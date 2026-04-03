/**
 * agent/workspace-bootstrap.ts — 工作区引导文件加载
 *
 * Phase G1 (GAP-16): 扫描 workspaceDir 下的特殊 Markdown 文件，
 * 内容注入到 system prompt 中，让 Agent 具备项目级上下文。
 *
 * 支持的文件：
 *   AGENTS.md   — 项目级 Agent 行为指令（类似 .cursorrules / CLAUDE.md）
 *   SOUL.md     — Agent 身份/人格定义
 *   TOOLS.md    — 项目可用工具限制
 *   IDENTITY.md — 项目身份标识
 *
 * 安全机制：
 *   - 路径边界检查（防止 ../../../etc/passwd 逃逸）
 *   - 单文件 2MB 上限
 *   - mtime+size 缓存，避免重复 I/O
 */

import { readFile, stat } from 'node:fs/promises'
import { join, resolve, relative, sep } from 'node:path'

// ─── Types ──────────────────────────────────────────────────────────────────

export type BootstrapFileName = 'AGENTS.md' | 'SOUL.md' | 'TOOLS.md' | 'IDENTITY.md'

export interface BootstrapFile {
  name: BootstrapFileName
  path: string
  content: string
}

export type BootstrapLoadErrorReason = 'missing' | 'too_large' | 'security' | 'io'

export interface BootstrapLoadError {
  name: string
  reason: BootstrapLoadErrorReason
  detail?: string
}

export interface BootstrapLoadResult {
  files: BootstrapFile[]
  errors: BootstrapLoadError[]
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const BOOTSTRAP_FILENAMES: readonly BootstrapFileName[] = [
  'AGENTS.md',
  'SOUL.md',
  'TOOLS.md',
  'IDENTITY.md',
]

/** 单文件最大字节数 (2 MB) */
const MAX_FILE_BYTES = 2 * 1024 * 1024

// ─── Cache ──────────────────────────────────────────────────────────────────

interface CacheEntry {
  content: string
  identity: string // `${mtimeMs}:${size}`
}

const cache = new Map<string, CacheEntry>()

/** 清除缓存（测试用） */
export function invalidateBootstrapCache(workspaceDir?: string): void {
  if (!workspaceDir) {
    cache.clear()
    return
  }
  const prefix = resolve(workspaceDir)
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key)
  }
}

// ─── Security ───────────────────────────────────────────────────────────────

/**
 * 路径边界检查：确保 filePath 在 rootDir 内部。
 * 防止 symlink / .. 逃逸。
 */
function isWithinBoundary(filePath: string, rootDir: string): boolean {
  const resolved = resolve(filePath)
  const root = resolve(rootDir)
  // 确保相对路径不以 .. 开头
  const rel = relative(root, resolved)
  if (rel.startsWith('..') || rel.startsWith(sep + sep)) return false
  // 确保 resolved 确实在 root 下
  return resolved.startsWith(root + sep) || resolved === root
}

// ─── Core ───────────────────────────────────────────────────────────────────

/**
 * 加载工作区引导文件。
 *
 * 安全且宽容：缺失的文件不报错（大多数项目不会全部都有），
 * 只记录在 errors 中供调试。
 */
export async function loadWorkspaceBootstrapFiles(
  workspaceDir: string,
): Promise<BootstrapLoadResult> {
  const files: BootstrapFile[] = []
  const errors: BootstrapLoadError[] = []
  const resolvedDir = resolve(workspaceDir)

  for (const name of BOOTSTRAP_FILENAMES) {
    const filePath = join(resolvedDir, name)

    // 1. 路径边界检查
    if (!isWithinBoundary(filePath, resolvedDir)) {
      errors.push({ name, reason: 'security', detail: 'path escapes workspace boundary' })
      continue
    }

    try {
      // 2. stat 检查
      const st = await stat(filePath)

      // 3. 大小限制
      if (st.size > MAX_FILE_BYTES) {
        errors.push({
          name,
          reason: 'too_large',
          detail: `${st.size} bytes exceeds ${MAX_FILE_BYTES} limit`,
        })
        continue
      }

      // 4. 缓存检查
      const identity = `${st.mtimeMs}:${st.size}`
      const cached = cache.get(filePath)
      if (cached && cached.identity === identity) {
        files.push({ name, path: filePath, content: cached.content })
        continue
      }

      // 5. 读取文件
      const content = await readFile(filePath, 'utf-8')

      // 6. 更新缓存
      cache.set(filePath, { content, identity })

      files.push({ name, path: filePath, content })
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code === 'ENOENT') {
        errors.push({ name, reason: 'missing' })
      } else {
        errors.push({
          name,
          reason: 'io',
          detail: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  return { files, errors }
}

/**
 * 将引导文件格式化为可注入 system prompt 的文本块。
 *
 * 格式：
 *   <workspace-context name="AGENTS.md">
 *   ...内容（去掉 frontmatter）...
 *   </workspace-context>
 */
export function formatBootstrapBlock(files: BootstrapFile[]): string {
  if (files.length === 0) return ''

  const blocks = files.map(f => {
    const content = stripFrontMatter(f.content).trim()
    return `<workspace-context name="${f.name}">\n${content}\n</workspace-context>`
  })

  return `\n## 项目上下文（工作区引导文件）

以下内容来自当前工作目录中的项目配置文件。请遵循其中的指令和约束。

${blocks.join('\n\n')}`
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** 剥离 YAML frontmatter（如有） */
function stripFrontMatter(content: string): string {
  if (!content.startsWith('---')) return content
  const endIdx = content.indexOf('\n---', 3)
  if (endIdx === -1) return content
  return content.slice(endIdx + 4).replace(/^\s+/, '')
}
