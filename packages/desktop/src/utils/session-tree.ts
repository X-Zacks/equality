/**
 * utils/session-tree.ts — Session 层级解析
 *
 * Phase N4 (N4.3.1): 从 session key 构建树形结构
 * - 解析 ::sub:: 分隔符
 * - 构建父子关系树
 * - 计算深度
 */

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export interface SessionListItem {
  key: string
  title?: string
  messageCount: number
  createdAt: number
  lastActiveAt?: number
  parentSessionKey?: string
  agentRole?: string
  taskState?: string
  depth?: number
}

export interface SessionTreeNode {
  /** Session key */
  key: string
  /** 显示标题 */
  title: string
  /** 父 session key（顶层为 undefined） */
  parentKey?: string
  /** 角色标识 */
  role?: string
  /** 任务状态 */
  state?: string
  /** 子节点 */
  children: SessionTreeNode[]
  /** 嵌套深度（0=顶层） */
  depth: number
  /** 消息数 */
  messageCount: number
  /** 创建时间 */
  createdAt: number
}

// ─── 解析 ─────────────────────────────────────────────────────────────────────

const SUB_SEPARATOR = '::sub::'

/**
 * 从 session key 中解析父 key。
 * 如果 key 包含 ::sub::，则 parentKey = key 在最后一个 ::sub:: 之前的部分。
 */
export function parseParentKey(key: string): string | undefined {
  const idx = key.lastIndexOf(SUB_SEPARATOR)
  if (idx === -1) return undefined
  return key.substring(0, idx)
}

/**
 * 计算 session key 的嵌套深度。
 * 深度 = key 中 ::sub:: 出现的次数。
 */
export function computeDepth(key: string): number {
  let count = 0
  let idx = 0
  while ((idx = key.indexOf(SUB_SEPARATOR, idx)) !== -1) {
    count++
    idx += SUB_SEPARATOR.length
  }
  return count
}

/**
 * 将扁平的 session 列表解析为树形结构。
 *
 * 规则：
 * - 无 ::sub:: 的 key → 顶层节点
 * - 有 ::sub:: 的 key → 其 parentKey 的子节点
 * - 如果 parentKey 不在列表中，该 session 作为孤立顶层节点
 */
export function parseSessionHierarchy(sessions: SessionListItem[]): SessionTreeNode[] {
  // 先为每个 session 创建 TreeNode
  const nodeMap = new Map<string, SessionTreeNode>()

  for (const s of sessions) {
    const parentKey = parseParentKey(s.key)
    const depth = computeDepth(s.key)

    nodeMap.set(s.key, {
      key: s.key,
      title: s.title ?? '对话',
      parentKey,
      role: s.agentRole,
      state: s.taskState,
      children: [],
      depth,
      messageCount: s.messageCount,
      createdAt: s.createdAt,
    })
  }

  // 构建树
  const roots: SessionTreeNode[] = []

  for (const node of nodeMap.values()) {
    if (node.parentKey && nodeMap.has(node.parentKey)) {
      nodeMap.get(node.parentKey)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  // 子节点按创建时间排序
  for (const node of nodeMap.values()) {
    node.children.sort((a, b) => a.createdAt - b.createdAt)
  }

  // 顶层按最近活跃排序（降序）
  roots.sort((a, b) => b.createdAt - a.createdAt)

  return roots
}
