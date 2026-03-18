import { useState, useEffect, useCallback, useRef } from 'react'
import { useGateway } from './useGateway'
import './SessionPanel.css'

interface SessionItem {
  key: string
  createdAt: number
  lastActiveAt: number
  messageCount: number
  title: string  // 从第一条消息提取
}

interface SessionPanelProps {
  activeKey: string
  onSelect: (key: string) => void
  onNewChat: () => void
  disabled?: boolean
  streaming?: boolean
}

/** 生成会话标题：取第一条消息前 30 字符 */
function sessionTitle(item: { key: string; messageCount: number }): string {
  if (item.messageCount === 0) return '新对话'
  // key 格式: agent:main:desktop:default:direct:<id>
  // 没有消息内容，后面加载时会更新
  return '对话'
}

/** 相对时间格式化 */
function relativeTime(ts: number): string {
  const now = Date.now()
  const diff = now - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`
  if (diff < 172800_000) return '昨天'
  if (diff < 604800_000) return `${Math.floor(diff / 86400_000)} 天前`
  return new Date(ts).toLocaleDateString('zh-CN')
}

/** 日期分组 */
function dateGroup(ts: number): string {
  const now = new Date()
  const date = new Date(ts)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400_000)
  const weekAgo = new Date(today.getTime() - 7 * 86400_000)

  if (date >= today) return '今天'
  if (date >= yesterday) return '昨天'
  if (date >= weekAgo) return '最近 7 天'
  return '更早'
}

export default function SessionPanel({ activeKey, onSelect, onNewChat, disabled, streaming }: SessionPanelProps) {
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [titles, setTitles] = useState<Record<string, string>>({})
  const { listSessions, loadSession, deleteSession } = useGateway()
  const prevStreaming = useRef(streaming)

  // 加载会话列表
  const refreshList = useCallback(async () => {
    const list = await listSessions()
    setSessions(list.map(s => ({
      ...s,
      title: sessionTitle(s),
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

  const handleDelete = async (key: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await deleteSession(key)
    if (key === activeKey) {
      // 删的是当前对话，切到列表第一个或新建
      const remaining = sessions.filter(s => s.key !== key)
      if (remaining.length > 0) {
        onSelect(remaining[0].key)
      } else {
        onNewChat()
      }
    }
    refreshList()
  }

  // 按日期分组
  const grouped = new Map<string, SessionItem[]>()
  for (const s of sessions) {
    const group = dateGroup(s.lastActiveAt)
    if (!grouped.has(group)) grouped.set(group, [])
    grouped.get(group)!.push(s)
  }

  return (
    <div className="session-panel">
      <div className="session-panel-header">
        <button
          className="session-new-btn"
          onClick={onNewChat}
          disabled={disabled}
          title="新对话 (Ctrl+N)"
        >+ 新对话</button>
      </div>

      <div className="session-list">
        {sessions.length === 0 && (
          <div className="session-empty">暂无对话</div>
        )}
        {[...grouped.entries()].map(([group, items]) => (
          <div key={group} className="session-group">
            <div className="session-group-label">{group}</div>
            {items.map(s => (
              <div
                key={s.key}
                className={`session-item ${s.key === activeKey ? 'active' : ''}`}
                onClick={() => !disabled && onSelect(s.key)}
              >
                <div className="session-item-title">
                  {titles[s.key] || s.title}
                </div>
                <div className="session-item-time">
                  {relativeTime(s.lastActiveAt)}
                </div>
                <button
                  className="session-item-delete"
                  onClick={(e) => handleDelete(s.key, e)}
                  title="删除对话"
                >🗑</button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
