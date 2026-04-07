/**
 * diagnostics/cache-trace.ts — LLM 调用追踪
 *
 * Phase I4 (GAP-23): 结构化记录每次 LLM 调用的 7 个阶段。
 *
 * 参考 OpenClaw cache-trace.ts (261 行) 的设计：
 *   - 7 阶段追踪：session:loaded → session:sanitized → session:limited →
 *     prompt:before → prompt:images → stream:context → session:after
 *   - 消息指纹（SHA-256 digest）
 *   - 敏感数据脱敏
 *   - 环境变量开关 EQUALITY_CACHE_TRACE=1
 *   - JSONL 输出（非阻塞队列写入）
 */

import crypto from 'node:crypto'
import path from 'node:path'
import os from 'node:os'
import { sanitizeDiagnosticPayload } from './redact.js'
import { getQueuedFileWriter, type QueuedFileWriter } from './queued-writer.js'

// ─── Types ──────────────────────────────────────────────────────────────────

export type CacheTraceStage =
  | 'session:loaded'
  | 'session:sanitized'
  | 'session:limited'
  | 'prompt:before'
  | 'prompt:images'
  | 'stream:context'
  | 'session:after'

export interface CacheTraceEvent {
  ts: string
  seq: number
  stage: CacheTraceStage
  sessionKey?: string
  provider?: string
  modelId?: string
  messageCount?: number
  messageRoles?: string[]
  messagesDigest?: string
  systemDigest?: string
  system?: unknown
  messages?: unknown[]
  options?: Record<string, unknown>
  prompt?: string
  note?: string
  error?: string
}

export interface CacheTrace {
  enabled: true
  filePath: string
  recordStage: (stage: CacheTraceStage, payload?: Partial<CacheTraceEvent>) => void
}

export interface CacheTraceInit {
  env?: NodeJS.ProcessEnv
  sessionKey?: string
  provider?: string
  modelId?: string
  /** 外部注入的 writer（测试用） */
  writer?: QueuedFileWriter
}

// ─── Digest Helpers ─────────────────────────────────────────────────────────

function stableStringify(value: unknown, seen: WeakSet<object> = new WeakSet()): string {
  if (value === null || value === undefined) return String(value)
  if (typeof value === 'number' && !Number.isFinite(value)) return JSON.stringify(String(value))
  if (typeof value === 'bigint') return JSON.stringify(value.toString())
  if (typeof value !== 'object') return JSON.stringify(value) ?? 'null'

  if (seen.has(value)) return JSON.stringify('[Circular]')
  seen.add(value)

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item, seen)).join(',')}]`
  }

  const record = value as Record<string, unknown>
  const fields = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key], seen)}`)
  return `{${fields.join(',')}}`
}

export function digest(value: unknown): string {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex')
}

function summarizeMessages(messages: unknown[]): {
  messageCount: number
  messageRoles: string[]
  messagesDigest: string
} {
  const fingerprints = messages.map((msg) => digest(msg))
  return {
    messageCount: messages.length,
    messageRoles: messages.map((msg) =>
      typeof msg === 'object' && msg !== null ? ((msg as Record<string, unknown>).role as string ?? 'unknown') : 'unknown',
    ),
    messagesDigest: digest(fingerprints.join('|')),
  }
}

// ─── Config Resolution ──────────────────────────────────────────────────────

function resolveTraceConfig(env: NodeJS.ProcessEnv = process.env): {
  enabled: boolean
  filePath: string
} {
  const enabled = env.EQUALITY_CACHE_TRACE === '1' || env.EQUALITY_CACHE_TRACE === 'true'
  const fileOverride = env.EQUALITY_CACHE_TRACE_FILE?.trim()
  const defaultDir = path.join(os.homedir(), '.equality', 'logs')
  const filePath = fileOverride || path.join(defaultDir, 'cache-trace.jsonl')

  return { enabled, filePath }
}

// ─── Factory ────────────────────────────────────────────────────────────────

/**
 * 创建 CacheTrace 实例。
 *
 * - 未启用时返回 null
 * - 启用后返回 { enabled, filePath, recordStage }
 */
export function createCacheTrace(params: CacheTraceInit): CacheTrace | null {
  const env = params.env ?? process.env
  const cfg = resolveTraceConfig(env)

  if (!cfg.enabled) return null

  const writer = params.writer ?? getQueuedFileWriter(cfg.filePath)
  let seq = 0

  const base: Partial<CacheTraceEvent> = {}
  if (params.sessionKey) base.sessionKey = params.sessionKey
  if (params.provider) base.provider = params.provider
  if (params.modelId) base.modelId = params.modelId

  const recordStage: CacheTrace['recordStage'] = (stage, payload = {}) => {
    const event: CacheTraceEvent = {
      ...base,
      ts: new Date().toISOString(),
      seq: (seq += 1),
      stage,
    }

    // System prompt
    if (payload.system !== undefined) {
      event.system = sanitizeDiagnosticPayload(payload.system)
      event.systemDigest = digest(payload.system)
    }

    // Options
    if (payload.options) {
      event.options = sanitizeDiagnosticPayload(payload.options) as Record<string, unknown>
    }

    // Prompt
    if (payload.prompt !== undefined) {
      event.prompt = payload.prompt
    }

    // Messages
    if (Array.isArray(payload.messages)) {
      const summary = summarizeMessages(payload.messages)
      event.messageCount = summary.messageCount
      event.messageRoles = summary.messageRoles
      event.messagesDigest = summary.messagesDigest
      event.messages = sanitizeDiagnosticPayload(payload.messages) as unknown[]
    }

    // Note / Error
    if (payload.note) event.note = payload.note
    if (payload.error) event.error = payload.error

    try {
      const line = JSON.stringify(event)
      writer.write(`${line}\n`)
    } catch { /* ignore serialization failures */ }
  }

  return {
    enabled: true,
    filePath: cfg.filePath,
    recordStage,
  }
}
