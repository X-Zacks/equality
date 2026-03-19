import { useState, useEffect, useCallback, useRef } from 'react'
import { useGateway } from './useGateway'
import type { SettingsState, SecretKey } from './useGateway'
import { open } from '@tauri-apps/plugin-shell'
import './Settings.css'

type SettingsTab = 'model' | 'tools' | 'skills' | 'advanced' | 'about'
type ThemePreference = 'system' | 'light' | 'dark'
type EffectiveTheme = 'light' | 'dark'

// ─── 模型路由选择器组�?───────────────────────────────────────────────────────

interface ModelOption {
  value: string
  label: string
  provider: string
  multiplier?: number
  category?: string   // powerful / versatile / fast
  preview?: boolean
}

function categoryLabel(m: ModelOption): string {
  // Copilot 模型�?category，其�?provider �?multiplier
  if (m.category) {
    switch (m.category) {
      case 'powerful': return '🔥'
      case 'versatile': return '❤️'
      case 'fast': return '�?
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
    if (m.multiplier <= 1) return 'var(--tag-neutral)'
    if (m.multiplier <= 3) return '#ff9f0a'
    return '#ff453a'
  }
  return 'var(--tag-faint)'
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

  // 动态获取所有可用模�?
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

  // �?provider 分组
  const grouped = models.reduce<Record<string, ModelOption[]>>((acc, m) => {
    ;(acc[m.provider] ??= []).push(m)
    return acc
  }, {})
  const providerOrder = ['copilot', 'custom', 'deepseek', 'qwen', 'volc', 'minimax']
  const providerLabel: Record<string, string> = {
    copilot: 'GitHub Copilot', custom: '自定义端�?,
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
            <span className="model-routing-label">Auto（根据问题复杂度自动选择模型�?/span>
          </label>
        </div>
        <p className="model-routing-hint">
          {isAuto
            ? '简单问�?�?轻量模型，普通问�?�?标准模型，复杂问�?�?最强模�?
            : '所有消息将使用下方选定的模�?}
        </p>

        {/* 自定义模型选择�?*/}
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
            <span className="model-select-chevron">{open ? '�? : '�?}</span>
          </button>

          {open && dropdownPos && (
            <div
              ref={dropdownRef}
              className="model-select-dropdown"
              style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width }}
            >
              {models.length === 0 ? (
                <div className="model-select-empty">加载中�?/div>
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
    label: '自定�?OpenAI 兑容端点',
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
    label: 'Qwen （通义千问�?,
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
    label: 'MiniMax（MiniMax-M2.5 / M2.7�?,
    fields: [{ key: 'MINIMAX_API_KEY' as SecretKey, label: 'API Key', type: 'password', placeholder: 'eyJ...' }],
    saveKeys: ['MINIMAX_API_KEY'] as SecretKey[],
  },
]

const PROVIDER_LABEL: Record<string, string> = {
  copilot: 'GitHub Copilot',
  custom: '自定义端�?,
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  volc: 'Volc',
  minimax: 'MiniMax',
}

// ─── Copilot 登录状�?─────────────────────────────────────────────────────────
type CopilotState =
  | { phase: 'idle' }
  | { phase: 'waiting'; userCode: string; verificationUri: string }
  | { phase: 'logged-in'; user: string }
  | { phase: 'error'; message: string }


// ─── Provider 图标映射 ────────────────────────────────────────────────────────
const PROVIDER_ICON: Record<string, string> = {
  copilot: '🐙',
  custom: '🔌',
  deepseek: '🔮',
  qwen: '🌟',
  volc: '🌋',
  minimax: '🤖',
}

// ─── ProviderRow: 固定高度48px的列表行 ──────────────────────────────────────
interface ProviderRowProps {
  id: string
  label: string
  badge?: string
  status: 'active' | 'configured' | 'unconfigured'
  isCopilotUnlogged?: boolean
  onAction: () => void
}

function ProviderRow({ id, label, badge, status, isCopilotUnlogged, onAction }: ProviderRowProps) {
  const icon = PROVIDER_ICON[id] ?? '�?

  const statusNode = (() => {
    if (status === 'active') return <span className="pr-status pr-status-active">�?激活中</span>
    if (status === 'configured') return <span className="pr-status pr-status-configured">�?已配�?/span>
    return <span className="pr-status pr-status-unconfigured">�?未配�?/span>
  })()

  const actionLabel = (() => {
    if (isCopilotUnlogged) return '登录 GitHub'
    if (status === 'active' || status === 'configured') return '管理'
    return '配置'
  })()

  return (
    <div className={`provider-row ${status === 'active' ? 'provider-row-active' : ''}`}>
      <span className="pr-icon">{icon}</span>
      <span className="pr-name">{label}</span>
      {badge && <span className="pr-badge">{badge}</span>}
      <div className="pr-right">
        {statusNode}
        <button className="pr-action-btn" onClick={onAction}>{actionLabel}</button>
      </div>
    </div>
  )
}

// ─── ProviderDrawer: 右侧滑出抽屉 ────────────────────────────────────────────
interface ProviderDrawerProps {
  providerId: string
  settings: SettingsState
  draft: Partial<Record<SecretKey, string>>
  saving: Record<string, 'idle' | 'saving' | 'ok' | 'err'>
  copilot: CopilotState
  getMasked: (key: SecretKey) => string
  onDraftChange: (key: SecretKey, value: string) => void
  onSave: (groupId: string, keys: SecretKey[]) => Promise<void>
  onClear: (groupId: string, keys: SecretKey[]) => Promise<void>
  onCopilotLogin: () => Promise<void>
  onCopilotLogout: () => Promise<void>
  onClose: () => void
}

function saveLabel(state: string) {
  return state === 'saving' ? '保存中�? : state === 'ok' ? '�?已保�? : state === 'err' ? '�?失败' : '保存'
}

function ProviderDrawer({
  providerId, settings, draft, saving, copilot,
  getMasked, onDraftChange, onSave, onClear, onCopilotLogin, onCopilotLogout, onClose,
}: ProviderDrawerProps) {
  const group = PROVIDER_GROUPS.find(g => g.id === providerId)
  const isActive = settings.activeProvider === providerId

  // Copilot 抽屉内容
  if (providerId === 'copilot') {
    return (
      <div className="drawer-mask" onClick={onClose}>
        <div className="drawer-panel" onClick={e => e.stopPropagation()}>
          <div className="drawer-header">
            <span className="drawer-title">🐙 GitHub Copilot</span>
            <button className="drawer-close" onClick={onClose}>�?/button>
          </div>
          <div className="drawer-body">
            {isActive && (
              <div className="drawer-active-bar">�?当前激�?/div>
            )}
            {copilot.phase === 'idle' && (
              <>
                <p className="drawer-hint">
                  通过 GitHub Copilot 订阅免费使用 Claude / GPT / Gemini 等模�?
                </p>
                <button className="btn-save drawer-btn-full" onClick={onCopilotLogin}>
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
                  �?等待授权中�?
                </p>
              </div>
            )}
            {copilot.phase === 'logged-in' && (
              <>
                <p style={{ margin: '0 0 8px', fontSize: 13, color: '#4caf50' }}>
                  �?已登�?{copilot.user ? `(${copilot.user})` : ''}
                </p>
                <p style={{ margin: '4px 0 12px', fontSize: 11, color: '#888' }}>
                  费用：�?（含�?Copilot 订阅中）。模型选择请使用上方「模型选择」卡片�?
                </p>
                <button className="btn-clear drawer-btn-full" onClick={onCopilotLogout}>
                  退出登�?
                </button>
              </>
            )}
            {copilot.phase === 'error' && (
              <>
                <p style={{ margin: '0 0 8px', fontSize: 12, color: '#f44336' }}>
                  �?{copilot.message}
                </p>
                <button className="btn-save drawer-btn-full" onClick={onCopilotLogin}>
                  🔑 重新登录
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // 普�?provider 抽屉内容
  if (!group) return null

  const hasAny = group.fields.some(f => getMasked(f.key))
  const hasDraft = group.saveKeys.some(k => draft[k]?.trim())

  return (
    <div className="drawer-mask" onClick={onClose}>
      <div className="drawer-panel" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <span className="drawer-title">{PROVIDER_ICON[providerId] ?? '�?} {PROVIDER_LABEL[providerId]}</span>
          <button className="drawer-close" onClick={onClose}>�?/button>
        </div>
        <div className="drawer-body">
          {isActive && (
            <div className="drawer-active-bar">�?当前激�?/div>
          )}
          {'badge' in group && (
            <div className="drawer-badge-row">
              <span className="priority-badge">{group.badge}</span>
            </div>
          )}
          {group.fields.map(f => (
            <div key={f.key} className="key-row">
              <label>{f.label}</label>
              <input
                type={f.type}
                placeholder={getMasked(f.key) || f.placeholder}
                value={draft[f.key] ?? ''}
                onChange={e => onDraftChange(f.key, e.target.value)}
              />
            </div>
          ))}
          <div className="provider-actions" style={{ marginTop: 8 }}>
            {hasAny && (
              <button className="btn-clear" onClick={() => onClear(group.id, group.saveKeys)}>
                清除
              </button>
            )}
            <button
              className="btn-save"
              disabled={!hasDraft || saving[group.id] === 'saving'}
              onClick={() => onSave(group.id, group.saveKeys)}
            >
              {saveLabel(saving[group.id] ?? 'idle')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Settings({
  onClose,
  themePreference,
  effectiveTheme,
  onThemeChange,
}: {
  onClose?: () => void
  themePreference: ThemePreference
  effectiveTheme: EffectiveTheme
  onThemeChange: (theme: ThemePreference) => void
}) {
  const {
    saveApiKey, loadSettings, deleteKey,
    copilotLogin, copilotLoginStatus, copilotLogout,
  } = useGateway()

  // 已配置状态（来自服务端）
  const [settings, setSettings] = useState<SettingsState>({ configured: [], activeProvider: null })
  // 用户正在编辑的字�?
  const [draft, setDraft] = useState<Partial<Record<SecretKey, string>>>({})
  // 每个 group 的保存状�?
  const [saving, setSaving] = useState<Record<string, 'idle' | 'saving' | 'ok' | 'err'>>({})
  // 当前打开�?drawer（provider id，null 表示关闭�?
  const [drawerProvider, setDrawerProvider] = useState<string | null>(null)
  // proxy 展开（保�?tools tab �?accordion�?
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ braveSearch: false, chromePath: false, proxy: false })

  // ─── Copilot 状�?─────────────────────────────────────────────────────
  const [copilot, setCopilot] = useState<CopilotState>({ phase: 'idle' })
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refresh = useCallback(async () => {
    const s = await loadSettings()
    setSettings(s)

    // 检�?copilot 登录状�?
    if (s.activeProvider === 'copilot') {
      const ghToken = s.configured.find(c => c.key === 'GITHUB_TOKEN')
      setCopilot({ phase: 'logged-in', user: ghToken ? 'GitHub User' : '' })
    } else {
      // 检查是否有保存�?GITHUB_TOKEN（但不是活跃 provider�?
      const ghToken = s.configured.find(c => c.key === 'GITHUB_TOKEN')
      if (ghToken) {
        setCopilot({ phase: 'logged-in', user: 'GitHub User' })
      }
    }
  }, [loadSettings])

  useEffect(() => { refresh() }, [refresh])

  // 清理轮询定时�?
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

    // 打开浏览�?
    try { await open(result.verificationUri) } catch { /* ignore */ }

    // 开始轮�?
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
      // 清空�?group �?draft
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

  // ─── Tab 状�?───────────────────────────────────────────────────────
  const [tab, setTab] = useState<SettingsTab>('model')
  const [toolsList, setToolsList] = useState<Array<{ name: string }>>([])
  const [skillsList, setSkillsList] = useState<Array<{ name: string; description: string; source: string }>>([])

  // Gallery 状�?
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
        setInstallMsg(p => ({ ...p, [skill.name]: '�?已安�? }))
        setGalleryList(prev => prev.map(s => s.name === skill.name ? { ...s, installed: true } : s))
        // 刷新已加载列�?
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
              �?{PROVIDER_LABEL[settings.activeProvider]}
            </span>
          )}
          {onClose && <button className="btn-close" onClick={onClose}>�?/button>}
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

      {/* ━━�?模型 Tab ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━�?*/}
      {tab === 'model' && (<>
        {!settings.activeProvider && (
          <p className="settings-hint">请配置任意一�?Provider，保存后即自动激�?/p>
        )}

        {/* ─── 模型路由选择�?──────────────────────────────────────────── */}
        <ModelRoutingCard settings={settings} saveApiKey={saveApiKey} refresh={refresh} />

        {/* ─── Provider 列表 ───────────────────────────────────────────── */}
        <div className="provider-list">
          {/* Copilot �?*/}
          <ProviderRow
            id="copilot"
            label="GitHub Copilot"
            badge="免费"
            status={
              settings.activeProvider === 'copilot' ? 'active'
              : copilot.phase === 'logged-in' ? 'configured'
              : 'unconfigured'
            }
            isCopilotUnlogged={copilot.phase !== 'logged-in'}
            onAction={() => setDrawerProvider('copilot')}
          />
          {/* 其他 Provider �?*/}
          {PROVIDER_GROUPS.map(group => {
            const isActive = settings.activeProvider === group.id
            const hasAny = group.fields.some(f => getMasked(f.key))
            return (
              <ProviderRow
                key={group.id}
                id={group.id}
                label={PROVIDER_LABEL[group.id] ?? group.label}
                badge={'badge' in group ? (group as { badge: string }).badge : undefined}
                status={isActive ? 'active' : hasAny ? 'configured' : 'unconfigured'}
                onAction={() => setDrawerProvider(group.id)}
              />
            )
          })}
        </div>

        {/* ─── 网络设置 ─────────────────────────────────────────────── */}
        <div className="settings-section-title" style={{ marginTop: 8 }}>网络设置</div>
        <div className="provider-card">
          <div className="provider-header" onClick={() => setExpanded(p => ({ ...p, proxy: !p.proxy }))}>
            <span className="provider-name">🌐 HTTP 代理</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {getMasked('HTTPS_PROXY' as SecretKey) && <span className="configured-dot" title="已配�? />}
              <span className="chevron">{expanded.proxy ? '�? : '�?}</span>
            </div>
          </div>
          {expanded.proxy && (
            <div className="provider-body">
              <p style={{ margin: '0 0 8px', fontSize: 12, color: '#888' }}>
                在中国大陆访�?GitHub Copilot API 通常需�?HTTP 代理
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

        {/* ─── Provider Drawer ────────────────────────────────────────── */}
        {drawerProvider && (
          <ProviderDrawer
            providerId={drawerProvider}
            settings={settings}
            draft={draft}
            saving={saving}
            copilot={copilot}
            getMasked={getMasked}
            onDraftChange={(key, value) => setDraft(p => ({ ...p, [key]: value }))}
            onSave={async (groupId, keys) => {
              await handleSave(groupId, keys)
            }}
            onClear={async (groupId, keys) => {
              await handleClear(groupId, keys)
              setDrawerProvider(null)
            }}
            onCopilotLogin={handleCopilotLogin}
            onCopilotLogout={async () => {
              await handleCopilotLogout()
              setDrawerProvider(null)
            }}
            onClose={() => setDrawerProvider(null)}
          />
        )}

      </>)}

      {/* ━━�?工具 Tab ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━�?*/}
      {tab === 'tools' && (
        <>
          {/* ─── Brave Search API Key 配置�?─────────────────────────────── */}
          <div className="provider-card">
            <div className="provider-header" onClick={() => setExpanded(p => ({ ...p, braveSearch: !p.braveSearch }))}>
              <span className="provider-name">🔍 Web Search（Brave Search API�?/span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {getMasked('BRAVE_SEARCH_API_KEY') && <span className="configured-dot" title="已配�? />}
                <span className="chevron">{expanded.braveSearch ? '�? : '�?}</span>
              </div>
            </div>
            {expanded.braveSearch && (
              <div className="provider-body">
                <p style={{ margin: '0 0 8px', fontSize: 12, color: '#888' }}>
                  免费申请�?a href="https://brave.com/search/api/" target="_blank" rel="noreferrer"
                    style={{ color: 'var(--accent)' }}>brave.com/search/api</a>
                  （免费版每月 2000 次）。未配置时自动回退�?DuckDuckGo�?
                </p>
                <div className="key-row">
                  <label>API Key</label>
                  <input
                    type="password"
                    placeholder={getMasked('BRAVE_SEARCH_API_KEY') || 'BSAxxxxx�?}
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

          {/* ─── Chrome 路径配置�?─────────────────────────────────────────── */}
          <div className="provider-card">
            <div className="provider-header" onClick={() => setExpanded(p => ({ ...p, chromePath: !p.chromePath }))}>
              <span className="provider-name">🌐 浏览器工具（Chrome 路径�?/span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {getMasked('CHROME_PATH') && <span className="configured-dot" title="已配�? />}
                <span className="chevron">{expanded.chromePath ? '�? : '�?}</span>
              </div>
            </div>
            {expanded.chromePath && (
              <div className="provider-body">
                <p style={{ margin: '0 0 8px', fontSize: 12, color: '#888' }}>
                  非必填。未填时自动搜索系统 Chrome / Edge。如自动搜索失败，请手动填入 chrome.exe 的完整路径�?
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

          <div className="settings-section-title" style={{ marginTop: 16 }}>已注册工�?/div>
          {toolsList.length === 0 ? (
            <p className="settings-hint">加载中�?/p>
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
            工具调用上限�?0 �?�?· bash 超时见「⚙�?高级」设�?
          </p>
        </>
      )}

      {/* ━━�?Skills Tab ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━�?*/}
      {tab === 'skills' && (
        <>
          <div className="settings-section-title">已加�?Skills（{skillsList.length}�?/div>
          {skillsList.length === 0 ? (
            <p className="settings-hint">加载中�?/p>
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
              {galleryLoading ? '加载中�? : '🛒 技能商�?}
            </button>
          </div>

          {/* Gallery 区域 */}
          {galleryError && (
            <p className="settings-hint" style={{ color: '#f44336', marginTop: 8 }}>�?{galleryError}</p>
          )}
          {galleryList.length > 0 && (
            <>
              <div className="settings-section-title" style={{ marginTop: 12 }}>
                🛡�?可信仓库 Skills
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
                        {g.trust === 'official' ? '🔒 官方' : g.trust === 'verified' ? '�?已验�? : '👥 社区'}
                      </span>
                    </div>
                    <div className="skill-desc">{g.description}</div>
                    <div className="gallery-actions">
                      {g.installed ? (
                        <>
                          <span className="gallery-installed">�?已安�?/span>
                          <button className="btn-clear btn-sm" onClick={() => handleUninstallSkill(g.name)}>卸载</button>
                        </>
                      ) : (
                        <button
                          className="btn-save btn-sm"
                          disabled={installing[g.name] === 'installing'}
                          onClick={() => handleInstallSkill(g)}
                        >
                          {installing[g.name] === 'installing' ? '安装中�? : installing[g.name] === 'ok' ? '�? : '安装'}
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

      {/* ━━�?高级 Tab ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━�?*/}
      {tab === 'advanced' && (
        <>
          <div className="advanced-section" style={{ marginBottom: 10 }}>
            <div className="advanced-section-title">🎨 界面主题</div>
            <div className="advanced-item">
              <div className="advanced-item-header">
                <span className="advanced-item-label">界面风格</span>
                <span className="advanced-item-unit">当前：{effectiveTheme === 'light' ? '白色' : '深色'}</span>
              </div>
              <div className="theme-switch" role="group" aria-label="主题选择">
                <button
                  className={`theme-btn ${themePreference === 'light' ? 'active' : ''}`}
                  onClick={() => onThemeChange('light')}
                >
                  白色
                </button>
                <button
                  className={`theme-btn ${themePreference === 'dark' ? 'active' : ''}`}
                  onClick={() => onThemeChange('dark')}
                >
                  深色
                </button>
                <button
                  className={`theme-btn subtle ${themePreference === 'system' ? 'active' : ''}`}
                  onClick={() => onThemeChange('system')}
                  title="清除手动选择并跟随系�?
                >
                  跟随系统
                </button>
              </div>
              <p className="advanced-item-desc">默认会跟随系统主题。选择白色或深色后将固定，并在重启后保持�?/p>
            </div>
          </div>

          {/* ─── Bash 超时配置 ────────────────────────────────────────── */}
          <div className="advanced-section">
            <div className="advanced-section-title">�?性能设置</div>

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
              <p className="advanced-item-desc">bash 前台命令的总超时。最�?5s，默�?5 分钟。命令持续有输出不会被此超时中断，只有总时长超限才触发�?/p>
            </div>

            <div className="advanced-item">
              <div className="advanced-item-header">
                <span className="advanced-item-label">无输出超�?/span>
                <span className="advanced-item-unit">ms</span>
              </div>
              <input
                className="advanced-input"
                type="number"
                placeholder={getMasked('BASH_IDLE_TIMEOUT_MS' as SecretKey) || '120000'}
                value={draft['BASH_IDLE_TIMEOUT_MS' as SecretKey] ?? ''}
                onChange={e => setDraft(p => ({ ...p, BASH_IDLE_TIMEOUT_MS: e.target.value }))}
              />
              <p className="advanced-item-desc">命令在此时间内无任何 stdout/stderr 输出则判定卡死并终止。设�?0 禁用。默�?2 分钟�?/p>
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
              <p className="advanced-item-desc">单条 bash 命令的绝对上限，防止 LLM 传入过大�?timeout_ms。默�?30 分钟�?/p>
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

      {/* ━━�?关于 Tab ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━�?*/}
      {tab === 'about' && (
        <div className="about-section">
          <div className="about-logo">�?/div>
          <h2 className="about-title">Equality</h2>
          <p className="about-version">v0.2.1</p>
          <p className="about-desc">面向中国大陆 Windows 用户�?AI 桌面智能助理</p>
          <div className="about-info">
            <div className="about-row"><span>运行环境</span><span>Tauri + React + Fastify</span></div>
            <div className="about-row"><span>工具数量</span><span>{toolsList.length || '�?}</span></div>
            <div className="about-row"><span>Skills 数量</span><span>{skillsList.length || '�?}</span></div>
            <div className="about-row">
              <span>Key 存储</span>
              <span style={{ color: settings.storageMode === 'dpapi' ? '#30d158' : '#ff9f0a' }}>
                {settings.storageMode === 'dpapi' ? '🔒 加密存储（DPAPI�? : '⚠️ 明文存储'}
              </span>
            </div>
          </div>
          {globalCost && (
            <>
              <div className="settings-section-title" style={{ marginTop: 16, alignSelf: 'flex-start' }}>💰 累计费用</div>
              <div className="about-info">
                <div className="about-row"><span>总费�?/span><span style={{ color: '#ff9f0a' }}>¥{globalCost.totalCny.toFixed(4)}</span></div>
                <div className="about-row"><span>�?Tokens</span><span>{globalCost.totalTokens.toLocaleString()}</span></div>
                <div className="about-row"><span>调用次数</span><span>{globalCost.callCount}</span></div>
                <div className="about-row"><span>会话�?/span><span>{globalCost.sessionCount}</span></div>
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
