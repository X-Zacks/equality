# Delta Spec: Desktop — Session 树形 UI + Diff 预览

> 修改 `desktop` 前端。新增树形会话面板、进度指示和 Diff 预览组件。

---

## ADDED Requirements

### Requirement: Session 树形视图

系统 SHALL 提供 `SessionTreeView` 组件，替代当前的扁平会话列表。

UI 结构：
```
SessionPanel
├─ SessionTreeView
│   ├─ 📋 XX 系统开发（3/5 已完成）    ← 有子 Agent 的会话（可展开）
│   │   ├─ 📐 [架构] 系统架构设计 ✅    ← 子 Agent（缩进）
│   │   ├─ 💻 [开发] Phase 1 实现 🔄    ← 运行中
│   │   ├─ 🧪 [测试] Phase 1 测试 ⏳    ← 等待中
│   │   └─ 📝 [审查] 代码审查 ⏳        ← 等待中
│   ├─ 💬 日常闲聊                       ← 无子 Agent（普通会话）
│   └─ 🐛 修复登录 bug                   ← 普通会话
└─ 按日期分组保留（今天/昨天/...）
```

行为要求：
- 有子 Agent 的会话 MUST 可展开/折叠（默认展开）
- 子 Agent 会话 MUST 显示角色图标（📐💻🧪📝）
- 子 Agent 会话 MUST 显示状态指示（✅🔄⏳❌）
- 点击子 Agent 会话 SHOULD 在 Chat 区域展示其对话记录（只读模式）
- 父会话标题后 MUST 显示进度摘要（如 "3/5 已完成"）

#### Scenario: 展开折叠
- GIVEN 一个有 3 个子 Agent 的会话
- WHEN 用户点击展开箭头
- THEN 显示 3 个缩进的子会话项
- WHEN 用户再次点击
- THEN 子会话项收起

#### Scenario: 状态实时更新
- GIVEN 一个子 Agent 正在运行（🔄）
- WHEN 子 Agent 完成
- THEN 状态指示从 🔄 变为 ✅
- AND 父会话进度摘要更新

#### Scenario: 点击查看子对话
- GIVEN 用户点击子 Agent 会话
- WHEN 切换到该会话
- THEN Chat 区域显示子 Agent 的对话记录
- AND 输入框显示 "只读模式" 提示（子 Agent 对话不可干预）

#### Scenario: 普通会话不受影响
- GIVEN 没有子 Agent 的普通会话
- WHEN 显示在列表中
- THEN 与当前行为一致（标题 + 时间 + 删除按钮）
- AND 无展开箭头

---

### Requirement: Session Key 解析

系统 SHALL 提供 `parseSessionHierarchy()` 工具函数。

```typescript
interface SessionTreeNode {
  key: string
  title: string
  parentKey?: string
  role?: AgentRole
  state?: TaskState
  children: SessionTreeNode[]
  depth: number
}

function parseSessionHierarchy(sessions: SessionListItem[]): SessionTreeNode[]
```

解析规则：
- session key 包含 `::sub::` 的，parentKey = key.split('::sub::')[0]（取第一段）
- 深度 = key 中 `::sub::` 出现的次数
- 顶层节点（无 `::sub::`）作为树根

#### Scenario: 单层子 Agent
- GIVEN sessions 包含:
  - `agent:main:desktop:default:direct:123` (parent)
  - `agent:main:desktop:default:direct:123::sub::abc` (child)
- WHEN `parseSessionHierarchy()` 被调用
- THEN 返回 1 个树根，有 1 个 child

#### Scenario: 多层嵌套
- GIVEN sessions 包含:
  - `agent:...123` (depth 0)
  - `agent:...123::sub::abc` (depth 1)
  - `agent:...123::sub::abc::sub::def` (depth 2)
- WHEN `parseSessionHierarchy()` 被调用
- THEN 返回树：根 → abc → def

---

### Requirement: 角色图标组件

系统 SHALL 提供 `RoleIcon` 组件，根据角色显示图标。

