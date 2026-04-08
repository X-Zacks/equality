/**
 * tools/permission-context.ts — 工具权限上下文
 *
 * Phase N5 (N5.2.1): 借鉴 claw-code permissions.py
 * - ToolPermissionContext
 * - deny_names + deny_prefixes 匹配
 * - 大小写不敏感
 */

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export interface ToolPermissionContext {
  /** 精确名称黑名单（存储时已转小写） */
  denyNames: ReadonlySet<string>
  /** 前缀黑名单（存储时已转小写） */
  denyPrefixes: readonly string[]
}

// ─── 构建 ─────────────────────────────────────────────────────────────────────

/**
 * 从角色配置中提取权限上下文。
 * 所有名称和前缀转为小写以实现大小写不敏感匹配。
 */
export function createPermissionContext(config: {
  toolDeny?: string[]
  toolDenyPrefixes?: string[]
}): ToolPermissionContext {
  return {
    denyNames: new Set((config.toolDeny ?? []).map(n => n.toLowerCase())),
    denyPrefixes: (config.toolDenyPrefixes ?? []).map(p => p.toLowerCase()),
  }
}

// ─── 判断 ─────────────────────────────────────────────────────────────────────

/**
 * 判断给定工具是否被权限上下文阻止。
 *
 * 判断逻辑：
 * 1. 先检查 denyNames（精确匹配，大小写不敏感）
 * 2. 再检查 denyPrefixes（前缀匹配，大小写不敏感）
 * 3. 任一命中即返回 true
 */
export function isToolBlocked(name: string, ctx: ToolPermissionContext): boolean {
  const lowered = name.toLowerCase()
  if (ctx.denyNames.has(lowered)) return true
  return ctx.denyPrefixes.some(prefix => lowered.startsWith(prefix))
}

/**
 * 创建一个空的权限上下文（不阻止任何工具）。
 */
export function emptyPermissionContext(): ToolPermissionContext {
  return {
    denyNames: new Set(),
    denyPrefixes: [],
  }
}
