# Design: Project Dev Workflow Skill

## Skill 定位

- **触发场景**：用户说"帮我做一个 XX 系统/功能/项目"、"我想开发 XX"、"帮我写个 XX"
- **排除场景**：单文件修改、bug fix、代码解释、单次脚本任务

## 工作流状态机

```
NEW_REQUEST
    ↓ (Agent 检测到项目开发意图)
CLARIFY          ← 问 3-5 个需求问题
    ↓ (用户回答后)
SPEC_WRITE       ← 生成 OpenSpec 目录 + 文件
    ↓
SPEC_CONFIRM     ← 展示 spec 摘要，等用户确认
    ↓ (用户说"开始"/"确认"/"ok")
PHASE_EXECUTE    ← 执行当前 Phase 的所有 tasks
    ↓ (Phase 完成)
PHASE_CHECKPOINT ← 输出完成摘要，更新 tasks.md checkbox，询问继续
    ↓ (用户说"继续")
PHASE_EXECUTE    ← 执行下一 Phase
    ...
    ↓ (所有 Phase 完成)
DONE
```

## OpenSpec 目录规范

生成路径：`<workspaceDir>/openspec/changes/<feature-name>/`

```
<feature-name>/
  proposal.md          ← 需求 + 用户故事 + 验收标准
  design.md            ← 技术选型 + 架构图（文字版）+ 数据流
  tasks.md             ← Phase 分解，每个 task 用 checkbox
  specs/
    api/
      spec.md          ← 接口列表（method、path、request、response）
    data/
      spec.md          ← 数据模型定义
    ui/
      spec.md          ← 页面/组件列表（如有前端）
```

## tasks.md Checkpoint 格式

```markdown
# Tasks: <feature-name>

> 最后更新：2026-03-23 | 当前进度：Phase 2 / 4

## Phase 1：后端基础框架 ✅ 已完成
- [x] 1.1 初始化项目结构
- [x] 1.2 数据库建模
- [x] 1.3 基础 CRUD 接口

## Phase 2：核心业务逻辑 🔄 进行中
- [x] 2.1 用户认证模块
- [ ] 2.2 权限控制
- [ ] 2.3 业务规则实现

## Phase 3：前端界面
- [ ] 3.1 ...

## Phase 4：集成测试 + 文档
- [ ] 4.1 ...
```

## 需求澄清问题模板

Agent 应在首次接收项目请求后，一次性问以下 3-5 个问题（根据已知信息动态选择）：

1. **目标用户**：这个系统/功能主要给谁用？（内部工具？用户量级？）
2. **技术栈**：前端用什么（React/Vue/原生）？后端语言（Python/Node/Rust）？数据库？
3. **核心功能**：最核心的 3 个功能是什么？其他都可以暂时不做。
4. **部署环境**：运行在哪里？（本地/云服务器/Docker？Windows/Linux？）
5. **时间预期**：是快速原型（能跑就行）还是生产就绪（需要完整错误处理和测试）？

每次最多问 5 个，已经明确的不问。

## Phase 推进节奏

- 每次对话执行 **1 个 Phase**（约 20-40 个工具调用）
- Phase 完成后必须：
  1. 更新 `tasks.md` 中的 checkbox（bash 运行测试验证）
  2. 输出 `✅ Phase X 完成` 摘要（做了什么 + 遇到的问题 + 下一 Phase 预期）
  3. 询问"是否继续 Phase X+1？"
- 若单次对话工具调用接近上限（剩余 < 20 次），**主动停止**并输出 checkpoint

## memory_save 使用时机

以下情况 Agent 应调用 `memory_save`：
- Spec 生成完成后（保存 spec 路径 + feature 名）
- 每个 Phase 完成后（保存当前 Phase 编号 + 关键决策）
- 遇到需要用户决策的阻塞点时（保存阻塞原因）

保存内容格式：
```
[project-dev] feature=<name> phase=<n>/total=<total> status=<in-progress|blocked|done>
spec=<path-to-tasks.md>
last-action: <一句话描述>
```
