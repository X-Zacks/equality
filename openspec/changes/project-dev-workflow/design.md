# Design: Project Dev Workflow Skill

## Skill 定位

- **触发场景**：用户说"帮我做一个 XX 系统/功能/项目"、"我想开发 XX"、"帮我写个 XX"
- **排除场景**：单文件修改、bug fix、代码解释、单次脚本任务

## 工作流状态机

```
NEW_REQUEST
    ↓ (Agent 检测到项目开发意图)
CLARIFY          ← 多轮问答，每轮 3-5 个问题，覆盖不同维度
    ↓               首轮必问：工程目录路径
    ↓            ← 持续对话，直到用户说"可以开始了"
SPEC_WRITE       ← 在用户指定工程目录下生成 OpenSpec 目录 + 文件
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

生成路径：`<用户指定工程目录>/openspec/changes/<feature-name>/`

所有代码也写入同一工程目录，保持 spec 与代码同根：

```
<用户工程目录>/
  openspec/
    changes/<feature-name>/
      proposal.md
      design.md
      tasks.md
      specs/
        api/spec.md
        data/spec.md
        ui/spec.md    （如有前端）
  src/               ← 所有代码
  README.md
```

## memory_save checkpoint 格式

```markdown
[project-dev] feature=<name>
project-dir=<用户工程目录绝对路径>
phase=<当前Phase编号>/<总Phase数>
status=in-progress|blocked|done
spec=<工程目录>/openspec/changes/<name>/tasks.md
last-action: <一句话描述最后完成的操作>
blocking: <阻塞原因（如有）>
```

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

Agent 通过**多轮对话**持续澄清，直到用户说"可以开始了"为止。问题按 4 批优先级排列，每轮聚焦一个维度（3-5 个问题），根据用户回答动态追问。

**第一批（首轮必问）**：工程目录路径 / 目标用户 / 核心功能 / MVP 边界

**第二批**：技术栈（后端语言 / 前端 / 数据库 / 运行环境）

**第三批**：认证权限 / 外部集成 / 性能要求 / 质量要求

**第四批（复杂系统）**：数据规模 / 已有代码 / 参考系统

规则：**工程目录**首轮必须确认（所有 spec 和代码都写到这里），其他信息可逐轮补充。无问题数量上限。

## Phase 推进节奏

- 每次对话执行 **1 个 Phase**（约 20-40 个工具调用）
- Phase 完成后必须：
  1. 更新 `tasks.md` 中的 checkbox（bash 运行测试验证）
  2. 输出 `✅ Phase X 完成` 摘要（做了什么 + 遇到的问题 + 下一 Phase 预期）
  3. 询问"是否继续 Phase X+1？"
- 若单次对话工具调用接近上限（剩余 < 20 次），**主动停止**并输出 checkpoint

## memory_save 使用时机

以下情况 Agent 应调用 `memory_save`：
- Spec 生成完成后（保存工程目录 + spec 路径 + feature 名）
- 每个 Phase 完成后（保存当前 Phase 编号 + 关键决策）
- 遇到需要用户决策的阻塞点时（保存阻塞原因）

详见上方 **memory_save checkpoint 格式** 章节。
