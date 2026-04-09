# 多 Agent 工作区与会话架构分析

> 分析日期：2026-04-09  
> 状态：架构分析 + 可行性评估  
> 范围：AGENTS.md 生命周期、会话-Agent 映射、跨 Agent 协作

---

## 1. 当前架构现状

### 1.1 AGENTS.md / SOUL.md 等引导文件的生命周期

```
Core 启动
  ↓
ensureWorkspaceBootstrap(workspaceDir)
  ↓
检查 BOOTSTRAP_FILENAMES 是否存在
  ↓
┌─ 全新工作区（无任何文件）：种下全部 6 个文件（含 BOOTSTRAP.md 引导脚本）
└─ 已有内容：跳过 BOOTSTRAP.md，只补种缺失的文件（flag: 'wx' 不覆盖）
  ↓
每次对话发起时 → loadWorkspaceBootstrapFiles(workspaceDir)
  ↓
将 AGENTS.md / SOUL.md / USER.md / IDENTITY.md / TOOLS.md 注入到 system prompt 中
  ↓
所有对话共享同一个 workspaceDir → 所有 Agent 读同一份引导文件
```

**关键事实：**

| 属性 | 现状 |
|------|------|
| AGENTS.md 生成时机 | Core 首次启动时种下模板，后续不再覆盖 |
| 是否每次新对话重新生成 | ❌ 不会。所有对话共享同一份文件 |
| 工作区目录结构 | 全局单一目录：`~/Equality/workspace/` 或 `WORKSPACE_DIR` 指定 |
| 每个对话是否有独立目录 | ❌ 没有。所有对话读写同一目录 |
| session 存储 | `%APPDATA%/Equality/sessions/{key}.json`（按 sessionKey 分文件） |
| 新对话是否对应新 Agent | ❌ 不是。新对话 = 新 session（消息列表），但复用同一个 system prompt 模板 |

### 1.2 Session vs Agent — 当前的对应关系

```
Session ≠ Agent

Session = 一个 sessionKey + 一段消息历史 + 一个 AbortController
Agent = 没有独立实体！它只是：system prompt + 工具列表 + session 的组合
```

当前的 "Agent" 本质是**临时的运行时组合**——每次 `runAttempt()` 调用时从几个全局单例中拼装：

```typescript
runAttempt({
  sessionKey: 'agent:main:desktop:default:direct:xxx',
  workspaceDir: getWorkspaceDir(),          // 全局共享
  toolRegistry: globalToolRegistry,          // 全局共享
  skills: globalSkills,                      // 全局共享
  contextEngine: defaultContextEngine,       // 全局共享
})
```

### 1.3 子 Agent（SubagentManager）的现状

子 Agent 是**当前最接近"独立 Agent"的设计**：

- 有独立的 sessionKey（`parentKey::sub::taskId`）
- 有独立的消息历史
- 可以有自己的 role identity（通过 N5 AgentRoleConfig）
- 有工具白名单/黑名单约束

**但它的限制是：**
- 只能由父 Agent 通过 `subagent_spawn` 工具创建
- 父 Agent 结束后子 Agent 也被清理
- 不能由用户直接在 UI 上创建
- 不能跨会话存活——没有持久化的 Agent 实体

---

## 2. 用户设想的模型

用户描述的理想架构：

```
用户新建对话 A → 对应 Agent-A（"前端开发 Agent"）
用户新建对话 B → 对应 Agent-B（"后端开发 Agent"）
用户新建对话 C → 对应 Agent-C（"架构师 Agent"）

Agent-C 可以调用 Agent-A 和 Agent-B 协作完成一个复杂任务
每个 Agent 有自己的工作目录、记忆、配置文件
```

### 与当前架构的 Gap 分析

| 维度 | 当前状态 | 理想状态 | Gap |
|------|---------|---------|-----|
| Agent 实体 | 不存在，临时拼装 | 持久化实体，有 ID、名称、角色 | 🔴 大 |
| Agent 工作区 | 全局共享一个目录 | 每个 Agent 独立子目录 | 🔴 大 |
| Agent 引导文件 | 全局共享 AGENTS.md | 每个 Agent 有独立的 IDENTITY.md | 🟡 中 |
| Agent 记忆 | 全局共享 SQLite | 每个 Agent 独立记忆空间 | 🟡 中 |
| Agent 工具集 | 全局共享 | 可按角色定制（N5 已有） | 🟢 小 |
| 跨 Agent 协作 | 仅限父→子 subagent | 任意 Agent 间可相互调用 | 🔴 大 |
| 用户创建 Agent | 不支持 | UI 上新建 + 配置 | 🟡 中 |
| Agent 持久化 | 不存在 | Agent 定义存盘，重启后恢复 | 🔴 大 |

