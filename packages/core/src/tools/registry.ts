/**
 * tools/registry.ts — 工具注册表
 *
 * 提供工具的注册、注销、容错查找和 schema 导出。
 * 容错匹配策略：精确 → 标准化 → 命名空间剥离 → 大小写不敏感
 */

import type { ToolDefinition, OpenAIToolSchema } from './types.js'

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map()

  /** 注册工具（同名重复注册抛错） */
  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: "${tool.name}"`)
    }
    this.tools.set(tool.name, tool)
  }

  /** 注销工具 */
  unregister(name: string): boolean {
    return this.tools.delete(name)
  }

  /**
   * 容错查找工具
   *
   * 匹配策略（按优先级）：
   * 1. 精确匹配（大小写敏感）
   * 2. 标准化后匹配（统一下划线/中划线）
   * 3. 命名空间剥离后匹配（取最后一段：mcp.github.create_issue → create_issue）
   * 4. 大小写不敏感匹配（最后兜底）
   */
  resolve(name: string): ToolDefinition | null {
    // 1. 精确匹配
    const exact = this.tools.get(name)
    if (exact) return exact

    // 2. 标准化后匹配（统一为下划线）
    const normalized = normalize(name)
    for (const [key, tool] of this.tools) {
      if (normalize(key) === normalized) return tool
    }

    // 3. 命名空间剥离（取最后一段）
    const stripped = stripNamespace(name)
    if (stripped !== name) {
      // 先精确匹配剥离后的名字
      const byStripped = this.tools.get(stripped)
      if (byStripped) return byStripped

      // 再标准化匹配
      const strippedNorm = normalize(stripped)
      for (const [key, tool] of this.tools) {
        if (normalize(key) === strippedNorm) return tool
      }
    }

    // 4. 大小写不敏感
    const lower = name.toLowerCase()
    for (const [key, tool] of this.tools) {
      if (key.toLowerCase() === lower) return tool
    }

    return null
  }

  /**
   * 获取所有工具的 OpenAI Function Calling schema
   * 直接传给 provider.streamChat({ tools })
   */
  getToolSchemas(): OpenAIToolSchema[] {
    const schemas: OpenAIToolSchema[] = []
    for (const tool of this.tools.values()) {
      schemas.push({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema as unknown as Record<string, unknown>,
        },
      })
    }
    return schemas
  }

  /** 列出所有已注册工具名 */
  list(): string[] {
    return [...this.tools.keys()]
  }

  /** 获取工具数量 */
  get size(): number {
    return this.tools.size
  }

  /** 清空所有工具（测试用） */
  clear(): void {
    this.tools.clear()
  }
}

// ─── 内部工具函数 ─────────────────────────────────────────────────────────────

/** 标准化工具名：中划线 → 下划线，去除点号 */
function normalize(name: string): string {
  return name.replace(/[-]/g, '_').replace(/\./g, '_')
}

/** 命名空间剥离：取最后一段（按 . 分割） */
function stripNamespace(name: string): string {
  const parts = name.split('.')
  return parts[parts.length - 1]
}
