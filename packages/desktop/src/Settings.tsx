import { useState, useEffect, useCallback, useRef } from 'react'
import { useGateway } from './useGateway'
import type { SettingsState, SecretKey } from './useGateway'
import { open } from '@tauri-apps/plugin-shell'
import { MemoryTab } from './MemoryTab'
import './Settings.css'

type SettingsTab = 'model' | 'tools' | 'skills' | 'memory' | 'advanced' | 'about'
type ThemePreference = 'system' | 'purple' | 'dark'
type EffectiveTheme = 'purple' | 'dark'

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
    if (status === 'active') return <span className="pr-status pr-status-active">● 激活中</span>
    if (status === 'configured') return <span className="pr-status pr-status-configured">● 已配置</span>
    return <span className="pr-status pr-status-unconfigured">○ 未配置</span>
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
  onSaveKey: (key: SecretKey, value: string) => Promise<boolean>
  onRefresh: () => Promise<void>
}

function saveLabel(state: string) {
  return state === 'saving' ? '保存中…' : state === 'ok' ? '✓ 已保存' : state === 'err' ? '✕ 失败' : '保存'
}

function ProviderDrawer({
  providerId, settings, draft, saving, copilot,
  getMasked, onDraftChange, onSave, onClear, onCopilotLogin, onCopilotLogout, onClose,
  onSaveKey, onRefresh,
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
        </div>
      </div>
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

function ToolDetailDrawer({ tool, onClose }: { tool: ToolSchema; onClose: () => void }) {
  const props = tool.parameters?.properties ?? {}
  const required = new Set(tool.parameters?.required ?? [])
  const paramEntries = Object.entries(props)

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
            <p className="tool-detail-desc">{tool.description || '暂无描述'}</p>
          </div>

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

          {paramEntries.length === 0 && (
            <p className="drawer-hint">此工具无需额外参数</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── AdvancedDrawer: 高级设置右侧抽屉 ────────────────────────────────────────
interface AdvancedDrawerProps {
  panel: 'performance' | 'agentLoop'
  draft: Partial<Record<SecretKey, string>>
  saving: Record<string, 'idle' | 'saving' | 'ok' | 'err'>
  getMasked: (key: SecretKey) => string
  onDraftChange: (key: SecretKey, value: string) => void
  onSave: (groupId: string, keys: SecretKey[]) => Promise<void>
  onClose: () => void
}

function AdvancedDrawer({ panel, draft, saving, getMasked, onDraftChange, onSave, onClose }: AdvancedDrawerProps) {
  const isPerformance = panel === 'performance'
  const title = isPerformance ? '⚡ 性能设置' : '🔁 Agent 循环上限'
  const saveGroup = isPerformance ? 'advanced' : 'agentLoop'
  const saveKeys: SecretKey[] = isPerformance
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
          {isPerformance ? (
            <>
              <div className="key-row">
                <label>Bash 默认超时 (ms)</label>
                <input
                  type="number"
                  placeholder={getMasked('BASH_TIMEOUT_MS') || '300000'}
                  value={draft['BASH_TIMEOUT_MS'] ?? ''}
                  onChange={e => onDraftChange('BASH_TIMEOUT_MS', e.target.value)}
                />
              </div>
              <p className="drawer-hint">bash 前台命令总超时。最小 5s，默认 5 分钟。持续有输出不会中断，总时长超限才触发。</p>
              <div className="key-row" style={{ marginTop: 10 }}>
                <label>无输出超时 (ms)</label>
                <input
                  type="number"
                  placeholder={getMasked('BASH_IDLE_TIMEOUT_MS') || '120000'}
                  value={draft['BASH_IDLE_TIMEOUT_MS'] ?? ''}
                  onChange={e => onDraftChange('BASH_IDLE_TIMEOUT_MS', e.target.value)}
                />
              </div>
              <p className="drawer-hint">命令无 stdout/stderr 输出超过此时间则终止。设为 0 禁用。默认 2 分钟。</p>
              <div className="key-row" style={{ marginTop: 10 }}>
                <label>超时上限 (ms)</label>
                <input
                  type="number"
                  placeholder={getMasked('BASH_MAX_TIMEOUT_MS') || '1800000'}
                  value={draft['BASH_MAX_TIMEOUT_MS'] ?? ''}
                  onChange={e => onDraftChange('BASH_MAX_TIMEOUT_MS', e.target.value)}
                />
              </div>
              <p className="drawer-hint">单条 bash 命令绝对上限，防止 LLM 传入过大 timeout_ms。默认 30 分钟。</p>
            </>
          ) : (
            <>
              <div className="key-row">
                <label>工具调用上限 (次)</label>
                <input
                  type="number"
                  placeholder={getMasked('AGENT_MAX_TOOL_CALLS') || '50'}
                  value={draft['AGENT_MAX_TOOL_CALLS'] ?? ''}
                  onChange={e => onDraftChange('AGENT_MAX_TOOL_CALLS', e.target.value)}
                />
              </div>
              <p className="drawer-hint">单次任务最多执行多少次工具调用。默认 50，写大型项目可调高（如 200-300）。最大 500。</p>
              <div className="key-row" style={{ marginTop: 10 }}>
                <label>LLM 轮次上限 (轮)</label>
                <input
                  type="number"
                  placeholder={getMasked('AGENT_MAX_LLM_TURNS') || '50'}
                  value={draft['AGENT_MAX_LLM_TURNS'] ?? ''}
                  onChange={e => onDraftChange('AGENT_MAX_LLM_TURNS', e.target.value)}
                />
              </div>
              <p className="drawer-hint">单次任务最多发起多少轮 LLM 调用。默认 50，通常保持默认即可，工具调用上限是更常见的瓶颈。最大 500。</p>
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

  // 已配置状态（来自服务端）
  const [settings, setSettings] = useState<SettingsState>({ configured: [], activeProvider: null })
  // 用户正在编辑的字段
  const [draft, setDraft] = useState<Partial<Record<SecretKey, string>>>({})
  // 每个 group 的保存状态
  const [saving, setSaving] = useState<Record<string, 'idle' | 'saving' | 'ok' | 'err'>>({})
  // 当前打开的 drawer（provider id，null 表示关闭）
  const [drawerProvider, setDrawerProvider] = useState<string | null>(null)
  // 高级设置 drawer
  const [advancedDrawer, setAdvancedDrawer] = useState<'performance' | 'agentLoop' | null>(null)
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
  const [skillsList, setSkillsList] = useState<Array<{ name: string; description: string; source: string; body?: string }>>([])
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null)

  // 配额状态 (V4.1)
  const [quotaConfigs, setQuotaConfigs] = useState<Array<{ provider: string; tier: string; monthlyLimit: number; warnPct: number; criticalPct: number; autoDowngrade: boolean }>>([])
  const [quotaStatuses, setQuotaStatuses] = useState<Array<{ provider: string; tier: string; used: number; limit: number; remaining: number; pct: number; level: string }>>([])

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
          { id: 'memory' as SettingsTab, label: '🧠 记忆' },
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

        {/* ─── Provider 列表 ───────────────────────────────────────────── */}
        <div className="provider-list">
          {/* Copilot 行 */}
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
          />
        )}

        {/* ─── 月度配额区域 (V4.1) ────────────────────────────────────── */}
        <div className="settings-section-title" style={{ marginTop: 12 }}>📊 月度请求配额</div>
        {quotaStatuses.length === 0 && quotaConfigs.length === 0 ? (
          <p className="settings-hint">暂无配额配置。通过 <code>PUT /quota</code> API 设置，或在下方添加。</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {quotaStatuses.map(s => {
              const pct = Math.min(s.pct * 100, 100)
              const levelIcon = s.level === 'ok' ? '✅' : s.level === 'warn' ? '⚠️' : s.level === 'critical' ? '🔴' : '🚫'
              const barColor = s.level === 'ok' ? '#30d158' : s.level === 'warn' ? '#ff9f0a' : '#ff453a'
              return (
                <div key={`${s.provider}-${s.tier}`} className="provider-card" style={{ padding: '8px 10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>{levelIcon} {s.provider} · {s.tier}</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{s.used} / {s.limit === Infinity ? '∞' : s.limit}</span>
                  </div>
                  {s.limit !== Infinity && (
                    <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 2, transition: 'width 0.3s' }} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

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
                <div key={t.name} className="tool-item" onClick={() => setToolDetail(t)} style={{ cursor: 'pointer' }}>
                  <span className="tool-icon">{getToolIcon(t.name)}</span>
                  <span className="tool-name">{t.name}</span>
                  <span className="tool-detail-btn">›</span>
                </div>
              ))}
            </div>
          )}
          <p className="settings-hint" style={{ marginTop: 8 }}>
            点击工具名查看详情。工具调用上限及 LLM 轮次上限见「⚙️ 高级」设置
          </p>

          {toolDetail && (
            <ToolDetailDrawer tool={toolDetail} onClose={() => setToolDetail(null)} />
          )}
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
              {skillsList.map(s => {
                const isExpanded = expandedSkill === s.name
                return (
                  <div key={s.name} className={`skill-item ${isExpanded ? 'skill-item-expanded' : ''}`}
                       onClick={() => setExpandedSkill(isExpanded ? null : s.name)}
                       style={{ cursor: 'pointer' }}>
                    <div className="skill-header">
                      <span className="skill-expand">{isExpanded ? '▼' : '▶'}</span>
                      <span className="skill-name">{s.name}</span>
                      <span className="skill-source">{s.source}</span>
                    </div>
                    <div className="skill-desc">{s.description}</div>
                    {isExpanded && s.body && (
                      <pre className="skill-body">{s.body}</pre>
                    )}
                  </div>
                )
              })}
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
          </div>
        </>
      )}

      {/* ━━━ 记忆 Tab ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {tab === 'memory' && <MemoryTab />}

      {/* ━━━ 高级 Tab ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {tab === 'advanced' && (
        <>
          <div className="advanced-section" style={{ marginBottom: 10 }}>
            <div className="advanced-section-title">🎨 界面主题</div>
            <div className="advanced-item">
              <div className="advanced-item-header">
                <span className="advanced-item-label">界面风格</span>
                <span className="advanced-item-unit">当前：{effectiveTheme === 'purple' ? '紫色' : '深色'}</span>
              </div>
              <div className="theme-switch" role="group" aria-label="主题选择">
                <button
                  className={`theme-btn ${themePreference === 'purple' ? 'active' : ''}`}
                  onClick={() => onThemeChange('purple')}
                >
                  💜 紫色
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
                  title="清除手动选择并跟随系统"
                >
                  跟随系统
                </button>
              </div>
              <p className="advanced-item-desc">默认会跟随系统主题。选择紫色或深色后将固定，并在重启后保持。</p>
            </div>
          </div>

          {/* ─── 高级配置条目行 ──────────────────────────────────────── */}
          <div className="advanced-section">
            <div className="advanced-section-title">⚙️ 高级配置</div>

            {/* 工作目录 */}
            <div className="advanced-item" style={{ marginBottom: 10 }}>
              <div className="advanced-item-header">
                <span className="advanced-item-label">📁 工作目录</span>
                <span className="advanced-item-unit">{getMasked('WORKSPACE_DIR') || '未设置（使用默认）'}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <input
                  type="text"
                  className="key-input"
                  style={{ flex: 1 }}
                  placeholder="例：C:\Users\你的用户名\Equality\workspace"
                  value={draft['WORKSPACE_DIR'] ?? getMasked('WORKSPACE_DIR')}
                  onChange={e => setDraft(p => ({ ...p, WORKSPACE_DIR: e.target.value }))}
                />
                <button
                  className="btn-save"
                  disabled={!draft['WORKSPACE_DIR']?.trim() || saving['workspaceDir'] === 'saving'}
                  onClick={() => handleSave('workspaceDir', ['WORKSPACE_DIR'])}
                >
                  {saveLabel(saving['workspaceDir'] ?? 'idle')}
                </button>
              </div>
              <p className="advanced-item-desc">Agent 写脚本、临时文件的默认目录。bash 命令也在此目录下执行。留空使用默认路径。</p>
            </div>

            <div className="provider-card" style={{ marginBottom: 6 }}>
              <div className="provider-header" onClick={() => setAdvancedDrawer('performance')} style={{ cursor: 'pointer' }}>
                <span className="provider-name">⚡ 性能设置</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: '#888' }}>Bash 超时</span>
                  <span className="chevron">›</span>
                </div>
              </div>
            </div>
            <div className="provider-card">
              <div className="provider-header" onClick={() => setAdvancedDrawer('agentLoop')} style={{ cursor: 'pointer' }}>
                <span className="provider-name">🔁 Agent 循环上限</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: '#888' }}>工具次数 / LLM 轮次</span>
                  <span className="chevron">›</span>
                </div>
              </div>
            </div>

            {/* M3/T35: 自动记忆开关 */}
            <div className="advanced-item" style={{ marginTop: 12, marginBottom: 10 }}>
              <div className="advanced-item-header">
                <span className="advanced-item-label">🧠 自动记忆 (Auto Capture)</span>
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
          <p className="about-desc">面向中国大陆 Windows 用户的 AI 桌面智能助理</p>
          <div className="about-info">
            <div className="about-row"><span>运行环境</span><span>Tauri + React + Fastify</span></div>
            <div className="about-row"><span>工具数量</span><span>{toolsList.length || '—'}</span></div>
            <div className="about-row"><span>Skills 数量</span><span>{skillsList.length || '—'}</span></div>
            <div className="about-row">
              <span>Key 存储</span>
              <span style={{ color: settings.storageMode === 'dpapi' ? '#30d158' : '#ff9f0a' }}>
                {settings.storageMode === 'dpapi' ? '🔒 加密存储（DPAPI）' : '⚠️ 明文存储'}
              </span>
            </div>
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
