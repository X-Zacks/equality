import { useState, useEffect, useCallback, useRef } from 'react'
import { useGateway } from './useGateway'
import type { SettingsState, SecretKey } from './useGateway'
import { open } from '@tauri-apps/plugin-shell'
import './Settings.css'

type SettingsTab = 'model' | 'tools' | 'skills' | 'advanced' | 'about'

// ─── 模型路由选择器组件 ───────────────────────────────────────────────────────

interface ModelOption {
  value: string
  label: string
  provider: string
  multiplier?: number
  category?: string   // powerful / versatile / fast
  preview?: boolean
}

function categoryLabel(m: ModelOption): string {
  // Copilot 模型用 category，其他 provider 用 multiplier
  if (m.category) {
    switch (m.category) {
      case 'powerful': return '🔥'
      case 'versatile': return '❤️'
      case 'fast': return '⚡'
      default: return m.category
    }
  }
  // fallback: multiplier
  if (m.multiplier !== undefined) {
    if (m.multiplier === 0) return '免费'
    return `${m.multiplier}x`
  }
  return ''
}

function categoryColor(m: ModelOption): string {
  if (m.category === 'powerful') return '#ff9f0a'
  if (m.category === 'versatile') return '#0a84ff'
  if (m.category === 'fast') return '#30d158'
  if (m.multiplier !== undefined) {
    if (m.multiplier <= 0.33) return '#30d158'
    if (m.multiplier <= 1) return 'rgba(255,255,255,0.5)'
    if (m.multiplier <= 3) return '#ff9f0a'
    return '#ff453a'
  }
  return 'rgba(255,255,255,0.3)'
}

