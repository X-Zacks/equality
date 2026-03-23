---
name: skill-creator
description: 创建、改进或审查 Equality Skill（目录结构、双分区 description、脚本提取、渐进式披露）。Use when: 用户说"创建 skill"、"做成 skill"、"保存为 skill"、"改进/审查/整理 skill"。NOT for: 直接执行任务（不保存为 skill）；安装软件；查询文档。
user-invocable: true
equality:
  always: false
  emoji: 🛠️
---

# Skill Creator

## 关于 Skill

Skill 是可复用的知识包，为 Equality 提供特定领域的工作流、脚本和参考材料。每个 Skill 由一个 `SKILL.md` 文件和可选的配套资源组成。

### 目录结构

```
skill-name/
├── SKILL.md          # 必填：YAML frontmatter + Markdown 正文
├── scripts/          # 可选：可执行脚本（.py / .js）
├── references/       # 可选：参考文档（按需 read_file 加载）
└── assets/           # 可选：输出资源（模板、图片、字体）
```

### 渐进式披露（三层加载）

| 层级 | 内容 | 加载时机 |
|------|------|---------|
| 元数据 | `name` + `description` | 始终在 System Prompt 中（~100 词） |
| SKILL.md 正文 | 工作流、参数、步骤 | Skill 触发后加载（≤ 300 行） |
| 资源文件 | scripts/、references/、assets/ | 按需读取或执行 |

---

## 创建流程（6步）

### Step 1：澄清使用场景（创建前必做）

在创建任何文件之前，先明确：
- **触发场景**（1-3 个）：用户说什么、在什么情境下会用到这个 Skill？
- **排除场景**（1-2 个）：哪些看似相关、但不应触发的场景？

示例问题：
- "这个 skill 主要处理什么类型的输入？"
- "有没有你不希望它触发的场景？比如只是查看文件而不做分析时，是否应该触发？"

跳过条件：触发/排除场景已经完全清晰。

### Step 2：规划三层内容

分析使用场景，确定每层放什么：

| 层 | 放什么 | 何时创建 |
|----|--------|---------|
| `scripts/` | 重复执行的代码（> 50 行 Python/JS） | 脚本逻辑固定，需要可靠性时 |
| `references/` | 领域知识、API 文档、表格、schema | 内容丰富且不需要每次都加载时 |
| `assets/` | 模板文件、图片、字体、boilerplate | 输出中会用到的现成文件 |

### Step 3：创建 SKILL.md

**frontmatter**（仅以下字段）：

```yaml
---
name: skill-name          # 小写+数字+连字符，≤64 字符，与目录名一致
description: [功能摘要]。Use when: [触发场景1]、[触发场景2]。NOT for: [排除场景1]。
                          # 长度 ≤ 200 字符，两个分区均必填
user-invocable: true      # 可选，用户可主动触发时填写
---
```

**正文结构**：任务说明、参数表格、执行步骤（引用脚本路径，不内联大段代码）

### Step 4：提取脚本到 scripts/

判断标准：
- 脚本行数 > 50 行 → 存为 `scripts/<name>.py`，正文只写调用命令
- 脚本需反复调用 → 用 `argparse` 接收参数
- 小片段（< 20 行）→ 可内联在正文

示例正文写法（引用脚本）：
```markdown
运行分析脚本：
```bash
python scripts/analyze.py --input {{输入目录}} --output {{输出目录}}
```
```

### Step 5：验证清单

- [ ] `name` 与目录名一致，小写+连字符，≤ 64 字符
- [ ] `description` 含功能摘要 + "Use when:" + "NOT for:"，≤ 200 字符
- [ ] 正文 ≤ 300 行（超出则拆分到 references/）
- [ ] 超过 50 行的脚本已移至 scripts/
- [ ] scripts/ 脚本遵守 Windows 兼容规则
- [ ] 如有安装依赖，使用 PRC 镜像

### Step 6：迭代

使用 Skill 执行真实任务后观察触发准确性、步骤适用性、脚本参数是否需更新。

---

## description 写作指南

格式：`[功能摘要]。Use when: [触发场景]。NOT for: [排除场景]。`

**正面示例**：
> 分析两个季度费用 Excel 的多维差异，生成 MD/HTML 报告。Use when: 用户提供季度费用对比 Excel 目录时。NOT for: 单个 Excel 读取；非财务数据对比。

**反面示例**（缺 NOT for）：
> 分析费用 Excel 的差异并生成报告

**"NOT for" 必填**——防止模糊场景下的误触发。

---

## 审查现有 Skill

1. 读取 SKILL.md
2. 检查 description 是否含 "NOT for:"（缺失则询问用户并补充）
3. 检查正文是否有 > 50 行内联脚本（如有，建议提取到 scripts/）
4. 检查正文行数（> 200 行时建议拆分到 references/）
5. 更新后告知具体改动

---

## Windows 兼容规则（必须遵守）

1. 脚本用 `.py` 或 `.js`，**不要用 `.sh`**
2. **不要用 heredoc**（`<<EOF`）；先用 `write_file` 保存为 `.py` 文件，再用 `bash` 执行
3. 路径用正斜杠 `/` 或 Python raw string `r"C:\path"`
4. 不依赖 `\n` 分割换行（Windows 是 `\r\n`）

## PRC 镜像规则（必须遵守）

| 包管理器 | 镜像参数 |
|---------|---------|
| pip | `-i https://pypi.tuna.tsinghua.edu.cn/simple` |
| npm | `--registry https://registry.npmmirror.com` |
| conda | `-c https://mirrors.tuna.tsinghua.edu.cn/anaconda` |
| go | `GOPROXY=https://goproxy.cn` |

## 反面案例（不要做）

- ❌ 创建 README.md / CHANGELOG.md 等冗余文件
- ❌ description 缺少 "NOT for:" 分区
- ❌ 将 > 50 行脚本内联在 SKILL.md 正文
- ❌ 在正文和 references/ 中重复同一信息
- ❌ 使用 `.sh` 脚本（Windows 不兼容）
- ❌ 使用 heredoc 语法
