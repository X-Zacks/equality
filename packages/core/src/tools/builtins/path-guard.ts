/**
 * tools/builtins/path-guard.ts — 统一路径边界校验
 *
 * 所有文件操作工具（read_file, write_file, list_dir, edit_file 等）
 * 在解析路径后都应调用 guardPath() 确保不越出 workspace 边界。
 */

import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

/** 统一 normalize：小写盘符 + 正斜杠 */
function norm(p: string): string {
  return p.replace(/\\/g, '/').replace(/^([A-Z]):/, (_, d) => `${d.toLowerCase()}:`)
}

/**
 * 解析文件路径并做边界校验。
 *
 * @returns absPath 如果合法；否则返回 error string
 */
export function guardPath(
  filePath: string,
  workspaceDir: string,
  opts?: { allowTmp?: boolean },
): { absPath: string } | { error: string } {
  const absPath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(workspaceDir, filePath)

  // 追踪符号链接
  let realPath: string
  try {
    realPath = fs.realpathSync(absPath)
  } catch {
    realPath = absPath // 文件不存在时用 resolve 结果
  }

  const normalizedReal = norm(realPath)

  // 1) workspace 内 → 允许
  let realWorkspace: string
  try { realWorkspace = fs.realpathSync(workspaceDir) } catch { realWorkspace = workspaceDir }
  const normalizedWorkspace = norm(realWorkspace)
  if (normalizedReal === normalizedWorkspace || normalizedReal.startsWith(normalizedWorkspace + '/')) {
    return { absPath }
  }

  // 2) 系统临时目录 → 允许（PDF 缓存等场景）
  if (opts?.allowTmp !== false) {
    const tmpDir = norm(os.tmpdir())
    if (normalizedReal === tmpDir || normalizedReal.startsWith(tmpDir + '/')) {
      return { absPath }
    }
  }

  return { error: `Security: path "${absPath}" is outside workspace "${workspaceDir}". Only files within the workspace directory are accessible.` }
}
