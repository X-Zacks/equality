# Proposal: Skill System v2

## 背景与问题

当前 Skill 生成系统存在三个核心问题，阻碍 Skill 的质量和可复用性：

### 问题 1：description 缺乏"NOT for"边界

当前生成的 SKILL.md 描述仅说明"可以做什么"，缺少使用边界。这导致 Agent 在模糊场景下触发错误的 Skill，或同时触发多个相互竞争的 Skill。

**示例**（当前）：
```
description: 对同一目录下两个不同季度的费用分摊 Excel 表进行多维度汇总对比
```

**问题**：任何 Excel 对比任务都可能误触发此 Skill，即使场景完全不同。

### 问题 2：可复用脚本内联在 SKILL.md 正文中

当前 Agent 将 Python 脚本作为模板嵌在 SKILL.md 正文里（用 `{{参数}}` 占位符），每次使用时都需要重新生成脚本文件。这违背了 Progressive Disclosure 原则：

- SKILL.md 正文被大量脚本代码撑大（当前已达 358 行），消耗宝贵 context
- 每次执行都需要重新解析模板、替换占位符，容易出错
- 脚本无法独立测试和验证

### 问题 3：skill-creator/SKILL.md 指导缺失关键环节

当前 `skill-creator` Skill 没有充分引导 Agent 在创建技能时：
1. 主动问用户澄清 Skill 的触发场景与排除场景
2. 将可复用代码提取到 `scripts/` 目录，而非内联在正文
3. 在 description 中明确写出"NOT for"边界

---

## 目标

1. **强制 description 包含 "Use when" + "NOT for" 双分区**，提升 Skill 路由精度
2. **scripts/ 作为可复用脚本的规范存放位置**，复杂逻辑的 Python/JS 脚本预先写好放入 `scripts/`，SKILL.md 正文只保留引用
3. **更新 skill-creator/SKILL.md**，对齐 OpenClaw 6步骤流程，让 Agent 创建 Skill 时有更完整的指导

---

## 范围

| 变更 | 文件 | 影响 |
|------|------|------|
| Skill 沉淀指令更新 | `packages/core/src/agent/system-prompt.ts` | Agent 自动生成 Skill 时的行为 |
| skill-creator/SKILL.md 重写 | `packages/core/skills/skill-creator/SKILL.md` | 用户主动创建 Skill 时的指导 |

---

## 方案概述

### 方案 A（本次采用）：渐进调整 + 对齐 OpenClaw 设计

1. 修改 `system-prompt.ts` 中的"Skill 沉淀"指令块，强制要求 description 格式为：
   ```
   [功能描述]。Use when: [触发场景]。NOT for: [排除场景]。
   ```
2. 修改 `skill-creator/SKILL.md`，融合 OpenClaw 的设计原则：
   - Progressive Disclosure 三层模型
   - scripts/references/assets 各自职责与使用时机
   - description 双分区写法
   - 优先将重复逻辑提取到 `scripts/`

### 方案 B（未采用）：引入 init_skill.py / package_skill.py 脚手架

OpenClaw 有完整的 Python 脚本来初始化和打包 Skill。此方案工作量大，且目前 Equality 的 Skill 是由 Agent 动态创建的（不是人类开发者手工构建），不一定适合引入命令行脚手架。留作未来参考。

---

## 不在本次范围内

- 修改现有已生成 Skill 的 description（量大，靠自然演化）
- 引入 `.skill` 打包格式
- init_skill.py / package_skill.py 脚手架脚本
