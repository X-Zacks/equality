# Delta Spec: Tool Session Isolation

## ADDED Requirements

### Requirement: ToolContext 携带 Session 标识
`ToolContext` 接口 MUST 包含 `sessionKey?: string` 字段。
`runner.ts` 构造 `toolCtx` 时 SHALL 传入当前会话的 `sessionKey`。

#### Scenario: 工具执行时能获取 session 标识
- GIVEN runner 正在为 session "abc-123" 执行工具调用
- WHEN 构造 ToolContext 传入工具的 execute() 函数
- THEN toolCtx.sessionKey === "abc-123"

#### Scenario: 无 sessionKey 时回退
- GIVEN 某些场景（如单元测试）不传 sessionKey
- WHEN 工具读取 ctx.sessionKey
- THEN 使用 "default" 作为回退值

---

### Requirement: Browser 多会话隔离
browser 工具 MUST 为每个 session 维护独立的 BrowserContext。
不同 session 的页面、标签页、cookie、localStorage SHALL 互不干扰。

#### Scenario: 两个 session 同时操作浏览器
- GIVEN session A 打开了百度（Tab 0）
- AND session B 打开了淘宝（Tab 0）
- WHEN session A 执行 snapshot
- THEN 返回百度的 ARIA 快照（不是淘宝的）

#### Scenario: 共享 Chrome 进程
- GIVEN session A 和 session B 都在使用浏览器
- WHEN 检查系统进程
- THEN 只有 1 个 Chrome 主进程在运行（BrowserContext 共享进程）

#### Scenario: 关闭 session 浏览器不影响其他 session
- GIVEN session A 和 session B 都有活跃浏览器
- WHEN session A 执行 browser stop
- THEN session A 的所有标签页关闭
- AND session B 的标签页不受影响
- AND Chrome 进程继续运行

#### Scenario: 最后一个 session 关闭时释放 Chrome 进程
- GIVEN 只剩 session A 有活跃浏览器
- WHEN session A 执行 browser stop
- THEN Chrome 进程关闭

---

### Requirement: ProcessManager 会话归属（P1，待实施）
每个后台进程 SHOULD 记录其 `createdBySession` 标识。
`process list` 默认只展示当前 session 创建的进程。
`process kill` 只能终止当前 session 创建的进程（除非提供 `--force`）。

#### Scenario: session A 看不到 session B 的进程
- GIVEN session A 启动了 `node server.js`
- AND session B 启动了 `python app.py`
- WHEN session A 执行 process list
- THEN 只看到 `node server.js`

#### Scenario: 跨 session kill 需要 force
- GIVEN session A 启动了进程 "abc123"
- WHEN session B 尝试 process kill "abc123"
- THEN 返回错误 "该进程属于其他会话，使用 force=true 强制终止"

---

### Requirement: Cron 任务归属标记（P2，待实施）
定时任务 SHOULD 记录 `createdBySession` 字段。
`cron list` 展示所有任务，但标注创建来源。
定时任务本质是全局资源，不做强隔离。

#### Scenario: 显示任务来源
- GIVEN session A 创建了"每日早报"任务
- WHEN 任何 session 执行 cron list
- THEN 任务列表中显示 createdBy: "session-A-key"

## MODIFIED Requirements

（无）

## REMOVED Requirements

（无）

---

### Requirement: Chat 主动中止（Active Abort）
系统 MUST 提供一个独立的中止端点 `POST /chat/abort`，前端通过它主动通知后端中止正在进行的请求。
系统 SHALL NOT 仅依赖 HTTP 连接关闭来触发中止。

#### Scenario: 用户点击停止按钮中止 LLM 流式回复
- GIVEN 对话 A 正在进行 LLM 流式回复（tool loop 中）
- WHEN 用户点击停止按钮
- THEN 前端调用 `abort_chat({ sessionKey })`
- AND Core 的 `POST /chat/abort` 触发 `AbortController.abort()`
- AND LLM stream 立即中断
- AND 正在执行的 bash 命令收到 SIGTERM

#### Scenario: 新消息自动中止旧的请求
- GIVEN 对话 A 正在进行 LLM 回复
- WHEN 同一个 session 发送了新消息
- THEN 旧的请求自动被 abort（`prevAbort.abort()`）
- AND 新请求正常开始

#### Scenario: 中止链路完整传播
- GIVEN runner 收到 abort signal
- WHEN signal 被触发
- THEN LLM stream 停止（OpenAI SDK 通过 AbortSignal 中断）
- AND 正在执行的 bash 子进程收到 SIGTERM（500ms 后 SIGKILL）
- AND tool loop 检查 `abort.signal.aborted` 后 break