---

## 3. 可行性方案：渐进式实现

### 方案哲学

**不推翻现有架构，而是在现有 Session + SubagentManager 上增加一层 Agent Registry。**

### 3.1 Phase O1 — AgentDefinition 持久化层

引入持久化的 Agent 定义，让"Agent"从运行时概念变为一等实体：

```typescript
interface AgentDefinition {
  /** 唯一标识（UUID 或用户指定） */
  id: string
  /** 用户可见名称 */
  name: string
  /** 角色（可选，映射到 N5 AgentRoleConfig） */
  role?: AgentRole
  /** 自定义身份描述（覆盖 role.identity） */
  identity?: string
  /** 工具白名单（覆盖 role.toolAllow） */
  toolAllow?: string[]
  /** 工具黑名单 */
  toolDeny?: string[]
  /** 加载的 Skills */
  skills?: string[]
  /** 独立工作子目录名（相对于全局 workspaceDir） */
  workspaceSuffix?: string
  /** 模型偏好（覆盖全局） */
  model?: string
  /** 创建时间 */
  createdAt: number
}
```

**存储**：`%APPDATA%/Equality/agents/{id}.json`（与 sessions 同级）

**影响范围**：
- 新增 `agent/agent-registry.ts`
- 改动最小——只是一个 CRUD 层，不影响现有 runAttempt 流程

### 3.2 Phase O2 — Session 绑定 Agent

扩展 Session 和新对话创建逻辑：

```
现在：                        改进后：
┌──────────┐                ┌──────────────────────┐
│ Session  │                │ Session              │
│  key     │                │  key                 │
│  messages│                │  messages            │
│          │                │  agentId: string?    │ ← 新增
└──────────┘                │  agentWorkspaceDir?  │ ← 新增（覆盖全局）
                            └──────────────────────┘
```

**Session Key 格式扩展**：

```
默认 Agent（无绑定）:  agent:main:desktop:default:direct:<ts>-<rand>
指定 Agent:           agent:<agentId>:desktop:default:direct:<ts>-<rand>
```

**新对话创建流程变化**：

```
用户点击 "+ 新对话"                    用户点击 "Agent-A" 下的 "+ 新对话"
         │                                        │
         ▼                                        ▼
newSessionKey('main')                   newSessionKey('my-frontend-agent')
session.agentId = null                  session.agentId = 'my-frontend-agent'
workspaceDir = 全局                      workspaceDir = 全局/agents/my-frontend-agent/
AGENTS.md = 全局版本                     AGENTS.md = Agent 专属版本
```

### 3.3 Phase O3 — Agent 独立工作区

每个 Agent 有独立子目录：

```
~/Equality/workspace/                    ← 全局（默认 Agent 使用）
  ├── AGENTS.md
  ├── SOUL.md
  ├── USER.md
  ├── IDENTITY.md
  └── agents/                            ← Agent 专属目录
      ├── frontend-dev/                  ← Agent "前端开发"
      │   ├── AGENTS.md                  ← 独立指令（自动种下）
      │   ├── IDENTITY.md               ← 独立身份
      │   └── context/                   ← Agent 自用文件
      ├── backend-dev/                   ← Agent "后端开发"
      │   ├── AGENTS.md
      │   └── ...
      └── architect/                     ← Agent "架构师"
          └── ...
```

**关键设计决策**：

| 决策点 | 选择 | 理由 |
|--------|------|------|
| Agent 间是否共享 USER.md | ✅ 是，全局 USER.md 仍然注入 | 用户身份是固定的，不随 Agent 变化 |
| Agent 间是否共享 SOUL.md | ❌ 否，每个 Agent 有自己的 | 不同 Agent 可能有不同的行为准则 |
| Agent 间是否共享 memory | 🟡 可选：全局搜索 + Agent 标签过滤 | memory_save 增加 `agentId` 字段，搜索时优先返回同 Agent 的 |
| Agent 间是否共享工具 | ✅ 是，但通过 N5 的 toolAllow/toolDeny 做定制 | 已有基础设施 |

