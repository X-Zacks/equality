import { useState, useEffect, useCallback, useRef } from 'react'
import { useGateway } from './useGateway'
import { useT } from './i18n'
import './SessionPanel.css'

const SUB_SEP = '::sub::'

interface SessionItem {
  key: string
  createdAt: number
  lastActiveAt: number
  messageCount: number
  title: string
}

/** 最简树节点 */
interface TreeNode {
  item: SessionItem
  children: TreeNode[]
}

interface SessionPanelProps {
  activeKey: string
  onSelect: (key: string) => void
  onNewChat: () => void
  disabled?: boolean
  streaming?: boolean
}

/** 相对时间格式化 */
function relativeTime(ts: number, t: (key: string, vars?: Record<string, string | number> | string) => string, locale: string): string {
  const now = Date.now()
  const diff = now - ts
  if (diff < 60_000) return t('time.justNow')
  if (diff < 3600_000) return t('time.minutesAgo', { n: Math.floor(diff / 60_000) })
  if (diff < 86400_000) return t('time.hoursAgo', { n: Math.floor(diff / 3600_000) })
  if (diff < 172800_000) return t('time.yesterday')
  if (diff < 604800_000) return t('time.daysAgo', { n: Math.floor(diff / 86400_000) })
  return new Date(ts).toLocaleDateString(locale === 'zh-CN' ? 'zh-CN' : 'en-US')
}

/** 日期分组 */
function dateGroup(ts: number, t: (key: string) => string): string {
  const now = new Date()
  const date = new Date(ts)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400_000)
  const weekAgo = new Date(today.getTime() - 7 * 86400_000)
  if (date >= today) return t('time.today')
  if (date >= yesterday) return t('time.yesterday')
  if (date >= weekAgo) return t('time.last7days')
  return t('time.older')
}

