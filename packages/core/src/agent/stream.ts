/**
 * Stream Decorator Pipeline — Phase 9
 *
 * 洋葱模型：每个装饰器是一个纯函数 wrapper，
 * 输入 AsyncGenerator<ChatDelta>，输出 AsyncGenerator<ChatDelta>。
 *
 * 通过 applyDecorators() 链式组合，runner 只需一行调用。
 */

import type { ChatDelta, LLMProvider } from '../providers/types.js'

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export type StreamDecorator = (source: AsyncGenerator<ChatDelta>) => AsyncGenerator<ChatDelta>

// ─── 管道组合 ──────────────────────────────────────────────────────────────────

/**
 * 将多个装饰器链式应用到原始 stream 上。
 * decorators[0] 最先包裹（最内层），decorators[last] 最后包裹（最外层）。
 */
export function applyDecorators(
  stream: AsyncGenerator<ChatDelta>,
  decorators: StreamDecorator[],
): AsyncGenerator<ChatDelta> {
  return decorators.reduce<AsyncGenerator<ChatDelta>>((s, d) => d(s), stream)
}

// ─── 装饰器 1: trimToolCallNames ──────────────────────────────────────────────

/**
 * 去除 tool_calls 中 name 字段的前后空格。
 * 某些模型返回 " read_file " 而非 "read_file"。
 */
export async function* trimToolCallNames(
  source: AsyncGenerator<ChatDelta>,
): AsyncGenerator<ChatDelta> {
  for await (const delta of source) {
    if (delta.toolCalls) {
      yield {
        ...delta,
        toolCalls: delta.toolCalls.map(tc => ({
          ...tc,
          name: tc.name?.trim(),
        })),
      }
    } else {
      yield delta
    }
  }
}

// ─── 装饰器 2: dropThinkingBlocks ────────────────────────────────────────────

/**
 * 剥离推理模型（DeepSeek-R1 / QwQ 等）返回的 <think>...</think> 块。
 *
 * 流式场景下，<think> 标签可能跨多个 chunk，所以用状态机追踪：
 * - 遇到 <think> → 进入 thinking 状态，后续 content 被过滤
 * - 遇到 </think> → 退出 thinking 状态，后续 content 恢复输出
 */
export function createDropThinkingBlocks(): StreamDecorator {
  return async function* dropThinkingBlocks(
    source: AsyncGenerator<ChatDelta>,
  ): AsyncGenerator<ChatDelta> {
    let insideThink = false
    let buffer = ''  // 缓冲区：处理跨 chunk 的标签

    for await (const delta of source) {
      // 非文本内容直接透传
      if (!delta.content) {
        yield delta
        continue
      }

      buffer += delta.content
      let output = ''

      while (buffer.length > 0) {
        if (insideThink) {
          // 寻找 </think>
          const closeIdx = buffer.indexOf('</think>')
          if (closeIdx === -1) {
            // 还没找到关闭标签，可能还在积累中
            // 如果 buffer 太大（>1KB），说明 thinking 块很长，直接清空
            if (buffer.length > 1024) {
              buffer = ''
            }
            break
          }
          // 丢弃 thinking 内容，跳过 </think> 标签本身
          buffer = buffer.slice(closeIdx + '</think>'.length)
          insideThink = false
        } else {
          // 寻找 <think>
          const openIdx = buffer.indexOf('<think>')
          if (openIdx === -1) {
            // 没有 <think>，但要保留一点缓冲以防标签被截断
            // "<think>" 最长 7 字符，保留末尾 6 字符
            if (buffer.length <= 6) {
              // 缓冲区太短，可能是截断的标签开头，等待更多数据
              // 但如果这是最后一个 chunk，也要输出
              break
            }
            const safe = buffer.slice(0, -6)
            output += safe
            buffer = buffer.slice(-6)
            break
          }
          // <think> 之前的内容输出
          output += buffer.slice(0, openIdx)
          buffer = buffer.slice(openIdx + '<think>'.length)
          insideThink = true
        }
      }

      if (output) {
        yield { ...delta, content: output }
      } else if (delta.toolCalls || delta.finishReason) {
        // 即使 content 被过滤，仍然传递 toolCalls 和 finishReason
        yield { ...delta, content: undefined }
      }
    }

    // 流结束，flush 缓冲区残余（非 thinking 状态下）
    if (!insideThink && buffer.length > 0) {
      yield { content: buffer }
    }
  }
}

