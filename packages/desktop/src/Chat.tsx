import { useState, useEffect, useRef, useCallback, KeyboardEvent } from 'react'
import { useGateway, type ToolCallEvent, type InteractivePayload } from './useGateway'
import { open } from '@tauri-apps/plugin-dialog'
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
import { invoke } from '@tauri-apps/api/core'
import Markdown from './Markdown'
import InteractiveBlock from './InteractiveBlock'
import { MentionPicker } from './MentionPicker'
import DiffPreview from './DiffPreview'
import WelcomeGuide from './WelcomeGuide'
import FeatureTip from './FeatureTip'
import './Chat.css'
import './MentionPicker.css'

interface Message {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCallEvent[]
  /** 错误消息关联的操作（如跳转到设置页或重试） */
  action?: { label: string; target: 'settings' } | { label: string; target: 'retry'; retryMessage: string }
}

/** 从工具参数中提取可读摘要 */
function toolArgsSummary(name: string, args?: Record<string, unknown>): string {
  if (!args) return ''
  switch (name) {
    case 'bash': return String(args.command ?? '')
    case 'browser': {
      const action = String(args.action ?? '')
      const url = args.url ? ` ${args.url}` : ''
      return `${action}${url}`
    }
    case 'read_file': {
      const p = String(args.path ?? args.file_path ?? '')
      const start = args.start_line ?? args.startLine
      const end = args.end_line ?? args.endLine
      return start != null ? `${p} (${start}-${end})` : p
    }
    case 'write_file': case 'edit_file': case 'replace_in_file':
      return String(args.path ?? args.file_path ?? '')
    case 'search_files': case 'grep':
      return String(args.pattern ?? args.query ?? args.regex ?? '')
    case 'list_directory':
      return String(args.path ?? '')
    default: {
      const first = Object.values(args)[0]
      return first != null ? String(first) : ''
    }
  }
}

interface Attachment {
  path: string
  name: string
  icon: string
}

interface ChatProps {
  sessionKey: string
  onStreamingChange?: (streaming: boolean) => void
  onOpenSettings?: () => void
}

const MAX_ATTACHMENTS = 5

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']
const PDF_EXTS = ['pdf']

function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (IMAGE_EXTS.includes(ext)) return '🖼️'
  if (PDF_EXTS.includes(ext)) return '📑'
  return '📄'
}

function getFileName(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').pop() ?? filePath
}