/** 将平铺 session 列表构建为树。子 session（含 ::sub::）归到父节点下，不单独出现在顶层 */
function buildTree(sessions: SessionItem[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  for (const s of sessions) {
    map.set(s.key, { item: s, children: [] })
  }

  const roots: TreeNode[] = []
  for (const node of map.values()) {
    const idx = node.item.key.lastIndexOf(SUB_SEP)
    if (idx !== -1) {
      const parentKey = node.item.key.substring(0, idx)
      const parentNode = map.get(parentKey)
      if (parentNode) {
        parentNode.children.push(node)
        continue // 不加入顶层
      }
    }
    roots.push(node)
  }

  // 子节点按创建时间排
  for (const node of map.values()) {
    node.children.sort((a, b) => a.item.createdAt - b.item.createdAt)
  }

  return roots
}

// ─── 子会话项 ────────────────────────────────────────────────────────────────

function ChildItem({ node, activeKey, onSelect, titles }: {
  node: TreeNode
  activeKey: string
  onSelect: (key: string) => void
  titles: Record<string, string>
}) {
  const s = node.item
  const isActive = s.key === activeKey
  const title = titles[s.key] || s.title || '子任务'
  // 显示为子 session 的缩略标题
  const displayTitle = title.length > 28 ? title.slice(0, 28) + '…' : title
  return (
    <div
      className={`session-item session-child ${isActive ? 'active' : ''}`}
      onClick={() => onSelect(s.key)}
      title={title}
    >
      <div className="session-item-title">
        <span className="child-icon">↳</span> {displayTitle}
      </div>
    </div>
  )
}

// ─── 父会话项（带折叠子节点）────────────────────────────────────────────────

function ParentItem({ node, activeKey, onSelect, onDelete, titles }: {
  node: TreeNode
  activeKey: string
  onSelect: (key: string) => void
  onDelete: (key: string, e: React.MouseEvent) => void
  titles: Record<string, string>
}) {
  // 如果当前 active 是自己的子节点，默认展开
  const isChildActive = node.children.some(c => c.item.key === activeKey)
  const [expanded, setExpanded] = useState(isChildActive || false)
  const { t, locale } = useT()
  const s = node.item
  const isActive = s.key === activeKey
  const hasChildren = node.children.length > 0

  // active 变到子节点时自动展开
  useEffect(() => {
    if (isChildActive) setExpanded(true)
  }, [isChildActive])

  return (
    <div>
      <div
        className={`session-item ${isActive ? 'active' : ''}`}
        onClick={() => onSelect(s.key)}
      >
        {/* 折叠箭头 */}
        {hasChildren && (
          <span
            className="session-expand-btn"
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
          >
            {expanded ? '▾' : '▸'}
          </span>
        )}
        <div className="session-item-title" style={hasChildren ? { paddingLeft: 12 } : undefined}>
          {titles[s.key] || s.title || t('newChat.fallback')}
          {hasChildren && <span className="child-count">{node.children.length}</span>}
        </div>
        <div className="session-item-time">
          {relativeTime(s.lastActiveAt, t, locale)}
        </div>
        <button
          className="session-item-delete"
          onClick={(e) => onDelete(s.key, e)}
          title={t('deleteChat')}
        >🗑</button>
      </div>

      {/* 子会话 */}
      {hasChildren && expanded && (
        <div className="session-children">
          {node.children.map(child => (
            <ChildItem
              key={child.item.key}
              node={child}
              activeKey={activeKey}
              onSelect={onSelect}
              titles={titles}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────

export default function SessionPanel({ activeKey, onSelect, onNewChat, disabled, streaming }: SessionPanelProps) {
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [titles, setTitles] = useState<Record<string, string>>({})
  const { listSessions, loadSession, deleteSession } = useGateway()
  const { t, locale } = useT()
  const prevStreaming = useRef(streaming)

  // 加载会话列表
  const refreshList = useCallback(async () => {
    const list = await listSessions()
    setSessions(list.map(s => ({
      ...s,
      title: s.title || (s.messageCount === 0 ? t('newChat.fallback') : t('chat.fallback')),
    })))

    // 逐个加载标题：优先使用 listSessions 返回的自动标题，否则取第一条 user 消息
    const newTitles: Record<string, string> = {}
    for (const s of list) {
      if (s.title) {
        newTitles[s.key] = s.title
      } else if (s.messageCount > 0) {
        const history = await loadSession(s.key)
        if (history?.title) {
          newTitles[s.key] = history.title
        } else {
          const firstUser = history?.messages?.find(m => m.role === 'user')
          if (firstUser?.content) {
            const clean = firstUser.content.replace(/\n/g, ' ').trim()
            newTitles[s.key] = clean.length > 30 ? clean.slice(0, 30) + '…' : clean
          }
        }
      }
    }
    setTitles(newTitles)
  }, [listSessions, loadSession])

  // activeKey 变化时刷新
  useEffect(() => {
    refreshList()
  }, [refreshList, activeKey])

  // streaming 结束时刷新（对话完成后 persist 已写入磁盘）
  useEffect(() => {
    if (prevStreaming.current && !streaming) {
      refreshList()
    }
    prevStreaming.current = streaming
  }, [streaming, refreshList])

  // 子 Agent 运行期间定时刷新列表（每 3 秒），让子 session 及时出现
  useEffect(() => {
    if (!streaming) return
    const timer = setInterval(refreshList, 3000)
    return () => clearInterval(timer)
  }, [streaming, refreshList])

  const handleDelete = async (key: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await deleteSession(key)
    // 同时删除子会话
    const childSessions = sessions.filter(s => s.key.startsWith(key + SUB_SEP))
    for (const child of childSessions) {
      await deleteSession(child.key)
    }
    if (key === activeKey || childSessions.some(c => c.key === activeKey)) {
      const remaining = sessions.filter(s => s.key !== key && !s.key.startsWith(key + SUB_SEP))
      if (remaining.length > 0) {
        // 选择第一个顶层 session
        const topLevel = remaining.find(s => !s.key.includes(SUB_SEP))
        onSelect(topLevel?.key ?? remaining[0].key)
      } else {
        onNewChat()
      }
    }
    refreshList()
  }

  // 构建树并按日期分组（只对顶层节点分组）
  const tree = buildTree(sessions)
  const grouped = new Map<string, TreeNode[]>()
  for (const node of tree) {
    const group = dateGroup(node.item.lastActiveAt, t)
    if (!grouped.has(group)) grouped.set(group, [])
    grouped.get(group)!.push(node)
  }

  return (
    <div className="session-panel">
      <div className="session-panel-header">
        <button
          className="session-new-btn"
          onClick={onNewChat}
          disabled={disabled}
          title={t('newChat.title')}
        >{t('newChat')}</button>
      </div>

      <div className="session-list">
        {tree.length === 0 && (
          <div className="session-empty">{t('noSessions')}</div>
        )}
        {[...grouped.entries()].map(([group, nodes]) => (
          <div key={group} className="session-group">
            <div className="session-group-label">{group}</div>
            {nodes.map(node => (
              <ParentItem
                key={node.item.key}
                node={node}
                activeKey={activeKey}
                onSelect={onSelect}
                onDelete={handleDelete}
                titles={titles}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
