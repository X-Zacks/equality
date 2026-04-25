# Proposal: 修复 Skills 路径 & 增强 Frontmatter

> 日期：2026-04-25

## 问题概述

### 问题 1：Agent 创建 Skill 保存到错误目录

Agent 通过 `@skill-creator` 创建 Skill 时，system-prompt 指向 `getBundledSkillsDir()`（只读内置目录），被 path-guard 沙箱拦截后落入 `<workspaceDir>/.equality/skills/`（synced-bundled 目录），而非设计中的 `managed` 目录。

**根因**：`system-prompt.ts` L39 使用 `getBundledSkillsDir()` 作为 Skill 创建目标。

### 问题 2：Frontmatter 字段过于简陋

当前 `SkillMetadata` 仅支持 `name`、`description`、`category` 等基本字段。对比 Hermes-Agent 和 OpenClaw，缺少 `version`、`tags`、`platforms`、`author` 等管理字段。

## 目标

1. 修复 Skill 创建路径：Agent 创建 → `managed` 目录；项目级 → `project-agents` 目录
2. path-guard 放行 `%APPDATA%/Equality/` 目录
3. 增强 frontmatter 支持：添加 `version`、`tags`、`author`、`platforms` 字段
4. 保持完全向后兼容（新字段均可选）

## 影响范围

| 文件 | 改动类型 | 风险 |
|------|----------|------|
| `agent/system-prompt.ts` | 路径变量 + prompt 文本 | 低 |
| `tools/builtins/path-guard.ts` | 新增白名单 | 低 |
| `skills/types.ts` | 新增可选字段 | 无（向后兼容）|
| `skills/frontmatter.ts` | 解析新字段 | 低 |
| `skills/skill-creator/SKILL.md` | 更新模板 | 无 |
