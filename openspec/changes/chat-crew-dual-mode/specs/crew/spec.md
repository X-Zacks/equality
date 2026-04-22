# Delta Spec: Crew Template

> **Delta Type**: ADDED
> **Base Spec**: 无（新模块）

---

## ADDED Requirements

### Requirement: Crew Template CRUD

系统 MUST 支持 Crew Template 的创建、读取、更新和删除。

#### Scenario: 创建 Crew Template

- GIVEN 用户在 Crew 管理页填写名称、描述并勾选 Skills
- WHEN 用户点击保存
- THEN 系统 MUST 持久化 Crew Template 到 `%APPDATA%/Equality/crews/`
- AND 新 Crew 立即出现在左侧栏列表中

#### Scenario: Crew Template 绑定 Skills

- GIVEN 一个 Crew Template 绑定了 `skillNames: ['react-dev', 'git-workflow']`
- WHEN 用户以此 Crew 开始会话
- THEN System Prompt 中 MUST 仅注入这些 Skill 的索引，NOT 全量 Skills

### Requirement: Crew Template 可配置 System Prompt

Crew Template MAY 包含 `systemPromptExtra` 字段。

#### Scenario: 自定义 System Prompt 生效

- GIVEN Crew Template 设置了 `systemPromptExtra: "你是一个严格的代码审查者"`
- WHEN 以此 Crew 开始会话
- THEN System Prompt MUST 在默认 prompt 后追加此文本