### 3.4 Phase O4 — 跨 Agent 协作

**核心思路：将 SubagentManager 的 spawn 扩展为"调用已有 Agent"**

现有的 `subagent_spawn` 只能创建匿名的临时子 Agent。扩展后：

```typescript
// 现有：创建匿名子 Agent
subagent_spawn({ prompt: "...", role: "developer" })

// 新增：调用已有的持久化 Agent
agent_delegate({ 
  agentId: "my-frontend-agent",   // 调用已存在的 Agent
  task: "请实现用户列表页面",
  waitForResult: true              // 等待完成
})
```

**实现方式**：

```
Agent-C（架构师）发起 agent_delegate
  ↓
查找 AgentRegistry 中 id = "my-frontend-agent" 的 AgentDefinition
  ↓
创建子 session: agent:my-frontend-agent:desktop:delegate:<task_id>
  ↓
用 AgentDefinition 的 identity/toolAllow/skills 配置 runAttempt
  ↓
工作区目录 = 全局/agents/my-frontend-agent/
  ↓
结果返回给 Agent-C
```

**关键区别**：

| | 现有 subagent_spawn | 新增 agent_delegate |
|---|---|---|
| 被调用方 | 临时匿名 Agent（用完销毁） | 持久化 Agent（有名称、配置、历史） |
| 工作区 | 复用父 Agent 的目录 | 使用被调用 Agent 的独立目录 |
| 身份 | 由 role 参数决定 | 由 AgentDefinition 定义 |
| 记忆 | 共享全局 | Agent 独立 + 全局可搜 |
| 对话历史 | 父会话结束后清理 | 永久保存在 Agent 的 session 中 |

---

## 4. 实现路线图

### 第一步（小步验证）：AgentDefinition + UI 管理

**改动范围**：新增文件，几乎不改现有代码

```
新增文件：
  packages/core/src/agent/agent-registry.ts    ← CRUD
  packages/core/src/agent/agent-types.ts       ← 类型
  packages/desktop/src/AgentManager.tsx         ← UI 管理面板

改动文件：
  packages/core/src/index.ts                   ← 注册 REST 端点
  packages/desktop/src/App.tsx                 ← 左侧导航增加 Agent 入口
  packages/desktop/src/SessionPanel.tsx        ← 按 Agent 分组显示会话
```

**验证标准**：
- 用户可在 UI 中创建 / 编辑 / 删除 Agent
- 每个 Agent 可设置名称、角色、身份描述、工具白名单
- Agent 列表持久化到磁盘

### 第二步：Session-Agent 绑定 + 独立工作区

```
改动文件：
  packages/core/src/session/types.ts           ← Session 增加 agentId
  packages/core/src/context/default-engine.ts  ← assemble 时读 Agent 专属引导文件
  packages/core/src/agent/workspace-bootstrap.ts ← 支持 Agent 子目录
  packages/desktop/src/App.tsx                 ← newSessionKey 支持 agentId
```

**验证标准**：
- 在某个 Agent 下新建对话，该对话使用 Agent 独有的 AGENTS.md
- 不同 Agent 的对话互不影响
- 全局 USER.md 仍被所有对话读取

### 第三步：agent_delegate 工具 + 跨 Agent 协作

```
新增文件：
  packages/core/src/tools/builtins/agent-delegate.ts  ← 新工具
  
改动文件：
  packages/core/src/agent/subagent-manager.ts  ← 扩展 spawn 支持指定 agentId
```

**验证标准**：
- Agent-A 可以通过 `agent_delegate` 调用 Agent-B 完成子任务
- Agent-B 在自己的工作区中执行，结果返回给 Agent-A
- 多个 Agent 可组成协作链

---

## 5. 与现有 Phase N 的兼容性

