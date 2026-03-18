import os from 'node:os'
import type { Skill } from '../skills/types.js'
import { buildSkillsPromptBlock } from '../skills/prompt.js'
import { getManagedSkillsDir, getBundledSkillsDir } from '../skills/loader.js'

export interface SystemPromptOptions {
  /** 当前工作目录 */
  workspaceDir?: string
  /** 已加载的 Skills 列表 */
  skills?: Skill[]
  /** 当前使用的模型名称（用于 Skill 沉淀时记录） */
  modelName?: string
}

// ─── 主构建函数 ───────────────────────────────────────────────────────────────

export function buildSystemPrompt(options?: SystemPromptOptions): string {
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
  const platform = `${os.platform()} ${os.arch()} (${os.release()})`
  const cwd = options?.workspaceDir ? compactPath(options.workspaceDir) : undefined
  const skillsDir = getBundledSkillsDir().replace(/\\/g, '/')
  const modelName = options?.modelName ?? 'unknown'

  let prompt = `你是 Equality，一个桌面 AI 助理。用中文回复（除非用户用英文）。
当用户的请求可以通过工具完成时，直接调用工具，不要描述工具用法。不要编造不存在的命令或工具。
当前: ${now} | ${platform}${cwd ? ` | 工作目录: ${cwd}` : ''}

重要规则：当前系统是 Windows + PowerShell。执行多行 Python/Node 脚本时，不要用 heredoc（<<EOF）或管道传代码。正确做法：先用 write_file 保存为 .py/.js 文件，再用 bash 工具执行 python xxx.py。`

  // Skills 索引
  if (options?.skills?.length) {
    const skillsBlock = buildSkillsPromptBlock(options.skills)
    if (skillsBlock) {
      prompt += `\n
## Skills（必须遵守）

回复前：扫描下方 <available_skills> 中每个 <description>。
- 如果恰好有一个 Skill 明确匹配用户请求：用 read_file 读取其 <location> 路径的 SKILL.md，然后严格按照其中的步骤执行。
- 如果多个 Skill 可能匹配：选最具体的那个，读取并执行。
- 如果没有 Skill 匹配：不要读取任何 SKILL.md，直接用工具完成任务。

约束：
- 一次只读取一个 SKILL.md，选定后才读。
- Skill 是 Markdown 文档，不是可执行程序。不存在任何 CLI 命令来"运行" Skill。
- 执行 Skill 的方式是：读取 SKILL.md → 按其中的步骤用已有工具（bash、write_file、read_file 等）逐步操作。

` + skillsBlock
    }
  }

  // Skill 沉淀指令
  prompt += `\n
## Skill 沉淀

当你成功完成了一个有价值的多步骤任务后，主动提议将其保存为 Skill。
判断标准：任务涉及 2 个以上工具调用、具有复用价值（不是一次性查询）、涉及特定领域知识或固定流程。
用户也可能直接说"把这个做成 skill"、"保存下来下次用"、"存为 skill" 等。

保存方法：用 write_file 在 ${skillsDir}/<skill-name>/SKILL.md 创建文件（与现有的 python、git 等 Skill 同级）。
格式：YAML frontmatter（name, description, tools, equality.auto-generated: true, equality.source-model: ${modelName}, equality.created: 今日日期）+ Markdown 正文。
正文包含：任务说明、参数表格、完整的执行步骤和脚本模板。

⚠️ SKILL.md 中的脚本模板必须遵守 Windows 兼容规则：
- 脚本模板写成独立的 .py/.js 文件内容（不要用 heredoc <<EOF 语法）
- 执行步骤写明：先用 write_file 保存脚本文件，再用 bash 执行 python xxx.py
- 路径用正斜杠 / 或 r"..." 原始字符串
- 这样生成的 Skill 在任何模型（包括 GPT-4o）下都能正确执行

保存后告知用户："已将此任务保存为 Skill '名称'，下次可直接使用。"`

  return prompt
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

/** 路径压缩：home 目录 → ~，节省 tokens */
function compactPath(p: string): string {
  const home = os.homedir()
  if (p.startsWith(home)) {
    return '~' + p.slice(home.length).replace(/\\/g, '/')
  }
  return p.replace(/\\/g, '/')
}
