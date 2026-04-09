import { useState, useRef, useCallback, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

// ─── Interactive Payload 类型（Phase F1）──────────────────────────────────────

export type ButtonStyle = 'primary' | 'secondary' | 'success' | 'danger'

export interface InteractiveButton {
  type: 'button'
  actionId: string
  label: string
  style?: ButtonStyle
}

export interface InteractiveSelect {
  type: 'select'
  actionId: string
  placeholder?: string
  options: { label: string; value: string }[]
}

export interface InteractiveText {
  type: 'text'
  content: string
}

export type InteractiveElement = InteractiveButton | InteractiveSelect | InteractiveText

export interface InteractivePayload {
  elements: InteractiveElement[]
}

// ─── Secret / Settings ────────────────────────────────────────────────────────

export type SecretKey =
  | 'DEEPSEEK_API_KEY' | 'QWEN_API_KEY' | 'VOLC_API_KEY'
  | 'CUSTOM_API_KEY' | 'CUSTOM_BASE_URL' | 'CUSTOM_MODEL'
  | 'GITHUB_TOKEN' | 'COPILOT_MODEL'
  | 'HTTPS_PROXY'
  | 'BRAVE_SEARCH_API_KEY'
  | 'CHROME_PATH'
  | 'MINIMAX_API_KEY' | 'MINIMAX_SHOW_THINKING'
  | 'MODEL_ROUTING' | 'SELECTED_MODEL'
  | 'BASH_TIMEOUT_MS' | 'BASH_IDLE_TIMEOUT_MS' | 'BASH_MAX_TIMEOUT_MS'
  | 'AGENT_MAX_TOOL_CALLS' | 'AGENT_MAX_LLM_TURNS'
  | 'WORKSPACE_DIR'

export interface ConfiguredSecret {
  key: SecretKey
  masked: string
}

export interface SettingsState {
  configured: ConfiguredSecret[]
  activeProvider: 'copilot' | 'custom' | 'deepseek' | 'qwen' | 'volc' | 'minimax' | null
  modelRouting?: 'auto' | 'manual'
  selectedModel?: string
  storageMode?: 'plaintext' | 'dpapi'
}

interface DeltaEvent {
  type: 'delta' | 'done' | 'error' | 'tool_start' | 'tool_result' | 'tool_update' | 'interactive' | 'model_switch'
  sessionKey?: string
  content?: string
  message?: string
  usage?: { inputTokens: number; outputTokens: number; totalCny: number; toolCallCount?: number }
  // tool_start fields
  name?: string
  args?: Record<string, unknown>
  toolCallId?: string
  // tool_result fields
  isError?: boolean
  // interactive fields (Phase F1)
  payload?: InteractivePayload
}

export interface ToolCallEvent {
  toolCallId: string
  name: string
  args?: Record<string, unknown>
  result?: string
  partial?: string
  isError?: boolean
  status: 'running' | 'done' | 'error'
}

export function useGateway() {
  const [coreOnline, setCoreOnline] = useState<boolean | null>(null)
  const abortMapRef = useRef<Map<string, () => void>>(new Map())

  // 定期检测 Core 是否在线
  useEffect(() => {
    const check = async () => {
      const ok = await invoke<boolean>('core_health').catch(() => false)
      setCoreOnline(ok)
    }
    check()
    const t = setInterval(check, 5000)
    return () => clearInterval(t)
  }, [])

  const sendMessage = useCallback(
    async (
      message: string,
      onDelta: (chunk: string) => void,
      onDone: (usage?: DeltaEvent['usage']) => void,
      onError: (msg: string) => void,
      onToolCall?: (event: ToolCallEvent) => void,
      sessionKey?: string,
      model?: string,
      onAbort?: () => void,
      onStreamingChange?: (streaming: boolean) => void,
      onInteractive?: (payload: InteractivePayload) => void,
    ): Promise<void> => {
      if (!message.trim()) return
      const sk = sessionKey ?? ''
      onStreamingChange?.(true)

      let unlisten: any = null
      let resolvePromise: (() => void) | null = null
      let timeoutId: ReturnType<typeof setTimeout> | null = null

      // 清理函数：统一释放监听器和超时
      const cleanup = () => {
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null }
        if (unlisten) { unlisten(); unlisten = null }
      }

      abortMapRef.current.set(sk, () => {
        cleanup()
        onStreamingChange?.(false)
        abortMapRef.current.delete(sk)
        invoke('abort_chat', { sessionKey: sk || null }).catch(() => {})
        onAbort?.()
        if (resolvePromise) { resolvePromise(); resolvePromise = null }
      })

      try {
        // 用 Promise 等待 done/error 事件，确保所有 delta 都处理完
        await new Promise<void>((resolve, reject) => {
          resolvePromise = resolve

          // 超时兜底：10 分钟无任何事件则强制终止（防止 hang 住）
          const resetTimeout = () => {
            if (timeoutId) clearTimeout(timeoutId)
            timeoutId = setTimeout(() => {
              console.warn('[sendMessage] timeout: no event received for 10 minutes, force-resolving')
              cleanup()
              onStreamingChange?.(false)
              onError('⏱️ 响应超时（10 分钟无数据），请重试。')
              resolve()
            }, 10 * 60 * 1000)
          }

          listen<DeltaEvent>('chat-delta', (event) => {
            try {
              const evt = event.payload
              // 过滤：只处理属于本会话的事件
              if (evt.sessionKey && evt.sessionKey !== sk) return
              // 收到任何属于本会话的事件，重置超时
              resetTimeout()
              console.log('[chat-delta]', JSON.stringify(evt))
              if (evt.type === 'delta' && evt.content) {
                onDelta(evt.content)
              } else if (evt.type === 'tool_start') {
                onToolCall?.({
                  toolCallId: evt.toolCallId ?? '',
                  name: evt.name ?? 'unknown',
                  args: evt.args,
                  status: 'running',
                })
              } else if (evt.type === 'tool_update') {
                onToolCall?.({
                  toolCallId: evt.toolCallId ?? '',
                  name: '__update__',
                  partial: evt.content,
                  status: 'running',
                })
              } else if (evt.type === 'tool_result') {
                onToolCall?.({
                  toolCallId: evt.toolCallId ?? '',
                  name: evt.name ?? 'unknown',
                  result: evt.content,
                  isError: evt.isError,
                  status: evt.isError ? 'error' : 'done',
                })
              } else if (evt.type === 'done') {
                cleanup()
                onStreamingChange?.(false)
                onDone(evt.usage)
                resolve()
              } else if (evt.type === 'interactive' && evt.payload) {
                onInteractive?.(evt.payload)
              } else if (evt.type === 'error') {
                cleanup()
                onStreamingChange?.(false)
                onError(evt.message ?? 'Unknown error')
                resolve()
              }
            } catch { /* ignore parse error */ }
          }).then(fn => {
            unlisten = fn
            // 监听器注册好后启动超时，再发起请求
            resetTimeout()
            invoke('chat_stream', { message, sessionKey: sessionKey ?? null, model: model ?? null }).catch(err => {
              // invoke 本身失败（网络断开等），直接报错
              cleanup()
              reject(err)
            })
          }).catch(reject)
        })
      } catch (err: unknown) {
        cleanup()
        onStreamingChange?.(false)
        onError(err instanceof Error ? err.message : String(err))
      } finally {
        abortMapRef.current.delete(sk)
      }
    },
    [],
  )

  const abort = useCallback((sk: string) => {
    abortMapRef.current.get(sk)?.()
  }, [])

  const saveApiKey = useCallback(async (provider: SecretKey, key: string): Promise<boolean> => {
    return invoke<boolean>('save_api_key', { provider, key }).catch(() => false)
  }, [])

  const loadSettings = useCallback(async (): Promise<SettingsState> => {
    return invoke<SettingsState>('get_settings').catch(() => ({
      configured: [], activeProvider: null,
    }))
  }, [])

  const deleteKey = useCallback(async (key: SecretKey): Promise<boolean> => {
    return invoke<boolean>('delete_key', { key }).catch(() => false)
  }, [])

  // ─── Copilot ────────────────────────────────────────────────────────────────

  const copilotLogin = useCallback(async () => {
    return invoke<{ userCode: string; verificationUri: string; interval: number; error?: string }>('copilot_login').catch(() => ({
      userCode: '', verificationUri: '', interval: 5, error: 'invoke 失败',
    }))
  }, [])

  const copilotLoginStatus = useCallback(async (): Promise<{ status: string; message?: string; user?: string; interval?: number }> => {
    return invoke<{ status: string; message?: string; user?: string; interval?: number }>('copilot_login_status').catch(() => ({
      status: 'error', message: 'invoke 失败',
    }))
  }, [])

  const copilotLogout = useCallback(async (): Promise<boolean> => {
    return invoke<boolean>('copilot_logout').catch(() => false)
  }, [])

  const copilotModels = useCallback(async () => {
    return invoke<Array<{ id: string; name: string; contextWindow: number; canReason: boolean }>>('copilot_models').catch(() => [])
  }, [])

  // ─── Sessions（直接调 Core HTTP API） ───────────────────────────────────────

  const CORE_URL = 'http://localhost:18790'

  interface SessionSummary {
    key: string
    title?: string
    createdAt: number
    lastActiveAt: number
    messageCount: number
  }

  interface SessionHistory {
    key: string
    title?: string
    createdAt: number
    messages: Array<{ role: 'user' | 'assistant'; content: string; toolCalls?: Array<{ toolCallId: string; name: string; args?: Record<string, unknown>; result?: string; status: string }> }>
  }

  const listSessions = useCallback(async (): Promise<SessionSummary[]> => {
    try {
      const resp = await fetch(`${CORE_URL}/sessions`)
      return resp.ok ? await resp.json() : []
    } catch { return [] }
  }, [])

  const loadSession = useCallback(async (key: string): Promise<SessionHistory | null> => {
    try {
      const url = key.includes('::sub::')
        ? `${CORE_URL}/sessions/_?key=${encodeURIComponent(key)}`
        : `${CORE_URL}/sessions/${encodeURIComponent(key)}`
      const resp = await fetch(url)
      return resp.ok ? await resp.json() : null
    } catch { return null }
  }, [])

  const deleteSession = useCallback(async (key: string): Promise<boolean> => {
    try {
      const url = key.includes('::sub::')
        ? `${CORE_URL}/sessions/_?key=${encodeURIComponent(key)}`
        : `${CORE_URL}/sessions/${encodeURIComponent(key)}`
      const resp = await fetch(url, { method: 'DELETE' })
      return resp.ok
    } catch { return false }
  }, [])

  return {
    coreOnline, sendMessage, abort,
    saveApiKey, loadSettings, deleteKey,
    copilotLogin, copilotLoginStatus, copilotLogout, copilotModels,
    listSessions, loadSession, deleteSession,
  }
}
