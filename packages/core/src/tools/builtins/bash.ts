/**
 * tools/builtins/bash.ts — Shell 命令执行工具
 *
 * Windows 默认 PowerShell，可配置切换 cmd.exe。
 * 双超时（总超时 + 无输出超时）/ AbortSignal / 环境变量继承 / 代理穿透。
 * 支持后台执行模式（background=true），配合 process 工具管理。
 * 前台模式支持 onUpdate 流式 stdout 推送。
 */

import { spawn, execSync } from 'node:child_process'
import type { ToolDefinition, ToolResult, ToolContext } from '../types.js'
import { processManager } from './process-manager.js'
import { hasSecret, getSecret } from '../../config/secrets.js'
import type { SecretKey } from '../../config/secrets.js'

// ─── 默认值 ──────────────────────────────────────────────────────────────────
const DEFAULT_TIMEOUT_MS = 300_000       // 默认总超时 5 分钟
const DEFAULT_IDLE_TIMEOUT_MS = 120_000  // 默认无输出超时 2 分钟
const DEFAULT_MAX_TIMEOUT_MS = 1_800_000 // 默认最大总超时 30 分钟
const DEFAULT_BG_TIMEOUT_MS = 300_000    // 后台模式 5 分钟
const UPDATE_THROTTLE_MS = 500           // 流式推送节流间隔
const UPDATE_MAX_CHARS = 500             // 流式推送最大字符数

// ─── 配置读取 ────────────────────────────────────────────────────────────────
function getConfigNumber(key: SecretKey, defaultVal: number, min: number, max: number): number {
  if (!hasSecret(key)) return defaultVal
  try {
    const raw = getSecret(key)
    const num = Number(raw)
    if (!Number.isFinite(num)) {
      console.warn(`[bash] 配置 ${key} 值无效: "${raw}", 使用默认值 ${defaultVal}`)
      return defaultVal
    }
    return Math.min(max, Math.max(min, num))
  } catch {
    return defaultVal
  }
}

/** Windows 上杀整个进程树（SIGTERM/SIGKILL 只杀直接子进程，python 等孙进程会变孤儿） */
function killTree(pid: number) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore', timeout: 5000 })
    } else {
      process.kill(-pid, 'SIGTERM')
    }
  } catch { /* 进程可能已退出 */ }
}

