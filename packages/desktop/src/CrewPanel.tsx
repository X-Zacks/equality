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
    setSelectedSkills([...crew.skillNames])
    setActiveTab('info')
    setEditing(crew)
    setCreating(true)
  }

  const handleSave = async () => {
    if (!name.trim()) return
    if (editing) {
      await updateCrew(editing.id, { name, description, emoji, systemPromptExtra, skillNames: selectedSkills })
    } else {
      await createCrew({ name, description, emoji, skillNames: selectedSkills, systemPromptExtra })
    }
    setCreating(false)
    resetForm()
    refresh()
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
    !skillFilter || s.name.toLowerCase().includes(skillFilter.toLowerCase()) || s.description.toLowerCase().includes(skillFilter.toLowerCase())
  )

  // ─── Render ─────────────────────────────────────────────────────────────

  if (creating) {
    return (
      <div style={{ padding: 16, color: '#e0e0e0', height: '100%', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <button onClick={() => { setCreating(false); resetForm() }} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 16 }}>←</button>
          <h3 style={{ margin: 0 }}>{editing ? t('crew.edit', '编辑 Crew') : t('crew.create', '新建 Crew')}</h3>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #333' }}>
          {(['info', 'prompt', 'skills'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '6px 14px',
                background: activeTab === tab ? '#2a2a3e' : 'transparent',
                color: activeTab === tab ? '#fff' : '#888',
                border: 'none',
                borderBottom: activeTab === tab ? '2px solid #7c6ef6' : '2px solid transparent',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              {tab === 'info' ? t('crew.tab.info', '基础信息') : tab === 'prompt' ? t('crew.tab.prompt', 'System Prompt') : `${t('crew.tab.skills', 'Skills')} (${selectedSkills.length})`}
            </button>
          ))}
        </div>

        {activeTab === 'info' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: '#888' }}>Emoji</label>
              <input value={emoji} onChange={e => setEmoji(e.target.value)} style={{ width: '100%', padding: 8, background: '#1a1a2e', border: '1px solid #333', borderRadius: 6, color: '#fff', fontSize: 20, textAlign: 'center' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#888' }}>{t('crew.name', '名称')}</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder={t('crew.namePlaceholder', 'e.g. 前端开发助手')} style={{ width: '100%', padding: 8, background: '#1a1a2e', border: '1px solid #333', borderRadius: 6, color: '#fff' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#888' }}>{t('crew.description', '描述')}</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={t('crew.descPlaceholder', '一句话描述这个 Crew 的用途')} rows={3} style={{ width: '100%', padding: 8, background: '#1a1a2e', border: '1px solid #333', borderRadius: 6, color: '#fff', resize: 'vertical' }} />
            </div>
          </div>
        )}

        {activeTab === 'prompt' && (
          <div>
            <label style={{ fontSize: 12, color: '#888' }}>{t('crew.sysPrompt', '追加 System Prompt')}</label>
            <textarea
              value={systemPromptExtra}
              onChange={e => setSystemPromptExtra(e.target.value)}
              placeholder={t('crew.sysPromptPlaceholder', '在默认 System Prompt 之后追加的自定义指令…')}
              rows={12}
              style={{ width: '100%', padding: 8, background: '#1a1a2e', border: '1px solid #333', borderRadius: 6, color: '#fff', resize: 'vertical', fontFamily: 'monospace', fontSize: 13 }}
            />
          </div>
        )}

        {activeTab === 'skills' && (
          <div>
            <input
              value={skillFilter}
              onChange={e => setSkillFilter(e.target.value)}
              placeholder={t('crew.skillFilter', '搜索 Skill…')}
              style={{ width: '100%', padding: 8, background: '#1a1a2e', border: '1px solid #333', borderRadius: 6, color: '#fff', marginBottom: 8 }}
            />
            <div style={{ maxHeight: 400, overflow: 'auto' }}>
              {filteredSkills.map(s => (
                <label key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={selectedSkills.includes(s.name)}
                    onChange={() => toggleSkill(s.name)}
                  />
                  <span style={{ color: '#e0e0e0' }}>{s.name}</span>
                  <span style={{ color: '#666', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.description?.slice(0, 60)}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            style={{ flex: 1, padding: '8px 16px', background: '#7c6ef6', color: '#fff', border: 'none', borderRadius: 6, cursor: name.trim() ? 'pointer' : 'not-allowed', opacity: name.trim() ? 1 : 0.5 }}
          >
            {t('save', '保存')}
          </button>
          <button
            onClick={() => { setCreating(false); resetForm() }}
            style={{ padding: '8px 16px', background: '#333', color: '#ccc', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          >
            {t('cancel', '取消')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: 16, color: '#e0e0e0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>🤖 Crews</h3>
        <button onClick={openCreate} style={{ background: '#7c6ef6', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 13 }}>
          + {t('crew.new', '新建')}
        </button>
      </div>

      {crews.length === 0 && (
        <p style={{ color: '#666', fontSize: 13, textAlign: 'center', marginTop: 32 }}>
          {t('crew.empty', '还没有 Crew，点击上方按钮新建一个')}
        </p>
      )}

      {crews.map(crew => (
        <div
          key={crew.id}
          style={{ padding: 12, background: '#1a1a2e', borderRadius: 8, marginBottom: 8, cursor: 'pointer', border: '1px solid #2a2a3e' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>{crew.emoji ?? '🤖'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{crew.name}</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{crew.description || '—'}</div>
              <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{crew.skillNames.length} Skills</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button onClick={() => handleStartSession(crew.id)} style={{ flex: 1, padding: '5px 0', background: '#2d4a2d', color: '#7dff7d', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
              🚀 {t('crew.start', '开始会话')}
            </button>
            <button onClick={() => openEdit(crew)} style={{ padding: '5px 10px', background: '#333', color: '#ccc', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
              ✏️
            </button>
            <button onClick={() => handleDelete(crew.id)} style={{ padding: '5px 10px', background: '#3a2020', color: '#ff7d7d', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
              🗑
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