function ModelRoutingCard({ settings, saveApiKey, refresh }: {
  settings: SettingsState
  saveApiKey: (k: SecretKey, v: string) => Promise<boolean>
  refresh: () => Promise<void>
}) {
  const isAuto = settings.modelRouting !== 'manual'
  const currentModel = settings.selectedModel || 'copilot/gpt-5.2'
  const [models, setModels] = useState<ModelOption[]>([])
  const [open, setOpen] = useState(false)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  // 动态获取所有可用模型
  useEffect(() => {
    fetch('http://localhost:18790/models')
      .then(r => r.json())
      .then((list: ModelOption[]) => setModels(list))
      .catch(() => {})
  }, [])

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (
        dropdownRef.current && !dropdownRef.current.contains(t) &&
        triggerRef.current && !triggerRef.current.contains(t)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleTriggerClick = () => {
    if (isAuto) return
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
    }
    setOpen(o => !o)
  }

  const handleToggle = async () => {
    const next = isAuto ? 'manual' : 'auto'
    await saveApiKey('MODEL_ROUTING' as SecretKey, next)
    await refresh()
  }

  const handleModelChange = async (value: string) => {
    setOpen(false)
    await saveApiKey('SELECTED_MODEL' as SecretKey, value)
    await refresh()
  }

  const selectedOption = models.find(m => m.value === currentModel)

  // 按 provider 分组
  const grouped = models.reduce<Record<string, ModelOption[]>>((acc, m) => {
    ;(acc[m.provider] ??= []).push(m)
    return acc
  }, {})
  const providerOrder = ['copilot', 'custom', 'deepseek', 'qwen', 'volc', 'minimax']
  const providerLabel: Record<string, string> = {
    copilot: 'GitHub Copilot', custom: '自定义端点',
    deepseek: 'DeepSeek', qwen: 'Qwen', volc: 'Volc', minimax: 'MiniMax',
  }

  return (
    <div className="provider-card" style={{ marginBottom: 12 }}>
      <div className="provider-header" style={{ cursor: 'default' }}>
        <span className="provider-name">🧠 模型选择</span>
      </div>
      <div className="provider-body">
        <div className="model-routing-row">
          <label className="model-routing-toggle">
            <input type="checkbox" checked={isAuto} onChange={handleToggle} />
            <span className="model-routing-label">Auto（根据问题复杂度自动选择模型）</span>
          </label>
        </div>
        <p className="model-routing-hint">
          {isAuto
            ? '简单问题 → 轻量模型，普通问题 → 标准模型，复杂问题 → 最强模型'
            : '所有消息将使用下方选定的模型'}
        </p>

        {/* 自定义模型选择器 */}
        <div className="model-select-wrapper">
          <button
            ref={triggerRef}
            className="model-select-trigger"
            disabled={isAuto}
            onClick={handleTriggerClick}
          >
            {isAuto ? (
              <span className="model-select-name">🤖 自动选择</span>
            ) : (
              <>
                <span className="model-select-name">{selectedOption?.label ?? currentModel}</span>
                {selectedOption && categoryLabel(selectedOption) && (
                  <span className="model-select-multiplier" style={{ color: categoryColor(selectedOption) }}>
                    {categoryLabel(selectedOption)}
                    {selectedOption.preview && <span style={{ marginLeft: 3, fontSize: 9, opacity: 0.6 }}>Preview</span>}
                  </span>
                )}
              </>
            )}
            <span className="model-select-chevron">{open ? '▴' : '▾'}</span>
          </button>

          {open && dropdownPos && (
            <div
              ref={dropdownRef}
              className="model-select-dropdown"
              style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
            >
              {models.length === 0 ? (
                <div className="model-select-empty">加载中…</div>
              ) : (
                providerOrder
                  .filter(p => grouped[p]?.length)
                  .map(p => (
                    <div key={p}>
                      <div className="model-select-group">{providerLabel[p] ?? p}</div>
                      {grouped[p].map(m => (
                        <button
                          key={m.value}
                          className={`model-select-item ${m.value === currentModel ? 'selected' : ''}`}
                          onClick={() => handleModelChange(m.value)}
                        >
                          <span className="model-select-item-name">
                            {m.label}
                            {m.preview && <span className="model-preview-badge">Preview</span>}
                          </span>
                          {categoryLabel(m) && (
                            <span className="model-select-item-multiplier" style={{ color: categoryColor(m) }}>
                              {categoryLabel(m)}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Provider 定义 ─────────────────────────────────────────────────────────
const PROVIDER_GROUPS = [
  {
    id: 'custom' as const,
    label: '自定义 OpenAI 兑容端点',
    badge: '优先',
    fields: [
      { key: 'CUSTOM_BASE_URL' as SecretKey, label: 'Endpoint URL', type: 'text',     placeholder: 'https://your-endpoint/v1' },
      { key: 'CUSTOM_API_KEY' as SecretKey, label: 'Access Key',   type: 'password',  placeholder: 'sk-...' },
      { key: 'CUSTOM_MODEL'   as SecretKey, label: 'Model',        type: 'text',      placeholder: 'gpt-4o' },
    ],
    saveKeys: ['CUSTOM_BASE_URL', 'CUSTOM_API_KEY', 'CUSTOM_MODEL'] as SecretKey[],
  },
  {
    id: 'deepseek' as const,
    label: 'DeepSeek',
    fields: [{ key: 'DEEPSEEK_API_KEY' as SecretKey, label: 'API Key', type: 'password', placeholder: 'sk-...' }],
    saveKeys: ['DEEPSEEK_API_KEY'] as SecretKey[],
  },
  {
    id: 'qwen' as const,
    label: 'Qwen （通义千问）',
    fields: [{ key: 'QWEN_API_KEY' as SecretKey, label: 'API Key', type: 'password', placeholder: 'sk-...' }],
    saveKeys: ['QWEN_API_KEY'] as SecretKey[],
  },
  {
    id: 'volc' as const,
    label: 'Volc （豆包）',
    fields: [{ key: 'VOLC_API_KEY' as SecretKey, label: 'API Key', type: 'password', placeholder: '...' }],
    saveKeys: ['VOLC_API_KEY'] as SecretKey[],
  },
  {
    id: 'minimax' as const,
    label: 'MiniMax（MiniMax-M2.5 / M2.7）',
    fields: [{ key: 'MINIMAX_API_KEY' as SecretKey, label: 'API Key', type: 'password', placeholder: 'eyJ...' }],
    saveKeys: ['MINIMAX_API_KEY'] as SecretKey[],
  },
]

const PROVIDER_LABEL: Record<string, string> = {
  copilot: 'GitHub Copilot',
  custom: '自定义端点',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  volc: 'Volc',
  minimax: 'MiniMax',
}

// ─── Copilot 登录状态 ─────────────────────────────────────────────────────────
type CopilotState =
  | { phase: 'idle' }
  | { phase: 'waiting'; userCode: string; verificationUri: string }
  | { phase: 'logged-in'; user: string }
  | { phase: 'error'; message: string }

export default function Settings({ onClose }: { onClose?: () => void }) {
  const {
    saveApiKey, loadSettings, deleteKey,
    copilotLogin, copilotLoginStatus, copilotLogout,
  } = useGateway()

  // 已配置状态（来自服务端）
  const [settings, setSettings] = useState<SettingsState>({ configured: [], activeProvider: null })
  // 用户正在编辑的字段
  const [draft, setDraft] = useState<Partial<Record<SecretKey, string>>>({})
  // 每个 group 的保存状态
  const [saving, setSaving] = useState<Record<string, 'idle' | 'saving' | 'ok' | 'err'>>({})
  // 展开/折叠的 group
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ custom: true })

  // ─── Copilot 状态 ─────────────────────────────────────────────────────
  const [copilot, setCopilot] = useState<CopilotState>({ phase: 'idle' })
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refresh = useCallback(async () => {
    const s = await loadSettings()
    setSettings(s)
    // 当前已配置的 group 默认展开
    const exp: Record<string, boolean> = { custom: true }
    for (const g of PROVIDER_GROUPS) {
      if (g.fields.some(f => s.configured.find(c => c.key === f.key))) {
        exp[g.id] = true
      }
    }
    setExpanded(exp)

    // 检测 copilot 登录状态
    if (s.activeProvider === 'copilot') {
      const ghToken = s.configured.find(c => c.key === 'GITHUB_TOKEN')
      setCopilot({ phase: 'logged-in', user: ghToken ? 'GitHub User' : '' })
    } else {
      // 检查是否有保存的 GITHUB_TOKEN（但不是活跃 provider）
      const ghToken = s.configured.find(c => c.key === 'GITHUB_TOKEN')
      if (ghToken) {
        setCopilot({ phase: 'logged-in', user: 'GitHub User' })
      }
    }
  }, [loadSettings])

  useEffect(() => { refresh() }, [refresh])

  // 清理轮询定时器
  useEffect(() => {
    return () => { if (pollTimerRef.current) clearTimeout(pollTimerRef.current) }
  }, [])

  const getMasked = (key: SecretKey) =>
    settings.configured.find(c => c.key === key)?.masked ?? ''

  // ─── Copilot 登录流程 ───────────────────────────────────────────────────────

  const handleCopilotLogin = async () => {
    const result = await copilotLogin()
    if (result.error) {
      setCopilot({ phase: 'error', message: result.error })
      return
    }
    setCopilot({ phase: 'waiting', userCode: result.userCode, verificationUri: result.verificationUri })

    // 打开浏览器
    try { await open(result.verificationUri) } catch { /* ignore */ }

    // 开始轮询
    const poll = async (interval: number) => {
      const status = await copilotLoginStatus()
      if (status.status === 'ok') {
        setCopilot({ phase: 'logged-in', user: status.user ?? 'GitHub User' })
        await refresh()
      } else if (status.status === 'pending') {
        pollTimerRef.current = setTimeout(() => poll(status.interval ?? interval), (status.interval ?? interval) * 1000)
      } else {
        setCopilot({ phase: 'error', message: status.message ?? '登录失败' })
      }
    }
    pollTimerRef.current = setTimeout(() => poll(result.interval || 5), (result.interval || 5) * 1000)
  }

  const handleCopilotLogout = async () => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    await copilotLogout()
    setCopilot({ phase: 'idle' })
    await refresh()
  }

  const handleSave = async (groupId: string, keys: SecretKey[]) => {
    setSaving(p => ({ ...p, [groupId]: 'saving' }))
    try {
      for (const k of keys) {
        const val = draft[k]?.trim()
        if (val) await saveApiKey(k, val)
      }
      // 清空该 group 的 draft
      setDraft(p => {
        const n = { ...p }
        keys.forEach(k => delete n[k])
        return n
      })
      await refresh()
      setSaving(p => ({ ...p, [groupId]: 'ok' }))
      setTimeout(() => setSaving(p => ({ ...p, [groupId]: 'idle' })), 2000)
    } catch {
      setSaving(p => ({ ...p, [groupId]: 'err' }))
    }
  }

  const handleClear = async (groupId: string, keys: SecretKey[]) => {
    for (const k of keys) await deleteKey(k)
    await refresh()
    setSaving(p => ({ ...p, [groupId]: 'idle' }))
  }

  const saveLabel = (state: string) =>
    state === 'saving' ? '保存中…' : state === 'ok' ? '✓ 已保存' : state === 'err' ? '✕ 失败' : '保存'

  // ─── Tab 状态 ───────────────────────────────────────────────────────
  const [tab, setTab] = useState<SettingsTab>('model')
  const [toolsList, setToolsList] = useState<Array<{ name: string }>>([])
  const [skillsList, setSkillsList] = useState<Array<{ name: string; description: string; source: string }>>([])

  // Gallery 状态
  const [galleryList, setGalleryList] = useState<Array<{ name: string; description: string; repoId: string; remotePath: string; downloadUrl: string; trust: string; installed: boolean }>>([])
  const [galleryLoading, setGalleryLoading] = useState(false)
  const [galleryError, setGalleryError] = useState('')
  const [installing, setInstalling] = useState<Record<string, 'idle' | 'installing' | 'ok' | 'err'>>({})
  const [installMsg, setInstallMsg] = useState<Record<string, string>>({})

  const fetchGallery = useCallback(async () => {
    setGalleryLoading(true)
    setGalleryError('')
    try {
      const r = await fetch('http://localhost:18790/skills/gallery')
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setGalleryList(await r.json())
    } catch (e) {
      setGalleryError(e instanceof Error ? e.message : '获取失败')
    } finally {
      setGalleryLoading(false)
    }
  }, [])

  const handleInstallSkill = useCallback(async (skill: typeof galleryList[0]) => {
    setInstalling(p => ({ ...p, [skill.name]: 'installing' }))
    setInstallMsg(p => ({ ...p, [skill.name]: '' }))
    try {
      const r = await fetch('http://localhost:18790/skills/gallery/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: skill.name, repoId: skill.repoId, downloadUrl: skill.downloadUrl, remotePath: skill.remotePath }),
      })
      const result = await r.json()
      if (result.ok) {
        setInstalling(p => ({ ...p, [skill.name]: 'ok' }))
        setInstallMsg(p => ({ ...p, [skill.name]: '✅ 已安装' }))
        setGalleryList(prev => prev.map(s => s.name === skill.name ? { ...s, installed: true } : s))
        // 刷新已加载列表
        const sr = await fetch('http://localhost:18790/skills')
        setSkillsList(await sr.json())
      } else {
        setInstalling(p => ({ ...p, [skill.name]: 'err' }))
        setInstallMsg(p => ({ ...p, [skill.name]: result.message }))
      }
    } catch {
      setInstalling(p => ({ ...p, [skill.name]: 'err' }))
      setInstallMsg(p => ({ ...p, [skill.name]: '网络错误' }))
    }
  }, [])

  const handleUninstallSkill = useCallback(async (name: string) => {
    try {
      const r = await fetch('http://localhost:18790/skills/gallery/uninstall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const result = await r.json()
      if (result.ok) {
        setGalleryList(prev => prev.map(s => s.name === name ? { ...s, installed: false } : s))
        const sr = await fetch('http://localhost:18790/skills')
        setSkillsList(await sr.json())
      }
    } catch { /* ignore */ }
  }, [])

  // 费用统计
  const [globalCost, setGlobalCost] = useState<{ totalCny: number; totalTokens: number; callCount: number; sessionCount: number } | null>(null)

  useEffect(() => {
    if (tab === 'tools') {
      fetch('http://localhost:18790/tools').then(r => r.json()).then(setToolsList).catch(() => {})
    }
    if (tab === 'skills') {
      fetch('http://localhost:18790/skills').then(r => r.json()).then(setSkillsList).catch(() => {})
    }
    if (tab === 'about') {
      fetch('http://localhost:18790/cost/global').then(r => r.json()).then(setGlobalCost).catch(() => {})
    }
  }, [tab])

  return (
    <div className="settings-root">
      <div className="settings-header">
        <span>设置</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {settings.activeProvider && (
            <span className="active-badge">
              ✔ {PROVIDER_LABEL[settings.activeProvider]}
            </span>
          )}
          {onClose && <button className="btn-close" onClick={onClose}>✕</button>}
        </div>
      </div>

      {/* Tab 导航 */}
      <div className="settings-tabs">
        {([
          { id: 'model' as SettingsTab, label: '🤖 模型' },
          { id: 'tools' as SettingsTab, label: '🔧 工具' },
          { id: 'skills' as SettingsTab, label: '📚 Skills' },
          { id: 'advanced' as SettingsTab, label: '⚙️ 高级' },
          { id: 'about' as SettingsTab, label: 'ℹ️ 关于' },
        ]).map(t => (
          <button
            key={t.id}
            className={`settings-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="settings-body">

      {/* ━━━ 模型 Tab ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {tab === 'model' && (<>
        {!settings.activeProvider && (
          <p className="settings-hint">请配置任意一个 Provider，保存后即自动激活</p>
        )}

        {/* ─── 模型路由选择器 ──────────────────────────────────────────── */}
        <ModelRoutingCard settings={settings} saveApiKey={saveApiKey} refresh={refresh} />

        {/* ─── Copilot 卡片 ──────────────────────────────────────────────── */}
        <div className={`provider-card ${settings.activeProvider === 'copilot' ? 'active' : ''}`}>
          <div className="provider-header" onClick={() => setExpanded(p => ({ ...p, copilot: !p.copilot }))}>
            <span className="provider-name">🐙 GitHub Copilot</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="priority-badge">免费</span>
              {settings.activeProvider === 'copilot' && <span className="active-dot" title="当前激活" />}
              {copilot.phase === 'logged-in' && settings.activeProvider !== 'copilot' && <span className="configured-dot" title="已登录" />}
              <span className="chevron">{expanded.copilot ? '▴' : '▾'}</span>
            </div>
          </div>

          {expanded.copilot && (
            <div className="provider-body">
              {copilot.phase === 'idle' && (
                <>
                  <p style={{ margin: '0 0 8px', fontSize: 12, color: '#888' }}>
                    通过 GitHub Copilot 订阅免费使用 Claude / GPT / Gemini 等模型
                  </p>
                  <button className="btn-save" onClick={handleCopilotLogin}>
                    🔑 登录 GitHub
                  </button>
                </>
              )}

              {copilot.phase === 'waiting' && (
                <div className="copilot-device-flow">
                  <p style={{ margin: '0 0 4px', fontSize: 12, color: '#888' }}>
                    请在浏览器中输入验证码：
                  </p>
                  <div className="copilot-user-code">{copilot.userCode}</div>
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: '#666' }}>
                    ⏳ 等待授权中…
                  </p>
                </div>
              )}

              {copilot.phase === 'logged-in' && (
                <>
                  <p style={{ margin: '0 0 8px', fontSize: 13, color: '#4caf50' }}>
                    ✅ 已登录 {copilot.user ? `(${copilot.user})` : ''}
                  </p>
                  <p style={{ margin: '4px 0 8px', fontSize: 11, color: '#888' }}>
                    费用：¥0（含在 Copilot 订阅中）。模型选择请使用上方「模型选择」卡片。
                  </p>
                  <button className="btn-clear" onClick={handleCopilotLogout}>
                    退出登录
                  </button>
                </>
              )}

              {copilot.phase === 'error' && (
                <>
                  <p style={{ margin: '0 0 8px', fontSize: 12, color: '#f44336' }}>
                    ❌ {copilot.message}
                  </p>
                  <button className="btn-save" onClick={handleCopilotLogin}>
                    🔑 重新登录
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* ─── 其他 Provider 卡片 ─────────────────────────────────────────── */}

        {PROVIDER_GROUPS.map(group => {
          const isActive = settings.activeProvider === group.id
          const isOpen = !!expanded[group.id]
          const hasAny = group.fields.some(f => getMasked(f.key))
          const hasDraft = group.saveKeys.some(k => draft[k]?.trim())

          return (
            <div key={group.id} className={`provider-card ${isActive ? 'active' : ''}`}>
              {/* 卡片标题行 */}
              <div className="provider-header" onClick={() => setExpanded(p => ({ ...p, [group.id]: !p[group.id] }))}>
                <span className="provider-name">{group.label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {'badge' in group && <span className="priority-badge">{group.badge}</span>}
                  {isActive && <span className="active-dot" title="当前激活" />}
                  {hasAny && !isActive && <span className="configured-dot" title="已配置" />}
                  <span className="chevron">{isOpen ? '▴' : '▾'}</span>
                </div>
              </div>

              {/* 展开内容 */}
              {isOpen && (
                <div className="provider-body">
                  {group.fields.map(f => (
                    <div key={f.key} className="key-row">
                      <label>{f.label}</label>
                      <input
                        type={f.type}
                        placeholder={getMasked(f.key) || f.placeholder}
                        value={draft[f.key] ?? ''}
                        onChange={e => setDraft(p => ({ ...p, [f.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                  <div className="provider-actions">
                    {hasAny && (
                      <button
                        className="btn-clear"
                        onClick={() => handleClear(group.id, group.saveKeys)}
                      >
                        清除
                      </button>
                    )}
                    <button
                      className="btn-save"
                      disabled={!hasDraft || saving[group.id] === 'saving'}
                      onClick={() => handleSave(group.id, group.saveKeys)}
                    >
                      {saveLabel(saving[group.id] ?? 'idle')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {/* ─── 网络代理配置 ─────────────────────────────────────────── */}
        <div className="settings-section-title" style={{ marginTop: 8 }}>网络设置</div>
        <div className="provider-card">
          <div className="provider-header" onClick={() => setExpanded(p => ({ ...p, proxy: !p.proxy }))}>
            <span className="provider-name">🌐 HTTP 代理</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {getMasked('HTTPS_PROXY' as SecretKey) && <span className="configured-dot" title="已配置" />}
              <span className="chevron">{expanded.proxy ? '▴' : '▾'}</span>
            </div>
          </div>
          {expanded.proxy && (
            <div className="provider-body">
              <p style={{ margin: '0 0 8px', fontSize: 12, color: '#888' }}>
                在中国大陆访问 GitHub Copilot API 通常需要 HTTP 代理
              </p>
              <div className="key-row">
                <label>Proxy URL</label>
                <input
                  type="text"
                  placeholder={getMasked('HTTPS_PROXY' as SecretKey) || 'http://127.0.0.1:7890'}
                  value={draft['HTTPS_PROXY' as SecretKey] ?? ''}
                  onChange={e => setDraft(p => ({ ...p, HTTPS_PROXY: e.target.value }))}
                />
              </div>
              <div className="provider-actions">
                {getMasked('HTTPS_PROXY' as SecretKey) && (
                  <button
                    className="btn-clear"
                    onClick={() => handleClear('proxy', ['HTTPS_PROXY' as SecretKey])}
                  >
                    清除
                  </button>
                )}
                <button
                  className="btn-save"
                  disabled={!draft['HTTPS_PROXY' as SecretKey]?.trim() || saving.proxy === 'saving'}
                  onClick={() => handleSave('proxy', ['HTTPS_PROXY' as SecretKey])}
                >
                  {saveLabel(saving.proxy ?? 'idle')}
                </button>
              </div>
            </div>
          )}
        </div>

      </>)}

      {/* ━━━ 工具 Tab ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {tab === 'tools' && (
        <>
          {/* ─── Brave Search API Key 配置卡 ─────────────────────────────── */}
          <div className="provider-card">
            <div className="provider-header" onClick={() => setExpanded(p => ({ ...p, braveSearch: !p.braveSearch }))}>
              <span className="provider-name">🔍 Web Search（Brave Search API）</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {getMasked('BRAVE_SEARCH_API_KEY') && <span className="configured-dot" title="已配置" />}
                <span className="chevron">{expanded.braveSearch ? '▴' : '▾'}</span>
              </div>
            </div>
            {expanded.braveSearch && (
              <div className="provider-body">
                <p style={{ margin: '0 0 8px', fontSize: 12, color: '#888' }}>
                  免费申请：<a href="https://brave.com/search/api/" target="_blank" rel="noreferrer"
                    style={{ color: 'var(--accent)' }}>brave.com/search/api</a>
                  （免费版每月 2000 次）。未配置时自动回退至 DuckDuckGo。
                </p>
                <div className="key-row">
                  <label>API Key</label>
                  <input
                    type="password"
                    placeholder={getMasked('BRAVE_SEARCH_API_KEY') || 'BSAxxxxx…'}
                    value={draft['BRAVE_SEARCH_API_KEY'] ?? ''}
                    onChange={e => setDraft(p => ({ ...p, BRAVE_SEARCH_API_KEY: e.target.value }))}
                  />
                </div>
                <div className="provider-actions">
                  {getMasked('BRAVE_SEARCH_API_KEY') && (
                    <button className="btn-clear" onClick={() => handleClear('braveSearch', ['BRAVE_SEARCH_API_KEY'])}>清除</button>
                  )}
                  <button
                    className="btn-save"
                    disabled={!draft['BRAVE_SEARCH_API_KEY']?.trim() || saving.braveSearch === 'saving'}
                    onClick={() => handleSave('braveSearch', ['BRAVE_SEARCH_API_KEY'])}
                  >
                    {saveLabel(saving.braveSearch ?? 'idle')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ─── Chrome 路径配置卡 ─────────────────────────────────────────── */}
          <div className="provider-card">
            <div className="provider-header" onClick={() => setExpanded(p => ({ ...p, chromePath: !p.chromePath }))}>
              <span className="provider-name">🌐 浏览器工具（Chrome 路径）</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {getMasked('CHROME_PATH') && <span className="configured-dot" title="已配置" />}
                <span className="chevron">{expanded.chromePath ? '▴' : '▾'}</span>
              </div>
            </div>
            {expanded.chromePath && (
              <div className="provider-body">
                <p style={{ margin: '0 0 8px', fontSize: 12, color: '#888' }}>
                  非必填。未填时自动搜索系统 Chrome / Edge。如自动搜索失败，请手动填入 chrome.exe 的完整路径。
                </p>
                <div className="key-row">
                  <label>Chrome 路径</label>
                  <input
                    type="text"
                    placeholder={getMasked('CHROME_PATH') || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'}
                    value={draft['CHROME_PATH'] ?? ''}
                    onChange={e => setDraft(p => ({ ...p, CHROME_PATH: e.target.value }))}
                  />
                </div>
                <div className="provider-actions">
                  {getMasked('CHROME_PATH') && (
                    <button className="btn-clear" onClick={() => handleClear('chromePath', ['CHROME_PATH'])}>清除</button>
                  )}
                  <button
                    className="btn-save"
                    disabled={!draft['CHROME_PATH']?.trim() || saving.chromePath === 'saving'}
                    onClick={() => handleSave('chromePath', ['CHROME_PATH'])}
                  >
                    {saveLabel(saving.chromePath ?? 'idle')}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="settings-section-title" style={{ marginTop: 16 }}>已注册工具</div>
          {toolsList.length === 0 ? (
            <p className="settings-hint">加载中…</p>
          ) : (
            <div className="tools-list">
              {toolsList.map(t => (
                <div key={t.name} className="tool-item">
                  <span className="tool-icon">🔧</span>
                  <span className="tool-name">{t.name}</span>
                </div>
              ))}
            </div>
          )}
          <p className="settings-hint" style={{ marginTop: 8 }}>
            工具调用上限：30 次/轮 · bash 超时见「⚙️ 高级」设置
          </p>
        </>
      )}

      {/* ━━━ Skills Tab ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {tab === 'skills' && (
        <>
          <div className="settings-section-title">已加载 Skills（{skillsList.length}）</div>
          {skillsList.length === 0 ? (
            <p className="settings-hint">加载中…</p>
          ) : (
            <div className="skills-list">
              {skillsList.map(s => (
                <div key={s.name} className="skill-item">
                  <div className="skill-header">
                    <span className="skill-name">{s.name}</span>
                    <span className="skill-source">{s.source}</span>
                  </div>
                  <div className="skill-desc">{s.description}</div>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button
              className="btn-save"
              onClick={async () => {
                await fetch('http://localhost:18790/skills/reload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
                const r = await fetch('http://localhost:18790/skills')
                setSkillsList(await r.json())
              }}
            >
              🔄 重新加载
            </button>
            <button
              className="btn-save"
              onClick={fetchGallery}
              disabled={galleryLoading}
            >
              {galleryLoading ? '加载中…' : '🛒 技能商店'}
            </button>
          </div>

          {/* Gallery 区域 */}
          {galleryError && (
            <p className="settings-hint" style={{ color: '#f44336', marginTop: 8 }}>❌ {galleryError}</p>
          )}
          {galleryList.length > 0 && (
            <>
              <div className="settings-section-title" style={{ marginTop: 12 }}>
                🛡️ 可信仓库 Skills
              </div>
              <p className="settings-hint">
                以下 Skills 来自经过安全审计的官方仓库，安装前会自动进行安全扫描
              </p>
              <div className="skills-list">
                {galleryList.map(g => (
                  <div key={`${g.repoId}/${g.name}`} className="skill-item gallery-item">
                    <div className="skill-header">
                      <span className="skill-name">{g.name}</span>
                      <span className={`skill-trust trust-${g.trust}`}>
                        {g.trust === 'official' ? '🔒 官方' : g.trust === 'verified' ? '✅ 已验证' : '👥 社区'}
                      </span>
                    </div>
                    <div className="skill-desc">{g.description}</div>
                    <div className="gallery-actions">
                      {g.installed ? (
                        <>
                          <span className="gallery-installed">✅ 已安装</span>
                          <button className="btn-clear btn-sm" onClick={() => handleUninstallSkill(g.name)}>卸载</button>
                        </>
                      ) : (
                        <button
                          className="btn-save btn-sm"
                          disabled={installing[g.name] === 'installing'}
                          onClick={() => handleInstallSkill(g)}
                        >
                          {installing[g.name] === 'installing' ? '安装中…' : installing[g.name] === 'ok' ? '✓' : '安装'}
                        </button>
                      )}
                    </div>
                    {installMsg[g.name] && (
                      <div className={`gallery-msg ${installing[g.name] === 'err' ? 'err' : ''}`}>
                        {installMsg[g.name]}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ━━━ 高级 Tab ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {tab === 'advanced' && (
        <>
          {/* ─── Bash 超时配置 ────────────────────────────────────────── */}
          <div className="advanced-section">
            <div className="advanced-section-title">⚡ 性能设置</div>

            <div className="advanced-item">
              <div className="advanced-item-header">
                <span className="advanced-item-label">Bash 默认超时</span>
                <span className="advanced-item-unit">ms</span>
              </div>
              <input
                className="advanced-input"
                type="number"
                placeholder={getMasked('BASH_TIMEOUT_MS' as SecretKey) || '300000'}
                value={draft['BASH_TIMEOUT_MS' as SecretKey] ?? ''}
                onChange={e => setDraft(p => ({ ...p, BASH_TIMEOUT_MS: e.target.value }))}
              />
              <p className="advanced-item-desc">bash 前台命令的总超时。最小 5s，默认 5 分钟。命令持续有输出不会被此超时中断，只有总时长超限才触发。</p>
            </div>

            <div className="advanced-item">
              <div className="advanced-item-header">
                <span className="advanced-item-label">无输出超时</span>
                <span className="advanced-item-unit">ms</span>
              </div>
              <input
                className="advanced-input"
                type="number"
                placeholder={getMasked('BASH_IDLE_TIMEOUT_MS' as SecretKey) || '120000'}
                value={draft['BASH_IDLE_TIMEOUT_MS' as SecretKey] ?? ''}
                onChange={e => setDraft(p => ({ ...p, BASH_IDLE_TIMEOUT_MS: e.target.value }))}
              />
              <p className="advanced-item-desc">命令在此时间内无任何 stdout/stderr 输出则判定卡死并终止。设为 0 禁用。默认 2 分钟。</p>
            </div>

            <div className="advanced-item">
              <div className="advanced-item-header">
                <span className="advanced-item-label">超时上限</span>
                <span className="advanced-item-unit">ms</span>
              </div>
              <input
                className="advanced-input"
                type="number"
                placeholder={getMasked('BASH_MAX_TIMEOUT_MS' as SecretKey) || '1800000'}
                value={draft['BASH_MAX_TIMEOUT_MS' as SecretKey] ?? ''}
                onChange={e => setDraft(p => ({ ...p, BASH_MAX_TIMEOUT_MS: e.target.value }))}
              />
              <p className="advanced-item-desc">单条 bash 命令的绝对上限，防止 LLM 传入过大的 timeout_ms。默认 30 分钟。</p>
            </div>

            <div className="provider-actions" style={{ marginTop: 4 }}>
              <button
                className="btn-save"
                disabled={(!draft['BASH_TIMEOUT_MS' as SecretKey]?.trim() && !draft['BASH_IDLE_TIMEOUT_MS' as SecretKey]?.trim() && !draft['BASH_MAX_TIMEOUT_MS' as SecretKey]?.trim()) || saving.advanced === 'saving'}
                onClick={() => handleSave('advanced', ['BASH_TIMEOUT_MS' as SecretKey, 'BASH_IDLE_TIMEOUT_MS' as SecretKey, 'BASH_MAX_TIMEOUT_MS' as SecretKey])}
              >
                {saveLabel(saving.advanced ?? 'idle')}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ━━━ 关于 Tab ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {tab === 'about' && (
        <div className="about-section">
          <div className="about-logo">⚡</div>
          <h2 className="about-title">Equality</h2>
          <p className="about-version">v0.2.1</p>
          <p className="about-desc">面向中国大陆 Windows 用户的 AI 桌面智能助理</p>
          <div className="about-info">
            <div className="about-row"><span>运行环境</span><span>Tauri + React + Fastify</span></div>
            <div className="about-row"><span>工具数量</span><span>{toolsList.length || '—'}</span></div>
            <div className="about-row"><span>Skills 数量</span><span>{skillsList.length || '—'}</span></div>
          </div>
          {globalCost && (
            <>
              <div className="settings-section-title" style={{ marginTop: 16, alignSelf: 'flex-start' }}>💰 累计费用</div>
              <div className="about-info">
                <div className="about-row"><span>总费用</span><span style={{ color: '#ff9f0a' }}>¥{globalCost.totalCny.toFixed(4)}</span></div>
                <div className="about-row"><span>总 Tokens</span><span>{globalCost.totalTokens.toLocaleString()}</span></div>
                <div className="about-row"><span>调用次数</span><span>{globalCost.callCount}</span></div>
                <div className="about-row"><span>会话数</span><span>{globalCost.sessionCount}</span></div>
              </div>
            </>
          )}
          <p className="about-copyright">© 2026 Equality Project</p>
        </div>
      )}

      </div>
    </div>
  )
}
