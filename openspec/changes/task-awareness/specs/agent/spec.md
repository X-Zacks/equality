# Spec: 任务感知

## Overview

Agent 在任务执行的三个关键节点表现出任务感知能力：执行前澄清歧义、长任务前输出计划、执行后输出结构化摘要。

---

## Requirements

### Requirement: 主动澄清

当用户请求存在关键歧义或必要参数缺失时，Agent MUST 在调用任何工具之前提出澄清问题。

澄清问题 MUST NOT 超过 2 个。

Agent MUST NOT 询问可以通过工具自行探查的信息（例如目录结构、文件是否存在）。

如果请求虽然宽泛但有合理默认解释，Agent MUST NOT 打断用户，直接执行默认解释并在开始时说明假设。

#### Scenario: 请求目标不明确
- GIVEN 用户发送"帮我整理一下项目"
- WHEN Agent 判断"整理"含义不明（代码/文档/Git/目录结构均可）
- THEN Agent 在调用任何工具前提出澄清："请问您希望整理哪方面？例如：代码结构、文档、Git 历史、还是目录组织？"
- AND Agent NOT 调用任何工具直到用户回复

#### Scenario: 关键路径缺失
- GIVEN 用户发送"帮我生成报告"
- AND 对话历史中没有提到过任何数据源文件
- WHEN Agent 判断无法合理推断数据来源
- THEN Agent 询问数据源路径，而不是猜测或报错

#### Scenario: 可合理推断时不打断
- GIVEN 用户发送"帮我整理一下桌面上的文档"
- WHEN Agent 可以通过 list_directory 探查桌面内容
- THEN Agent NOT 询问"桌面在哪里"，直接探查后执行
- AND Agent 在开始时说明"我来看看桌面上有什么文件"

#### Scenario: 有合理默认时直接执行
- GIVEN 用户发送"帮我分析一下这个项目"
- AND 当前工作目录是一个代码项目
- WHEN Agent 可以合理理解为"分析代码项目结构和质量"
- THEN Agent NOT 询问，直接开始分析并在开头说明"我来分析当前目录的项目结构"

---

### Requirement: 执行前计划

对于预计需要 3 个或更多工具调用步骤的任务，Agent MUST 在调用第一个工具前输出执行计划。

计划 MUST 以 `📋 执行计划：` 开头，每步一行编号列表。

每步描述 MUST 简洁（不超过一行），MUST NOT 包含技术细节或工具参数。

Agent MUST NOT 等待用户确认计划后再执行（计划是通知，不是审批）。

#### Scenario: 多步骤任务输出计划
- GIVEN 用户发送"帮我分析这个月的销售数据并生成 HTML 报告"
- WHEN Agent 判断需要：读取数据 → 处理分析 → 生成报告，共 3+ 步
- THEN Agent 在第一个工具调用前输出：
  ```
  📋 执行计划：
  1. 读取销售数据文件，确认数据结构
  2. 用 Python 脚本处理和分析数据
  3. 生成 HTML 报告并写入目标路径
  ```
- THEN Agent 立即开始执行，NOT 等待用户回复

#### Scenario: 简单任务不输出计划
- GIVEN 用户发送"帮我查一下当前目录有哪些 Python 文件"
- WHEN Agent 判断只需要 1 个工具调用（list_directory 或 bash）
- THEN Agent NOT 输出执行计划，直接执行

#### Scenario: 计划与实际执行可以不完全一致
- GIVEN Agent 输出了 3 步计划
- WHEN 执行中发现需要额外步骤
- THEN Agent 可以增加步骤，NOT 需要重新输出更新后的计划
- AND Agent 在最终摘要中反映实际执行的内容

---

### Requirement: 执行后摘要

当本次交互调用了 2 个或更多工具后，Agent MUST 以结构化摘要作为最终回复，而不是逐步描述执行过程。

摘要 MUST 包含：完成状态标识（✅ 或 ⚠️）、核心结果（做了什么、产出在哪里）。

当有值得注意的问题时，摘要 SHOULD 包含注意事项。

摘要 MUST NOT 逐步列举每个工具调用的过程（"第1步我执行了…第2步我执行了…"）。

#### Scenario: 多步骤任务正常完成
- GIVEN Agent 执行了 5 个工具调用完成数据分析任务
- WHEN 所有工具调用成功
- THEN Agent 输出摘要，格式类似：
  ```
  ✅ 完成

  **做了什么**：生成了 2024 年 3 月销售分析报告

  **结果**：
  - 报告路径：C:/reports/2024-03.html
  - 数据范围：3 月 1 日～31 日，共 1,203 条记录
  - 关键发现：华东区环比增长 23%
  ```
- AND 摘要 NOT 包含"第1步我读取了文件…"这类流水账

#### Scenario: 执行中遇到部分问题
- GIVEN Agent 执行任务时某步遇到非致命错误（如部分数据缺失）
- WHEN 任务整体完成但有瑕疵
- THEN 摘要以 ⚠️ 开头，并在注意事项中说明问题
- AND 结果仍然描述实际产出

#### Scenario: 纯对话不触发摘要
- GIVEN 用户问"Python 的 list 和 tuple 有什么区别"
- WHEN Agent 直接用文字回答，未调用任何工具
- THEN Agent NOT 输出"✅ 完成"格式的摘要，正常回答即可

#### Scenario: 单工具调用不触发完整摘要
- GIVEN 用户发送"帮我查一下当前目录的文件"
- WHEN Agent 调用 1 个 list_directory 工具
- THEN Agent 可以用自然语言描述结果，NOT 强制使用摘要格式

---

## Non-Requirements（此版本不做）

- 结构化规划阶段（独立的规划 LLM 调用）
- 用户确认计划后再执行的审批流程
- 任务进度的实时 UI 进度条
- 强制阻塞等待澄清的硬逻辑（Agent 自行判断）
- 任务失败时的自动重试计划
