# Gateway Specification

> 描述 Gateway 进程的职责、启动序列和对外接口。  
> Gateway 是整个系统的入口进程，负责接收来自渠道和 GUI 的消息，路由给 Agent Runner。  
> 依赖：[session/spec.md](../session/spec.md)、[routing/spec.md](../routing/spec.md)

---

## Requirements

### Requirement: Gateway 进程模型

Gateway MUST 作为单一后台进程运行，监听本地端口。

- 监听地址：`127.0.0.1:18790`（仅本机可访问，不对外暴露）
- 协议：HTTP（REST）+ WebSocket（流式推送）
- 进程启动方式（Windows）：由 Tauri 主进程作为子进程启动，随 Tauri 退出而退出

> 注：端口 18790 区别于 OpenClaw 的 18789，避免同机冲突。

#### Scenario: Tauri 启动 Gateway 子进程
- GIVEN Tauri 主进程启动
- WHEN 系统托盘初始化完成
- THEN Tauri SHALL 启动 `equality-core.exe` 子进程
- AND 等待 Gateway 在 18790 端口就绪（最多 10 秒）
- AND 就绪后向前端 WebView 发送 `gateway:ready` 事件

#### Scenario: Tauri 退出时清理子进程
- GIVEN Tauri 主进程收到退出信号（用户关闭 / 系统关机）
- WHEN Tauri 开始退出流程
- THEN Gateway 子进程 SHALL 在 5 秒内收到 SIGTERM
- AND Gateway SHALL 完成当前 Session 的持久化后退出

---

### Requirement: Gateway 启动序列

Gateway MUST 按以下顺序初始化，任意步骤失败则 MUST 中止启动并记录错误日志：

```
1. 加载并验证配置（equality.config.yaml）
   └── 验证失败 → 退出，输出 human-readable 错误信息

2. 解密并激活 API Key 快照
   └── 解密失败（DPAPI 错误）→ 退出

3. 初始化 SessionStore（内存）

4. 加载 Skills 目录（异步，不阻塞启动）

5. 启动 HTTP/WebSocket 服务（绑定 18790）
   └── 端口占用 → 退出，提示用户检查是否已有实例运行

6. 注册渠道适配器（按配置）

7. 注册 Skills 文件变更监听器（chokidar）

8. 恢复未完成的出站消息队列

9. 输出 "Gateway ready on 127.0.0.1:18790"
```

#### Scenario: 配置文件格式错误
- GIVEN `equality.config.yaml` 包含非法 YAML
- WHEN Gateway 启动
- THEN 进程 SHALL 退出（exit code 1）
- AND 在标准错误输出打印具体行号和错误描述

---

### Requirement: HTTP API 接口

Gateway MUST 提供以下 HTTP 端点：

| 方法 | 路径 | 描述 |
|------|------|------|
| `POST` | `/chat` | 发起一次对话请求（非流式，等待完整回复）|
| `POST` | `/chat/stream` | 发起流式对话请求（Server-Sent Events）|
| `DELETE` | `/chat/:sessionKey` | 取消该 Session 正在进行的运行 |
| `GET` | `/sessions` | 列出活跃 Session 列表 |
| `GET` | `/sessions/:sessionKey/history` | 获取 Session 对话历史 |
| `GET` | `/health` | 健康检查（返回 200 OK + 版本号）|

所有接口 MUST 通过 CORS Origin 白名单过滤非受信来源（见变更 `cors-and-secrets-hardening`）。

允许的 Origin：
- `null` / 无 Origin 头（本机直接请求）
- `https://tauri.localhost`（Tauri WebView，Windows）
- `tauri://localhost`（Tauri WebView，macOS/Linux）
- `http://localhost:*`（仅开发模式）

本机 Token 鉴权（Bearer Token）列为 Phase 2 实现。

> **安全调研背景**：对照 OpenClaw CVE 调研（2026-03-18），以下漏洞对 Equality 不适用：
> WebSocket 劫持（无 WS 服务）、命令注入 RCE（无公网入口）、沙箱逃逸（无多租户沙箱）。
> 当前最高优先级风险为 CORS 过宽（`origin: true`），已通过本变更修复。

#### Scenario: Tauri GUI 发送消息
- GIVEN 用户在悬浮窗输入框输入消息并按回车
- WHEN 前端 JavaScript 调用 `POST /chat/stream`
- THEN Gateway 通过 SSE 推送流式文本增量
- AND 前端实时渲染每个 delta

---

### Requirement: 配置热更新

Gateway SHOULD 支持配置热更新，无需重启进程。

热更新范围（MUST 支持）：
- API Key 变更（用户在设置面板修改）
- 模型路由规则变更
- Skills 文件变更（自动检测，30s 防抖）

热更新范围（MUST NOT 支持，需重启）：
- 监听端口变更
- 日志级别变更

#### Scenario: 用户在设置面板保存新的 API Key
- GIVEN 用户在 Tauri 设置面板输入新的 DeepSeek API Key
- WHEN 用户点击"保存"
- THEN Tauri 通过 IPC 调用 Gateway `POST /config/reload`
- AND Gateway 重新加载 API Key（无需重启）
- AND 下一次 LLM 调用使用新的 API Key
