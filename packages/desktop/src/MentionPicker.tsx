import { useEffect, useRef, useState, useMemo } from 'react'
import './MentionPicker.css'

export interface SkillItem {
  name: string
  description: string
}

export interface ToolItem {
  name: string
  description?: string
}

interface MentionPickerProps {
  type: 'skill' | 'tool'
  query: string
  onSelect: (name: string) => void
  onClose: () => void
}

// ─── 模块级缓存（session 内复用） ────────────────────────────────────────────
let skillsCache: SkillItem[] | null = null
let toolsCache: ToolItem[] | null = null

const CORE_PORT = 18790

async function fetchSkills(): Promise<SkillItem[]> {
  if (skillsCache) return skillsCache
  const res = await fetch(`http://localhost:${CORE_PORT}/skills`)
  const data = await res.json() as SkillItem[]
  skillsCache = data
  return data
}

async function fetchTools(): Promise<ToolItem[]> {
  if (toolsCache) return toolsCache
  const res = await fetch(`http://localhost:${CORE_PORT}/tools/schemas`)
  const raw = await res.json() as Array<{ function: { name: string; description?: string } }>
  toolsCache = raw.map(t => ({ name: t.function.name, description: t.function.description }))
  return toolsCache
}

// ─── 工具 emoji 映射 ─────────────────────────────────────────────────────────
const TOOL_ICONS: Record<string, string> = {
  bash: '💻', write_file: '✏️', edit_file: '📝', read_file: '📖',
  glob: '🔍', grep: '🔎', list_dir: '📁', web_fetch: '🌐',
  web_search: '🔍', read_image: '🖼️', read_pdf: '📑',
  apply_patch: '🩹', process: '⚙️', cron: '⏰', browser: '🌍',
  memory_save: '💾', memory_search: '🧠',
}

export function MentionPicker({ type, query, onSelect, onClose }: MentionPickerProps) {
  const [items, setItems] = useState<SkillItem[] | ToolItem[]>([])
  const [highlightIdx, setHighlightIdx] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (type === 'skill') {
      fetchSkills().then(setItems).catch(() => setItems([]))
    } else {
      fetchTools().then(setItems).catch(() => setItems([]))
    }
  }, [type])

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    if (!q) return items
    return items.filter(item =>
      item.name.toLowerCase().includes(q) ||
      (item.description?.toLowerCase().includes(q) ?? false),
    )
  }, [items, query])

  // query 变化时重置高亮
  useEffect(() => setHighlightIdx(0), [query])

  // 把高亮项滚动到可见区域
  useEffect(() => {
    const container = listRef.current
    if (!container) return
    const highlighted = container.querySelector<HTMLDivElement>('.mention-picker-item.highlighted')
    highlighted?.scrollIntoView({ block: 'nearest' })
  }, [highlightIdx])

  // 暴露给父组件调用的键盘处理
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIdx(i => (i + 1) % Math.max(filtered.length, 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIdx(i => (i - 1 + Math.max(filtered.length, 1)) % Math.max(filtered.length, 1))
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (filtered.length > 0) {
          e.preventDefault()
          e.stopPropagation()
          onSelect(filtered[highlightIdx]?.name ?? filtered[0].name)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [filtered, highlightIdx, onSelect, onClose])

  if (filtered.length === 0 && items.length > 0) {
    return (
      <div className="mention-picker">
        <div className="mention-picker-empty">
          没有匹配的{type === 'skill' ? 'Skill' : '工具'}
        </div>
      </div>
    )
  }

  if (items.length === 0) return null

  return (
    <div className="mention-picker" ref={listRef}>
      <div className="mention-picker-header">
        {type === 'skill' ? '🧩 选择 Skill' : '🔧 选择工具'}
      </div>
      {filtered.map((item, idx) => (
        <div
          key={item.name}
          className={`mention-picker-item${idx === highlightIdx ? ' highlighted' : ''}`}
          onMouseEnter={() => setHighlightIdx(idx)}
          onMouseDown={(e) => { e.preventDefault(); onSelect(item.name) }}
        >
          <span className="mention-picker-item-icon">
            {type === 'tool' ? (TOOL_ICONS[item.name] ?? '🔧') : '🧩'}
          </span>
          <span className="mention-picker-item-body">
            <span className="mention-picker-item-name">{item.name}</span>
            {item.description && (
              <span className="mention-picker-item-desc">
                {item.description.slice(0, 70)}{item.description.length > 70 ? '…' : ''}
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  )
}
