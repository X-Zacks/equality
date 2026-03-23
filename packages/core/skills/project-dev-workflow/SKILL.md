---
name: project-dev-workflow
description: '完整项目开发工作流：需求澄清 → OpenSpec 规范 → 分 Phase 长时间开发 → 跨 session 续接。Use when: 用户想开发一个完整项目/功能/系统，需要从需求到代码完整交付。NOT for: 单文件修改、bug fix、代码解释、一次性脚本任务。'
---

## 工作流概述

当用户说"帮我做一个 XX 系统/功能/项目"时，按以下 5 个阶段推进：

```
需求澄清 → 写 OpenSpec → 用户确认 → 分 Phase 编码 → 跨 session 续接
```

---

## 阶段 1：需求澄清

**在调用任何工具之前**，根据用户描述，从以下问题中选 3-5 个**尚未明确**的问题一次性提问：

1. **目标用户**：主要给谁用？内部工具还是面向用户产品？预期使用量？
2. **技术栈**：
   - 后端：Python / Node.js / Go / Rust / Java？
   - 前端：React / Vue / 原生 HTML？或纯后端无前端？
   - 数据库：SQLite / PostgreSQL / MySQL / MongoDB / 无？
3. **核心功能**：最不可缺的 3 个功能是什么？哪些可以 MVP 先不做？
4. **部署环境**：本地运行 / 云服务器 / Docker / Tauri 桌面应用？操作系统？
5. **质量要求**：快速原型（跑起来即可）还是生产就绪（需要测试、错误处理、日志）？

**规则**：
- 已经明确的信息不重复问
- 最多问 5 个，一次性全部问完，不要轮流问
- 如果用户提供的信息已经足够，直接进入阶段 2

---

## 阶段 2：生成 OpenSpec

用户回答后，用 `write_file` 在以下路径创建完整 OpenSpec 目录：

```
<workspaceDir>/openspec/changes/<feature-name>/
  proposal.md     ← 需求描述 + 用户故事 + 验收标准
  design.md       ← 技术选型 + 架构 + 关键决策
  tasks.md        ← Phase 分解（用 checkbox）
  specs/
    api/spec.md   ← 接口清单（如有后端 API）
    data/spec.md  ← 数据模型
    ui/spec.md    ← 页面/组件清单（如有前端）
```

### proposal.md 模板

```markdown
# Proposal: <功能名>

## 背景与目标
[用户的原始需求 + 为什么要做]

## 用户故事
- US-1 ...
- US-2 ...

## 验收标准
- [ ] ...
- [ ] ...

## 不在范围内
- ...
```

### tasks.md 模板

```markdown
# Tasks: <功能名>

> 最后更新：<日期> | 当前进度：尚未开始

## Phase 1：<后端/基础框架>
- [ ] 1.1 ...
- [ ] 1.2 ...

## Phase 2：<核心逻辑>
- [ ] 2.1 ...

## Phase 3：<前端/集成>
- [ ] 3.1 ...

## Phase 4：<测试 + 文档>
- [ ] 4.1 运行测试套件
- [ ] 4.2 更新 README
```

**Phase 划分原则**：
- 每个 Phase 约 20-40 个工具调用（约 1 次对话）
- Phase 1 优先建立可运行的骨架（哪怕功能不完整）
- 最后一个 Phase 必须包含测试和文档

---

## 阶段 3：用户确认

生成 Spec 后，输出以下摘要等待确认：

```
📋 Spec 已生成：openspec/changes/<feature>/

**项目概述**：[一句话描述]

**技术栈**：[后端] + [前端] + [数据库]

**开发计划**（共 N 个 Phase）：
- Phase 1：[描述] → 预计 XX 个文件
- Phase 2：[描述]
- ...

**第一个 Phase 将完成**：[具体内容]

回复"开始"或"确认"启动 Phase 1，或提出修改意见。
```

---

## 阶段 4：分 Phase 编码

### 每个 Phase 的执行规则

1. **开始前**：读取 `tasks.md`，确认当前 Phase 的所有 tasks
2. **执行中**：
   - 写代码用 `write_file`（新文件）或 `edit_file`（修改已有文件）
   - 每写完一个模块，立即用 `bash` 运行（编译检查 / 单元测试）
   - 发现依赖缺失：用 `bash` 安装，不要停下来问用户
3. **结束时**（必须做）：
   - 用 `edit_file` 更新 `tasks.md`：已完成的 task 改为 `[x]`，更新进度行
   - 调用 `memory_save` 保存 checkpoint（见格式）
   - 输出 Phase 完成摘要

### Phase 完成摘要格式

```
✅ Phase X 完成

**做了什么**：[一句话]

**已完成**：
- [关键文件或功能]

**遇到的问题**（如有）：[简述 + 如何解决的]

**下一 Phase（Phase X+1）**：[描述内容]

回复"继续"开始 Phase X+1。
```

### 工具调用上限保护

若剩余工具调用次数 < 20（通过已使用次数估算），**主动停止**当前 Phase：

```
⚠️ 本次对话工具调用次数接近上限，主动暂停。

**已完成**：[已做的 tasks，打 ✓]
**未完成**：[剩余 tasks]

已保存进度到 tasks.md。下次对话说"继续 Phase X"即可续接。
```

### memory_save checkpoint 格式

```
[project-dev] feature=<name>
phase=<当前Phase编号>/<总Phase数>
status=in-progress|blocked|done
spec=openspec/changes/<name>/tasks.md
last-action: <一句话描述最后完成的操作>
blocking: <阻塞原因（如有）>
```

---

## 阶段 5：跨 session 续接

当用户在新 session 中说"继续上次的项目"/"继续开发"/"继续 Phase X" 时：

1. 用 `memory_search` 搜索 `[project-dev]` 找到最近的 checkpoint
2. 用 `read_file` 读取 `tasks.md`，找到第一个未完成的 Phase
3. 输出状态摘要：

```
📌 续接上次项目：<feature-name>

**当前进度**：Phase X / 总 N（<描述>）
**待完成**：
- [ ] X.Y ...
- [ ] X.Z ...

继续执行 Phase X？
```

4. 用户确认后继续执行，遵循阶段 4 的规则

---

## 注意事项

- **Windows PowerShell 环境**：`bash` 工具实际执行 PowerShell，多行脚本必须先 `write_file` 保存再执行
- **大型前端项目**：如果有 `npm install`，放在 Phase 1 最开始做，后续 Phase 不重复安装
- **数据库迁移**：每次 schema 变更，在 `specs/data/spec.md` 更新数据模型定义
- **测试优先**：Phase 4（最终测试）不是可选的，每个核心模块必须有至少一个可运行的验证步骤
