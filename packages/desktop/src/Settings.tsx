import { useState, useEffect, useCallback, useRef } from 'react'
import { useGateway } from './useGateway'
import type { SettingsState, SecretKey } from './useGateway'
import { open } from '@tauri-apps/plugin-shell'
import { MemoryTab } from './MemoryTab'
import { useT, type Locale } from './i18n'
import './Settings.css'

type SettingsTab = 'model' | 'tools' | 'skills' | 'memory' | 'advanced' | 'about'
type ThemePreference = 'system' | 'purple' | 'dark' | 'black'
type EffectiveTheme = 'purple' | 'dark' | 'black'

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
    copilot: 'GitHub Copilot', custom: 'Custom Endpoint',
    deepseek: 'DeepSeek', qwen: 'Qwen', volc: 'Volc', minimax: 'MiniMax',
  }

  return (
    <div className="provider-card" style={{ marginBottom: 12 }}>
      <div className="provider-header" style={{ cursor: 'default' }}>
        <span className="provider-name">🧠 Model Selection</span>
      </div>
      <div className="provider-body">
        <div className="model-routing-row">
          <label className="model-routing-toggle">
            <input type="checkbox" checked={isAuto} onChange={handleToggle} />
            <span className="model-routing-label">Auto (select model by complexity)</span>
          </label>
        </div>
        <p className="model-routing-hint">
          {isAuto
            ? 'Simple → lightweight, Normal → standard, Complex → strongest'
            : 'All messages will use the selected model below'}
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
                <div className="model-select-empty">Loading…</div>
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
    label: 'MiniMax（M2.5 / M2.7 / M2.7-Highspeed）',
    fields: [{ key: 'MINIMAX_API_KEY' as SecretKey, label: 'API Key', type: 'password', placeholder: 'eyJ...' }],
    saveKeys: ['MINIMAX_API_KEY'] as SecretKey[],
  },
]

