# Skills Specification

> 描述 Skills 系统：以 Markdown 文件形式扩展 Agent 的领域知识。  
> Skills 是软编码能力（文档），Tools 是硬编码能力（代码），两者互补。

---

## Requirements

### Requirement: Skill 文件格式

每个 Skill MUST 是一个 Markdown 文件（`SKILL.md` 或 `<name>.skill.md`），包含 YAML frontmatter 和正文。

```markdown
---
name: git                          # 必填，全局唯一标识
description: 使用 Git 进行版本控制  # 必填，LLM 路由用的简短描述（≤120字符）
tools: bash, read_file             # 可选，该 Skill 依赖的工具
user-invocable: true               # 可选，用户能否通过 /skill-name 直接调用
equality:
  always: false                    # 是否始终注入（不受 Top-K 限制）
  emoji: 🌿
  requires:
    bins: [git]                    # 依赖的系统命令
---

# Git Skill

当需要操作 Git 仓库时...（详细指令，供 LLM 阅读）
```

---

### Requirement: Skills 加载优先级

Skills 来源按以下优先级加载（高优先级同名覆盖低优先级）：

| 优先级 | 来源 | 路径 |
|--------|------|------|
| 6（最高）| 工作区本地 | `<cwd>/skills/` |
| 5 | 项目级 | `<cwd>/.agents/skills/` |
| 4 | 用户个人 | `~/.agents/skills/` |
| 3 | 用户管理 | `%APPDATA%\Equality\skills\` |
| 2 | 内置 | 随安装包分发的内置 Skills |
| 1（最低）| 额外目录 | `config.skills.extraDirs` |

每个来源 MUST 最多加载 200 个 Skills（`maxSkillsPerSource`）。

---

### Requirement: System Prompt 注入（XML 索引 + 懒加载）

加载的 Skills MUST 以 **XML 索引格式** 注入 System Prompt（NOT 全文注入）：

```xml
<available_skills>
  <skill>
    <name>git</name>
    <description>使用 Git 进行版本控制</description>
    <location>~/.agents/skills/git/SKILL.md</location>
  </skill>
</available_skills>
```

**索引注入规则：**
- 注入上限：最多 150 个 Skills，且总字符 ≤ 30,000
- System Prompt 中只包含 name + description + location 三个字段
- Skill 文件路径中的 home 目录 MUST 替换为 `~`（节省约 400-600 tokens）
- Token 成本：基础 195 字符 + 每个 skill ~24 tokens（约 97 + name + desc + location 字符）
- `always: true` 的 Skills MUST 始终注入，不受 Top-K 限制
- 超出上限时：二分搜索找到在字符预算内的最大 skills 前缀

**懒加载机制：**
- 模型看到索引后，根据用户问题的相关性，自主决定是否通过 `read_file` 工具读取 `<location>` 指向的 SKILL.md 文件
- 这避免了将所有 skill 全文注入 prompt 的 token 浪费

> **架构决策**：此设计参考 OpenClaw 的 `formatSkillsForPrompt()`（来自 `@mariozechner/pi-coding-agent`），  
> 经深入研究确认其采用 XML 索引 + `read` 工具懒加载模式，150 个 skills 仅消耗 ~3,600 tokens。

---

### Requirement: Skills 热更新

系统 SHOULD 监听 Skills 目录的文件变化，自动重新加载。

- 文件变化事件 MUST 经过 30 秒防抖延迟，避免频繁重载
- 重载后，下一次 `runAttempt` 使用新的 Skills 集合
- 当前正在运行的 `runAttempt` 不受影响（使用启动时的快照）

#### Scenario: 用户修改 Skill 文件
- GIVEN 用户在编辑器修改了 `~/.agents/skills/git.skill.md`
- WHEN 文件保存后 30 秒
- THEN Skills 缓存自动刷新
- AND 下一轮对话使用更新后的 Git Skill

---

### Requirement: PRC 内置 Skills

equality 内置 Skills MUST 针对 PRC 环境：所有安装命令走国内镜像源。

| Skill | 安装命令示例 |
|-------|------------|
| Python 依赖 | `pip install -i https://pypi.tuna.tsinghua.edu.cn/simple xxx` |
| Node.js 依赖 | `npm install --registry https://registry.npmmirror.com xxx` |
| Go 模块 | `GOPROXY=https://goproxy.cn go install xxx` |
| conda 包 | `conda install -c https://mirrors.tuna.tsinghua.edu.cn/anaconda xxx` |

