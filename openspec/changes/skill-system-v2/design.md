# Design: Skill System v2

## 1. 变更概述

两个文件需要修改：

| 文件 | 改动类型 | 目的 |
|------|---------|------|
| `packages/core/src/agent/system-prompt.ts` | 修改"Skill 沉淀"指令块 | 强制 Agent 自动生成 Skill 时写双分区 description |
| `packages/core/skills/skill-creator/SKILL.md` | 重写 | 对齐 OpenClaw 流程，指导用户主动创建高质量 Skill |

---

## 2. system-prompt.ts — Skill 沉淀指令修改

### 2.1 现状

当前指令块中对 description 的要求：

```typescript
格式：YAML frontmatter（name, description, tools, equality.auto-generated: true, ...）+ Markdown 正文。
正文包含：任务说明、参数表格、完整的执行步骤和脚本模板。
```

问题：
- description 只是一句话功能描述，无边界
- 提示"完整的执行步骤和脚本模板"——鼓励将脚本内联在 SKILL.md 正文

### 2.2 修改方案

修改 `system-prompt.ts` 第 97-107 行附近的"Skill 沉淀"块，增加：

**1. description 格式强制要求**：

```
description 格式：
  [功能摘要]。Use when: [触发场景1]、[触发场景2]。NOT for: [排除场景1]、[排除场景2]。
  长度 ≤ 200 字符。
```

**2. 脚本放置原则**：

```
正文写法：
- 核心流程、参数说明、调用示例写在 SKILL.md 正文
- 超过 50 行的脚本 → 写入 scripts/<name>.py，正文只写调用命令
- 参考文档、表格 → 写入 references/，正文只写路径引用
```

### 2.3 修改后的完整指令块（新文本）

```typescript
// Skill 沉淀指令
prompt += `\n
## Skill 沉淀

当你成功完成了一个有价值的多步骤任务后，主动提议将其保存为 Skill。
判断标准：任务涉及 2 个以上工具调用、具有复用价值（不是一次性查询）、涉及特定领域知识或固定流程。
用户也可能直接说"把这个做成 skill"、"保存下来下次用"、"存为 skill" 等。

保存方法：用 write_file 在 ${skillsDir}/<skill-name>/SKILL.md 创建文件（与现有的 python、git 等 Skill 同级）。

**frontmatter 格式**（仅这几个字段）：
\`\`\`yaml
name: skill-name                   # 小写+数字+连字符，≤64 字符
description: [功能摘要]。Use when: [场景1]、[场景2]。NOT for: [排除1]、[排除2]。
                                   # 长度 ≤ 200 字符
tools:
  - bash
  - write_file
equality:
  auto-generated: true
  source-model: ${modelName}
  created: 今日日期
\`\`\`

**正文结构**：
- 任务说明（何时使用）
- 参数表格
- 执行步骤（聚焦流程，不内联大段脚本）

**脚本放置原则**（重要）：
- 超过 50 行的 Python/JS 脚本 → 保存为 scripts/<name>.py，正文写调用命令
- 参数用 argparse，调用示例：\`python scripts/<name>.py --arg value\`
- 模板占位符 \`{{参数}}\` 只用于 < 20 行的小片段
- 参考文档、大型表格 → 保存为 references/<topic>.md，正文写文件路径引用

⚠️ 脚本文件必须遵守 Windows 兼容规则：
- 不要用 heredoc（\`<<EOF\`）
- 路径用正斜杠 / 或 Python raw string r"C:\\path"
- 换行不依赖 \\n 分割（Windows 是 \\r\\n）

⚠️ 安装命令使用国内镜像：
- pip: \`pip install -i https://pypi.tuna.tsinghua.edu.cn/simple <pkg>\`

保存后告知用户："已将此任务保存为 Skill '<名称>'，下次可直接使用。"`
```

---

## 3. skill-creator/SKILL.md 重写

### 3.1 现状问题

当前 `skill-creator/SKILL.md` 已有基础结构（108 行），包含：
- 目录结构模板
- SKILL.md frontmatter 模板
- 命名规范
- 渐进式披露说明
- Windows 兼容规则
- PRC 镜像规则

**缺失的内容**（对比 OpenClaw skill-creator）：
1. 创建前澄清触发/排除场景（Step 1）
2. 规划 scripts/references/assets（Step 2）
3. description 双分区格式指导
4. 脚本提取到 scripts/ 的判断准则
5. 审查/改进已有 Skill 的指导

### 3.2 重写方案

重写 `skill-creator/SKILL.md`，保留现有内容精华，新增：

**新增 frontmatter description 格式**（双分区，含 NOT for）：
```yaml
description: '创建、改进或审查 Equality Skill（目录结构、双分区 description、脚本提取）。
  Use when: 用户说"创建 skill"、"做成 skill"、"保存为 skill"、"改进/审查 skill"。
  NOT for: 直接执行任务（不保存为 skill）；安装软件；查询文档。'
```

**新增"创建流程"章节**（6步骤，对齐 OpenClaw）：

```
Step 1: 澄清场景（30秒）
Step 2: 规划三层内容
Step 3: 创建 SKILL.md（双分区 description）
Step 4: 提取脚本到 scripts/
Step 5: 验证
Step 6: 迭代
```

**description 写作指南**（独立小节）：

```markdown
## description 写作指南

格式：[功能摘要]。Use when: [触发场景]。NOT for: [排除场景]。

示例（好）：
> 分析两个季度费用 Excel 的多维差异，生成 MD/HTML 报告。
> Use when: 用户提供季度费用对比 Excel 目录时。NOT for: 单个 Excel 读取；非财务数据对比。

示例（差，缺 NOT for）：
> 分析费用 Excel 的差异并生成报告

"NOT for" 必填，是 Skill 路由精度的关键保障。
```

### 3.3 保留内容

以下现有内容保留不变（已经良好）：
- Windows 兼容规则（不用 heredoc，路径用正斜杠）
- PRC 镜像规则（pip/npm 等国内镜像）
- 渐进式披露（元数据 → 正文 → 资源文件）
- 目录结构模板（skills/, scripts/, references/, assets/）

---

## 4. 两处修改的关联

```
system-prompt.ts           skill-creator/SKILL.md
(Agent 自动保存路径)         (用户主动创建路径)
       │                            │
       └──────────┬─────────────────┘
                  │
         共同保障 Skill 质量
                  │
         双分区 description
         scripts/ 脚本提取
         Progressive Disclosure
```

两处修改相互独立，可分别验证，但覆盖了 Skill 诞生的两个入口（自动 vs 手动）。

---

## 5. 不改动的内容

- `skills/loader.ts`：加载逻辑不变
- `skills/prompt.ts`：index 构建不变
- `skills/types.ts`：类型定义不变
- 已有 Skill 文件：不批量改造，靠自然演化

---

## 6. 验证标准

实施完成后，以下场景应可验证：

1. Agent 完成任务后自动生成的 SKILL.md description 包含 "NOT for:" 分区
2. Agent 完成任务后不再将 100+ 行 Python 脚本内联在 SKILL.md 正文中
3. 触发 skill-creator 时，Agent 会在创建文件前询问触发/排除场景
4. 已有 skill 被审查时，Agent 主动检查并补充 "NOT for:" 分区
