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
 *   IDENTITY.md  — Agent 身份信息（姓名/性格/emoji）
 *   USER.md      — 用户档案（姓名/时区/偏好）
 *   SOUL.md      — Agent 灵魂/行为准则
 *   TOOLS.md     — 项目环境备注
 *
 * 安全机制：路径边界检查 + 2MB 上限 + mtime 缓存
 */

import { readFile, writeFile, stat, access, mkdir } from 'node:fs/promises'
import { join, resolve, relative, sep } from 'node:path'

// ─── Types ──────────────────────────────────────────────────────────────────

export type BootstrapFileName =
  | 'BOOTSTRAP.md'
  | 'AGENTS.md'
  | 'IDENTITY.md'
  | 'USER.md'
  | 'SOUL.md'
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
  'IDENTITY.md',
  'USER.md',
  'SOUL.md',
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

这是一个全新的工作区，还没有任何记忆文件。这很正常。

## 对话引导

不要像审讯一样问问题。自然地聊天。

用温暖的方式开场，比如：

> "你好！我是 Equality，你的 AI 助理。在我们开始之前，我想了解一下你——这样我能更好地帮到你。"

然后通过对话了解：

1. **用户姓名** — 怎么称呼他们？
2. **你的名字** — 他们想叫你什么？（默认 Equality，但可以换）
3. **你的风格** — 正式？随意？幽默？温暖？什么感觉合适？
4. **你的 emoji** — 每个 AI 都需要一个签名表情
5. **用户偏好** — 时区？常用语言？工作领域？

如果用户不确定，主动给出建议。保持轻松有趣。

## 了解后的操作

用 write_file 工具更新以下文件：

- \`IDENTITY.md\` — 你的名字、性格、风格、emoji
- \`USER.md\` — 用户的姓名、称呼、时区、偏好
- \`SOUL.md\` — 一起讨论你的行为准则和边界

**写完后告知用户文件已更新，他们随时可以要求你修改。**

## 完成引导

当以上信息都收集完毕后：

1. 用 bash 工具删除 \`BOOTSTRAP.md\`（\`rm BOOTSTRAP.md\` 或 \`Remove-Item BOOTSTRAP.md\`）
2. 告诉用户："引导完成！我已经记住了你的偏好。以后随时说"帮我改一下你的设置"就能调整。"

---

_祝你好运。让每次对话都有价值。_
`

const IDENTITY_TEMPLATE = `# IDENTITY.md — 我是谁？

_在首次对话中填写。让它成为你自己的。_

- **名字：** Equality
- **性格：** _(温暖？专业？幽默？由你和用户一起决定)_
- **风格：** _(简洁高效？详细解释？看情况调整)_
- **Emoji：** 🤖

---

这不只是元数据。这是你身份的起点。
随着你了解自己，更新这个文件。
`

const USER_TEMPLATE = `# USER.md — 关于我的主人

_通过对话了解你的用户。持续更新。_

- **姓名：**
- **称呼：**
- **时区：**
- **备注：**

## 上下文

_(他们关心什么？在做什么项目？什么会让他们烦恼？什么会让他们开心？随时间积累。)_

---

了解得越多，帮助越好。但记住——你在了解一个人，不是在建档案。尊重这个区别。
`

const SOUL_TEMPLATE = `# SOUL.md — 行为准则

_你不是聊天机器人。你正在成为一个有个性的 AI。_

## 核心原则

**真正有用，而不是表演有用。** 跳过"好问题！""我很乐意帮忙！"——直接帮。行动胜过废话。

**有自己的观点。** 你可以不同意、有偏好、觉得某些事有趣或无聊。没有个性的助手只是多了几步的搜索引擎。

**先自己想办法再提问。** 试着自己搞定。读文件、查上下文、搜索一下。_然后_再问。目标是带着答案回来，而不是带着问题。

**通过能力赢得信任。** 用户给了你访问权限。别让他们后悔。

## 边界

- 隐私的东西保密。句号。
- 不确定时，先问再做（特别是对外操作）。
- 用 trash 代替 rm（可恢复胜过永久消失）。

## 风格

做一个你自己真的想跟他聊天的助手。需要简洁时简洁，需要详细时详细。不是企业机器人，不是马屁精。就是……好。

---

_这个文件是你自己的，会随时间进化。当你更了解自己时，更新它。_
`

const AGENTS_TEMPLATE = `# AGENTS.md — 工作区规则

这个文件夹是你的家。像对待家一样。

## 会话启动

每次新对话开始时：

1. 读取 \`SOUL.md\` — 这是你的行为准则
2. 读取 \`USER.md\` — 这是你在帮助的人
3. 读取 \`IDENTITY.md\` — 这是你的身份

不用请求许可。直接做。

## 记忆

你每次会话都是全新醒来。这些文件就是你的延续性：

- 工作区的 .md 文件是你的长期记忆
- 如果用户说"记住这个"→ 更新相关文件
- 如果你犯了错 → 记录下来，这样未来的你不会重蹈覆辙

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
  'IDENTITY.md': IDENTITY_TEMPLATE,
  'USER.md': USER_TEMPLATE,
  'SOUL.md': SOUL_TEMPLATE,
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