OpenClaw 内置 Skills 中使用 `brew` / 境外 npm registry 的安装命令 MUST NOT 直接复用。

---

### Requirement: Skill 自动沉淀（对话 → Skill）

> 核心目标：强模型（如 GPT-5.4）完成的复杂任务，能自动固化为 Skill，让弱模型（如 GPT-4o）也能复用。
> 这是"技能平权"理念的关键闭环：**使用 → 沉淀 → 复用 → 人人可用**。

#### 1. System Prompt 指令

System Prompt 中 MUST 包含 Skill 沉淀指令，告知模型：

```
当你成功完成了一个有价值的多步骤任务后，SHOULD 主动提议将其保存为 Skill。
判断标准：
- 任务涉及 2 个以上工具调用
- 任务具有复用价值（不是一次性查询）
- 任务涉及特定领域知识或固定流程

保存 Skill 的方法：
1. 用 write_file 在 <managed_skills_dir> 下创建 <skill-name>/SKILL.md
2. SKILL.md 格式：YAML frontmatter（name, description, tools）+ Markdown 正文
3. 正文中包含完整的步骤说明和脚本模板（用 {{参数名}} 占位）
4. 保存后告知用户："已将此任务保存为 Skill '<name>'，下次可直接使用。"

Skill 保存目录: <managed_skills_dir>
```

其中 `<managed_skills_dir>` MUST 由 System Prompt 构建函数动态注入，
值为 `%APPDATA%\Equality\skills\`（Windows）或 `~/.config/Equality/skills/`（Linux/macOS）。

#### 2. 用户主动触发

用户 SHOULD 可以通过以下方式主动要求保存 Skill：

- "把这个过程保存为 skill"
- "把刚才做的存下来，下次直接用"
- "帮我做成一个 skill"

模型收到此类请求后，MUST 基于当前对话历史提取任务步骤，生成 SKILL.md 并写入 managed 目录。

#### 3. 沉淀的 Skill 格式规范

自动生成的 SKILL.md MUST 遵循以下结构：

```markdown
---
name: excel-diff                       # 全局唯一
description: 对比两个 Excel 文件的差异   # 简短描述，≤120 字符
tools:
  - bash                               # 依赖的工具列表
equality:
  emoji: 📊
  auto-generated: true                 # 标记为自动生成
  source-model: gpt-5.4                # 记录生成时使用的模型
  created: 2026-03-15                  # 创建日期
---

# Excel 文件对比

当用户需要对比两个 Excel 文件的差异时使用此 Skill。

## 参数

| 参数 | 说明 | 示例 |
|------|------|------|
| fileA | 第一个 Excel 文件路径 | C:\data\old.xlsx |
| fileB | 第二个 Excel 文件路径 | C:\data\new.xlsx |
| keyColumn | 主键列名 | 订单编号 |
| output | 结果输出路径 | C:\data\diff.xlsx |

## 执行步骤

使用 bash 工具执行以下 Python 脚本：

（此处为完整的脚本模板，包含参数占位符）
```

#### 4. 自动加载

因 managed 目录（优先级 3）已在 `SKILLS_LOAD_ORDER` 中注册，
保存后的 Skill 在下一次 30 秒防抖周期后 SHOULD 被 watcher 自动检测并加载，
无需重启即可在后续对话中使用。

#### 5. Scenario: 对话沉淀为 Skill

- GIVEN 用户使用 GPT-5.4 完成了"60万行 Excel 对比"任务
- WHEN 用户说"把这个做成 skill"
- THEN 模型从对话历史提取：参数（fileA, fileB, keyColumn, output）、工具调用（bash + Python 脚本）、流程步骤
- AND 生成 `%APPDATA%\Equality\skills\excel-diff\SKILL.md`
- AND 30 秒后 Skills 自动重载
- AND 下一次对话中 GPT-4o 看到 `<skill><name>excel-diff</name>` 索引
- WHEN 用户对 GPT-4o 说"对比这两个 Excel"
- THEN GPT-4o 通过 read_file 读取 excel-diff SKILL.md
- AND 按照 Skill 中的脚本模板执行，填入用户提供的参数
- AND 成功完成任务（无需从零推理脚本写法）