export const bashTool: ToolDefinition = {
  name: 'bash',
  description:
    '在本地执行 shell 命令。Windows 下默认使用 PowerShell。返回 stdout + stderr 合并输出。' +
    '设置 background=true 可后台执行长时间命令，返回进程 ID，之后用 process 工具查看状态。',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: '要执行的 shell 命令' },
      timeout_ms: { type: 'number', description: '超时毫秒数（默认 300000，可在设置中调整）' },
      background: { type: 'boolean', description: '是否后台执行（立即返回进程 ID，用 process 工具跟进）' },
    },
    required: ['command'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext, onUpdate?: (partial: string) => void): Promise<ToolResult> {
    const command = String(input.command ?? '')
    if (!command.trim()) {
      return { content: 'Error: command is required', isError: true }
    }

    const background = Boolean(input.background)

    // 构造 shell 命令
    const isWindows = process.platform === 'win32'
    const shell = isWindows ? 'powershell.exe' : '/bin/sh'
    const shellArgs = isWindows
      ? ['-NoProfile', '-NonInteractive', '-Command', command]
      : ['-c', command]

    // 环境变量：继承当前进程 + 注入代理 + 自定义
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...(ctx.proxyUrl ? {
        HTTPS_PROXY: ctx.proxyUrl,
        HTTP_PROXY: ctx.proxyUrl,
        https_proxy: ctx.proxyUrl,
        http_proxy: ctx.proxyUrl,
      } : {}),
      ...ctx.env,
    }

    // ── 後台模式 ─────────────────────────────────
    if (background) {
      const maxTimeout = getConfigNumber('BASH_MAX_TIMEOUT_MS', DEFAULT_MAX_TIMEOUT_MS, 60_000, 86_400_000)
      const timeoutMs = Math.min(
        Number(input.timeout_ms) || DEFAULT_BG_TIMEOUT_MS,
        maxTimeout,
      )
      try {
        const proc = processManager.spawn({
          command,
          shell,
          shellArgs,
          cwd: ctx.workspaceDir,
          env,
          timeoutMs,
          sessionKey: ctx.sessionKey,
        })
        return {
          content: [
            `🚀 后台进程已启动`,
            `  ID: ${proc.id}`,
            `  PID: ${proc.pid}`,
            `  命令: ${command}`,
            `  超时: ${Math.round(timeoutMs / 1000)}s`,
            ``,
            `使用 process 工具管理：`,
            `  process(action="poll", id="${proc.id}")  — 查看新输出`,
            `  process(action="log", id="${proc.id}")   — 查看完整日志`,
            `  process(action="kill", id="${proc.id}")  — 终止进程`,
          ].join('\n'),
        }
      } catch (err) {
        return { content: `Error: ${(err as Error).message}`, isError: true }
      }
    }

    // ── 前台模式 ─────────────────────────────────

    // 读取配置
    const maxTimeout = getConfigNumber('BASH_MAX_TIMEOUT_MS', DEFAULT_MAX_TIMEOUT_MS, 60_000, 86_400_000)
    const overallTimeoutMs = Math.min(
      Math.max(Number(input.timeout_ms) || getConfigNumber('BASH_TIMEOUT_MS', DEFAULT_TIMEOUT_MS, 5_000, maxTimeout), 5_000),
      maxTimeout,
    )
    const idleTimeoutMs = getConfigNumber('BASH_IDLE_TIMEOUT_MS', DEFAULT_IDLE_TIMEOUT_MS, 0, maxTimeout)

    const startMs = Date.now()

    return new Promise<ToolResult>((resolve) => {
      const chunks: Buffer[] = []
      let killed = false
      let killReason: 'overall' | 'idle' | 'abort' = 'overall'

      const child = spawn(shell, shellArgs, {
        cwd: ctx.workspaceDir,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })

      // ── 总超时定时器 ──────────────────────
      const overallTimer = setTimeout(() => {
        killed = true
        killReason = 'overall'
        if (child.pid) killTree(child.pid)
      }, overallTimeoutMs)

      // ── 无输出超时定时器 ──────────────────
      let idleTimer: ReturnType<typeof setTimeout> | null = null
      function resetIdleTimer() {
        if (idleTimer) clearTimeout(idleTimer)
        if (idleTimeoutMs > 0) {
          idleTimer = setTimeout(() => {
            killed = true
            killReason = 'idle'
            if (child.pid) killTree(child.pid)
          }, idleTimeoutMs)
        }
      }
      resetIdleTimer()  // 启动时开始计时

      // ── 流式推送（节流）────────────────────
      let lastUpdateTime = 0
      function throttledUpdate() {
        if (!onUpdate) return
        const now = Date.now()
        if (now - lastUpdateTime < UPDATE_THROTTLE_MS) return
        lastUpdateTime = now
        const fullOutput = Buffer.concat(chunks).toString('utf-8')
        onUpdate(fullOutput.slice(-UPDATE_MAX_CHARS))
      }

      // stdout + stderr 合并 + idle 重置 + 流式推送
      const onData = (c: Buffer) => {
        chunks.push(c)
        resetIdleTimer()
        throttledUpdate()
      }
      child.stdout?.on('data', onData)
      child.stderr?.on('data', onData)

      // AbortSignal
      if (ctx.abortSignal) {
        const onAbort = () => { killed = true; killReason = 'abort'; if (child.pid) killTree(child.pid) }
        ctx.abortSignal.addEventListener('abort', onAbort, { once: true })
        child.on('close', () => ctx.abortSignal?.removeEventListener('abort', onAbort))
      }

      child.on('close', (code) => {
        clearTimeout(overallTimer)
        if (idleTimer) clearTimeout(idleTimer)
        const durationMs = Date.now() - startMs
        const output = Buffer.concat(chunks).toString('utf-8')

        // 最后一次推送（确保最终输出到达前端）
        if (onUpdate && output) {
          onUpdate(output.slice(-UPDATE_MAX_CHARS))
        }

        if (killed) {
          const reason = killReason === 'idle'
            ? `⚠️ 命令无输出超时（${idleTimeoutMs}ms 内无 stdout/stderr）`
            : killReason === 'abort'
              ? `⚠️ 命令已被用户取消`
              : `⚠️ 命令总超时（${overallTimeoutMs}ms）`
          resolve({
            content: output + `\n\n${reason}（执行时间 ${durationMs}ms）`,
            isError: true,
            metadata: { durationMs },
          })
        } else {
          resolve({
            content: output || '(no output)',
            isError: (code ?? 0) !== 0,
            metadata: { durationMs },
          })
        }
      })

      child.on('error', (err) => {
        clearTimeout(overallTimer)
        if (idleTimer) clearTimeout(idleTimer)
        resolve({
          content: `Error spawning process: ${err.message}`,
          isError: true,
          metadata: { durationMs: Date.now() - startMs },
        })
      })
    })
  },
}