export default function Chat({ sessionKey, onStreamingChange, onOpenSettings }: ChatProps) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [streamingText, setStreamingText] = useState('')
  const [activeToolCalls, setActiveToolCalls] = useState<ToolCallEvent[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [dragOver, setDragOver] = useState(false)
  // ─── Interactive Payload 状态（Phase F1）──────────────────────────────────
  const [interactivePayloads, setInteractivePayloads] = useState<InteractivePayload[]>([])

  // ─── Memory Captured Toast 状态（T22）──────────────────────────────────────
  const [memoryToast, setMemoryToast] = useState<{ id: string; text: string; undone?: boolean } | null>(null)
  const memoryToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // ─── Mention Picker 状态 ────────────────────────────────────────────────
  const [mentionState, setMentionState] = useState<{
    type: 'skill' | 'tool'
    query: string
    triggerPos: number   // @ 或 # 在 input 中的起始位置
  } | null>(null)
  const [skillTags, setSkillTags] = useState<string[]>([])         // ['skill-a','skill-b']
  const [toolTags, setToolTags] = useState<string[]>([])           // ['bash','write_file']
  const streamingTextRef = useRef('')
  const activeToolCallsRef = useRef<ToolCallEvent[]>([])
  const pauseIntentRef = useRef(false)   // 用户已点⏸，等待下一个 tool_result
  const pauseAbortRef = useRef(false)    // 标记本次 abort 由暂停触发（非停止）
  const [paused, setPaused] = useState(false)
  const [pauseIntentVis, setPauseIntentVis] = useState(false)  // 驱动⏳按鈕 re-render
  const [streaming, setStreaming] = useState(false)
  // ─── Feature Tip 追踪（Onboarding Guide）────────────────────────────────
  const [hasUsedSkill, setHasUsedSkill] = useState(false)
  const [hasUsedAttachment, setHasUsedAttachment] = useState(false)
  const [expandedToolCalls, setExpandedToolCalls] = useState<Set<string>>(new Set())
  const [quotaWarning, setQuotaWarning] = useState<string | null>(null)
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<any>(null)
  // Z2.2: 语音播报 (TTS)
  const [speakingMsgIdx, setSpeakingMsgIdx] = useState<number | null>(null)
  // Z3.2: TTS 自动播报开关
  const [ttsAutoPlay, setTtsAutoPlay] = useState(true)
  const ttsAutoPlayRef = useRef(true)
  const { sendMessage, abort, loadSession } = useGateway()

  const toggleToolCall = useCallback((id: string) => {
    setExpandedToolCalls(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Z2: 语音输入 toggle
  const toggleVoice = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { alert('当前环境不支持语音识别（需要 Chromium 内核）'); return }
    const recognition = new SR()
    recognition.lang = 'zh-CN'
    recognition.interimResults = false
    recognition.continuous = false
    recognition.onresult = (e: any) => {
      const transcript = Array.from(e.results as SpeechRecognitionResultList).map((r: any) => r[0].transcript).join('')
      setInput(prev => prev + transcript)
      // 自动调整高度
      setTimeout(() => {
        const el = textareaRef.current
        if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 200) + 'px' }
      }, 0)
    }
    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [isListening])

  // Z2.2: 语音播报 (TTS)
  const speakMessage = useCallback((text: string, idx: number) => {
    if (typeof speechSynthesis === 'undefined') { alert('当前环境不支持语音合成'); return }
    speechSynthesis.cancel()
    // 清理 markdown + 代码块
    let clean = text.replace(/```[\s\S]*?```/g, '').replace(/[#*`_~\[\]()>|]/g, '').replace(/https?:\/\/\S+/g, '')
    // Z3.3: 去除表情符号
    clean = clean.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}\u{2700}-\u{27BF}\u{2300}-\u{23FF}]/gu, '')
    // Z3.3: 去除 token 统计信息行
    clean = clean.replace(/.*(?:token|tokens|Token|Tokens|消耗|令牌|输入|输出).*\d+[\d,.]*.*/g, '')
    clean = clean.replace(/[（(][^）)]*(?:token|tokens|令牌|消耗)[^）)]*[）)]/gi, '')
    clean = clean.trim()
    if (!clean) return
    // 按句分割，避免逐字机械感
    const sentences = clean.split(/(?<=[。！？\n.!?；;])\ */).filter(s => s.trim())
    sentences.forEach((s, i) => {
      const utt = new SpeechSynthesisUtterance(s.trim())
      utt.lang = 'zh-CN'
      utt.rate = 1.05
      if (i === sentences.length - 1) utt.onend = () => setSpeakingMsgIdx(null)
      speechSynthesis.speak(utt)
    })
    setSpeakingMsgIdx(idx)
  }, [])

  const stopSpeaking = useCallback(() => {
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
    setSpeakingMsgIdx(null)
  }, [])

  // 新消息到来或组件卸载时停止播报
  useEffect(() => {
    return () => { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel() }
  }, [])
  useEffect(() => {
    if (streaming && speakingMsgIdx !== null) stopSpeaking()
  }, [streaming, speakingMsgIdx, stopSpeaking])

  // sessionKey 变化时：从 Core 磁盘加载历史（首次切入或重启后）
  useEffect(() => {
    const mapMessages = (history: { messages: Array<{ role: 'user' | 'assistant'; content: string; toolCalls?: Array<{ toolCallId: string; name: string; args?: Record<string, unknown>; result?: string; status: string }> }> } | null) => {
      if (!history?.messages?.length) return []
      return history.messages.map(m => ({
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls?.map(tc => ({
          toolCallId: tc.toolCallId,
          name: tc.name,
          args: tc.args,
          result: tc.result,
          status: (tc.status === 'done' || tc.status === 'error' ? tc.status : 'done') as 'running' | 'done' | 'error',
        })),
      }))
    }

    // 从 Core 磁盘加载历史（首次切入或重启后）
    loadSession(sessionKey).then(history => {
      const msgs = mapMessages(history)
      setMessages(msgs)
    })
    streamingTextRef.current = ''
    setStreamingText('')
    activeToolCallsRef.current = []
    setActiveToolCalls([])
    setAttachments([])
    setStreaming(false)
    setPaused(false)
    pauseIntentRef.current = false
    setPauseIntentVis(false)
  }, [sessionKey, loadSession]) // eslint-disable-line react-hooks/exhaustive-deps

  // 子 Agent 会话自动轮询：::sub:: session 定时刷新直到子 agent 完成
  useEffect(() => {
    if (!sessionKey.includes('::sub::')) return
    let cancelled = false
    let pollCount = 0
    const maxPolls = 150 // 最多 10 分钟 (150 × 4s)
    let hasSeenContent = false

    const poll = async () => {
      if (cancelled || pollCount >= maxPolls) return
      pollCount++
      const history = await loadSession(sessionKey)
      if (cancelled) return
      if (history?.messages?.length) {
        hasSeenContent = true
        const hasAssistant = history.messages.some(m => m.role === 'assistant' && m.content)
        setMessages(history.messages.map(m => ({
          role: m.role,
          content: m.content,
          toolCalls: m.toolCalls?.map(tc => ({
            toolCallId: tc.toolCallId,
            name: tc.name,
            args: tc.args,
            result: tc.result,
            status: (tc.status === 'done' || tc.status === 'error' ? tc.status : 'done') as 'running' | 'done' | 'error',
          })),
        })))
        // 只有在 assistant 产生了最终文本回复时才停止轮询
        // tool_calls 阶段继续刷新以展示中间进度
        if (hasAssistant) {
          // 再刷一次确保最终状态
          if (!cancelled) setTimeout(async () => {
            const final = await loadSession(sessionKey)
            if (final?.messages?.length && !cancelled) {
              setMessages(final.messages.map(m => ({
                role: m.role,
                content: m.content,
                toolCalls: m.toolCalls?.map(tc => ({
                  toolCallId: tc.toolCallId,
                  name: tc.name,
                  args: tc.args,
                  result: tc.result,
                  status: (tc.status === 'done' || tc.status === 'error' ? tc.status : 'done') as 'running' | 'done' | 'error',
                })),
              })))
            }
          }, 2000)
          return
        }
      }
      // 继续轮询：有内容后用 4s 间隔，无内容用 3s
      if (!cancelled) {
        setTimeout(poll, hasSeenContent ? 4000 : 3000)
      }
    }

    // 首次延迟 1.5 秒后开始轮询
    const timer = setTimeout(poll, 1500)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [sessionKey, loadSession])

  // streaming 变化时通知外层 App.tsx
  useEffect(() => {
    onStreamingChange?.(streaming)
  }, [streaming, onStreamingChange])

  // Tauri 原生拖拽事件
  useEffect(() => {
    let unlisten: (() => void) | undefined
    getCurrentWebviewWindow().onDragDropEvent((event) => {
      if (event.payload.type === 'over') {
        setDragOver(true)
      } else if (event.payload.type === 'leave') {
        setDragOver(false)
      } else if (event.payload.type === 'drop') {
        setDragOver(false)
        const paths: string[] = event.payload.paths ?? []
        addAttachments(paths)
      }
    }).then(fn => { unlisten = fn })
    return () => { unlisten?.() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 添加附件（去重 + 限数）
  const addAttachments = useCallback((paths: string[]) => {
    setAttachments(prev => {
      const existing = new Set(prev.map(a => a.path))
      const newOnes = paths
        .filter(p => !existing.has(p))
        .slice(0, MAX_ATTACHMENTS - prev.length)
        .map(p => ({ path: p, name: getFileName(p), icon: getFileIcon(getFileName(p)) }))
      if (paths.length > 0 && newOnes.length === 0 && prev.length >= MAX_ATTACHMENTS) {
        // 已达上限 — 不做操作（可选提示）
      }
      if (newOnes.length > 0) setHasUsedAttachment(true)
      return [...prev, ...newOnes]
    })
  }, [])

  const removeAttachment = useCallback((path: string) => {
    setAttachments(prev => prev.filter(a => a.path !== path))
  }, [])

  // 📋 粘贴处理：Ctrl+V 粘贴图片或文件（Phase clipboard-paste-attachment）
  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items)

    // 1. 检测图片（截图 / 浏览器复制的图片）
    const imageItem = items.find(it => it.type.startsWith('image/'))
    if (imageItem) {
      e.preventDefault()
      const blob = imageItem.getAsFile()
      if (!blob) return
      try {
        const buf = await blob.arrayBuffer()
        const data = Array.from(new Uint8Array(buf))
        const filename = `paste-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.png`
        const absPath = await invoke<string>('write_temp_file', { data, filename })
        addAttachments([absPath])
      } catch (err) {
        console.error('[paste] write_temp_file failed:', err)
      }
      return
    }

    // 2. 检测文件（Windows 文件管理器 Ctrl+C 复制的文件）
    const fileItems = items.filter(it => it.kind === 'file')
    if (fileItems.length > 0) {
      const paths: string[] = []
      for (const item of fileItems) {
        const file = item.getAsFile() as (File & { path?: string }) | null
        if (file?.path) paths.push(file.path)
      }
      if (paths.length > 0) {
        e.preventDefault()
        addAttachments(paths)
        return
      }
    }

    // 3. 纯文本：不拦截，走默认行为
  }, [addAttachments])

  // 📎 按钮：打开系统文件选择对话框
  const handlePickFile = useCallback(async () => {
    try {
      const result = await open({
        multiple: true,
        title: '选择文件',
        filters: [
          { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] },
          { name: 'PDF', extensions: ['pdf'] },
          { name: '代码/文本', extensions: ['txt', 'md', 'ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'json', 'toml', 'yaml', 'yml', 'css', 'html', 'xml', 'csv', 'log', 'sh', 'bat', 'cmd', 'ps1'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      })
      if (result) {
        const paths = Array.isArray(result) ? result : [result]
        addAttachments(paths)
      }
    } catch {
      // 用户取消或出错
    }
  }, [addAttachments])

  // 自动聚焦
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  // 新消息到达时滚到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  // 自动调整 textarea 高度
  useEffect(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 200) + 'px'
    }
  }, [input])

  // ─── Mention 检测 ───────────────────────────────────────────────────────
  const detectMention = useCallback((value: string, cursorPos: number) => {
    // IME 组合输入期间不触发
    const slice = value.slice(0, cursorPos)
    // 从光标往左找最近的未结束的 @ 或 #（遇到空格则终止）
    const atMatch = slice.match(/(?:^|[\s\n])(@(\w*))$/)
    const hashMatch = slice.match(/(?:^|[\s\n])(#(\w*))$/)
    if (atMatch) {
      const triggerPos = slice.lastIndexOf('@')
      setMentionState({ type: 'skill', query: atMatch[2], triggerPos })
    } else if (hashMatch) {
      const triggerPos = slice.lastIndexOf('#')
      setMentionState({ type: 'tool', query: hashMatch[2], triggerPos })
    } else {
      setMentionState(null)
    }
  }, [])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setInput(val)
    detectMention(val, e.target.selectionStart ?? val.length)
  }, [detectMention])

  const handleMentionSelect = useCallback((name: string) => {
    if (!mentionState) return
    // 删除触发词（@xxx 或 #xxx）
    const before = input.slice(0, mentionState.triggerPos)
    const after = input.slice(mentionState.triggerPos + 1 + mentionState.query.length)
    setInput(before + after)
    setMentionState(null)
    if (mentionState.type === 'skill') {
      setSkillTags(prev => prev.includes(name) ? prev : [...prev, name])
      setHasUsedSkill(true)
    } else {
      setToolTags(prev => prev.includes(name) ? prev : [...prev, name])
    }
    // 恢复焦点
    setTimeout(() => textareaRef.current?.focus(), 0)
  }, [mentionState, input])

  const handleMentionClose = useCallback(() => setMentionState(null), [])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // 当 picker 开着时，↑↓Enter/Escape 交给 MentionPicker 处理（通过 window 事件）
    if (mentionState && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Escape')) {
      e.preventDefault()
      return
    }
    if (mentionState && (e.key === 'Enter' || e.key === 'Tab')) {
      // 如果 picker 有结果，让 picker 的键盘 handler 先处理（capture=true）
      // picker handler 会 stopPropagation，这里兜底不发送
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  /** WelcomeGuide 卡片点击 → 直接发送预设提问 */
  const handleWelcomePrompt = useCallback((text: string) => {
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: text }])
    streamingTextRef.current = ''
    setStreamingText('')
    activeToolCallsRef.current = []
    setActiveToolCalls([])
    setInteractivePayloads([])
    void sendMessage(
      text,
      (chunk) => {
        streamingTextRef.current += chunk
        setStreamingText(streamingTextRef.current)
      },
      (usage) => {
        const final = streamingTextRef.current
        const tools = activeToolCallsRef.current
        if (final || tools.length > 0) {
          setMessages(msgs => [...msgs, { role: 'assistant', content: final, toolCalls: tools.length > 0 ? [...tools] : undefined }])
        }
        streamingTextRef.current = ''
        setStreamingText('')
        activeToolCallsRef.current = []
        setActiveToolCalls([])
        setQuotaWarning(usage?.quotaWarning ?? null)
      },
      (err) => {
        const partial = streamingTextRef.current
        const tools = activeToolCallsRef.current
        if (partial || tools.length > 0) {
          setMessages(msgs => [...msgs, {
            role: 'assistant',
            content: partial || '',
            toolCalls: tools.length > 0 ? tools.map(t =>
              t.status === 'running' ? { ...t, status: 'error' as const, result: '⚠️ 中断' } : t
            ) : undefined,
          }])
        }
        const isCopilotExpired = err.includes('Copilot') && err.includes('登录已过期')
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `⚠️ ${err}`,
          action: isCopilotExpired
            ? { label: '去设置重新登录', target: 'settings' as const }
            : { label: '🔄 重试', target: 'retry' as const, retryMessage: text },
        }])
        streamingTextRef.current = ''
        setStreamingText('')
        activeToolCallsRef.current = []
        setActiveToolCalls([])
      },
      undefined, // onToolCall — use default inline handler below won't work, keep undefined for simplicity
      sessionKey,
    )
  }, [sessionKey, sendMessage])

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || (streaming && !paused)) return
    if (paused) {
      setPaused(false)
      pauseIntentRef.current = false
      setPauseIntentVis(false)
    }
    let text = input.trim()

    // 将附件路径注入消息末尾
    if (attachments.length > 0) {
      const attachmentLines = attachments.map(a => `[附件: ${a.path}]`).join('\n')
      text = text ? text + '\n\n' + attachmentLines : attachmentLines
      setAttachments([])
    }

    if (!text) return

    // ─── 构建 mention 前缀 ────────────────────────────────────────────────
    const prefixParts: string[] = []
    if (skillTags.length > 0) prefixParts.push(`[${skillTags.map(s => `@${s}`).join(',')}]`)
    if (toolTags.length > 0) prefixParts.push(`[${toolTags.map(t => `#${t}`).join(',')}]`)
    const prefix = prefixParts.length > 0 ? prefixParts.join(' ') + ' ' : ''
    const finalText = prefix + text

    setInput('')
    setMentionState(null)
    setSkillTags([])
    setToolTags([])
    setMessages(prev => [...prev, { role: 'user', content: finalText }])
    streamingTextRef.current = ''
    setStreamingText('')
    activeToolCallsRef.current = []
    setActiveToolCalls([])
    setInteractivePayloads([])

    await sendMessage(
      finalText,
      (chunk) => {
        streamingTextRef.current += chunk
        setStreamingText(streamingTextRef.current)
      },
      () => {
        // done — 把流式文本合并到消息列表
        const final = streamingTextRef.current
        const tools = activeToolCallsRef.current
        if (final || tools.length > 0) {
          setMessages(msgs => {
            const newMsgs = [...msgs, { role: 'assistant' as const, content: final, toolCalls: tools.length > 0 ? [...tools] : undefined }]
            // Z3.2: 自动播报
            if (ttsAutoPlayRef.current && final) {
              setTimeout(() => speakMessage(final, newMsgs.length - 1), 300)
            }
            return newMsgs
          })
        }
        streamingTextRef.current = ''
        setStreamingText('')
        activeToolCallsRef.current = []
        setActiveToolCalls([])
        // 任务结束：清除快照，下次切回走磁盘历史（保证看到完整持久化数据）
      },
      (err) => {
        // 保留已流式输出的内容（文字 + 工具调用卡片）
        const partial = streamingTextRef.current
        const tools = activeToolCallsRef.current
        if (partial || tools.length > 0) {
          setMessages(msgs => [...msgs, {
            role: 'assistant',
            content: partial || '',
            toolCalls: tools.length > 0 ? tools.map(t =>
              t.status === 'running' ? { ...t, status: 'error' as const, result: '⚠️ 中断' } : t
            ) : undefined,
          }])
        }
        const isCopilotExpired = err.includes('Copilot') && err.includes('登录已过期')
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `⚠️ ${err}`,
          action: isCopilotExpired
            ? { label: '去设置重新登录', target: 'settings' as const }
            : { label: '🔄 重试', target: 'retry' as const, retryMessage: finalText },
        }])
        streamingTextRef.current = ''
        setStreamingText('')
        activeToolCallsRef.current = []
        setActiveToolCalls([])
      },
      (toolEvent) => {
        // 合并 tool call 事件到列表
        const existing = activeToolCallsRef.current.findIndex(t => t.toolCallId === toolEvent.toolCallId)
        if (existing >= 0) {
          // tool_update 事件只更新 partial，不覆盖 name/args
          if (toolEvent.name === '__update__') {
            activeToolCallsRef.current[existing] = { ...activeToolCallsRef.current[existing], partial: toolEvent.partial, status: toolEvent.status }
          } else {
            activeToolCallsRef.current[existing] = { ...activeToolCallsRef.current[existing], ...toolEvent }
          }
        } else if (toolEvent.name !== '__update__') {
          activeToolCallsRef.current.push(toolEvent)
        }
        setActiveToolCalls([...activeToolCallsRef.current])

        // 暂停检测：tool_result 到达（done 或 error）且用户已点⏸，触发暂停
        if ((toolEvent.status === 'done' || toolEvent.status === 'error') && pauseIntentRef.current) {
          pauseIntentRef.current = false
          setPauseIntentVis(false)
          pauseAbortRef.current = true  // 标记本次是暂停触发的 abort（非停止）
          abort(sessionKey)
          setPaused(true)
          // 主动持久化 session，防止进程重启后丢失已完成的工具结果
          invoke('persist_session', { sessionKey }).catch(() => {})
        }
      },
      sessionKey,
      undefined,
      () => {
        // onAbort — 区分暂停触发的 abort vs 用户点停止
        if (pauseAbortRef.current) {
          // 暂停触发：保留已完成的工具调用卡片，不追加「已中止」
          pauseAbortRef.current = false
          streamingTextRef.current = ''
          setStreamingText('')
          // activeToolCalls 保留（暂停横幅中显示已完成的工具调用数）
        } else {
          // 普通停止：保存已有部分到消息列表，清理工具卡片
          const partial = streamingTextRef.current
          const tools = activeToolCallsRef.current.map(t =>
            t.status === 'running' ? { ...t, status: 'error' as const, result: '⏹ 已中止' } : t,
          )
          if (partial || tools.length > 0) {
            setMessages(msgs => [...msgs, {
              role: 'assistant',
              content: partial ? partial + '\n\n⏹ *已中止*' : '⏹ *已中止*',
              toolCalls: tools.length > 0 ? tools : undefined,
            }])
          }
          streamingTextRef.current = ''
          setStreamingText('')
          activeToolCallsRef.current = []
          setActiveToolCalls([])
        }
      },
      (s) => setStreaming(s),
      (payload) => setInteractivePayloads(prev => [...prev, payload]),
      handleMemoryCaptured,
    )
  }

  // ─── Interactive 交互回传（Phase F1）───────────────────────────
  const handleInteractiveAction = useCallback(async (actionId: string, value: string) => {
    setInteractivePayloads([])
    const reply = `__interactive_reply__:${actionId}:${value}`
    // 当作用户消息发送
    setMessages(prev => [...prev, { role: 'user', content: `选择了: ${actionId}` }])
    streamingTextRef.current = ''
    setStreamingText('')
    activeToolCallsRef.current = []
    setActiveToolCalls([])

    await sendMessage(
      reply,
      (chunk) => { streamingTextRef.current += chunk; setStreamingText(streamingTextRef.current) },
      () => {
        const final = streamingTextRef.current
        const tools = activeToolCallsRef.current
        if (final || tools.length > 0) {
          setMessages(msgs => [...msgs, { role: 'assistant', content: final, toolCalls: tools.length > 0 ? [...tools] : undefined }])
        }
        streamingTextRef.current = ''
        setStreamingText('')
        activeToolCallsRef.current = []
        setActiveToolCalls([])
      },
      (err) => {
        const partial = streamingTextRef.current
        const tools = activeToolCallsRef.current
        if (partial || tools.length > 0) {
          setMessages(msgs => [...msgs, {
            role: 'assistant',
            content: partial || '',
            toolCalls: tools.length > 0 ? tools.map(t =>
              t.status === 'running' ? { ...t, status: 'error' as const, result: '⚠️ 中断' } : t
            ) : undefined,
          }])
        }
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `⚠️ ${err}`,
          action: { label: '🔄 重试', target: 'retry' as const, retryMessage: reply },
        }])
        streamingTextRef.current = ''
        setStreamingText('')
        activeToolCallsRef.current = []
        setActiveToolCalls([])
      },
      undefined,
      sessionKey,
      undefined,
      undefined,
      (s) => setStreaming(s),
      (payload) => setInteractivePayloads(prev => [...prev, payload]),
    )
  }, [sendMessage, sessionKey, abort])

  // ─── Memory Captured Toast 回调（T22）──────────────────────────
  const handleMemoryCaptured = useCallback((info: { id: string; text: string; category: string }) => {
    // 清除之前的 timer
    if (memoryToastTimerRef.current) clearTimeout(memoryToastTimerRef.current)
    setMemoryToast({ id: info.id, text: info.text })
    // 5 秒自动消失
    memoryToastTimerRef.current = setTimeout(() => setMemoryToast(null), 5000)
  }, [])

  const handleMemoryUndo = useCallback(async () => {
    if (!memoryToast) return
    try {
      await invoke('proxy_request', { method: 'DELETE', path: `/memories/${memoryToast.id}` })
      setMemoryToast(prev => prev ? { ...prev, undone: true } : null)
      setTimeout(() => setMemoryToast(null), 1500)
    } catch {
      // 撤销失败静默处理
    }
  }, [memoryToast])

  // ─── 复制消息 ───────────────────────────────────────────────────
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const handleCopyMsg = useCallback((idx: number) => {
    const text = messages[idx]?.content ?? ''
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx(null), 2000)
    }).catch(() => {})
  }, [messages])

  // ─── 重新生成 ─────────────────────────────────────────────────────
  const handleRegenerate = useCallback(async (idx: number) => {
    if (streaming) return
    // 找到最近一条 user 消息
    let userIdx = idx - 1
    while (userIdx >= 0 && messages[userIdx].role !== 'user') userIdx--
    if (userIdx < 0) return
    const userText = messages[userIdx].content

    // 删掉这条 assistant 及之后的消息
    setMessages(prev => prev.slice(0, idx))
    streamingTextRef.current = ''
    setStreamingText('')
    activeToolCallsRef.current = []
    setActiveToolCalls([])

    await sendMessage(
      userText,
      (chunk) => {
        streamingTextRef.current += chunk
        setStreamingText(streamingTextRef.current)
      },
      () => {
        const final = streamingTextRef.current
        const tools = activeToolCallsRef.current
        if (final || tools.length > 0) {
          setMessages(msgs => [...msgs, { role: 'assistant', content: final, toolCalls: tools.length > 0 ? [...tools] : undefined }])
        }
        streamingTextRef.current = ''
        setStreamingText('')
        activeToolCallsRef.current = []
        setActiveToolCalls([])
      },
      (err) => {
        const partial = streamingTextRef.current
        const tools = activeToolCallsRef.current
        if (partial || tools.length > 0) {
          setMessages(msgs => [...msgs, {
            role: 'assistant',
            content: partial || '',
            toolCalls: tools.length > 0 ? tools.map(t =>
              t.status === 'running' ? { ...t, status: 'error' as const, result: '⚠️ 中断' } : t
            ) : undefined,
          }])
        }
        const isCopilotExpired = err.includes('Copilot') && err.includes('登录已过期')
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `⚠️ ${err}`,
          action: isCopilotExpired
            ? { label: '去设置重新登录', target: 'settings' as const }
            : { label: '🔄 重试', target: 'retry' as const, retryMessage: userText },
        }])
        streamingTextRef.current = ''
        setStreamingText('')
        activeToolCallsRef.current = []
        setActiveToolCalls([])
      },
      (toolEvent) => {
        const existing = activeToolCallsRef.current.findIndex(t => t.toolCallId === toolEvent.toolCallId)
        if (existing >= 0) {
          if (toolEvent.name === '__update__') {
            activeToolCallsRef.current[existing] = { ...activeToolCallsRef.current[existing], partial: toolEvent.partial, status: toolEvent.status }
          } else {
            activeToolCallsRef.current[existing] = { ...activeToolCallsRef.current[existing], ...toolEvent }
          }
        } else if (toolEvent.name !== '__update__') {
          activeToolCallsRef.current.push(toolEvent)
        }
        setActiveToolCalls([...activeToolCallsRef.current])

        if ((toolEvent.status === 'done' || toolEvent.status === 'error') && pauseIntentRef.current) {
          pauseIntentRef.current = false
          setPauseIntentVis(false)
          pauseAbortRef.current = true
          abort(sessionKey)
          setPaused(true)
          invoke('persist_session', { sessionKey }).catch(() => {})
        }
      },
      sessionKey,
      undefined,
      () => {
        // onAbort — 重新生成时中止
        if (pauseAbortRef.current) {
          pauseAbortRef.current = false
          streamingTextRef.current = ''
          setStreamingText('')
        } else {
          const partial = streamingTextRef.current
          const tools = activeToolCallsRef.current.map(t =>
            t.status === 'running' ? { ...t, status: 'error' as const, result: '⏹ 已中止' } : t,
          )
          if (partial || tools.length > 0) {
            setMessages(msgs => [...msgs, {
              role: 'assistant',
              content: partial ? partial + '\n\n⏹ *已中止*' : '⏹ *已中止*',
              toolCalls: tools.length > 0 ? tools : undefined,
            }])
          }
          streamingTextRef.current = ''
          setStreamingText('')
          activeToolCallsRef.current = []
          setActiveToolCalls([])
        }
      },
      (s) => setStreaming(s),
      (payload) => setInteractivePayloads(prev => [...prev, payload]),
    )
  }, [streaming, messages, sendMessage, sessionKey, abort, paused])

  return (
    <div className="chat-page">
      {/* T22: Memory Captured Toast */}
      {memoryToast && (
        <div className="memory-toast" style={{
          position: 'fixed', top: 16, right: 16, zIndex: 9999,
          background: 'var(--bg-secondary, #2a2a2a)', color: 'var(--text-primary, #e0e0e0)',
          borderRadius: 8, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)', fontSize: 13, maxWidth: 360,
          animation: 'fadeIn 0.2s ease-out',
        }}>
          {memoryToast.undone ? (
            <span>↩️ 已撤销</span>
          ) : (
            <>
              <span style={{ flex: 1 }}>💾 已自动记住: {memoryToast.text.slice(0, 60)}{memoryToast.text.length > 60 ? '...' : ''}</span>
              <button
                onClick={handleMemoryUndo}
                style={{
                  background: 'transparent', border: '1px solid #666', borderRadius: 4,
                  color: '#ccc', padding: '2px 8px', cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap',
                }}
              >撤销</button>
            </>
          )}
        </div>
      )}
      {/* 消息列表 */}
      <div className="chat-messages">
        {messages.length === 0 && !streaming && (
          <WelcomeGuide onSendPrompt={handleWelcomePrompt} />
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`chat-bubble chat-${msg.role}`}>
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <div className="tool-calls">
                {msg.toolCalls.map((tc) => {
                  const cardId = `hist-${i}-${tc.toolCallId}`
                  const expanded = expandedToolCalls.has(cardId)
                  const summary = toolArgsSummary(tc.name, tc.args)
                  return (
                    <div key={tc.toolCallId} className={`tool-call tool-call-${tc.status}${expanded ? ' tool-call-expanded' : ''}`}>
                      <button className="tool-call-header" onClick={() => toggleToolCall(cardId)}>
                        <span className="tool-call-chevron">{expanded ? '▼' : '▶'}</span>
                        <span className="tool-call-icon">{tc.status === 'error' ? '❌' : '✅'}</span>
                        <span className="tool-call-name">{tc.name}</span>
                        {summary && !expanded && (
                          <span className="tool-call-args" title={summary}>
                            {summary.slice(0, 60)}{summary.length > 60 ? '…' : ''}
                          </span>
                        )}
                        <span className="tool-call-spacer" />
                        {!expanded && tc.status === 'done' && (
                          <span className="tool-call-badge">{tc.result ? `${tc.result.length} chars` : 'done'}</span>
                        )}
                      </button>
                      {expanded && (
                        <div className="tool-call-body">
                          {tc.args && Object.keys(tc.args).length > 0 && (
                            <div className="tool-call-section">
                              <div className="tool-call-section-label">INPUT</div>
                              <pre className="tool-call-pre">{JSON.stringify(tc.args, null, 2)}</pre>
                            </div>
                          )}
                          {tc.result && (
                            <div className="tool-call-section">
                              <div className="tool-call-section-label">OUTPUT</div>
                              <pre className="tool-call-pre">{tc.result}</pre>
                            </div>
                          )}
                          {(tc.name === 'write_file' || tc.name === 'edit_file' || tc.name === 'replace_in_file') && tc.args?.content && tc.status === 'done' && (
                            <div className="tool-call-section">
                              <div className="tool-call-section-label">DIFF PREVIEW</div>
                              <DiffPreview
                                filePath={String(tc.args.path || tc.args.file_path || '')}
                                originalContent={null}
                                newContent={String(tc.args.content)}
                                onAccept={() => {}}
                                onReject={() => {}}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            <span className="bubble-content">
              {msg.role === 'assistant' ? <Markdown content={msg.content} /> : msg.content}
            </span>
            {msg.action && msg.action.target === 'settings' && onOpenSettings && (
              <button
                className="msg-action-link"
                onClick={onOpenSettings}
              >
                {msg.action.label} →
              </button>
            )}
            {msg.action && msg.action.target === 'retry' && !streaming && (
              <button
                className="msg-action-link retry-btn"
                onClick={async () => {
                  const retryMsg = (msg.action as { retryMessage: string }).retryMessage
                  // 移除错误消息，重发请求（不重复追加用户消息）
                  setMessages(prev => prev.filter((_, j) => j !== i))
                  streamingTextRef.current = ''
                  setStreamingText('')
                  activeToolCallsRef.current = []
                  setActiveToolCalls([])
                  setInteractivePayloads([])
                  await sendMessage(
                    retryMsg,
                    (chunk) => { streamingTextRef.current += chunk; setStreamingText(streamingTextRef.current) },
                    () => {
                      const final = streamingTextRef.current
                      const tools = activeToolCallsRef.current
                      if (final || tools.length > 0) {
                        setMessages(msgs => [...msgs, { role: 'assistant', content: final, toolCalls: tools.length > 0 ? [...tools] : undefined }])
                      }
                      streamingTextRef.current = ''
                      setStreamingText('')
                      activeToolCallsRef.current = []
                      setActiveToolCalls([])
                    },
                    (retryErr) => {
                      const partial = streamingTextRef.current
                      const tools = activeToolCallsRef.current
                      if (partial || tools.length > 0) {
                        setMessages(msgs => [...msgs, { role: 'assistant', content: partial || '', toolCalls: tools.length > 0 ? [...tools] : undefined }])
                      }
                      setMessages(prev => [...prev, {
                        role: 'assistant',
                        content: `⚠️ ${retryErr}`,
                        action: { label: '🔄 重试', target: 'retry' as const, retryMessage: retryMsg },
                      }])
                      streamingTextRef.current = ''
                      setStreamingText('')
                      activeToolCallsRef.current = []
                      setActiveToolCalls([])
                    },
                    undefined,
                    sessionKey,
                    undefined,
                    undefined,
                    (s) => setStreaming(s),
                    (payload) => setInteractivePayloads(prev => [...prev, payload]),
                    handleMemoryCaptured,
                  )
                }}
              >
                {msg.action.label}
              </button>
            )}
            {/* 消息操作按钮 */}
            <div className="msg-actions">
              <button
                className="msg-action-btn"
                onClick={() => handleCopyMsg(i)}
                title="复制"
              >
                {copiedIdx === i ? '✓' : '📋'}
              </button>
              {msg.role === 'assistant' && !streaming && (
                <button
                  className="msg-action-btn"
                  onClick={() => handleRegenerate(i)}
                  title="重新生成"
                >
                  🔄
                </button>
              )}
              {msg.role === 'assistant' && !streaming && msg.content && (
                <button
                  className={`msg-action-btn tts-btn${speakingMsgIdx === i ? ' tts-active' : ''}`}
                  onClick={() => speakingMsgIdx === i ? stopSpeaking() : speakMessage(msg.content, i)}
                  title={speakingMsgIdx === i ? '停止播报' : '语音播报'}
                >
                  {speakingMsgIdx === i ? '🔇' : '🔊'}
                </button>
              )}
            </div>
          </div>
        ))}
        {(streamingText || activeToolCalls.length > 0) && (
          <div className="chat-bubble chat-assistant">
            {activeToolCalls.length > 0 && (
              <div className="tool-calls">
                {activeToolCalls.map((tc) => {
                  const cardId = `live-${tc.toolCallId}`
                  const expanded = expandedToolCalls.has(cardId)
                  const summary = toolArgsSummary(tc.name, tc.args)
                  return (
                    <div key={tc.toolCallId} className={`tool-call tool-call-${tc.status}${expanded ? ' tool-call-expanded' : ''}`}>
                      <button className="tool-call-header" onClick={() => toggleToolCall(cardId)}>
                        <span className="tool-call-chevron">{expanded ? '▼' : '▶'}</span>
                        <span className="tool-call-icon">
                          {tc.status === 'running' ? <span className="tool-call-spinner" /> : tc.status === 'error' ? '❌' : '✅'}
                        </span>
                        <span className="tool-call-name">{tc.name}</span>
                        {summary && !expanded && (
                          <span className="tool-call-args" title={summary}>
                            {summary.slice(0, 60)}{summary.length > 60 ? '…' : ''}
                          </span>
                        )}
                        <span className="tool-call-spacer" />
                        {tc.status === 'running' && !expanded && tc.partial && (
                          <span className="tool-call-badge">{tc.partial.split('\n').length} lines</span>
                        )}
                      </button>
                      {expanded && (
                        <div className="tool-call-body">
                          {tc.args && Object.keys(tc.args).length > 0 && (
                            <div className="tool-call-section">
                              <div className="tool-call-section-label">INPUT</div>
                              <pre className="tool-call-pre">{JSON.stringify(tc.args, null, 2)}</pre>
                            </div>
                          )}
                          {tc.partial && tc.status === 'running' && (
                            <div className="tool-call-section">
                              <div className="tool-call-section-label">STDOUT</div>
                              <pre className="tool-call-pre tool-call-pre-live">{tc.partial}</pre>
                            </div>
                          )}
                          {tc.result && (
                            <div className="tool-call-section">
                              <div className="tool-call-section-label">OUTPUT</div>
                              <pre className="tool-call-pre">{tc.result}</pre>
                            </div>
                          )}
                          {(tc.name === 'write_file' || tc.name === 'edit_file' || tc.name === 'replace_in_file') && tc.args?.content && tc.status === 'done' && (
                            <div className="tool-call-section">
                              <div className="tool-call-section-label">DIFF PREVIEW</div>
                              <DiffPreview
                                filePath={String(tc.args.path || tc.args.file_path || '')}
                                originalContent={null}
                                newContent={String(tc.args.content)}
                                onAccept={() => {}}
                                onReject={() => {}}
                              />
                            </div>
                          )}
                        </div>
                      )}
                      {!expanded && tc.partial && tc.status === 'running' && (
                        <div className="tool-call-output">{tc.partial}</div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {streamingText && <span className="bubble-content"><Markdown content={streamingText} /></span>}
            <span className="cursor-blink">▌</span>
          </div>
        )}
        {/* Interactive Blocks（Phase F1）*/}
        {interactivePayloads.length > 0 && !streaming && (
          <div className="interactive-payloads">
            {interactivePayloads.map((payload, i) => (
              <InteractiveBlock key={`ib-${i}`} payload={payload} onAction={handleInteractiveAction} />
            ))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 配额预警条（V4.2） */}
      {quotaWarning && (
        <div className={`quota-warning ${quotaWarning.startsWith('🚫') ? 'quota-exhausted' : quotaWarning.startsWith('🔴') ? 'quota-critical' : 'quota-warn'}`}>
          {quotaWarning}
          <button className="quota-warning-close" onClick={() => setQuotaWarning(null)}>✕</button>
        </div>
      )}

      {/* 输入区 */}
      <div className={`chat-input-area${dragOver ? ' drag-over' : ''}`}>
        {/* 功能发现提示 */}
        <FeatureTip
          messageCount={messages.length}
          hasUsedSkill={hasUsedSkill}
          hasUsedAttachment={hasUsedAttachment}
        />
        {/* 暂停横幅 */}
        {paused && (
          <div className="pause-banner">
            <span>⏸ 已暂停 · 已完成 {activeToolCalls.filter(t => t.status === 'done').length} 个工具调用 · 输入指令继续，或</span>
            <button className="pause-banner-cancel" onClick={() => { setPaused(false); activeToolCallsRef.current = []; setActiveToolCalls([]) }}>取消</button>
          </div>
        )}
        {/* 附件标签栏（附件 + mention chips 合并在此行） */}
        {(attachments.length > 0 || skillTags.length > 0 || toolTags.length > 0) && (
          <div className="chat-attachments">
            {/* Skill chips（多选） */}
            {skillTags.map(s => (
              <span key={s} className="mention-chip mention-chip-skill">
                🧩 {s}
                <button className="mention-chip-remove" onClick={() => setSkillTags(prev => prev.filter(x => x !== s))}>✕</button>
              </span>
            ))}
            {skillTags.length > 3 && (
              <span className="mention-chip-warning">⚠ 已选 {skillTags.length} 个 Skill，可能影响响应质量</span>
            )}
            {/* Tool chips */}
            {toolTags.map(t => (
              <span key={t} className="mention-chip mention-chip-tool">
                🔧 {t}
                <button className="mention-chip-remove" onClick={() => setToolTags(prev => prev.filter(x => x !== t))}>✕</button>
              </span>
            ))}
            {/* 文件附件 */}
            {attachments.map(a => (
              <span key={a.path} className="attachment-tag" title={a.path}>
                <span className="attachment-icon">{a.icon}</span>
                <span className="attachment-name">{a.name}</span>
                <button className="attachment-remove" onClick={() => removeAttachment(a.path)}>✕</button>
              </span>
            ))}
          </div>
        )}
        {/* 拖拽遮罩 */}
        {dragOver && (
          <div className="drag-overlay">📎 拖放文件到此处</div>
        )}
        {/* MentionPicker 浮层 */}
        {mentionState && (
          <MentionPicker
            type={mentionState.type}
            query={mentionState.query}
            onSelect={handleMentionSelect}
            onClose={handleMentionClose}
          />
        )}
        <div className="chat-input-row">
          <button className="chat-btn attach-btn" onClick={handlePickFile} title="添加文件" disabled={streaming && !paused}>
            📎
          </button>
          <button className={`chat-btn voice-btn${isListening ? ' listening' : ''}`} onClick={toggleVoice} title={isListening ? '停止录音' : '语音输入'} disabled={streaming && !paused}>
            {isListening ? '🔴' : '🎤'}
          </button>
          <button className={`chat-btn tts-toggle${ttsAutoPlay ? ' tts-on' : ''}`} onClick={() => { setTtsAutoPlay(v => !v); ttsAutoPlayRef.current = !ttsAutoPlayRef.current }} title={ttsAutoPlay ? '关闭自动播报' : '开启自动播报'}>
            {ttsAutoPlay ? '🔊' : '🔇'}
          </button>
          <textarea
            ref={textareaRef}
            className="chat-input"
            placeholder={paused ? '输入指令继续任务，或直接描述下一步…' : '输入消息…（Enter 发送，Shift+Enter 换行，@ 选 Skill，# 选工具）'}
            rows={1}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={streaming && !paused}
          />
          {streaming && !paused ? (
            <>
              {pauseIntentVis ? (
                <button className="chat-btn chat-btn-pause-pending" disabled title="等待当前工具完成后暂停">⏳</button>
              ) : (
                <button className="chat-btn chat-btn-pause" onClick={() => { pauseIntentRef.current = true; setPauseIntentVis(true) }} title="暂停（等当前工具完成）">⏸</button>
              )}
              <button className="chat-btn chat-btn-stop" onClick={() => { pauseIntentRef.current = false; setPauseIntentVis(false); abort(sessionKey) }} title="停止">■</button>
            </>
          ) : (
            <button
              className="chat-btn chat-btn-send"
              onClick={handleSend}
              disabled={!input.trim() && attachments.length === 0}
              title="发送（Enter）"
            >↑</button>
          )}
        </div>
      </div>
    </div>
  )
}
