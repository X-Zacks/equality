import { useState, useEffect, useCallback } from 'react'
import { useT } from './i18n'

// ─── Types ──────────────────────────────────────────────────────────────────

interface CrewTemplate {
  id: string
  name: string
  description: string
  emoji?: string
  systemPromptExtra?: string
  skillNames: string[]
  source: string
  createdAt: string
  updatedAt: string
}

interface SkillEntry {
  name: string
  description: string
  category: string
}

interface CrewPanelProps {
  listCrews: () => Promise<CrewTemplate[]>
  createCrew: (data: { name: string; description: string; emoji?: string; skillNames?: string[]; systemPromptExtra?: string }) => Promise<CrewTemplate | null>
  updateCrew: (id: string, data: Record<string, unknown>) => Promise<CrewTemplate | null>
  deleteCrew: (id: string) => Promise<boolean>
  createCrewSession: (crewId: string) => Promise<{ sessionKey: string; crewId: string; crewName: string } | null>
  onStartCrewSession: (sessionKey: string) => void
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function CrewPanel({
  listCrews, createCrew, updateCrew, deleteCrew, createCrewSession, onStartCrewSession,
}: CrewPanelProps) {
  const { t } = useT()
  const [crews, setCrews] = useState<CrewTemplate[]>([])
  const [skills, setSkills] = useState<SkillEntry[]>([])
  const [editing, setEditing] = useState<CrewTemplate | null>(null)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [emoji, setEmoji] = useState('🤖')
  const [systemPromptExtra, setSystemPromptExtra] = useState('')
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<'info' | 'prompt' | 'skills'>('info')
  const [skillFilter, setSkillFilter] = useState('')

  const refresh = useCallback(async () => {
    const list = await listCrews()
    setCrews(list)
  }, [listCrews])

  // Load crews and skills on mount
  useEffect(() => {
    refresh()
    fetch('http://localhost:18790/skills')
      .then(r => r.json())
      .then((list: SkillEntry[]) => setSkills(list))
      .catch(() => {})
  }, [refresh])

  const resetForm = () => {
    setName('')
    setDescription('')
    setEmoji('🤖')
    setSystemPromptExtra('')
    setSelectedSkills([])
    setActiveTab('info')
    setSkillFilter('')
  }

  const openCreate = () => {
    resetForm()
    setEditing(null)
    setCreating(true)
  }

  const openEdit = (crew: CrewTemplate) => {
    setName(crew.name)
    setDescription(crew.description)
    setEmoji(crew.emoji ?? '🤖')
    setSystemPromptExtra(crew.systemPromptExtra ?? '')
    setSelectedSkills([...(crew.skillNames ?? [])])
    setActiveTab('info')
    setEditing(crew)
    setCreating(true)
  }

  const handleSave = async () => {
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        emoji: emoji.trim() || '🤖',
        systemPromptExtra,
        skillNames: [...selectedSkills],
      }
      console.log('[CrewPanel] saving payload:', JSON.stringify(payload))
      if (editing) {
        const result = await updateCrew(editing.id, payload)
        console.log('[CrewPanel] update result:', result)
        if (!result) return
      } else {
        const result = await createCrew(payload)
        console.log('[CrewPanel] create result:', result)
        if (!result) return
      }
      setCreating(false)
      resetForm()
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    await deleteCrew(id)
    refresh()
  }

  const handleStartSession = async (crewId: string) => {
    const result = await createCrewSession(crewId)
    if (result) onStartCrewSession(result.sessionKey)
  }

  const toggleSkill = (skillName: string) => {
    setSelectedSkills(prev =>
      prev.includes(skillName) ? prev.filter(s => s !== skillName) : [...prev, skillName]
    )
  }

  const filteredSkills = skills.filter(s =>
    !skillFilter
    || s.name.toLowerCase().includes(skillFilter.toLowerCase())
    || (s.description ?? '').toLowerCase().includes(skillFilter.toLowerCase())
    || (s.category ?? '').toLowerCase().includes(skillFilter.toLowerCase())
  )

  // ─── Styles ─────────────────────────────────────────────────────────────

