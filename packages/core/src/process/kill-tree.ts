/**
 * process/kill-tree.ts — 进程树 Kill
 *
 * Phase L3 (GAP-34): 跨平台杀死进程及其所有子进程。
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * 杀死进程及其所有子进程。
 *
 * - Windows: `taskkill /F /T /PID {pid}`
 * - Unix: 先 SIGTERM 进程组，3s 后升级 SIGKILL
 *
 * @returns true 如果成功终止，false 如果进程不存在
 */
export async function killProcessTree(
  pid: number,
  opts?: { timeoutMs?: number },
): Promise<boolean> {
  const isWin = process.platform === 'win32'
  const timeout = opts?.timeoutMs ?? 3000

  try {
    if (isWin) {
      await execAsync(`taskkill /F /T /PID ${pid}`)
      return true
    } else {
      // Unix: 先 SIGTERM
      try {
        process.kill(-pid, 'SIGTERM')
      } catch (e: any) {
        if (e.code === 'ESRCH') return false // 进程不存在
        // 如果进程组 kill 失败，尝试单进程
        try { process.kill(pid, 'SIGTERM') } catch { return false }
      }

      // 等待进程退出
      const exited = await waitForExit(pid, timeout)
      if (!exited) {
        // 升级 SIGKILL
        try { process.kill(-pid, 'SIGKILL') } catch { /* ignore */ }
        try { process.kill(pid, 'SIGKILL') } catch { /* ignore */ }
      }
      return true
    }
  } catch {
    return false
  }
}

/**
 * 检查进程是否存在。
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0) // signal 0 = just check
    return true
  } catch {
    return false
  }
}

// ─── Internal ───────────────────────────────────────────────────────────────

async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (!isProcessAlive(pid)) return true
    await new Promise(r => setTimeout(r, 100))
  }
  return !isProcessAlive(pid)
}
