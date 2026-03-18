# Session Specification

> 权威描述 Session 模型的完整行为。其他模块（agent-runner、routing、context-engine）依赖本规格定义的接口。

---

## Requirements

### Requirement: Session 标识

系统 SHALL 通过 `SessionKey` 唯一标识每一个对话会话。  
`SessionKey` MUST 遵循以下编码格式：

```
agent:<agentId>:<channel>:<accountId>:<peerKind>:<peerId>
```

字段约束：
- `agentId`：字母数字和连字符，标识处理该会话的 Agent（`main`、`coder` 等）
- `channel`：渠道标识（`feishu`、`dingtalk`、`wecom`、`api`、`desktop`）
- `accountId`：多账号区分，单账号配置时固定为 `default`
- `peerKind`：`direct`（私聊）| `group`（群组）| `thread`（话题）
- `peerId`：对端唯一 ID（用户 ID 或群组 ID）

#### Scenario: 飞书私聊消息路由
- GIVEN 飞书用户 `u_abc123` 向 Bot 发送私信
- WHEN 系统收到该消息
- THEN SessionKey 为 `agent:main:feishu:default:direct:u_abc123`

#### Scenario: 飞书群组消息路由
- GIVEN 飞书群 `oc_group456` 中有人 @Bot
- WHEN 系统收到该消息
- THEN SessionKey 为 `agent:main:feishu:default:group:oc_group456`

#### Scenario: 桌面客户端消息路由
- GIVEN 用户通过 Tauri GUI 发送消息（无渠道账号）
- WHEN 系统收到该消息
- THEN SessionKey 为 `agent:main:desktop:default:direct:local`

---

### Requirement: Session 存储

系统 SHALL 维护一个 `SessionStore`，支持以下操作：

| 操作 | 描述 |
|------|------|
| `getOrCreate(key)` | 返回已有 Session，或创建新 Session |
| `get(key)` | 返回 Session（不存在则返回 undefined）|
| `cancel(key)` | 中止该 Session 当前正在运行的 Agent |
| `reap()` | 清理超过 TTL 且无活跃运行的 Session |

容量约束：
- `maxSessions`：5000（超出时拒绝创建新 Session）
- `idleTtlMs`：86,400,000（24 小时，空闲超时自动清理）

#### Scenario: 超出容量拒绝创建
- GIVEN SessionStore 中已有 5000 个 Session
- WHEN 新消息到达需要创建新 Session
- THEN 系统 SHALL 拒绝该请求，并向渠道返回"服务繁忙"错误

#### Scenario: 空闲 Session 自动清理
- GIVEN 某 Session 超过 24 小时无新消息
- AND 该 Session 没有正在运行的 Agent
- WHEN `reap()` 被定时调用
- THEN 该 Session 被从内存中移除

---

### Requirement: Session 持久化

系统 SHALL 将 Session 的对话历史（Transcript）持久化到磁盘。

持久化路径（Windows）：
```
%APPDATA%\Equality\sessions\<sessionKey-urlencoded>.json
```

写入规则：
- 每次 Agent 运行完成后，MUST 触发一次持久化
- 写入 MUST 使用 per-Session 写锁，防止并发写入冲突
- 写入 SHOULD 使用原子写（写临时文件后重命名），防止写到一半时进程崩溃

#### Scenario: 进程重启后恢复会话历史
- GIVEN 某 Session 已有 10 轮对话历史持久化到磁盘
- WHEN 进程重启后，同一用户发来新消息
- THEN `getOrCreate(key)` 从磁盘加载历史
- AND Agent 可以看到完整的 10 轮历史

#### Scenario: 孤立 user 消息修复
- GIVEN Session 文件末尾存在孤立的 `user` 消息（上次被中断）
- WHEN 新的 Agent 运行开始并读取 Session
- THEN 系统 SHALL 检测并回退到该孤立消息的父节点
- AND 不得向 LLM 发送两条连续的 `user` 消息

---

### Requirement: 并发控制

同一 SessionKey 的请求 MUST 严格串行执行。  
不同 SessionKey 的请求 MAY 完全并发执行。

实现约束：使用 per-SessionKey 的链式 Promise 队列（非全局锁），
以保证不同 Session 之间不互相阻塞。

#### Scenario: 同一群组多人同时发消息
- GIVEN 飞书群 `oc_group456` 对应 Session A
- AND 用户 X 在 t=0ms 发送消息，Agent 开始处理
- WHEN 用户 Y 在 t=200ms 发送消息到同一群组
- THEN 用户 Y 的消息进入队列等待
- AND 用户 X 的 Agent 运行完成后，用户 Y 的消息才开始处理

#### Scenario: 两个不同群组并发
- GIVEN 群组 A 和群组 B 各自有消息到达
- WHEN 两条消息几乎同时被接收
- THEN 两个 Agent 实例 SHALL 并发运行，互不阻塞