// ─── 装饰器 3: sanitizeToolCallIds ───────────────────────────────────────────

/**
 * Mistral 系列模型的 tool_call id 格式可能不规范。
 * 确保 id 以 "call_" 开头，否则补上前缀。
 */
export async function* sanitizeToolCallIds(
  source: AsyncGenerator<ChatDelta>,
): AsyncGenerator<ChatDelta> {
  for await (const delta of source) {
    if (delta.toolCalls) {
      yield {
        ...delta,
        toolCalls: delta.toolCalls.map(tc => ({
          ...tc,
          id: tc.id && !tc.id.startsWith('call_') ? `call_${tc.id}` : tc.id,
        })),
      }
    } else {
      yield delta
    }
  }
}

// ─── 装饰器 4: decodeHtmlEntities ───────────────────────────────────────────

/**
 * 部分国内模型（通义千问、火山引擎等）在工具参数中返回 HTML 实体编码。
 * 将 &quot; &amp; &lt; &gt; &#39; 还原为原始字符。
 */
const HTML_ENTITIES: Record<string, string> = {
  '&quot;': '"',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&#39;': "'",
  '&apos;': "'",
}

const ENTITY_RE = /&(?:quot|amp|lt|gt|#39|apos);/g

function decodeEntities(str: string): string {
  return str.replace(ENTITY_RE, match => HTML_ENTITIES[match] ?? match)
}

export async function* decodeHtmlEntities(
  source: AsyncGenerator<ChatDelta>,
): AsyncGenerator<ChatDelta> {
  for await (const delta of source) {
    let modified = false
    let newDelta = delta

    // 解码 content
    if (delta.content && ENTITY_RE.test(delta.content)) {
      newDelta = { ...newDelta, content: decodeEntities(delta.content) }
      modified = true
    }

    // 解码 tool_call arguments
    if (delta.toolCalls) {
      const decoded = delta.toolCalls.map(tc => {
        if (tc.arguments && ENTITY_RE.test(tc.arguments)) {
          return { ...tc, arguments: decodeEntities(tc.arguments) }
        }
        return tc
      })
      newDelta = { ...newDelta, toolCalls: decoded }
      modified = true
    }

    yield modified ? newDelta : delta
  }
}

// ─── 装饰器 5: costTrace ────────────────────────────────────────────────────

/**
 * 累计流式输出的字符数，流结束时打日志。
 * 轻量级监控，不影响流内容。
 */
export function createCostTrace(providerId: string, modelId: string): StreamDecorator {
  return async function* costTrace(
    source: AsyncGenerator<ChatDelta>,
  ): AsyncGenerator<ChatDelta> {
    let totalChars = 0
    let chunkCount = 0

    for await (const delta of source) {
      if (delta.content) {
        totalChars += delta.content.length
      }
      chunkCount++
      yield delta
    }

    console.log(`[stream] ${providerId}/${modelId}: ${chunkCount} chunks, ${totalChars} chars`)
  }
}

// ─── 自动管道构建 ──────────────────────────────────────────────────────────────

/**
 * 根据 Provider 的能力和 ID 自动构建装饰器管道。
 *
 * 顺序（从内到外）：
 * 1. trimToolCallNames  — 始终
 * 2. dropThinkingBlocks — 如果 supportsThinking
 * 3. sanitizeToolCallIds — 如果 providerId 含 mistral
 * 4. decodeHtmlEntities  — 如果 providerId 是 qwen / volc
 * 5. costTrace           — 始终（最外层）
 */
export function buildDecoratorPipeline(provider: LLMProvider): StreamDecorator[] {
  const caps = provider.getCapabilities()
  const pid = provider.providerId.toLowerCase()

  const decorators: StreamDecorator[] = []

  // 1. 始终：清理工具名空格
  decorators.push(trimToolCallNames)

  // 2. 推理模型：剥离 <think> 块
  if (caps.supportsThinking) {
    decorators.push(createDropThinkingBlocks())
  }

  // 3. Mistral 系列：规范化 tool_call id
  if (pid.includes('mistral')) {
    decorators.push(sanitizeToolCallIds)
  }

  // 4. 国内模型：解码 HTML 实体
  if (pid === 'qwen' || pid === 'volc') {
    decorators.push(decodeHtmlEntities)
  }

  // 5. 始终：字符计数日志（最外层）
  decorators.push(createCostTrace(provider.providerId, provider.modelId))

  return decorators
}
