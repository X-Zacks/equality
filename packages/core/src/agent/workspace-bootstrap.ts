/**
 * agent/workspace-bootstrap.ts — 工作区引导文件（对话驱动）
 *
 * Phase G1 (GAP-16): 参考 OpenClaw 的 workspace bootstrap 机制，
 * 通过**自动种子 + 对话引导**让 Agent 主动认识用户并建立身份。
 *
 * 核心流程（对齐 OpenClaw BOOTSTRAP.md 设计）：
 *
 *   1. 首次启动 → ensureWorkspaceBootstrap() 自动种下模板文件
 *   2. 检测到 BOOTSTRAP.md 存在 → Agent 在 system prompt 中收到引导脚本
 *   3. Agent 通过对话了解用户 → 用 write_file 填写 IDENTITY.md / USER.md / SOUL.md
 *   4. 引导完成 → Agent 删除 BOOTSTRAP.md，后续不再触发
 *   5. 用户后续可随时通过对话修改这些文件（"帮我改一下你的性格"）
 *
 * 支持的引导文件：
 *   BOOTSTRAP.md — 首次运行引导脚本（完成后自动删除）
 *   AGENTS.md    — 项目级 Agent 行为指令
 *   TOOLS.md     — 项目环境备注
 *
 * 已移除（由会话级 Purpose 和内置行为准则替代）：
 *   IDENTITY.md  — 原 Agent 身份信息
 *   USER.md      — 原用户档案
 *   SOUL.md      — 原行为准则
 *
 * 安全机制：路径边界检查 + 2MB 上限 + mtime 缓存
 */

import { readFile, writeFile, stat, access, mkdir } from 'node:fs/promises'
import { join, resolve, relative, sep } from 'node:path'

// ─── Types ──────────────────────────────────────────────────────────────────

export type BootstrapFileName =
  | 'BOOTSTRAP.md'
  | 'AGENTS.md'
  | 'TOOLS.md'

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
  /** 是否处于首次引导流程（BOOTSTRAP.md 存在） */
  isBootstrapping: boolean
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** 全部引导文件名（按注入顺序） */
export const BOOTSTRAP_FILENAMES: readonly BootstrapFileName[] = [
  'BOOTSTRAP.md',
  'AGENTS.md',
  'TOOLS.md',
]

/** 单文件最大字节数 (2 MB) */
const MAX_FILE_BYTES = 2 * 1024 * 1024

// ─── Templates ──────────────────────────────────────────────────────────────

/**
 * BOOTSTRAP.md — 首次运行引导脚本。
 * 注入到 system prompt 后，Agent 会主动发起对话引导用户。
 * 引导完成后 Agent 应删除此文件。
 */
const BOOTSTRAP_TEMPLATE = `# BOOTSTRAP.md — 首次认识

_你刚刚上线。是时候了解你的主人了。_

这是一个全新的工作区，还没有任何记忆。

## 对话引导

不要像审讯一样问问题。自然地聊天。

用温暖的方式开场，比如：

> "你好！我是 Equality，你的 AI 助理。在我们开始之前，我想了解一下你——这样我能更好地帮到你。"

然后通过对话了解：

1. **用户姓名** — 怎么称呼他们？
2. **工作领域** — 他们主要做什么？
3. **偏好** — 时区？常用语言？回复风格偏好？

如果用户不确定，主动给出建议。保持轻松有趣。

## 了解后的操作

用 \`memory_save\` 工具保存用户偏好，例如：
- memory_save({ category: "user", content: "用户叫小明，前端开发，偏好简洁中文回复" })

**不要创建任何 .md 文件。所有用户偏好都通过 memory 工具保存。**

## 功能导览（认识用户后简要提及）

了解用户后，在对话中自然地提到 1-2 个最相关的能力：

- **工具能力** — "我可以帮你执行命令、读写文件、搜索网页、分析图片/PDF 等。"
- **Skills 技能** — "我有 20+ 内置技能（Git、Python、文档处理等），输入 @ 就能选择。"
- **记忆能力** — "告诉我需要记住的事，下次对话我还会记得。"

不要一口气全讲——根据用户的工作领域，挑最相关的 1-2 个即可。

## 完成引导

当以上信息都收集完毕后：

1. 用 bash 工具删除 \`BOOTSTRAP.md\`（\`rm BOOTSTRAP.md\` 或 \`Remove-Item BOOTSTRAP.md\`）
2. 告诉用户："引导完成！我已经记住了你的偏好。以后随时说"帮我改一下你的设置"就能调整。"

---

_祝你好运。让每次对话都有价值。_
`

const AGENTS_TEMPLATE = `# AGENTS.md — 工作区规则

这个文件夹是你的家。像对待家一样。

## 记忆

你每次会话都是全新醒来。你有记忆系统：

### 结构化记忆（memory 工具 — 首选）
- 用户说"记住这个" / 提到个人偏好 → 调用 \`memory_save\` 工具
- 需要回忆用户偏好、历史决策、个人信息 → 调用 \`memory_search\` 工具
- memory 工具的数据跨会话持久保留，自动索引，支持模糊检索

### 文件记忆（工作区 .md 文件 — 项目级）
- \`AGENTS.md\` 用于项目级 Agent 行为规范
- \`TOOLS.md\` 存储项目环境备注

**优先级**：个人偏好和动态信息 → memory 工具；项目级配置 → .md 文件

## 红线

- 不要泄露隐私数据。永远不要。
- 没有确认不要执行破坏性命令。
- 不确定时，问。
`