  const S = {
    page: { height: '100%', display: 'flex', flexDirection: 'column' as const, color: '#e0e0e0' },
    header: { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid #2a2a3e' },
    title: { margin: 0, fontSize: 15, fontWeight: 600 as const },
    backBtn: { background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 16, padding: '4px 8px' },

    // Tabs
    tabs: { display: 'flex', gap: 0, borderBottom: '1px solid #2a2a3e', padding: '0 16px' },
    tab: (active: boolean) => ({
      padding: '8px 16px', background: 'transparent', border: 'none', fontSize: 13, cursor: 'pointer',
      color: active ? '#e0e0e0' : '#666',
      borderBottom: active ? '2px solid #7c6ef6' : '2px solid transparent',
      transition: 'all 0.15s',
    }),

    // Content
    content: { flex: 1, overflow: 'auto', padding: 16 },
    field: { marginBottom: 14 },
    label: { display: 'block', fontSize: 12, color: '#888', marginBottom: 4 },
    input: {
      width: '100%', padding: '8px 10px', background: '#1a1a2e', border: '1px solid #333',
      borderRadius: 6, color: '#e0e0e0', fontSize: 13, outline: 'none',
      boxSizing: 'border-box' as const,
    },
    textarea: { resize: 'vertical' as const, minHeight: 72 },

    // Footer
    footer: {
      display: 'flex', gap: 8, padding: '10px 16px', borderTop: '1px solid #2a2a3e',
      background: '#0d0d1a',
    },
    saveBtn: (disabled: boolean) => ({
      padding: '7px 20px', background: disabled ? '#3a3a5a' : '#7c6ef6', color: '#fff',
      border: 'none', borderRadius: 6, cursor: disabled ? 'default' : 'pointer',
      fontSize: 13, fontWeight: 500 as const, transition: 'background 0.15s',
    }),
    cancelBtn: {
      padding: '7px 16px', background: 'transparent', color: '#888',
      border: '1px solid #333', borderRadius: 6, cursor: 'pointer', fontSize: 13,
    },

    // Skills
    skillSearch: { marginBottom: 10 },
    selectedTags: { display: 'flex', flexWrap: 'wrap' as const, gap: 4, marginBottom: 10 },
    tag: {
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px',
      background: '#2a2a4e', borderRadius: 12, fontSize: 11, color: '#b8b0ff',
    },
    tagRemove: {
      background: 'none', border: 'none', color: '#888', cursor: 'pointer',
      fontSize: 12, padding: 0, lineHeight: 1,
    },
    skillItem: (selected: boolean) => ({
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
      borderRadius: 6, cursor: 'pointer', fontSize: 13,
      background: selected ? '#1e1e3a' : 'transparent',
      transition: 'background 0.1s',
    }),
    skillName: { color: '#e0e0e0', fontWeight: 500 as const, whiteSpace: 'nowrap' as const },
    skillDesc: {
      color: '#555', fontSize: 11, flex: 1,
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
    },
    skillCatTitle: {
      fontSize: 11, color: '#555', textTransform: 'uppercase' as const, letterSpacing: 1,
      padding: '8px 8px 4px', fontWeight: 600 as const,
    },

    // List view
    listHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' },
    newBtn: {
      background: '#7c6ef6', color: '#fff', border: 'none', borderRadius: 6,
      padding: '5px 14px', cursor: 'pointer', fontSize: 13,
    },
    card: {
      margin: '0 12px 8px', padding: 12, background: '#111128', borderRadius: 8,
      border: '1px solid #1e1e3a', transition: 'border-color 0.15s',
    },
    cardBody: { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' },
    cardEmoji: { fontSize: 24, width: 36, textAlign: 'center' as const },
    cardName: { fontSize: 14, fontWeight: 600 as const },
    cardDesc: { fontSize: 12, color: '#777', marginTop: 2 },
    cardSkills: { display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' as const },
    cardBadge: {
      fontSize: 10, padding: '1px 6px', background: '#1e1e3a', borderRadius: 8,
      color: '#8888bb',
    },
    cardActions: { display: 'flex', gap: 6, marginTop: 8, paddingTop: 8, borderTop: '1px solid #1e1e3a' },
    cardBtn: {
      flex: 1, padding: '5px 0', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12,
    },
    empty: { textAlign: 'center' as const, color: '#555', marginTop: 48, fontSize: 13 },
  }

  // ─── Edit / Create View ─────────────────────────────────────────────────

  if (creating) {
    // Group by category
    const grouped = filteredSkills.reduce<Record<string, SkillEntry[]>>((acc, s) => {
      const cat = s.category || 'other'
      ;(acc[cat] ??= []).push(s)
      return acc
    }, {})

    return (
      <div style={S.page}>
        {/* Header */}
        <div style={S.header}>
          <button style={S.backBtn} onClick={() => { setCreating(false); resetForm() }}>←</button>
          <h3 style={S.title}>{editing ? t('crew.edit', 'Edit Crew') : t('crew.create', 'New Crew')}</h3>
        </div>

        {/* Tabs */}
        <div style={S.tabs}>
          {(['info', 'prompt', 'skills'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={S.tab(activeTab === tab)}>
              {tab === 'info' ? t('crew.tab.info', 'Basics')
                : tab === 'prompt' ? t('crew.tab.prompt', 'System Prompt')
                : `${t('crew.tab.skills', 'Skills')} (${selectedSkills.length})`}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={S.content}>
          {activeTab === 'info' && (
            <>
              <div style={S.field}>
                <label style={S.label}>Emoji</label>
                <input value={emoji} onChange={e => setEmoji(e.target.value)}
                  style={{ ...S.input, fontSize: 24, textAlign: 'center', width: 64 }} />
              </div>
              <div style={S.field}>
                <label style={S.label}>{t('crew.name', '名称')}</label>
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder={t('crew.namePlaceholder', 'e.g. 前端开发助手')}
                  style={S.input} autoFocus />
              </div>
              <div style={S.field}>
                <label style={S.label}>{t('crew.description', '描述')}</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)}
                  placeholder={t('crew.descPlaceholder', '一句话描述这个 Crew 的用途')}
                  rows={3} style={{ ...S.input, ...S.textarea }} />
              </div>
            </>
          )}

          {activeTab === 'prompt' && (
            <div style={S.field}>
              <label style={S.label}>{t('crew.sysPrompt', '追加 System Prompt')}</label>
              <textarea
                value={systemPromptExtra} onChange={e => setSystemPromptExtra(e.target.value)}
                placeholder={t('crew.sysPromptPlaceholder', '在默认 System Prompt 之后追加的自定义指令…')}
                rows={18} style={{ ...S.input, ...S.textarea, fontFamily: 'monospace', fontSize: 13, minHeight: 300 }} />
            </div>
          )}

          {activeTab === 'skills' && (
            <>
              <input value={skillFilter} onChange={e => setSkillFilter(e.target.value)}
                placeholder={t('crew.skillFilter', 'Search Skills…')}
                style={{ ...S.input, ...S.skillSearch }} />

              {selectedSkills.length > 0 && (
                <div style={S.selectedTags}>
                  {selectedSkills.map(sn => (
                    <span key={sn} style={S.tag}>
                      {sn}
                      <button style={S.tagRemove} onClick={() => toggleSkill(sn)}>×</button>
                    </span>
                  ))}
                </div>
              )}

              <div>
                {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]) => (
                  <div key={cat}>
                    <div style={S.skillCatTitle}>{cat}</div>
                    {items.map(s => (
                      <label key={s.name} style={S.skillItem(selectedSkills.includes(s.name))}>
                        <input type="checkbox" checked={selectedSkills.includes(s.name)}
                          onChange={() => toggleSkill(s.name)} style={{ accentColor: '#7c6ef6' }} />
                        <span style={S.skillName}>{s.name}</span>
                        <span style={S.skillDesc}>{s.description?.slice(0, 80)}</span>
                      </label>
                    ))}
                  </div>
                ))}
                {filteredSkills.length === 0 && (
                  <p style={S.empty}>{skillFilter ? 'No matching skills' : 'No skills available'}</p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={S.footer}>
          <button style={S.cancelBtn} onClick={() => { setCreating(false); resetForm() }}>
            {t('cancel', 'Cancel')}
          </button>
          <button style={S.saveBtn(!name.trim() || saving)} onClick={handleSave}
            disabled={!name.trim() || saving}>
            {saving ? '⏳ Saving…' : '✓ Save'}
          </button>
        </div>
      </div>
    )
  }

  // ─── List View ────────────────────────────────────────────────────────────

  return (
    <div style={S.page}>
      <div style={S.listHeader}>
        <h3 style={S.title}>🤖 Crews</h3>
        <button style={S.newBtn} onClick={openCreate}>+ {t('crew.new', 'New')}</button>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {crews.length === 0 && (
          <div style={S.empty}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🤖</div>
            <p>{t('crew.empty', '还没有 Crew，点击上方按钮新建一个')}</p>
          </div>
        )}

        {crews.map(crew => (
          <div key={crew.id} style={S.card}>
            <div style={S.cardBody} onClick={() => openEdit(crew)}>
              <span style={S.cardEmoji}>{crew.emoji ?? '🤖'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={S.cardName}>{crew.name}</div>
                <div style={S.cardDesc}>{crew.description || '—'}</div>
                {crew.skillNames.length > 0 && (
                  <div style={S.cardSkills}>
                    {crew.skillNames.slice(0, 4).map(sn => (
                      <span key={sn} style={S.cardBadge}>{sn}</span>
                    ))}
                    {crew.skillNames.length > 4 && (
                      <span style={{ ...S.cardBadge, color: '#666' }}>+{crew.skillNames.length - 4}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div style={S.cardActions}>
              <button onClick={() => handleStartSession(crew.id)}
                style={{ ...S.cardBtn, background: '#1a2e1a', color: '#7dff7d' }}>
                🚀 {t('crew.start', 'Start')}
              </button>
              <button onClick={() => openEdit(crew)}
                style={{ ...S.cardBtn, background: '#1e1e3a', color: '#aaa', flex: 0, padding: '5px 10px' }}>
                ✏️
              </button>
              <button onClick={() => handleDelete(crew.id)}
                style={{ ...S.cardBtn, background: '#2e1a1a', color: '#ff7d7d', flex: 0, padding: '5px 10px' }}>
                🗑
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
