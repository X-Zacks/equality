/**
 * tools/builtins/process-tool.ts — 后台进程管理工具
 *
 * 借鉴 OpenClaw 的 process 工具设计。
 * 管理 bash 工具以 background=true 启动的后台进程。
 * 支持：list / poll / log / write / kill 操作。
 */

import type { ToolDefinition, ToolResult, ToolContext } from '../types.js'
import { processManager } from './process-manager.js'
import { truncateToolResult } from '../truncation.js'

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const mins = Math.floor(ms / 60_000)
  const secs = Math.floor((ms % 60_000) / 1000)
  return `${mins}m${secs}s`
}

export const processTool: ToolDefinition = {
  name: 'process',
  description:
    '管理 bash 工具启动的后台进程。支持操作：' +
    'list（列出所有进程）、poll（等待新输出）、log（完整日志）、' +
    'write（向 stdin 写入）、kill（终止进程）。',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: '操作类型：list / poll / log / write / kill',
        enum: ['list', 'poll', 'log', 'write', 'kill'],
      },
      id: {
        type: 'string',
        description: '进程 ID（list 操作不需要）',
      },
      all: {
        type: 'boolean',
        description: 'list 操作时：true = 显示所有会话的进程；默认只显示当前会话',
      },
      force: {
        type: 'boolean',
        description: 'kill 操作时：true = 允许终止其他会话的进程（默认拒绝）',
      },
      input: {
        type: 'string',
        description: 'write 操作时向 stdin 写入的内容',
      },
      timeout_ms: {
        type: 'number',
        description: 'poll 操作的等待超时（默认 5000ms）',
      },
    },
    required: ['action'],
  },

  async execute(input: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
    const action = String(input.action ?? '')
    const id = String(input.id ?? '')

    switch (action) {
      case 'list': {
        const showAll = String(input.all ?? '').toLowerCase() === 'true'
        const sessionKey = _ctx.sessionKey ?? ''
        const procs = showAll
          ? processManager.list()
          : (sessionKey ? processManager.listBySession(sessionKey) : processManager.list())

        if (procs.length === 0) {
          const hint = !showAll && sessionKey
            ? '\n\n当前会话没有后台进程。传 all=true 可查看所有会话的进程。'
            : ''
          return { content: `当前没有后台进程。使用 bash(command="...", background=true) 启动后台进程。${hint}` }
        }

        const lines = procs.map(p => {
          const duration = formatDuration(Date.now() - p.startedAt)
          const statusIcon = p.status === 'running' ? '🟢' : '⚫'
          const exitInfo = p.status === 'exited' ? ` (exit: ${p.exitCode})` : ''
          const sessionInfo = showAll && p.sessionKey ? ` | 会话: ${p.sessionKey.slice(0, 8)}` : ''
          return `${statusIcon} [${p.id}] ${p.status}${exitInfo} | ${duration} | PID ${p.pid}${sessionInfo}\n   ${p.command}`
        })

        const totalHint = !showAll && sessionKey && processManager.list().length > procs.length
          ? `\n\n(当前会话 ${procs.length} 个进程，传 all=true 可查看全部 ${processManager.list().length} 个)` : ''

        return { content: `后台进程 (${procs.length}):\n\n${lines.join('\n\n')}${totalHint}` }
      }

      case 'poll': {
        if (!id) return { content: 'Error: poll 操作需要 id 参数', isError: true }
        const timeoutMs = Number(input.timeout_ms) || 5_000
        const result = await processManager.poll(id, timeoutMs)
        if (!result) return { content: `Error: 进程 ${id} 不存在`, isError: true }

        const statusLine = result.status === 'exited'
          ? `⚫ 进程已退出 (exit code: ${result.exitCode})`
          : '🟢 进程运行中'

        return { content: `${statusLine}\n\n${result.output}` }
      }

      case 'log': {
        if (!id) return { content: 'Error: log 操作需要 id 参数', isError: true }
        const log = processManager.log(id)
        if (log === null) return { content: `Error: 进程 ${id} 不存在`, isError: true }

        const truncated = truncateToolResult(log)
        return { content: `进程 ${id} 完整日志:\n\n${truncated.content}` }
      }

      case 'write': {
        if (!id) return { content: 'Error: write 操作需要 id 参数', isError: true }
        const text = String(input.input ?? '')
        if (!text) return { content: 'Error: write 操作需要 input 参数', isError: true }

        const ok = processManager.write(id, text)
        if (!ok) return { content: `Error: 无法写入进程 ${id}（可能已退出或不存在）`, isError: true }

        return { content: `✅ 已向进程 ${id} 写入 ${text.length} 字符` }
      }

      case 'kill': {
        if (!id) return { content: 'Error: kill 操作需要 id 参数', isError: true }
        const force = String(input.force ?? '').toLowerCase() === 'true'
        const result = processManager.kill(id, { sessionKey: _ctx.sessionKey, force })
        if (!result.success && result.forbidden) {
          return {
            content: `Error: 进程 ${id} 属于其他会话，无权终止。如果确实需要，请传 force=true。`,
            isError: true,
          }
        }
        if (!result.success) return { content: `Error: 进程 ${id} 不存在`, isError: true }

        if (result.exitCode !== undefined) {
          return { content: `进程 ${id} 已经退出 (exit code: ${result.exitCode})` }
        }
        return { content: `✅ 已发送终止信号到进程 ${id}（SIGTERM → SIGKILL）` }
      }

      default:
        return {
          content: `Error: 未知操作 "${action}"。支持: list, poll, log, write, kill`,
          isError: true,
        }
    }
  },
}