const TOOLS_TEMPLATE = `# TOOLS.md — 环境备注

Skills 定义了工具_怎么用_。这个文件记录_你的环境_特有的信息。

## 这里放什么

比如：

- 常用项目路径
- SSH 主机和别名
- 开发环境偏好
- 任何环境特有的东西

---

把有助于你工作的信息都加进来。这是你的速查表。
`

// ─── 模板名 → 内容映射 ──────────────────────────────────────────────────────

const TEMPLATES: Record<string, string> = {
  'BOOTSTRAP.md': BOOTSTRAP_TEMPLATE,
  'AGENTS.md': AGENTS_TEMPLATE,
  'TOOLS.md': TOOLS_TEMPLATE,
}

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
  const rel = relative(root, resolved)
  if (rel.startsWith('..') || rel.startsWith(sep + sep)) return false
  return resolved.startsWith(root + sep) || resolved === root
}

// ─── ensureWorkspaceBootstrap（自动种下模板）────────────────────────────────

/**
 * 确保工作区引导文件存在。
 *
 * - 首次调用时，种下所有模板文件（writeIfMissing，不覆盖已有文件）
 * - 全新工作区还会种下 BOOTSTRAP.md（引导脚本）
 * - 已有用户内容的工作区跳过 BOOTSTRAP.md
 *
 * 应在 Core 启动时调用一次。
 */
export async function ensureWorkspaceBootstrap(workspaceDir: string): Promise<{
  seeded: string[]
  isNewWorkspace: boolean
}> {
  const resolvedDir = resolve(workspaceDir)
  await mkdir(resolvedDir, { recursive: true })

  // 检测是否全新工作区（无任何引导文件）
  const existingFiles: string[] = []
  for (const name of BOOTSTRAP_FILENAMES) {
    try {
      await access(join(resolvedDir, name))
      existingFiles.push(name)
    } catch {
      // 不存在
    }
  }

  const isNewWorkspace = existingFiles.length === 0

  // 确定需要种下的文件列表
  const filesToSeed = isNewWorkspace
    ? BOOTSTRAP_FILENAMES  // 全新 → 包含 BOOTSTRAP.md
    : BOOTSTRAP_FILENAMES.filter(n => n !== 'BOOTSTRAP.md')  // 已有内容 → 跳过 BOOTSTRAP

  const seeded: string[] = []
  for (const name of filesToSeed) {
    const filePath = join(resolvedDir, name)
    const template = TEMPLATES[name]
    if (!template) continue

    try {
      // writeFile with flag 'wx' → 只在文件不存在时写入
      await writeFile(filePath, template, { encoding: 'utf-8', flag: 'wx' })
      seeded.push(name)
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code !== 'EEXIST') {
        console.warn(`[workspace-bootstrap] 种下 ${name} 失败:`, err)
      }
      // EEXIST → 文件已存在，跳过（不覆盖用户内容）
    }
  }

  if (seeded.length > 0) {
    console.log(`[workspace-bootstrap] 已种下模板: ${seeded.join(', ')}${isNewWorkspace ? ' (新工作区，包含引导脚本)' : ''}`)
  }

  return { seeded, isNewWorkspace }
}

// ─── Core（加载）──────────────────────────────────────────────────────────────

/**
 * 加载工作区引导文件。
 *
 * 安全且宽容：缺失的文件不报错，只记录在 errors 中供调试。
 * 返回的 isBootstrapping 标记表示是否处于首次引导流程。
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

  const isBootstrapping = files.some(f => f.name === 'BOOTSTRAP.md')

  return { files, errors, isBootstrapping }
}

/**
 * 将引导文件格式化为可注入 system prompt 的文本块。
 *
 * 格式：
 *   <workspace-context name="AGENTS.md">
 *   ...内容（去掉 frontmatter）...
 *   </workspace-context>
 *
 * BOOTSTRAP.md 有特殊处理——作为最高优先级引导指令注入。
 */
export function formatBootstrapBlock(files: BootstrapFile[]): string {
  if (files.length === 0) return ''

  const bootstrapFile = files.find(f => f.name === 'BOOTSTRAP.md')
  const otherFiles = files.filter(f => f.name !== 'BOOTSTRAP.md')

  let block = ''

  // BOOTSTRAP.md → 首次引导，最高优先级
  if (bootstrapFile) {
    const content = stripFrontMatter(bootstrapFile.content).trim()
    block += `\n## 🚀 首次引导（最高优先级）

这是你的第一次运行。以下是你的引导脚本，**必须严格执行**：

<bootstrap-script>
${content}
</bootstrap-script>

请立即开始引导对话。不要等用户先说话——**你主动开场**。
`
  }

  // 其他引导文件
  if (otherFiles.length > 0) {
    const blocks = otherFiles.map(f => {
      const content = stripFrontMatter(f.content).trim()
      return `<workspace-context name="${f.name}">\n${content}\n</workspace-context>`
    })

    block += `\n## 项目上下文（工作区引导文件）

以下内容来自当前工作目录中的配置文件。请遵循其中的指令和约束。
用户可以通过对话随时要求你修改这些文件。

${blocks.join('\n\n')}`
  }

  return block
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** 剥离 YAML frontmatter（如有） */
function stripFrontMatter(content: string): string {
  if (!content.startsWith('---')) return content
  const endIdx = content.indexOf('\n---', 3)
  if (endIdx === -1) return content
  return content.slice(endIdx + 4).replace(/^\s+/, '')
}
