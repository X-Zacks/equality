# Delta Spec: Skills System v2

> **Delta Type**: ADDED + MODIFIED  
> **Base Spec**: `openspec/specs/skills/spec.md`（如不存在则此文件即为初始规格）

---

## ADDED Requirements

### Requirement: Skill Description 双分区格式

新生成的 Skill 的 `description` 字段 MUST 包含两个明确分区：

1. **功能摘要**：一句话说明 Skill 做什么
2. **Use when**：列举 1-3 个典型触发场景（短语或句子）
3. **NOT for**：列举 1-3 个明确不适用的场景，防止误触发

格式模板：
```yaml
# description 值含冒号时必须加引号
description: '[功能摘要]。Use when: [触发场景1]、[触发场景2]。NOT for: [排除场景1]、[排除场景2]。'
```

#### Scenario: Agent 自动生成 Skill 时写入双分区 description

- GIVEN Agent 完成一个多步骤任务后决定沉淀为 Skill
- WHEN Agent 写入 SKILL.md frontmatter 的 `description` 字段
- THEN description MUST 包含功能摘要 + "Use when:" 分区 + "NOT for:" 分区
- AND 总长度 ≤ 200 字符（原限制为 120）

#### Scenario: 用户主动创建 Skill 时引导双分区

- GIVEN 用户触发 skill-creator Skill
- WHEN Agent 引导用户定义 description
- THEN Agent MUST 询问明确的排除场景（"什么情况下不应该用这个 Skill？"）
- AND Agent 将用户的回答编码进 "NOT for:" 分区

---

### Requirement: scripts/ 用于预先编写的可复用脚本

当 Skill 的执行逻辑需要特定的脚本时，该脚本 SHOULD 以完整可执行文件的形式存放在 `scripts/` 目录中，而非以"模板"形式内联在 SKILL.md 正文里。

#### Scenario: SKILL.md 正文不内联超过 50 行的脚本

- GIVEN 一个 Skill 的核心执行逻辑需要一个 Python 脚本
- WHEN 脚本行数超过 50 行
- THEN 该脚本 MUST 作为独立文件存放在 `scripts/` 目录
- AND SKILL.md 正文仅引用脚本路径，如 `scripts/analyze.py`
- AND SKILL.md 说明脚本的调用方式和参数

#### Scenario: scripts/ 中的脚本接受命令行参数

- GIVEN `scripts/` 目录下存在一个 Python 脚本
- WHEN Agent 执行该脚本
- THEN 该脚本 SHOULD 通过 `argparse` 接收参数（而非依赖脚本内硬编码路径）
- AND 脚本 MUST 可直接用 `python scripts/xxx.py --arg value` 调用

---

### Requirement: SKILL.md 正文长度控制

为保证 Progressive Disclosure 有效运作，SKILL.md 正文（frontmatter 之外部分）SHOULD 不超过 300 行。

#### Scenario: 正文接近限制时拆分到 references/

- GIVEN 一个 Skill 的 SKILL.md 正文超过 200 行
- WHEN Agent 编写或更新该 Skill
- THEN Agent SHOULD 将详细的域知识、参考表格、备用方案等内容拆分到 `references/` 目录
- AND SKILL.md 保留核心工作流和指向 references/ 的跳转链接

---

## MODIFIED Requirements

### Requirement: Skill description 长度限制（原 ≤120 字符，改为 ≤200 字符）

**原规格**：description ≤ 120 字符，LLM 路由用

**修改后**：description ≤ 200 字符，以容纳 "Use when" + "NOT for" 双分区

**修改理由**：加入 NOT for 分区后原限制过短，无法容纳完整语义。

#### Scenario: description 超出新限制时的处理

- GIVEN Agent 生成的 description 超过 200 字符
- WHEN Agent 检查 description 长度
- THEN Agent MUST 压缩语言，而非省略 "NOT for:" 分区

---

### Requirement: skill-creator Skill 使用范围扩展

**原规格**：skill-creator 仅指导创建新 Skill（目录结构、frontmatter）

**修改后**：skill-creator 指导完整的 Skill 生命周期，包括：
1. 澄清触发场景与排除场景
2. 规划 scripts/references/assets 三层内容
3. 创建 SKILL.md（包含双分区 description）
4. 将重复逻辑提取到 `scripts/`
5. 对已有 Skill 进行审查和改进

#### Scenario: 审查现有 Skill 时检查双分区

- GIVEN 用户要求审查或改进一个现有 Skill
- WHEN Agent 读取该 Skill 的 SKILL.md
- THEN Agent MUST 检查 description 是否包含 "NOT for:" 分区
- AND 如缺少，Agent MUST 主动询问用户并补充

#### Scenario: 创建新 Skill 时的澄清流程

- GIVEN 用户要求创建一个新 Skill（例如"做一个处理 PDF 的 skill"）
- WHEN Agent 开始 skill-creator 流程
- THEN Agent MUST 在创建任何文件之前，先确认：
  - 1-3 个典型使用场景（用来写 "Use when:"）
  - 1-2 个明确排除场景（用来写 "NOT for:"）
- AND Agent 才开始分析 scripts/references/assets 规划

---

## 不变的现有规格

以下规格保持不变：

- Skill name: 小写字母+数字+连字符，≤64 字符
- 目录名 MUST 与 `name` 字段一致
- `scripts/` 中脚本 MUST 遵守 Windows 兼容规则（不用 heredoc、路径用正斜杠）
- PRC 镜像规则（pip/npm/conda/go 使用国内镜像）
- Progressive Disclosure 三层模型（元数据 → SKILL.md 正文 → 资源文件）
