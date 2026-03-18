---
name: skill-creator
description: 指导创建高质量的 Equality Skill（目录结构、frontmatter、Windows 兼容、PRC 镜像）
tools:
  - write_file
  - read_file
user-invocable: true
equality:
  always: false
  emoji: 🛠️
---

# Skill Creator

当用户要求创建新 Skill 时，按照以下规范操作。

## 目录结构

```
skill-name/
├── SKILL.md          # 必填：YAML frontmatter + Markdown 正文
├── scripts/          # 可选：可执行脚本（.py / .js / .ps1）
├── references/       # 可选：参考文档（按需 read_file 加载）
└── assets/           # 可选：输出资源（模板、图片、字体）
```

## SKILL.md 模板

```markdown
---
name: skill-name                    # 小写字母+数字+连字符，≤64 字符
description: 一句话描述功能           # ≤120 字符，LLM 路由用
tools:
  - bash                            # 依赖的工具列表
  - write_file
equality:
  emoji: 📊
  requires:
    bins: [python3]                 # 可选：依赖的系统命令
    env: []                         # 可选：依赖的环境变量
  install:                          # 可选：依赖安装指令
    - kind: pip
      spec: pandas openpyxl
---

# Skill 名称

描述何时使用此 Skill，以及执行的核心逻辑。

## 参数

| 参数 | 说明 | 示例 |
|------|------|------|
| input | 输入文件路径 | C:/data/input.xlsx |
| output | 输出文件路径 | C:/data/output.xlsx |

## 执行步骤

1. 第一步...
2. 第二步...

脚本模板使用 `{{参数名}}` 占位符。
```

## 命名规范

- 小写字母 + 数字 + 连字符：`excel-diff`、`pdf-rotate`、`git-commit-msg`
- 动词开头描述动作
- 目录名 MUST 与 `name` 字段一致
- 长度 ≤ 64 字符

## 渐进式披露

- **元数据**（name + description）：始终在 System Prompt 索引中（~100 词）
- **SKILL.md 正文**：Skill 触发后通过 `read_file` 加载（< 500 行）
- **scripts/ 资源文件**：按需读取（无上限，脚本可不读入上下文直接执行）

## Windows 兼容规则（重要）

1. 脚本用 `.py` 或 `.js`，**不要用 `.sh`**
2. **不要用 heredoc**（`<<EOF`），先用 `write_file` 保存为 `.py`/`.js` 文件，再用 `bash` 执行
3. 路径用正斜杠 `/` 或 Python raw string `r"C:\path"`
4. 换行符注意：Windows 是 `\r\n`，脚本中避免依赖 `\n` 分割

## PRC 镜像规则（重要）

所有安装命令 MUST 使用国内镜像：

| 包管理器 | 镜像参数 |
|---------|---------|
| pip | `-i https://pypi.tuna.tsinghua.edu.cn/simple` |
| npm | `--registry https://registry.npmmirror.com` |
| conda | `-c https://mirrors.tuna.tsinghua.edu.cn/anaconda` |
| go | `GOPROXY=https://goproxy.cn` |

示例：
```
pip install -i https://pypi.tuna.tsinghua.edu.cn/simple pandas openpyxl
```

## 反面案例（不要做）

- ❌ 创建 README.md / CHANGELOG.md 等冗余文件
- ❌ 在 SKILL.md 中解释 LLM 已知的常识（如"Python 是一种编程语言"）
- ❌ 在正文和 references/ 中重复同一信息
- ❌ frontmatter 中写超过 120 字符的 description
- ❌ 使用 `.sh` 脚本（Windows 不兼容）
- ❌ 使用 heredoc 语法