| 角色 | 图标 | 颜色 |
|------|------|------|
| supervisor | 📋 | blue |
| architect | 📐 | purple |
| developer | 💻 | green |
| tester | 🧪 | orange |
| reviewer | 📝 | gray |
| (无角色) | 💬 | default |

#### Scenario: 已知角色
- GIVEN role = 'developer'
- WHEN `RoleIcon` 渲染
- THEN 显示 💻 图标，绿色

#### Scenario: 未知角色
- GIVEN role = undefined
- WHEN `RoleIcon` 渲染
- THEN 显示 💬 图标，默认颜色

---

### Requirement: 状态徽标组件

系统 SHALL 提供 `StatusBadge` 组件，根据任务状态显示指示器。

| 状态 | 图标 | 颜色 |
|------|------|------|
| running | 🔄 | blue (脉动动画) |
| completed / succeeded | ✅ | green |
| failed / exhausted | ❌ | red |
| pending / queued | ⏳ | gray |
| cancelled | 🚫 | gray |
| skipped | ⏭️ | yellow |

#### Scenario: 运行中动画
- GIVEN state = 'running'
- WHEN `StatusBadge` 渲染
- THEN 显示 🔄 带脉动 CSS 动画

---

### Requirement: 任务进度条组件

系统 SHALL 提供 `TaskProgressBar` 组件，显示 Plan 整体进度。

```
┌─────────────────────────────────────────┐
│ 📋 XX 系统开发                          │
│ ████████████░░░░░░░░░ 60% (3/5)        │
│ 运行中: Phase 2 开发 | 预计剩余: ~8 min │
└─────────────────────────────────────────┘
```

#### Scenario: 正常进度
- GIVEN Plan 有 5 个节点，3 个已完成
- WHEN `TaskProgressBar` 渲染
- THEN 进度条显示 60%
- AND 文本显示 "3/5"

#### Scenario: 全部完成
- GIVEN Plan 所有节点已完成
- WHEN `TaskProgressBar` 渲染
- THEN 进度条 100%，绿色
- AND 文本显示 "已完成 ✅"

---

### Requirement: Diff 预览组件

系统 SHALL 提供 `DiffPreview` 组件，在文件写入前展示变更差异。

```
┌──────────────────────────────────────────┐
│ 📄 src/auth/login.ts                     │
│ ┌──────────────────┬──────────────────┐  │
│ │ - function login  │ + function login │  │
│ │ -   const old     │ +   const new    │  │
│ │                   │ +   // added     │  │
│ └──────────────────┴──────────────────┘  │
│              [Accept ✅]  [Reject ❌]    │
└──────────────────────────────────────────┘
```

行为要求：
- MUST 检测 Chat 中 write_file / edit_file / apply_patch 工具调用
- MUST 展示原文件内容 vs 新内容的 diff
- MUST 提供 Accept / Reject 按钮
- SHOULD 支持 auto-approve 模式（跳过预览直接写入）
- SHOULD 对新文件（不存在的）只显示新内容（全绿）

#### Scenario: 修改现有文件
- GIVEN Agent 调用 write_file 修改 `src/auth.ts`
- WHEN DiffPreview 渲染
- THEN 左侧显示原内容，右侧显示新内容
- AND 差异行高亮（红=删除，绿=新增）

#### Scenario: 创建新文件
- GIVEN Agent 调用 write_file 创建 `src/new-module.ts`（文件不存在）
- WHEN DiffPreview 渲染
- THEN 左侧为空
- AND 右侧显示全部新内容（全绿）

#### Scenario: Accept
- GIVEN DiffPreview 显示中
- WHEN 用户点击 Accept
- THEN 文件被实际写入
- AND DiffPreview 关闭

#### Scenario: Reject
- GIVEN DiffPreview 显示中
- WHEN 用户点击 Reject
- THEN 文件不被写入
- AND Agent 收到 "用户拒绝了此文件变更" 的 tool_result

#### Scenario: Auto-approve 模式
- GIVEN 设置中开启了 auto-approve
- WHEN Agent 调用 write_file
- THEN 直接写入，不弹出 DiffPreview
- AND Chat 中显示简化的变更摘要
