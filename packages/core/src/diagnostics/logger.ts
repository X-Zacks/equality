/**
 * diagnostics/logger.ts — 结构化日志
 *
 * Phase J (GAP-27): 分级结构化日志，替代散落的 console.log。
 *
 * 特性：
 *   - 4 级日志：debug / info / warn / error
 *   - 每条日志包含 ts、level、module、message + extra
 *   - 环境变量 EQUALITY_LOG_LEVEL 控制输出级别
 *   - EQUALITY_LOG_FILE 指定 JSONL 文件输出
 *   - 自动脱敏敏感数据（复用 redact.ts）
 */

import { sanitizeDiagnosticPayload } from './redact.js'
import { getQueuedFileWriter, type QueuedFileWriter } from './queued-writer.js'

// ─── Types ──────────────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  ts: string
  level: LogLevel
  module: string
  message: string
  [key: string]: unknown
}

export interface Logger {
  debug(message: string, extra?: Record<string, unknown>): void
  info(message: string, extra?: Record<string, unknown>): void
  warn(message: string, extra?: Record<string, unknown>): void
  error(message: string, extra?: Record<string, unknown>): void
  readonly module: string
  readonly level: LogLevel
}

export interface LoggerOptions {
  /** 日志级别（默认从 env 读取或 'info'） */
  level?: LogLevel
  /** JSONL 输出路径（默认从 EQUALITY_LOG_FILE 读取） */
  filePath?: string
  /** 外部注入的 writer（测试用） */
  writer?: QueuedFileWriter
  /** 外部注入的 env（测试用） */
  env?: NodeJS.ProcessEnv
  /** 是否脱敏（默认 true） */
  redact?: boolean
  /** 外部注入的控制台输出函数（测试用） */
  console?: Pick<Console, 'debug' | 'info' | 'warn' | 'error'>
}

// ─── Constants ──────────────────────────────────────────────────────────────

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

export const VALID_LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error']

// ─── Level Resolution ───────────────────────────────────────────────────────

export function resolveLogLevel(envValue?: string): LogLevel {
  if (!envValue) return 'info'
  const lower = envValue.trim().toLowerCase()
  if (VALID_LOG_LEVELS.includes(lower as LogLevel)) return lower as LogLevel
  return 'info'
}

// ─── Factory ────────────────────────────────────────────────────────────────

/**
 * 创建一个结构化 logger 实例。
 *
 * @param moduleName — 日志来源模块名（如 'agent-runner', 'gateway'）
 * @param opts — 可选配置
 */
export function createLogger(moduleName: string, opts?: LoggerOptions): Logger {
  const env = opts?.env ?? process.env
  const level = opts?.level ?? resolveLogLevel(env.EQUALITY_LOG_LEVEL)
  const levelNum = LOG_LEVELS[level]
  const shouldRedact = opts?.redact !== false
  const con = opts?.console ?? console

  // JSONL file writer
  const filePath = opts?.filePath ?? env.EQUALITY_LOG_FILE?.trim()
  const fileWriter = opts?.writer ?? (filePath ? getQueuedFileWriter(filePath) : null)

  function emit(logLevel: LogLevel, message: string, extra?: Record<string, unknown>): void {
    if (LOG_LEVELS[logLevel] < levelNum) return

    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level: logLevel,
      module: moduleName,
      message,
    }

    // Merge extra fields
    if (extra) {
      const sanitized = shouldRedact
        ? sanitizeDiagnosticPayload(extra) as Record<string, unknown>
        : extra
      Object.assign(entry, sanitized)
    }

    // Console output
    con[logLevel](`[${moduleName}] ${message}`, extra ? JSON.stringify(extra) : '')

    // File output
    if (fileWriter) {
      try {
        fileWriter.write(JSON.stringify(entry) + '\n')
      } catch { /* ignore */ }
    }
  }

  return {
    module: moduleName,
    level,
    debug: (msg, extra) => emit('debug', msg, extra),
    info: (msg, extra) => emit('info', msg, extra),
    warn: (msg, extra) => emit('warn', msg, extra),
    error: (msg, extra) => emit('error', msg, extra),
  }
}