const PROVIDER_LABEL: Record<string, string> = {
  copilot: 'GitHub Copilot',
  custom: 'Custom Endpoint',
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

// ─── Provider 图标映射 ────────────────────────────────────────────────────────
const PROVIDER_ICON: Record<string, string> = {
  copilot: '🐙',
  custom: '🔌',
  deepseek: '🔮',
  qwen: '🌟',
  volc: '🌋',
  minimax: '🤖',
}

// ─── Provider 默认模型映射 ─────────────────────────────────────────────────
const PROVIDER_DEFAULT_MODEL: Record<string, string> = {
  deepseek: 'deepseek-chat',
  qwen: 'qwen-plus',
  volc: 'doubao-1.5-pro-256k',
  minimax: 'MiniMax-M2.7',
}

// ─── R2: Intent Judge 开关组件 ────────────────────────────────────────────────
function IntentJudgeToggle({ providerId, settings, onSaveKey, onRefresh }: {
  providerId: string
  settings: SettingsState
  onSaveKey: (key: SecretKey, value: string) => Promise<boolean>
  onRefresh: () => Promise<void>
}) {
  const isActive = settings.intentJudge?.provider === providerId
  const [toggling, setToggling] = useState(false)

  // 获取该 Provider 的默认模型
  const getModelForProvider = () => {
    if (providerId === 'copilot') {
      // Copilot 使用当前选中的模型
      const sel = settings.selectedModel
      if (sel) {
        const parts = sel.split('/')
        return parts.length > 1 ? parts[1] : sel
      }
      return 'gpt-4o'
    }
    if (providerId === 'custom') {
      // Custom 使用 CUSTOM_MODEL
      const found = settings.configured.find(c => c.key === 'CUSTOM_MODEL')
      return found?.masked || 'gpt-4o'
    }
    return PROVIDER_DEFAULT_MODEL[providerId] ?? 'unknown'
  }

  const handleToggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setToggling(true)
    try {
      if (e.target.checked) {
        const model = getModelForProvider()
        await onSaveKey('INTENT_JUDGE_PROVIDER' as SecretKey, providerId)
        await onSaveKey('INTENT_JUDGE_MODEL' as SecretKey, model)
      } else {
        await onSaveKey('INTENT_JUDGE_PROVIDER' as SecretKey, '')
        await onSaveKey('INTENT_JUDGE_MODEL' as SecretKey, '')
      }
      await onRefresh()
    } finally {
      setToggling(false)
    }
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: toggling ? 'wait' : 'pointer', fontSize: 13 }}>
        <input
          type="checkbox"
          checked={isActive}
          onChange={handleToggle}
          disabled={toggling}
          style={{ width: 15, height: 15 }}
        />
        <span>🧠 用于意图判断</span>
      </label>
      <p style={{ margin: '6px 0 0 25px', fontSize: 11, color: '#888', lineHeight: 1.4 }}>
        {isActive
          ? `✅ 当前使用 ${settings.intentJudge?.model ?? '?'} 判断记忆意图`
          : '开启后，自动记忆功能将使用此模型判断用户意图（而非主对话模型）。同时只能有一个 Provider 启用。'}
      </p>
    </div>
  )
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
  const icon = PROVIDER_ICON[id] ?? '⚡'

  const statusNode = (() => {
    if (status === 'active') return <span className="pr-status pr-status-active">● Active</span>
    if (status === 'configured') return <span className="pr-status pr-status-configured">● Configured</span>
    return <span className="pr-status pr-status-unconfigured">○ Not configured</span>
  })()

  const actionLabel = (() => {
    if (isCopilotUnlogged) return 'Login GitHub'
    if (status === 'active' || status === 'configured') return 'Manage'
    return 'Configure'
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
interface QuotaDraft { provider: string; tier: string; monthlyLimit: number; warnPct: number; criticalPct: number; autoDowngrade: boolean }
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
  onSaveKey: (key: SecretKey, value: string) => Promise<boolean>
  onRefresh: () => Promise<void>
  quotaStatuses: Array<{ provider: string; tier: string; used: number; limit: number; remaining: number; pct: number; level: string }>
  quotaConfigs: Array<{ provider: string; tier: string; monthlyLimit: number; warnPct: number; criticalPct: number; autoDowngrade: boolean }>
  onQuotaSave: (cfg: QuotaDraft) => Promise<void>
  onQuotaDelete: (provider: string, tier: string) => Promise<void>
}

function saveLabel(state: string) {
  return state === 'saving' ? '保存中…' : state === 'ok' ? '✓ 已保存' : state === 'err' ? '✕ 失败' : '保存'
}

function ProviderDrawer({
  providerId, settings, draft, saving, copilot,
  getMasked, onDraftChange, onSave, onClear, onCopilotLogin, onCopilotLogout, onClose,
  onSaveKey, onRefresh,
  quotaStatuses, quotaConfigs, onQuotaSave, onQuotaDelete,
}: ProviderDrawerProps) {
  const group = PROVIDER_GROUPS.find(g => g.id === providerId)
  const isActive = settings.activeProvider === providerId
  // 配额：筛选当前 provider 的配额
  const myStatuses = quotaStatuses.filter(s => s.provider === providerId)
  const [showQForm, setShowQForm] = useState(false)
  const [qDraft, setQDraft] = useState<QuotaDraft>({ provider: providerId, tier: 'premium', monthlyLimit: 500, warnPct: 80, criticalPct: 95, autoDowngrade: true })

  // Copilot 抽屉内容
  if (providerId === 'copilot') {
    return (
      <div className="drawer-mask" onClick={onClose}>
        <div className="drawer-panel" onClick={e => e.stopPropagation()}>
          <div className="drawer-header">
            <span className="drawer-title">🐙 GitHub Copilot</span>
            <button className="drawer-close" onClick={onClose}>✕</button>
          </div>
          <div className="drawer-body">
            {isActive && (
              <div className="drawer-active-bar">✔ 当前激活</div>
            )}
            {copilot.phase === 'idle' && (
              <>
                <p className="drawer-hint">
                  通过 GitHub Copilot 订阅免费使用 Claude / GPT / Gemini 等模型
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
                  ⏳ 等待授权中…
                </p>
              </div>
            )}
            {copilot.phase === 'logged-in' && (
              <>
                <p style={{ margin: '0 0 8px', fontSize: 13, color: '#4caf50' }}>
                  ✅ 已登录 {copilot.user ? `(${copilot.user})` : ''}
                </p>
                <p style={{ margin: '4px 0 12px', fontSize: 11, color: '#888' }}>
                  费用：¥0（含在 Copilot 订阅中）。模型选择请使用上方「模型选择」卡片。
                </p>
                <button className="btn-clear drawer-btn-full" onClick={onCopilotLogout}>
                  退出登录
                </button>
              </>
            )}
            {copilot.phase === 'error' && (
              <>
                <p style={{ margin: '0 0 8px', fontSize: 12, color: '#f44336' }}>
                  ❌ {copilot.message}
                </p>
                <button className="btn-save drawer-btn-full" onClick={onCopilotLogin}>
                  🔑 重新登录
                </button>
              </>
            )}

            {/* R2: 意图判断模型开关 */}
            {copilot.phase === 'logged-in' && (
              <IntentJudgeToggle
                providerId="copilot"
                settings={settings}
                onSaveKey={onSaveKey}
                onRefresh={onRefresh}
              />
            )}

            {/* Z2.1: 配额设置 */}
            <DrawerQuotaSection
              providerId={providerId}
              myStatuses={myStatuses}
              quotaConfigs={quotaConfigs}
              showQForm={showQForm}
              setShowQForm={setShowQForm}
              qDraft={qDraft}
              setQDraft={setQDraft}
              onQuotaSave={onQuotaSave}
              onQuotaDelete={onQuotaDelete}
            />
          </div>
        </div>
      </div>
    )
  }

  // 普通 provider 抽屉内容
  if (!group) return null

  const hasAny = group.fields.some(f => getMasked(f.key))
  const hasDraft = group.saveKeys.some(k => draft[k]?.trim())

  return (
    <div className="drawer-mask" onClick={onClose}>
      <div className="drawer-panel" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <span className="drawer-title">{PROVIDER_ICON[providerId] ?? '⚡'} {PROVIDER_LABEL[providerId]}</span>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>
        <div className="drawer-body">
          {isActive && (
            <div className="drawer-active-bar">✔ 当前激活</div>
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

          {/* MiniMax 专属：显示思考过程开关 */}
          {providerId === 'minimax' && (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={getMasked('MINIMAX_SHOW_THINKING') === 'true'}
                  onChange={async (e) => {
                    const val = e.target.checked ? 'true' : 'false'
                    await onSaveKey('MINIMAX_SHOW_THINKING', val)
                    await onRefresh()
                  }}
                  style={{ width: 15, height: 15 }}
                />
                <span>显示思考过程（reasoning）</span>
              </label>
              <p style={{ margin: '6px 0 0 25px', fontSize: 11, color: '#888', lineHeight: 1.4 }}>
                开启后 MiniMax-M2.7 的推理内容将保留在回复中（&lt;think&gt; 格式）。默认关闭。
              </p>
            </div>
          )}

          {/* R2: 意图判断模型开关（所有已配置 provider 可见） */}
          {hasAny && (
            <IntentJudgeToggle
              providerId={providerId}
              settings={settings}
              onSaveKey={onSaveKey}
              onRefresh={onRefresh}
            />
          )}

          {/* Z2.1: 配额设置 */}
          <DrawerQuotaSection
            providerId={providerId}
            myStatuses={myStatuses}
            quotaConfigs={quotaConfigs}
            showQForm={showQForm}
            setShowQForm={setShowQForm}
            qDraft={qDraft}
            setQDraft={setQDraft}
            onQuotaSave={onQuotaSave}
            onQuotaDelete={onQuotaDelete}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Z2.1: 抽屉内配额子组件 ──────────────────────────────────────────────────
function DrawerQuotaSection({ providerId, myStatuses, quotaConfigs, showQForm, setShowQForm, qDraft, setQDraft, onQuotaSave, onQuotaDelete }: {
  providerId: string
  myStatuses: Array<{ provider: string; tier: string; used: number; limit: number; pct: number; level: string }>
  quotaConfigs: Array<{ provider: string; tier: string; monthlyLimit: number; warnPct: number; criticalPct: number; autoDowngrade: boolean }>
  showQForm: boolean
  setShowQForm: (v: boolean) => void
  qDraft: QuotaDraft
  setQDraft: React.Dispatch<React.SetStateAction<QuotaDraft>>
  onQuotaSave: (cfg: QuotaDraft) => Promise<void>
  onQuotaDelete: (provider: string, tier: string) => Promise<void>
}) {
  const inputStyle = { background: '#1a1a2e', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4, padding: '4px 6px', fontSize: 12 }
  return (
    <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'rgba(255,255,255,0.7)' }}>📊 配额管理</div>
      {myStatuses.map(s => {
        const pct = Math.min(s.pct * 100, 100)
        const barColor = s.level === 'ok' ? '#30d158' : s.level === 'warn' ? '#ff9f0a' : '#ff453a'
        const levelIcon = s.level === 'ok' ? '✅' : s.level === 'warn' ? '⚠️' : s.level === 'critical' ? '🔴' : '🚫'
        return (
          <div key={s.tier} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
              <span>{levelIcon} {s.tier} · {s.used}/{s.limit === Infinity ? '∞' : s.limit}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, padding: 0 }} title="编辑" onClick={() => {
                  const cfg = quotaConfigs.find(c => c.provider === s.provider && c.tier === s.tier)
                  if (cfg) {
                    setQDraft({ provider: cfg.provider, tier: cfg.tier, monthlyLimit: cfg.monthlyLimit, warnPct: Math.round(cfg.warnPct * 100), criticalPct: Math.round(cfg.criticalPct * 100), autoDowngrade: cfg.autoDowngrade })
                    setShowQForm(true)
                  }
                }}>✏️</button>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, padding: 0 }} title="删除" onClick={() => onQuotaDelete(s.provider, s.tier)}>🗑️</button>
              </div>
            </div>
            {s.limit !== Infinity && (
              <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginTop: 3 }}>
                <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 2, transition: 'width 0.3s' }} />
              </div>
            )}
          </div>
        )
      })}
      {!showQForm ? (
        <button className="btn-secondary" style={{ fontSize: 11, padding: '3px 10px', marginTop: 4 }} onClick={() => {
          setQDraft({ provider: providerId, tier: 'premium', monthlyLimit: 500, warnPct: 80, criticalPct: 95, autoDowngrade: true })
          setShowQForm(true)
        }}>+ 添加配额</button>
      ) : (
        <div style={{ marginTop: 6, padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 10px', fontSize: 11 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              Tier
              <select value={qDraft.tier} onChange={e => setQDraft(p => ({ ...p, tier: e.target.value }))} style={inputStyle}>
                <option value="premium">premium</option>
                <option value="standard">standard</option>
                <option value="economy">economy</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              月度上限
              <input type="number" min={1} value={qDraft.monthlyLimit} onChange={e => setQDraft(p => ({ ...p, monthlyLimit: parseInt(e.target.value) || 0 }))} style={inputStyle} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              警告阈值(%)
              <input type="number" min={1} max={100} value={qDraft.warnPct} onChange={e => setQDraft(p => ({ ...p, warnPct: parseInt(e.target.value) || 80 }))} style={inputStyle} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              危险阈值(%)
              <input type="number" min={1} max={100} value={qDraft.criticalPct} onChange={e => setQDraft(p => ({ ...p, criticalPct: parseInt(e.target.value) || 95 }))} style={inputStyle} />
            </label>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginTop: 6 }}>
            <input type="checkbox" checked={qDraft.autoDowngrade} onChange={e => setQDraft(p => ({ ...p, autoDowngrade: e.target.checked }))} />
            超限自动降级
          </label>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button className="btn-primary" style={{ fontSize: 11, padding: '3px 12px' }} onClick={async () => {
              await onQuotaSave({ ...qDraft, provider: providerId, warnPct: qDraft.warnPct / 100, criticalPct: qDraft.criticalPct / 100 })
              setShowQForm(false)
            }}>保存</button>
            <button className="btn-secondary" style={{ fontSize: 11, padding: '3px 12px' }} onClick={() => setShowQForm(false)}>取消</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 工具图标映射 ────────────────────────────────────────────────────────────
const TOOL_ICONS: Record<string, string> = {
  bash: '💻',
  read_file: '📄',
  write_file: '✏️',
  edit_file: '📝',
  glob: '🔎',
  grep: '🔍',
  list_dir: '📁',
  web_fetch: '🌐',
  web_search: '🔍',
  read_image: '🖼️',
  read_pdf: '📑',
  process: '⚙️',
  apply_patch: '🩹',
  cron: '⏰',
  browser: '🌏',
  memory_save: '💾',
  memory_search: '🧠',
}
function getToolIcon(name: string): string {
  return TOOL_ICONS[name] ?? '🔧'
}

// ─── 工具分类 ─────────────────────────────────────────────────────────────────
const TOOL_CATEGORIES = [
  { id: 'all', key: 'toolcat.all' },
  { id: 'file', key: 'toolcat.file' },
  { id: 'search', key: 'toolcat.search' },
  { id: 'browser', key: 'toolcat.browser' },
  { id: 'system', key: 'toolcat.system' },
  { id: 'memory', key: 'toolcat.memory' },
  { id: 'schedule', key: 'toolcat.schedule' },
  { id: 'other', key: 'toolcat.other' },
]
function getToolCategory(name: string): string {
  if (['read_file', 'write_file', 'edit_file', 'apply_patch', 'read_pdf', 'read_image'].includes(name)) return 'file'
  if (['grep', 'glob', 'web_search'].includes(name)) return 'search'
  if (['browser', 'web_fetch'].includes(name)) return 'browser'
  if (['bash', 'process', 'list_dir'].includes(name)) return 'system'
  if (['memory_save', 'memory_search'].includes(name)) return 'memory'
  if (['cron'].includes(name)) return 'schedule'
  return 'other'
}

// ─── ToolDetailDrawer: 工具详情右侧抽屉 ─────────────────────────────────────
interface ToolSchema {
  name: string
  description: string
  parameters?: {
    type?: string
    properties?: Record<string, { type?: string; description?: string; enum?: string[]; default?: unknown }>
    required?: string[]
  }
}

interface ToolDetailDrawerProps {
  tool: ToolSchema
  onClose: () => void
  // 配置相关 props（web_search / browser 工具需要）
  draft?: Partial<Record<SecretKey, string>>
  saving?: Record<string, 'idle' | 'saving' | 'ok' | 'err'>
  getMasked?: (key: SecretKey) => string
  onDraftChange?: (key: SecretKey, value: string) => void
  onSave?: (groupId: string, keys: SecretKey[]) => Promise<void>
  onClear?: (groupId: string, keys: SecretKey[]) => Promise<void>
  saveApiKey?: (k: SecretKey, v: string) => Promise<boolean>
}

function ToolDetailDrawer({ tool, onClose, draft, saving, getMasked, onDraftChange, onSave, onClear, saveApiKey: directSave }: ToolDetailDrawerProps) {
  const props = tool.parameters?.properties ?? {}
  const required = new Set(tool.parameters?.required ?? [])
  const paramEntries = Object.entries(props)
  const isWebSearch = tool.name === 'web_search'
  const isBrowser = tool.name === 'browser'
  const hasConfig = isWebSearch || isBrowser

  return (
    <div className="drawer-mask" onClick={onClose}>
      <div className="drawer-panel" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <span className="drawer-title">{getToolIcon(tool.name)} {tool.name}</span>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>
        <div className="drawer-body">
          <div className="tool-detail-section">
            <div className="tool-detail-label">描述</div>
            <p className="tool-detail-desc">{tool.description || 'No description'}</p>
          </div>

          {/* ─── web_search 配置 ─── */}
          {isWebSearch && draft && saving && getMasked && onDraftChange && onSave && onClear && (
            <div className="tool-detail-section">
              <div className="tool-detail-label">⚙️ 搜索引擎选择</div>
              <p style={{ margin: '0 0 8px', fontSize: 12, color: '#888' }}>
                选择一个搜索引擎。未配置 API Key 时自动回退至 DuckDuckGo（无需 Key）。
              </p>

              {/* Radio: Brave */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: '8px 0' }}>
                <input
                  type="radio"
                  name="web_search_provider"
                  checked={(draft['WEB_SEARCH_PROVIDER' as SecretKey] ?? getMasked('WEB_SEARCH_PROVIDER' as SecretKey) ?? 'brave') === 'brave'}
                  onChange={() => { onDraftChange('WEB_SEARCH_PROVIDER' as SecretKey, 'brave'); directSave?.('WEB_SEARCH_PROVIDER' as SecretKey, 'brave') }}
                />
                <span style={{ fontWeight: 500 }}>🔍 Brave Search</span>
                <span style={{ fontSize: 11, color: '#888' }}>免费 2000 次/月</span>
              </label>
              <div style={{ marginLeft: 24, marginBottom: 12 }}>
                <div className="key-row">
                  <label>API Key</label>
                  <input
                    type="password"
                    placeholder={getMasked('BRAVE_SEARCH_API_KEY') || 'BSAxxxxx…'}
                    value={draft['BRAVE_SEARCH_API_KEY'] ?? ''}
                    onChange={e => onDraftChange('BRAVE_SEARCH_API_KEY', e.target.value)}
                  />
                </div>
                <div className="provider-actions">
                  {getMasked('BRAVE_SEARCH_API_KEY') && (
                    <button className="btn-clear" onClick={() => onClear('braveSearch', ['BRAVE_SEARCH_API_KEY'])}>清除</button>
                  )}
                  <button className="btn-save" disabled={!draft['BRAVE_SEARCH_API_KEY']?.trim() || saving.braveSearch === 'saving'}
                    onClick={() => onSave('braveSearch', ['BRAVE_SEARCH_API_KEY'])}>{saveLabel(saving.braveSearch ?? 'idle')}</button>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#666' }}>
                  申请：<a href="https://brave.com/search/api/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>brave.com/search/api</a>
                </p>
              </div>

              {/* Radio: Tavily */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: '8px 0' }}>
                <input
                  type="radio"
                  name="web_search_provider"
                  checked={(draft['WEB_SEARCH_PROVIDER' as SecretKey] ?? getMasked('WEB_SEARCH_PROVIDER' as SecretKey) ?? 'brave') === 'tavily'}
                  onChange={() => { onDraftChange('WEB_SEARCH_PROVIDER' as SecretKey, 'tavily'); directSave?.('WEB_SEARCH_PROVIDER' as SecretKey, 'tavily') }}
                />
                <span style={{ fontWeight: 500 }}>🤖 Tavily Search</span>
                <span style={{ fontSize: 11, color: '#888' }}>AI 专用，免费 1000 次/月</span>
              </label>
              <div style={{ marginLeft: 24, marginBottom: 12 }}>
                <div className="key-row">
                  <label>API Key</label>
                  <input
                    type="password"
                    placeholder={getMasked('TAVILY_API_KEY' as SecretKey) || 'tvly-xxxxx…'}
                    value={draft['TAVILY_API_KEY' as SecretKey] ?? ''}
                    onChange={e => onDraftChange('TAVILY_API_KEY' as SecretKey, e.target.value)}
                  />
                </div>
                <div className="provider-actions">
                  {getMasked('TAVILY_API_KEY' as SecretKey) && (
                    <button className="btn-clear" onClick={() => onClear('tavilySearch', ['TAVILY_API_KEY' as SecretKey])}>清除</button>
                  )}
                  <button className="btn-save" disabled={!draft['TAVILY_API_KEY' as SecretKey]?.trim() || saving.tavilySearch === 'saving'}
                    onClick={() => onSave('tavilySearch', ['TAVILY_API_KEY' as SecretKey])}>{saveLabel(saving.tavilySearch ?? 'idle')}</button>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#666' }}>
                  申请：<a href="https://tavily.com" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>tavily.com</a>
                </p>
              </div>

              {/* Radio: DuckDuckGo */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: '8px 0' }}>
                <input
                  type="radio"
                  name="web_search_provider"
                  checked={(draft['WEB_SEARCH_PROVIDER' as SecretKey] ?? getMasked('WEB_SEARCH_PROVIDER' as SecretKey) ?? 'brave') === 'ddg'}
                  onChange={() => { onDraftChange('WEB_SEARCH_PROVIDER' as SecretKey, 'ddg'); directSave?.('WEB_SEARCH_PROVIDER' as SecretKey, 'ddg') }}
                />
                <span style={{ fontWeight: 500 }}>🦆 DuckDuckGo</span>
                <span style={{ fontSize: 11, color: '#888' }}>无需 API Key，无限制</span>
              </label>
            </div>
          )}

          {/* ─── browser 配置 ─── */}
          {isBrowser && draft && saving && getMasked && onDraftChange && onSave && onClear && (
            <div className="tool-detail-section">
              <div className="tool-detail-label">⚙️ Chrome 路径</div>
              <p style={{ margin: '0 0 8px', fontSize: 12, color: '#888' }}>
                非必填。未填时自动搜索系统 Chrome / Edge。如自动搜索失败，请手动填入 chrome.exe 的完整路径。
              </p>
              <div className="key-row">
                <label>Chrome 路径</label>
                <input
                  type="text"
                  placeholder={getMasked('CHROME_PATH') || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'}
                  value={draft['CHROME_PATH'] ?? ''}
                  onChange={e => onDraftChange('CHROME_PATH', e.target.value)}
                />
              </div>
              <div className="provider-actions">
                {getMasked('CHROME_PATH') && (
                  <button className="btn-clear" onClick={() => onClear('chromePath', ['CHROME_PATH'])}>清除</button>
                )}
                <button
                  className="btn-save"
                  disabled={!draft['CHROME_PATH']?.trim() || saving.chromePath === 'saving'}
                  onClick={() => onSave('chromePath', ['CHROME_PATH'])}
                >
                  {saveLabel(saving.chromePath ?? 'idle')}
                </button>
              </div>

              <div className="tool-detail-label" style={{ marginTop: 16 }}>🌐 允许访问内网 IP</div>
              <p style={{ margin: '0 0 8px', fontSize: 12, color: '#888' }}>
                默认关闭以防止 SSRF 攻击。开启后浏览器工具可访问 10.x / 172.16-31.x / 192.168.x 等内网地址。
              </p>
              <div className="key-row" style={{ alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={(() => {
                      const v = draft['ALLOW_PRIVATE_IPS' as SecretKey] ?? getMasked('ALLOW_PRIVATE_IPS' as SecretKey) ?? ''
                      return v === '1' || v === 'true' || v === 'yes'
                    })()}
                    onChange={e => {
                      const val = e.target.checked ? '1' : '0'
                      onDraftChange('ALLOW_PRIVATE_IPS' as SecretKey, val)
                      directSave?.('ALLOW_PRIVATE_IPS' as SecretKey, val)
                    }}
                  />
                  <span style={{ fontSize: 13 }}>允许访问私有 / 内网 IP 地址</span>
                </label>
              </div>
            </div>
          )}

          {paramEntries.length > 0 && (
            <div className="tool-detail-section">
              <div className="tool-detail-label">参数</div>
              <div className="tool-detail-params">
                {paramEntries.map(([pname, pdef]) => (
                  <div key={pname} className="tool-detail-param">
                    <div className="tool-detail-param-header">
                      <code className="tool-detail-param-name">{pname}</code>
                      {required.has(pname) && <span className="tool-detail-required">必填</span>}
                      {pdef.type && <span className="tool-detail-type">{pdef.type}</span>}
                    </div>
                    {pdef.description && (
                      <p className="tool-detail-param-desc">{pdef.description}</p>
                    )}
                    {pdef.enum && (
                      <p className="tool-detail-param-desc">
                        可选值：{pdef.enum.map(v => `"${v}"`).join(' | ')}
                      </p>
                    )}
                    {pdef.default !== undefined && (
                      <p className="tool-detail-param-desc">默认值：{String(pdef.default)}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {paramEntries.length === 0 && !hasConfig && (
            <p className="drawer-hint">此工具无需额外参数</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── AdvancedDrawer: 高级设置右侧抽屉 ────────────────────────────────────────
interface AdvancedDrawerProps {
  panel: 'performance' | 'agentLoop' | 'workspace'
  draft: Partial<Record<SecretKey, string>>
  saving: Record<string, 'idle' | 'saving' | 'ok' | 'err'>
  getMasked: (key: SecretKey) => string
  onDraftChange: (key: SecretKey, value: string) => void
  onSave: (groupId: string, keys: SecretKey[]) => Promise<void>
  onClose: () => void
  /** 直接保存单个 key（用于 toggle 开关等即时生效的场景） */
  onSaveKey?: (key: string, value: string) => Promise<void>
}

function AdvancedDrawer({ panel, draft, saving, getMasked, onDraftChange, onSave, onClose, onSaveKey }: AdvancedDrawerProps) {
  const { t } = useT()
  const isPerformance = panel === 'performance'
  const isWorkspace = panel === 'workspace'
  const title = isWorkspace ? t('workspace.title') : isPerformance ? t('perf.title') : t('agentLoop.title')
  const saveGroup = isWorkspace ? 'workspaceDir' : isPerformance ? 'advanced' : 'agentLoop'
  const saveKeys: SecretKey[] = isWorkspace
    ? ['WORKSPACE_DIR']
    : isPerformance
      ? ['BASH_TIMEOUT_MS', 'BASH_IDLE_TIMEOUT_MS', 'BASH_MAX_TIMEOUT_MS']
      : ['AGENT_MAX_TOOL_CALLS', 'AGENT_MAX_LLM_TURNS']
  const hasDraft = saveKeys.some(k => draft[k]?.trim())

  return (
    <div className="drawer-mask" onClick={onClose}>
      <div className="drawer-panel" onClick={e => e.stopPropagation()}>
        <div className="drawer-header">
          <span className="drawer-title">{title}</span>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>
        <div className="drawer-body">
          {isWorkspace ? (
            <>
              <div className="key-row">
                <label>{t('workspaceDir')}</label>
                <input
                  type="text"
                  placeholder={getMasked('WORKSPACE_DIR') || t('workspaceDir.notSet')}
                  value={draft['WORKSPACE_DIR'] ?? ''}
                  onChange={e => onDraftChange('WORKSPACE_DIR', e.target.value)}
                />
              </div>
              <p className="drawer-hint">{t('workspaceDir.desc')}</p>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '16px 0' }} />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{t('sandbox.label')}</span>
                <label style={{ position: 'relative', display: 'inline-block', width: 40, height: 22 }}>
                  <input
                    type="checkbox"
                    style={{ opacity: 0, width: 0, height: 0 }}
                    checked={getMasked('SANDBOX_ENABLED') !== 'off'}
                    onChange={async (e) => {
                      const val = e.target.checked ? 'on' : 'off'
                      await onSaveKey?.('SANDBOX_ENABLED', val)
                    }}
                  />
                  <span style={{
                    position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                    background: getMasked('SANDBOX_ENABLED') === 'off' ? '#555' : '#30d158',
                    borderRadius: 11, transition: 'background 0.2s',
                  }}>
                    <span style={{
                      position: 'absolute', height: 18, width: 18,
                      left: getMasked('SANDBOX_ENABLED') === 'off' ? 2 : 20,
                      bottom: 2, background: '#fff', borderRadius: '50%', transition: 'left 0.2s',
                    }} />
                  </span>
                </label>
              </div>
              <p className="drawer-hint" style={{ color: getMasked('SANDBOX_ENABLED') === 'off' ? '#ff9f0a' : undefined }}>
                {getMasked('SANDBOX_ENABLED') === 'off' ? t('sandbox.offDesc') : t('sandbox.onDesc')}
              </p>
              {getMasked('SANDBOX_ENABLED') === 'off' && (
                <p style={{ fontSize: 12, color: '#ff9f0a', margin: '8px 0 0', padding: '6px 8px', background: 'rgba(255,159,10,0.08)', borderRadius: 6 }}>
                  {t('sandbox.warning')}
                </p>
              )}
            </>
          ) : isPerformance ? (
            <>
              <div className="key-row">
                <label>{t('perf.bashDefault')}</label>
                <input
                  type="number"
                  placeholder={getMasked('BASH_TIMEOUT_MS') || '300000'}
                  value={draft['BASH_TIMEOUT_MS'] ?? ''}
                  onChange={e => onDraftChange('BASH_TIMEOUT_MS', e.target.value)}
                />
              </div>
              <p className="drawer-hint">{t('perf.bashDefaultHint')}</p>
              <div className="key-row" style={{ marginTop: 10 }}>
                <label>{t('perf.idleTimeout')}</label>
                <input
                  type="number"
                  placeholder={getMasked('BASH_IDLE_TIMEOUT_MS') || '120000'}
                  value={draft['BASH_IDLE_TIMEOUT_MS'] ?? ''}
                  onChange={e => onDraftChange('BASH_IDLE_TIMEOUT_MS', e.target.value)}
                />
              </div>
              <p className="drawer-hint">{t('perf.idleTimeoutHint')}</p>
              <div className="key-row" style={{ marginTop: 10 }}>
                <label>{t('perf.maxTimeout')}</label>
                <input
                  type="number"
                  placeholder={getMasked('BASH_MAX_TIMEOUT_MS') || '1800000'}
                  value={draft['BASH_MAX_TIMEOUT_MS'] ?? ''}
                  onChange={e => onDraftChange('BASH_MAX_TIMEOUT_MS', e.target.value)}
                />
              </div>
              <p className="drawer-hint">{t('perf.maxTimeoutHint')}</p>
            </>
          ) : (
            <>
              <div className="key-row">
                <label>{t('agentLoop.toolLimit')}</label>
                <input
                  type="number"
                  placeholder={getMasked('AGENT_MAX_TOOL_CALLS') || '50'}
                  value={draft['AGENT_MAX_TOOL_CALLS'] ?? ''}
                  onChange={e => onDraftChange('AGENT_MAX_TOOL_CALLS', e.target.value)}
                />
              </div>
              <p className="drawer-hint">{t('agentLoop.toolLimitHint')}</p>
              <div className="key-row" style={{ marginTop: 10 }}>
                <label>{t('agentLoop.llmLimit')}</label>
                <input
                  type="number"
                  placeholder={getMasked('AGENT_MAX_LLM_TURNS') || '50'}
                  value={draft['AGENT_MAX_LLM_TURNS'] ?? ''}
                  onChange={e => onDraftChange('AGENT_MAX_LLM_TURNS', e.target.value)}
                />
              </div>
              <p className="drawer-hint">{t('agentLoop.llmLimitHint')}</p>
            </>
          )}
          <div className="provider-actions" style={{ marginTop: 12 }}>
            <button
              className="btn-save"
              disabled={!hasDraft || saving[saveGroup] === 'saving'}
              onClick={() => onSave(saveGroup, saveKeys)}
            >
              {saveLabel(saving[saveGroup] ?? 'idle')}
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

  const { locale, setLocale, t } = useT()

  // 已配置状态（来自服务端）
  const [settings, setSettings] = useState<SettingsState>({ configured: [], activeProvider: null })
  // 用户正在编辑的字段
  const [draft, setDraft] = useState<Partial<Record<SecretKey, string>>>({})
  // 每个 group 的保存状态
  const [saving, setSaving] = useState<Record<string, 'idle' | 'saving' | 'ok' | 'err'>>({})
  // 当前打开的 drawer（provider id，null 表示关闭）
  const [drawerProvider, setDrawerProvider] = useState<string | null>(null)
  // 高级设置 drawer
  const [advancedDrawer, setAdvancedDrawer] = useState<'performance' | 'agentLoop' | 'workspace' | null>(null)
  // proxy 展开（保留 tools tab 的 accordion）
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ braveSearch: false, chromePath: false, proxy: false })

  // ─── Copilot 状态 ─────────────────────────────────────────────────────
  const [copilot, setCopilot] = useState<CopilotState>({ phase: 'idle' })
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refresh = useCallback(async () => {
    const s = await loadSettings()
    setSettings(s)

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

  // ─── Tab 状态 ───────────────────────────────────────────────────────
  const [tab, setTab] = useState<SettingsTab>('model')
  const [toolsList, setToolsList] = useState<ToolSchema[]>([])
  // 当前查看详情的工具
  const [toolDetail, setToolDetail] = useState<ToolSchema | null>(null)
  const [skillsList, setSkillsList] = useState<Array<{ name: string; description: string; source: string; body?: string; category?: string }>>([])
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null)
  const [skillCategory, setSkillCategory] = useState<string>('all')
  const [toolCategory, setToolCategory] = useState<string>('all')
  const [toolSearch, setToolSearch] = useState('')
  const [toolPage, setToolPage] = useState(0)
  const [skillSearch, setSkillSearch] = useState('')
  const [skillPage, setSkillPage] = useState(0)
  const ITEMS_PER_PAGE = 20

  // 配额状态 (V4.1)
  const [quotaConfigs, setQuotaConfigs] = useState<Array<{ provider: string; tier: string; monthlyLimit: number; warnPct: number; criticalPct: number; autoDowngrade: boolean }>>([])
  const [quotaStatuses, setQuotaStatuses] = useState<Array<{ provider: string; tier: string; used: number; limit: number; remaining: number; pct: number; level: string }>>([])
  const [_showQuotaForm, _setShowQuotaForm] = useState(false)
  const [_quotaDraft, _setQuotaDraft] = useState({ provider: 'copilot', tier: 'premium', monthlyLimit: 500, warnPct: 80, criticalPct: 95, autoDowngrade: true })
  // 费用统计
  const [globalCost, setGlobalCost] = useState<{ totalCny: number; totalTokens: number; callCount: number; sessionCount: number } | null>(null)

  useEffect(() => {
    if (tab === 'tools') {
      fetch('http://localhost:18790/tools/schemas')
        .then(r => r.json())
        .then((schemas: Array<{ type: string; function: { name: string; description: string; parameters: ToolSchema['parameters'] } }>) =>
          setToolsList(schemas.map(s => ({ name: s.function.name, description: s.function.description, parameters: s.function.parameters })))
        )
        .catch(() => {})
    }
    if (tab === 'skills') {
      fetch('http://localhost:18790/skills').then(r => r.json()).then(setSkillsList).catch(() => {})
    }
    if (tab === 'about') {
      fetch('http://localhost:18790/cost/global').then(r => r.json()).then(setGlobalCost).catch(() => {})
    }
    if (tab === 'model') {
      fetch('http://localhost:18790/quota').then(r => r.json()).then((data: any) => {
        setQuotaConfigs(data.configs || [])
        setQuotaStatuses(data.statuses || [])
      }).catch(() => {})
    }
  }, [tab])

  return (
    <div className="settings-root">
      <div className="settings-header">
        <span>{t('settings')}</span>
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
          { id: 'model' as SettingsTab, icon: '🤖', key: 'model' },
          { id: 'tools' as SettingsTab, icon: '🔧', key: 'tools' },
          { id: 'skills' as SettingsTab, icon: '📚', key: 'skills' },
          { id: 'memory' as SettingsTab, icon: '🧠', key: 'memory' },
          { id: 'advanced' as SettingsTab, icon: '⚙️', key: 'advanced' },
          { id: 'about' as SettingsTab, icon: 'ℹ️', key: 'about' },
        ]).map(item => (
          <button
            key={item.id}
            className={`settings-tab ${tab === item.id ? 'active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.icon} {t(item.key)}
          </button>
        ))}
      </div>

      <div className="settings-body">

      {/* ━━━ 模型 Tab ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {tab === 'model' && (<>
        {!settings.activeProvider && (
          <p className="settings-hint">{t('provider.configHint')}</p>
        )}

        {/* ─── 模型路由选择器 ──────────────────────────────────────────── */}
        <ModelRoutingCard settings={settings} saveApiKey={saveApiKey} refresh={refresh} />

        {/* ─── Provider 列表 ───────────────────────────────────────────── */}
        <div className="provider-list">
          {/* Copilot 行 */}
          <ProviderRow
            id="copilot"
            label="GitHub Copilot"
            badge="Free"
            status={
              settings.activeProvider === 'copilot' ? 'active'
              : copilot.phase === 'logged-in' ? 'configured'
              : 'unconfigured'
            }
            isCopilotUnlogged={copilot.phase !== 'logged-in'}
            onAction={() => setDrawerProvider('copilot')}
          />
          {/* 其他 Provider 行 */}
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
        <div className="settings-section-title" style={{ marginTop: 8 }}>{t('network')}</div>
        <div className="provider-card">
          <div className="provider-header" onClick={() => setExpanded(p => ({ ...p, proxy: !p.proxy }))}>
            <span className="provider-name">🌐 {t('proxy')}</span>
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
            onSaveKey={saveApiKey}
            onRefresh={refresh}
            quotaStatuses={quotaStatuses}
            quotaConfigs={quotaConfigs}
            onQuotaSave={async (cfg) => {
              await fetch('http://localhost:18790/quota', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) })
              const data = await fetch('http://localhost:18790/quota').then(r => r.json())
              setQuotaConfigs(data.configs || []); setQuotaStatuses(data.statuses || [])
            }}
            onQuotaDelete={async (provider, tier) => {
              await fetch('http://localhost:18790/quota', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, tier }) })
              const data = await fetch('http://localhost:18790/quota').then(r => r.json())
              setQuotaConfigs(data.configs || []); setQuotaStatuses(data.statuses || [])
            }}
          />
        )}

        {/* ─── 月度配额总览 (只读，编辑请进入各模型抽屉) ──────────────── */}
        <div className="settings-section-title" style={{ marginTop: 12 }}>📊 {t('quota.title')}</div>
        {quotaStatuses.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {quotaStatuses.map(s => {
              const pct = Math.min(s.pct * 100, 100)
              const levelIcon = s.level === 'ok' ? '✅' : s.level === 'warn' ? '⚠️' : s.level === 'critical' ? '🔴' : '🚫'
              const barColor = s.level === 'ok' ? '#30d158' : s.level === 'warn' ? '#ff9f0a' : '#ff453a'
              return (
                <div key={`${s.provider}-${s.tier}`} className="provider-card" style={{ padding: '6px 10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                    <span style={{ fontSize: 11, fontWeight: 500 }}>{levelIcon} {s.provider} · {s.tier}</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{s.used} / {s.limit === Infinity ? '∞' : s.limit}</span>
                  </div>
                  {s.limit !== Infinity && (
                    <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 2, transition: 'width 0.3s' }} />
                    </div>
                  )}
                </div>
              )
            })}
            <p className="settings-hint" style={{ fontSize: 10, marginTop: 2 }}>{t('quota.ruleHint')}</p>
          </div>
        ) : (
          <p className="settings-hint">{t('quota.hint')}</p>
        )}

      </>)}

      {/* ━━━ 工具 Tab ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {tab === 'tools' && (
        <>
          <div className="settings-section-title" style={{ marginTop: 16 }}>{t('tools.registered')}</div>
          {/* 搜索栏 */}
          <input
            className="search-bar"
            type="text"
            placeholder={t('tools.search')}
            value={toolSearch}
            onChange={e => { setToolSearch(e.target.value); setToolPage(0) }}
          />
          {/* 工具分类筛选 Tab */}
          <div className="skill-category-tabs">
            {TOOL_CATEGORIES.map(c => {
              const count = c.id === 'all' ? toolsList.length : toolsList.filter(tl => getToolCategory(tl.name) === c.id).length
              if (c.id !== 'all' && count === 0) return null
              return (
                <button
                  key={c.id}
                  className={`skill-category-tab ${toolCategory === c.id ? 'active' : ''}`}
                  onClick={() => setToolCategory(c.id)}
                >
                  {t(c.key)} <span className="skill-category-count">{count}</span>
                </button>
              )
            })}
          </div>

          {toolsList.length === 0 ? (
            <p className="settings-hint">{t('tools.loading')}</p>
          ) : (
            <div className="tools-list">
              {(() => {
                const filtered = toolsList
                  .filter(t => toolCategory === 'all' || getToolCategory(t.name) === toolCategory)
                  .filter(t => !toolSearch || t.name.toLowerCase().includes(toolSearch.toLowerCase()) || t.description.toLowerCase().includes(toolSearch.toLowerCase()))
                const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
                const page = Math.min(toolPage, Math.max(totalPages - 1, 0))
                const paged = filtered.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE)
                return (<>
                  {paged.map(tool => {
                    const hasToolConfig = tool.name === 'web_search' || tool.name === 'browser'
                    const isConfigured = (tool.name === 'web_search' && (!!getMasked('BRAVE_SEARCH_API_KEY') || !!getMasked('TAVILY_API_KEY' as SecretKey) || !!getMasked('WEB_SEARCH_PROVIDER' as SecretKey)))
                      || (tool.name === 'browser' && !!getMasked('CHROME_PATH'))
                    return (
                    <div key={tool.name} className="tool-item" onClick={() => setToolDetail(tool)} style={{ cursor: 'pointer' }}>
                      <span className="tool-icon">{getToolIcon(tool.name)}</span>
                      <span className="tool-name">{tool.name}</span>
                      {hasToolConfig && (
                        <span className="tool-config-badge" title={isConfigured ? '已配置' : '点击配置'}>
                          {isConfigured ? <span className="configured-dot" /> : '⚙️'}
                        </span>
                      )}
                      <span className="tool-detail-btn">›</span>
                    </div>
                    )
                  })}
                  {totalPages > 1 && (
                    <div className="pagination">
                      <button disabled={page === 0} onClick={() => setToolPage(p => p - 1)}>‹ {t('pagination.prev')}</button>
                      <span>{page + 1} / {totalPages}</span>
                      <button disabled={page >= totalPages - 1} onClick={() => setToolPage(p => p + 1)}>{t('pagination.next')} ›</button>
                    </div>
                  )}
                </>)
              })()}
            </div>
          )}
          <p className="settings-hint" style={{ marginTop: 8 }}>
            {t('tools.hint')}
          </p>

          {toolDetail && (
            <ToolDetailDrawer
              tool={toolDetail}
              onClose={() => setToolDetail(null)}
              draft={draft}
              saving={saving}
              getMasked={getMasked}
              onDraftChange={(k, v) => setDraft(p => ({ ...p, [k]: v }))}
              onSave={handleSave}
              onClear={handleClear}
              saveApiKey={saveApiKey}
            />
          )}
        </>
      )}

      {/* ━━━ Skills Tab ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {tab === 'skills' && (
        <>
          <div className="settings-section-title">{t('skills.loaded')}（{skillsList.length}）</div>
          {/* 搜索栏 */}
          <input
            className="search-bar"
            type="text"
            placeholder={t('skills.search')}
            value={skillSearch}
            onChange={e => { setSkillSearch(e.target.value); setSkillPage(0) }}
          />
          {/* 分类筛选 Tab */}
          <div className="skill-category-tabs">
            {[
              { id: 'all', key: 'category.all' },
              { id: 'development', key: 'category.development' },
              { id: 'data', key: 'category.data' },
              { id: 'document', key: 'category.document' },
              { id: 'communication', key: 'category.communication' },
              { id: 'workflow', key: 'category.workflow' },
              { id: 'infra', key: 'category.infra' },
              { id: 'other', key: 'category.other' },
            ].map(c => {
              const count = c.id === 'all' ? skillsList.length : skillsList.filter(s => s.category === c.id).length
              if (c.id !== 'all' && count === 0) return null
              return (
                <button key={c.id}
                  className={`skill-category-tab ${skillCategory === c.id ? 'active' : ''}`}
                  onClick={() => setSkillCategory(c.id)}
                >
                  {t(c.key)} <span className="skill-category-count">{count}</span>
                </button>
              )
            })}
          </div>
          {skillsList.length === 0 ? (
            <p className="settings-hint">{t('skills.loading')}</p>
          ) : (
            <div className="skills-list">
              {(() => {
                const filtered = skillsList
                  .filter(s => skillCategory === 'all' || s.category === skillCategory)
                  .filter(s => !skillSearch || s.name.toLowerCase().includes(skillSearch.toLowerCase()) || s.description.toLowerCase().includes(skillSearch.toLowerCase()))
                const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
                const page = Math.min(skillPage, Math.max(totalPages - 1, 0))
                const paged = filtered.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE)
                return (<>
                  {paged.map(s => (
                  <div key={s.name} className="skill-item"
                       onClick={() => setExpandedSkill(expandedSkill === s.name ? null : s.name)}
                       style={{ cursor: 'pointer' }}>
                    <div className="skill-header">
                      <span className="skill-name">{s.name}</span>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <span className="skill-category-badge">{
                          { development: '🛠️', data: '📊', document: '📄', communication: '💬', workflow: '🔄', infra: '🌐', other: '📦' }[s.category || 'other'] || '📦'
                        }</span>
                        <span className="skill-source">{s.source}</span>
                      </div>
                    </div>
                    <div className="skill-desc">{s.description}</div>
                  </div>
                  ))}
                  {totalPages > 1 && (
                    <div className="pagination">
                      <button disabled={page === 0} onClick={() => setSkillPage(p => p - 1)}>‹ {t('pagination.prev')}</button>
                      <span>{page + 1} / {totalPages}</span>
                      <button disabled={page >= totalPages - 1} onClick={() => setSkillPage(p => p + 1)}>{t('pagination.next')} ›</button>
                    </div>
                  )}
                </>)
              })()}
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
              🔄 {t('skills.reload')}
            </button>
          </div>
          {/* Skill 详情抽屉 */}
          {expandedSkill && (() => {
            const skill = skillsList.find(s => s.name === expandedSkill)
            if (!skill) return null
            return (
              <>
                <div className="skill-drawer-overlay" onClick={() => setExpandedSkill(null)} />
                <div className="skill-drawer">
                  <div className="skill-drawer-header">
                    <div>
                      <div className="skill-drawer-title">{skill.name}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                        <span className="skill-category-badge">{
                          { development: '🛠️ 开发', data: '📊 数据', document: '📄 文档', communication: '💬 通信', workflow: '🔄 工作流', infra: '🌐 网络', other: '📦 其他' }[skill.category || 'other'] || '📦 其他'
                        }</span>
                        <span className="skill-source">{skill.source}</span>
                      </div>
                    </div>
                    <button className="skill-drawer-close" onClick={() => setExpandedSkill(null)}>✕</button>
                  </div>
                  <div className="skill-drawer-desc">{skill.description}</div>
                  {skill.body && (
                    <pre className="skill-drawer-body">{skill.body}</pre>
                  )}
                </div>
              </>
            )
          })()}
        </>
      )}

      {/* ━━━ 记忆 Tab ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {tab === 'memory' && <MemoryTab />}

      {/* ━━━ 高级 Tab ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {tab === 'advanced' && (
        <>
          <div className="advanced-section" style={{ marginBottom: 10 }}>
            <div className="advanced-section-title">🎨 {t('theme')}</div>
            <div className="advanced-item">
              <div className="advanced-item-header">
                <span className="advanced-item-label">{t('theme.label')}</span>
                <span className="advanced-item-unit">{t('theme.current')}：{t(`theme.${effectiveTheme === 'dark' ? 'dark' : effectiveTheme}`)}</span>
              </div>
              <div className="theme-switch" role="group" aria-label="主题选择">
                <button
                  className={`theme-btn ${themePreference === 'purple' ? 'active' : ''}`}
                  onClick={() => onThemeChange('purple')}
                >
                  💜 {t('theme.purple')}
                </button>
                <button
                  className={`theme-btn ${themePreference === 'dark' ? 'active' : ''}`}
                  onClick={() => onThemeChange('dark')}
                >
                  🌊 {t('theme.dark')}
                </button>
                <button
                  className={`theme-btn ${themePreference === 'black' ? 'active' : ''}`}
                  onClick={() => onThemeChange('black')}
                >
                  🖤 {t('theme.black')}
                </button>
                <button
                  className={`theme-btn subtle ${themePreference === 'system' ? 'active' : ''}`}
                  onClick={() => onThemeChange('system')}
                  title={t('theme.systemTip')}
                >
                  {t('theme.system')}
                </button>
              </div>
              <p className="advanced-item-desc">{t('theme.desc')}</p>
            </div>
          </div>

          {/* ─── 语言 ──────────────────────────────────────────────── */}
          <div className="advanced-section">
            <div className="advanced-section-title">🌐 {t('language')}</div>
            <div className="advanced-item">
              <div className="theme-switch" role="group" aria-label="Language">
                {([['zh-CN', '中文'], ['en', 'English']] as [Locale, string][]).map(([loc, label]) => (
                  <button
                    key={loc}
                    className={`theme-btn ${locale === loc ? 'active' : ''}`}
                    onClick={() => setLocale(loc)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ─── 高级配置条目行 ──────────────────────────────────────── */}
          <div className="advanced-section">
            <div className="advanced-section-title">⚙️ {t('advancedConfig')}</div>

            {/* 工作空间与安全 */}
            <div className="provider-card" style={{ marginBottom: 6 }}>
              <div className="provider-header" onClick={() => setAdvancedDrawer('workspace')} style={{ cursor: 'pointer' }}>
                <span className="provider-name">📁 {t('workspace.title')}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: getMasked('SANDBOX_ENABLED') === 'off' ? '#ff9f0a' : '#888' }}>
                    {getMasked('SANDBOX_ENABLED') === 'off' ? t('sandbox.warning') : (getMasked('WORKSPACE_DIR') || t('workspaceDir.notSet'))}
                  </span>
                  <span className="chevron">›</span>
                </div>
              </div>
            </div>

            <div className="provider-card" style={{ marginBottom: 6 }}>
              <div className="provider-header" onClick={() => setAdvancedDrawer('performance')} style={{ cursor: 'pointer' }}>
                <span className="provider-name">⚡ {t('perf')}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: '#888' }}>{t('perf.bashTimeout')}</span>
                  <span className="chevron">›</span>
                </div>
              </div>
            </div>
            <div className="provider-card">
              <div className="provider-header" onClick={() => setAdvancedDrawer('agentLoop')} style={{ cursor: 'pointer' }}>
                <span className="provider-name">🔁 {t('agentLoop')}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: '#888' }}>{t('agentLoop.sub')}</span>
                  <span className="chevron">›</span>
                </div>
              </div>
            </div>

            {/* M3/T35: 自动记忆开关 */}
            <div className="advanced-item" style={{ marginTop: 12, marginBottom: 10 }}>
              <div className="advanced-item-header">
                <span className="advanced-item-label">🧠 {t('autoMemory')}</span>
                <label style={{ position: 'relative', display: 'inline-block', width: 40, height: 22 }}>
                  <input
                    type="checkbox"
                    style={{ opacity: 0, width: 0, height: 0 }}
                    checked={getMasked('MEMORY_AUTO_CAPTURE') !== 'off'}
                    onChange={async (e) => {
                      const val = e.target.checked ? 'on' : 'off'
                      await saveApiKey('MEMORY_AUTO_CAPTURE', val)
                      // 刷新
                      const s = await loadSettings()
                      if (s) setSettings(s)
                    }}
                  />
                  <span style={{
                    position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                    background: getMasked('MEMORY_AUTO_CAPTURE') === 'off' ? '#555' : '#30d158',
                    borderRadius: 11, transition: 'background 0.2s',
                  }}>
                    <span style={{
                      position: 'absolute', height: 18, width: 18, left: getMasked('MEMORY_AUTO_CAPTURE') === 'off' ? 2 : 20,
                      bottom: 2, background: '#fff', borderRadius: '50%', transition: 'left 0.2s',
                    }} />
                  </span>
                </label>
              </div>
              <p className="advanced-item-desc">检测到"记住/remember"等关键词时自动保存到长期记忆。关闭后仍可手动使用 memory_save 工具。</p>
            </div>
          </div>

          {/* ─── 高级设置 drawer ─────────────────────────────────────── */}
          {advancedDrawer && (
            <AdvancedDrawer
              panel={advancedDrawer}
              draft={draft}
              saving={saving}
              getMasked={getMasked}
              onDraftChange={(key, value) => setDraft(p => ({ ...p, [key]: value }))}
              onSave={handleSave}
              onClose={() => setAdvancedDrawer(null)}
              onSaveKey={async (key, value) => {
                await saveApiKey(key as SecretKey, value)
                const s = await loadSettings()
                if (s) setSettings(s)
              }}
            />
          )}
        </>
      )}

      {/* ━━━ 关于 Tab ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {tab === 'about' && (
        <div className="about-section">
          <div className="about-logo">⚡</div>
          <h2 className="about-title">Equality</h2>
          <p className="about-version">v0.2.1</p>
          <p className="about-desc">{t('about.desc')}</p>
          <div className="about-info">
            <div className="about-row"><span>{t('about.runtime')}</span><span>Tauri + React + Fastify</span></div>
            <div className="about-row"><span>{t('about.toolCount')}</span><span>{toolsList.length || '—'}</span></div>
            <div className="about-row"><span>{t('about.skillCount')}</span><span>{skillsList.length || '—'}</span></div>
            <div className="about-row">
              <span>{t('about.keyStorage')}</span>
              <span style={{ color: settings.storageMode === 'dpapi' ? '#30d158' : '#ff9f0a' }}>
                {settings.storageMode === 'dpapi' ? t('about.encrypted') : t('about.plaintext')}
              </span>
            </div>
          </div>
          {globalCost && (
            <>
              <div className="settings-section-title" style={{ marginTop: 16, alignSelf: 'flex-start' }}>💰 {t('about.cost')}</div>
              <div className="about-info">
                <div className="about-row"><span>{t('about.totalCost')}</span><span style={{ color: '#ff9f0a' }}>¥{globalCost.totalCny.toFixed(4)}</span></div>
                <div className="about-row"><span>{t('about.totalTokens')}</span><span>{globalCost.totalTokens.toLocaleString()}</span></div>
                <div className="about-row"><span>{t('about.callCount')}</span><span>{globalCost.callCount}</span></div>
                <div className="about-row"><span>{t('about.sessionCount')}</span><span>{globalCost.sessionCount}</span></div>
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
