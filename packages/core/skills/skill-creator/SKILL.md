---
name: skill-creator
description: '创建、改进或审查 Equality Skill（目录结构、双分区 description、脚本提取）。Use when: 用户说"创建 skill"、"做成 skill"、"保存为 skill"、"改进 skill"、"审查 skill"。NOT for: 直接执行任务（不保存为 skill）；安装软件；查询文档。'
user-invocable: true
---

# Skill Creator

创建、改进和审查 Equality Skills 的标准流程。

---

## 创建流程（6 步）

### Step 1：澄清场景（30 秒）

在写任何文件之前，先问用户两个问题：

1. **什么时候应该触发这个 Skill？**（"Use when" 场景）
2. **什么时候不应该触发？**（"NOT for" 场景）

如果当前对话已经包含了完整的工作流（用户说"把这个做成 skill"），从对话历史中提取答案，向用户确认即可。

### Step 2：规划内容层级

决定哪些内容放在哪里：

| 内容 | 放哪里 | 判断标准 |
|------|--------|---------|
| 触发描述、核心步骤 | SKILL.md 正文 | 始终 |
| ≤20 行的小片段 | SKILL.md（用 `{{参数}}` 占位符） | 简短模板 |
| >50 行的脚本 | `scripts/<name>.py` | 可复用、可独立测试 |
| 域知识、参考表格 | `references/<topic>.md` | 大段文档 |
| 模板文件、图标 | `assets/` | 非代码资源 |

### Step 3：创建 SKILL.md

```yaml
---
name: skill-name                   # 小写+数字+连字符，≤64 字符
description: '[功能摘要]。Use when: [触发场景1]、[触发场景2]。NOT for: [排除场景1]、[排除场景2]。'
                                   # ≤200 字符，Use when + NOT for 均必填
                                   # ⚠️ 含冒号时必须用单引号包裹
version: '1.0.0'                   # 可选：语义版本号
tags: []                           # 可选：分类标签，如 [workflow, data, automation]
author: ''                         # 可选：作者
platforms: [windows, macos, linux] # 可选：限定平台（省略=全平台）
---
```

正文结构：
1. 一句话说明此 Skill 做什么
2. 参数表格（如有）
3. 执行步骤（聚焦流程，不内联大段脚本）

### Step 4：提取脚本到 scripts/

当步骤中有 >50 行的 Python/JS 脚本时：

1. 将脚本保存为 `scripts/<name>.py`
2. 用 `argparse` 接收参数
3. SKILL.md 中只写调用命令：`python scripts/<name>.py --input xxx --output yyy`

⚠️ Windows 兼容规则：
- 不要用 heredoc（`<<EOF`）
- 路径用正斜杠 `/` 或 Python raw string `r"C:\path"`
- 安装命令使用国内镜像：`pip install -i https://pypi.tuna.tsinghua.edu.cn/simple <pkg>`

### Step 5：验证清单

创建完成后自检：

- [ ] description 包含 "Use when:" 和 "NOT for:" 两个分区
- [ ] description ≤ 200 字符
- [ ] SKILL.md 正文 ≤ 300 行
- [ ] 没有 >50 行的脚本内联在正文中
- [ ] scripts/ 中的脚本可独立运行（`python scripts/xxx.py --help`）

### Step 6：迭代改进

告知用户："已创建 Skill '<名称>'。你可以试用后告诉我需要调整的地方。"

---

## 审查已有 Skill

当用户要求审查或改进已有 Skill 时：

1. 用 `read_file` 读取 SKILL.md
2. 检查以下问题：
   - description 是否缺少 "NOT for:" 分区？→ 询问用户排除场景并补充
   - 正文是否内联了 >50 行脚本？→ 提取到 scripts/
   - 正文是否超过 300 行？→ 拆分到 references/
3. 用 `write_file` 覆盖更新
4. 告知用户具体改了什么

---

## description 写作指南

格式：`[功能摘要]。Use when: [触发场景]。NOT for: [排除场景]。`

**好的示例**：
> 分析两个季度费用 Excel 的多维差异，生成对比报告。Use when: 用户提供季度费用 Excel 对比需求时。NOT for: 单文件读取；非财务数据对比。

**差的示例**（缺 NOT for）：
> 分析费用 Excel 的差异并生成报告

"NOT for" 是 Skill 路由精度的关键保障，必填。

---

## 目录结构模板

```
skill-name/
├── SKILL.md              # 必需：元数据 + 执行步骤
├── scripts/              # 可选：可复用脚本
│   └── analyze.py
├── references/           # 可选：域知识文档
│   └── format-spec.md
└── assets/               # 可选：模板、图标等
    └── template.docx
```
