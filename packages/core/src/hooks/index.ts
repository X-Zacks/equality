/**
 * hooks/index.ts — Hooks 框架
 *
 * Phase J (GAP-36): 可扩展的 hook 注册系统。
 *
 * Hook 点：
 *   - beforeToolCall — 工具执行前（可阻止）
 *   - afterToolCall  — 工具执行后（可修改结果）
 *   - beforeLLMCall  — LLM 调用前
 *   - afterLLMCall   — LLM 调用后
 *   - beforePersist  — session 持久化前
 *   - afterPersist   — session 持久化后
 *
 * 设计约束：
 *   - 同步 Set 存储，无 EventEmitter overhead
 *   - 单个 hook 异常不影响其他 hook 或主流程
 *   - hook 按注册顺序执行
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type HookPoint =
  | 'beforeToolCall'
  | 'afterToolCall'
  | 'beforeLLMCall'
  | 'afterLLMCall'
  | 'beforePersist'
  | 'afterPersist'

export interface BeforeToolCallPayload {
  toolName: string
  args: Record<string, unknown>
  sessionKey: string
}

export interface AfterToolCallPayload {
  toolName: string
  args: Record<string, unknown>
  result: string
  isError: boolean
  sessionKey: string
  durationMs: number
}

export interface BeforeLLMCallPayload {
  sessionKey: string
  providerId: string
  modelId: string
  messageCount: number
  loopCount: number
}

export interface AfterLLMCallPayload {
  sessionKey: string
  providerId: string
  modelId: string
  inputTokens: number
  outputTokens: number
  toolCallCount: number
  loopCount: number
}

export interface PersistPayload {
  sessionKey: string
  messageCount: number
}

export type HookPayloadMap = {
  beforeToolCall: BeforeToolCallPayload
  afterToolCall: AfterToolCallPayload
  beforeLLMCall: BeforeLLMCallPayload
  afterLLMCall: AfterLLMCallPayload
  beforePersist: PersistPayload
  afterPersist: PersistPayload
}

export type HookHandler<T = unknown> = (payload: T) => void | { block?: boolean; reason?: string } | Promise<void>

// ─── Constants ──────────────────────────────────────────────────────────────

export const HOOK_POINTS: readonly HookPoint[] = [
  'beforeToolCall',
  'afterToolCall',
  'beforeLLMCall',
  'afterLLMCall',
  'beforePersist',
  'afterPersist',
]

const MAX_HOOKS_PER_POINT = 50
const HOOK_TIMEOUT_MS = 5_000

// ─── Registry ───────────────────────────────────────────────────────────────

export class HookRegistry {
  private hooks = new Map<HookPoint, Array<HookHandler<any>>>()

  /**
   * 注册 hook。
   * @returns 取消注册的函数
   */
  register<K extends HookPoint>(
    point: K,
    handler: HookHandler<HookPayloadMap[K]>,
  ): () => void {
    let list = this.hooks.get(point)
    if (!list) {
      list = []
      this.hooks.set(point, list)
    }

    if (list.length >= MAX_HOOKS_PER_POINT) {
      console.warn(`[hooks] "${point}" 已达 hook 上限 (${MAX_HOOKS_PER_POINT})`)
    }

    list.push(handler)

    return () => {
      const idx = list!.indexOf(handler)
      if (idx >= 0) list!.splice(idx, 1)
    }
  }

  /**
   * 触发 hook 点。同步遍历所有 handler，逐个调用。
   * 返回第一个 { block: true } 的结果（若有）。
   */
  async invoke<K extends HookPoint>(
    point: K,
    payload: HookPayloadMap[K],
  ): Promise<{ blocked: boolean; reason?: string }> {
    const list = this.hooks.get(point)
    if (!list || list.length === 0) return { blocked: false }

    for (const handler of list) {
      try {
        const result = await Promise.race([
          Promise.resolve(handler(payload)),
          new Promise<undefined>((_, reject) =>
            setTimeout(() => reject(new Error(`hook timeout (${HOOK_TIMEOUT_MS}ms)`)), HOOK_TIMEOUT_MS),
          ),
        ])
        if (result && typeof result === 'object' && 'block' in result && result.block) {
          return { blocked: true, reason: (result as { reason?: string }).reason }
        }
      } catch (err) {
        console.warn(`[hooks] "${point}" handler error:`, err instanceof Error ? err.message : err)
      }
    }

    return { blocked: false }
  }

  /**
   * 获取指定 hook 点的 handler 数量。
   */
  count(point: HookPoint): number {
    return this.hooks.get(point)?.length ?? 0
  }

  /**
   * 清除所有 hooks（测试用）。
   */
  clear(): void {
    this.hooks.clear()
  }

  /**
   * 清除指定 hook 点的所有 handlers。
   */
  clearPoint(point: HookPoint): void {
    this.hooks.delete(point)
  }
}

/**
 * 全局默认 HookRegistry 实例。
 */
export const globalHookRegistry = new HookRegistry()
