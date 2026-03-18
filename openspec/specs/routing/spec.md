# Routing Specification

> 描述消息路由系统：从原始渠道消息到 SessionKey 的映射规则。  
> 依赖：[session/spec.md](../session/spec.md)

---

## Requirements

### Requirement: 渠道消息规范化

所有渠道适配器 MUST 将原始渠道消息转换为统一的 `NormalizedMessage` 格式，再进入路由系统。

```typescript
interface NormalizedMessage {
  channel: string;          // 渠道标识："feishu" | "dingtalk" | "wecom" | "desktop"
  accountId: string;        // 渠道账号 ID（多账号时区分），单账号固定 "default"
  senderId: string;         // 发送者 ID（用户唯一标识）
  targetId: string;         // 目标 ID（群组 ID 或 Bot 自身 ID）
  peerKind: "direct" | "group" | "thread";
  text: string;             // 消息文本
  attachments?: Attachment[];
  rawPayload: unknown;      // 原始 payload，供适配器内部使用
}
```

#### Scenario: 飞书私信消息规范化
- GIVEN 飞书推送一条私信 Webhook 事件
- WHEN 飞书适配器处理该事件
- THEN 产出 `{ channel: "feishu", peerKind: "direct", senderId: "u_xxx", targetId: "bot_id" }`

---

### Requirement: SessionKey 解析

路由系统 MUST 根据 `NormalizedMessage` 解析出 `SessionKey`，规则如下：

```
SessionKey = "agent:{agentId}:{channel}:{accountId}:{peerKind}:{peerId}"

peerId 取值规则：
  peerKind === "direct"  → peerId = senderId
  peerKind === "group"   → peerId = targetId
  peerKind === "thread"  → peerId = targetId（含 threadId 后缀）
```

#### Scenario: 群组消息的 peerId
- GIVEN 群组 `oc_group_abc` 中用户 `u_123` @Bot
- WHEN 路由解析
- THEN `peerId = "oc_group_abc"`（群组 ID，不是发送者 ID）
- AND 群内所有用户共享同一个 Session，上下文连续

---

### Requirement: Agent 绑定（Bindings）

系统 SHOULD 支持通过配置将不同来源的消息路由到不同 Agent。

优先级（高 → 低）：
1. 精确 peer 绑定（特定用户 / 特定群组）
2. 渠道级绑定（某渠道的所有消息）
3. 默认绑定（`agentId: "main"`）

```yaml
# equality.config.yaml 示例
bindings:
  - peer: { channel: feishu, peerId: "oc_coder_group" }
    agent: coder          # 编码群 → 路由到 coder agent
  - channel: dingtalk
    agent: assistant      # 钉钉全部消息 → assistant agent
  # 未匹配的消息 → 默认 main agent
```

#### Scenario: 特定群组路由到专用 Agent
- GIVEN 配置了飞书群 `oc_coder_group` → `coder` agent
- WHEN 该群收到一条消息
- THEN SessionKey 中 `agentId = "coder"`
- AND 消息由 coder agent 处理，使用 coder 专属 Skills 和模型配置

---

### Requirement: 渠道适配器接口

每个渠道适配器 MUST 实现 `ChannelAdapter` 接口：

```typescript
interface ChannelAdapter {
  readonly channelId: string;          // 渠道唯一标识
  
  // 初始化：建立连接（长轮询 / WebSocket / Webhook 注册）
  start(): Promise<void>;
  
  // 停止：断开连接，清理资源
  stop(): Promise<void>;
  
  // 解析原始 Webhook payload 为 NormalizedMessage
  parseInbound(raw: unknown): NormalizedMessage | null;
  
  // 向渠道发送消息
  sendMessage(targetId: string, text: string, options?: SendOptions): Promise<void>;
  
  // 渠道能力声明（用于功能降级判断）
  getCapabilities(): ChannelCapabilities;
}

interface ChannelCapabilities {
  supportsMarkdown: boolean;     // 是否支持 Markdown 格式
  supportsFileUpload: boolean;   // 是否支持发送文件
  maxMessageLength: number;      // 单条消息最大字符数
  requiresAsyncReply: boolean;   // 是否需要异步回复（如微信5秒限制）
}
```

系统 SHALL 通过 `ChannelAdapter` 接口与所有渠道交互，不得在核心逻辑中硬编码任何渠道专有逻辑。

#### Scenario: 消息超长自动分段
- GIVEN 飞书适配器声明 `maxMessageLength = 4096`
- AND Agent 生成了 6000 字的回复
- WHEN `sendMessage()` 被调用
- THEN 消息 SHALL 被自动分为两段发送（≤4096 字 / 段）

---

### Requirement: 出站消息队列（Delivery Queue）

系统 MUST 维护一个出站消息队列，保证消息投递的可靠性。

- 消息 MUST 在成功投递后才从队列删除
- 进程重启后，MUST 恢复未投递的消息并继续投递
- 投递失败（网络错误）SHOULD 按指数退避重试（最多 3 次）

#### Scenario: 进程崩溃后恢复未投递消息
- GIVEN Agent 已生成回复，正在投递到飞书
- AND 此时进程崩溃
- WHEN 进程重启
- THEN Gateway 启动时读取出站队列
- AND 继续向飞书发送该消息（用户收到回复，虽然可能延迟）