| Phase N 成果 | 兼容性 | 说明 |
|-------------|--------|------|
| N1 PlanDAG | ✅ 完全兼容 | PlanDAG 的每个节点可以绑定不同的 agentId |
| N2 SubagentManager | ✅ 扩展兼容 | spawn 增加 `agentId` 参数即可 |
| N3 CodeIndexer | ✅ 完全兼容 | 索引范围可按 Agent 工作区目录限定 |
| N4 SessionTreeView | ✅ 自然扩展 | 树形列表的顶层节点改为 Agent 分组 |
| N5 RoleConfig | ✅ 直接复用 | AgentDefinition 的 role 直接映射到 RoleConfig |
| N6 Bootstrap/Snapshot | ✅ 完全兼容 | 按 Agent 目录独立 bootstrap |
| Memory 系统 | 🟡 需扩展 | memory_save 增加 agentId 字段，search 支持过滤 |

---

## 6. 架构决策记录

### Q1: AGENTS.md 是否每次新对话重新生成？

**答：不需要。** AGENTS.md 是 Agent 级别的配置，不是对话级别的。同一个 Agent 的所有对话共享同一份 AGENTS.md。Agent 可以在对话中通过 write_file 更新自己的 AGENTS.md（自我进化）。

### Q2: 工作目录是否需要为每个对话创建子目录？

**答：不需要为每个对话创建，但需要为每个 Agent 创建。** 
- 同一 Agent 的多个对话共享该 Agent 的工作目录
- 对话产生的临时文件（脚本、输出等）放在 Agent 工作区内
- 对话历史本身存在 `sessions/` 目录（已有）

### Q3: 每新建一个对话是否对应新建一个 Agent？

**答：分两种场景。**
- **默认行为（保持现状）**：新建对话 = 新 session，使用默认 Agent（即当前的全局配置）
- **显式绑定**：用户先创建 Agent，再在该 Agent 下新建对话

建议 UI 交互：
```
┌─ 侧边栏 ───────────┐
│ [+ 新对话]           │  ← 默认 Agent
│                      │
│ 📋 架构师             │  ← Agent-1
│   ├─ 设计登录模块     │  ← Agent-1 的对话
│   └─ 评审 API 设计    │
│                      │
│ 💻 前端开发           │  ← Agent-2
│   ├─ 实现用户列表     │
│   └─ 修复样式问题     │
│                      │
│ 💬 默认               │  ← 无绑定 Agent
│   ├─ 日常问答         │
│   └─ 翻译文档         │
│                      │
│ [+ 新建 Agent]       │
└──────────────────────┘
```

### Q4: Agent 之间如何相互调用？

**答：通过 `agent_delegate` 工具（基于现有 SubagentManager 扩展）。**

调用方式与现有 `subagent_spawn` 相同（Function Calling），但不是创建临时子 Agent，而是调用已存在的持久化 Agent。被调用 Agent 使用自己的配置和工作区执行任务。

---

## 7. 成本与风险评估

### 成本

| 阶段 | 新增代码量 | 改动现有代码量 | 预估工时 |
|------|-----------|--------------|---------|
| O1 AgentDefinition | ~300 行 | ~50 行 | 2-3h |
| O2 Session-Agent 绑定 | ~100 行 | ~200 行 | 3-4h |
| O3 独立工作区 | ~150 行 | ~100 行 | 2-3h |
| O4 agent_delegate | ~200 行 | ~100 行 | 3-4h |
| UI（AgentManager + SessionPanel 改造） | ~400 行 | ~200 行 | 4-5h |
| **总计** | **~1150 行** | **~650 行** | **~15-20h** |

### 风险

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| Agent 工作区隔离不彻底（跨目录读写） | 🟡 中 | 复用现有的路径边界检查（isWithinBoundary） |
| 跨 Agent 调用形成死锁环路 | 🟡 中 | 复用 N2 的深度限制（maxDepth） |
| Memory 污染（Agent-A 的记忆被 Agent-B 错误召回） | 🟢 低 | memory_save 增加 agentId tag，search 加 scope 参数 |
| 向后兼容（无 Agent 的旧会话） | 🟢 低 | agentId 可选，null = 默认 Agent，零迁移成本 |

---

## 8. 结论

**推荐实施路径**：O1 → O2 → O3 → O4，可以逐步交付，每步都有独立的验证价值。

核心设计哲学是：**Agent 是 Session 之上的一层持久化抽象**。不改变 Session 的存储和运行机制，只在其上增加一个 AgentRegistry，让每个 Agent 成为可命名、可配置、可复用的实体。

现有的 N5 RoleConfig、SubagentManager、PlanDAG、Memory 系统全部可以在这个框架下自然扩展，无需重构。
