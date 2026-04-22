/**
 * SessionTreeView.tsx — 树形会话列表
 *
 * Phase N4 (N4.2.1): 支持父子任务 会话的层级展示
 */

import { useState, useMemo } from 'react'
import RoleIcon from './RoleIcon'
import StatusBadge from './StatusBadge'
import type { SessionTreeNode } from './utils/session-tree'

interface SessionTreeViewProps {
  /** 树形 session 数据 */
  roots: SessionTreeNode[]
  /** 当前选中的 session key */
  activeKey: string
  /** 选择回调 */
  onSelect: (key: string) => void
  /** 删除回调 */
  onDelete?: (key: string) => void
}

// ─── 树形项组件 ──────────────────────────────────────────────────────────────

interface TreeItemProps {
  node: SessionTreeNode
  activeKey: string
  onSelect: (key: string) => void
  onDelete?: (key: string) => void
}

function TreeItem({ node, activeKey, onSelect, onDelete }: TreeItemProps) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = node.children.length > 0
  const isActive = node.key === activeKey
  const isChild = node.depth > 0

  // 进度摘要（仅有子节点的父会话）
  const progressSummary = useMemo(() => {
    if (!hasChildren) return null
    const completed = node.children.filter(c => c.state === 'completed' || c.state === 'succeeded').length
    return `${completed}/${node.children.length}`
  }, [hasChildren, node.children])

  return (
    <div>
      {/* 当前节点 */}
      <div
        className={`session-tree-item ${isActive ? 'active' : ''} ${isChild ? 'child' : ''}`}
        style={{
          paddingLeft: `${12 + node.depth * 20}px`,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: `6px ${12 + node.depth * 20}px`,
          cursor: 'pointer',
          borderRadius: 6,
          backgroundColor: isActive ? 'var(--item-active-bg, #e8f0fe)' : 'transparent',
          fontSize: 13,
        }}
        onClick={() => onSelect(node.key)}
      >
        {/* 展开/折叠箭头 */}
        {hasChildren ? (
          <span
            style={{ fontSize: 10, width: 16, textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
          >
            {expanded ? '▼' : '▶'}
          </span>
        ) : (
          <span style={{ width: 16 }} />
        )}

        {/* 角色图标 */}
        <RoleIcon role={node.role} size={14} />

        {/* 标题 */}
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.role ? `[${node.role}] ` : ''}
          {node.title}
        </span>

        {/* 状态徽标 */}
        {node.state && <StatusBadge state={node.state} size={12} />}

        {/* 进度摘要 */}
        {progressSummary && (
          <span style={{ fontSize: 11, color: '#6b7280' }}>({progressSummary})</span>
        )}

        {/* 删除按钮（仅顶层） */}
        {!isChild && onDelete && (
          <span
            style={{ fontSize: 12, color: '#9ca3af', cursor: 'pointer', padding: '0 4px' }}
            onClick={(e) => { e.stopPropagation(); onDelete(node.key) }}
            title="删除会话"
          >
            ✕
          </span>
        )}
      </div>

      {/* 子节点 */}
      {hasChildren && expanded && (
        <div className="session-tree-children">
          {node.children.map(child => (
            <TreeItem
              key={child.key}
              node={child}
              activeKey={activeKey}
              onSelect={onSelect}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────

export default function SessionTreeView({ roots, activeKey, onSelect, onDelete }: SessionTreeViewProps) {
  if (roots.length === 0) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
        暂无会话
      </div>
    )
  }

  return (
    <div className="session-tree-view">
      {roots.map(root => (
        <TreeItem
          key={root.key}
          node={root}
          activeKey={activeKey}
          onSelect={onSelect}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}
