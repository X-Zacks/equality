# Tasks: Bash 超时重构 & 流式输出

> 变更：bash-timeout-streaming  
> 依赖：[design.md](./design.md)

---

## 1. 基础设施：配置项注册

- [x] 1.1 `config/secrets.ts` — KEY_NAMES 新增 `BASH_TIMEOUT_MS`、`BASH_IDLE_TIMEOUT_MS`、`BASH_MAX_TIMEOUT_MS`
- [x] 1.2 `tools/types.ts` — `ToolDefinition.execute` 签名加第三个参数 `onUpdate?: (partial: string) => void`

## 2. Bash 工具核心改造

- [x] 2.1 `bash.ts` — 新增 `getConfigNumber()` 辅助函数，从 settings.json 读取配置并校验/钳位
- [x] 2.2 `bash.ts` — 前台模式：默认超时改为从配置读取（DEFAULT → `getConfigNumber('BASH_TIMEOUT_MS', 300_000, 5_000, maxTimeout)`）
- [x] 2.3 `bash.ts` — 前台模式：新增 idle timeout 定时器，每次 stdout/stderr data 事件重置
- [x] 2.4 `bash.ts` — 前台模式：新增 `throttledUpdate()` 节流函数，每 500ms 最多推一次 onUpdate
- [x] 2.5 `bash.ts` — stdout/stderr on('data') 回调中调用 `resetIdleTimer()` + `throttledUpdate(last500)`
- [x] 2.6 `bash.ts` — 超时消息区分两种：`⚠️ 命令总超时（{n}ms）` vs `⚠️ 命令无输出超时（{n}ms 内无 stdout/stderr）`
- [x] 2.7 `bash.ts` — 常量更新：`MAX_TIMEOUT_MS` 删除或提升（由配置决定），`DEFAULT_TIMEOUT_MS = 300_000`

## 3. Runner & SSE 层

- [x] 3.1 `agent/runner.ts` — `RunAttemptParams` 新增 `onToolUpdate?: (info: { toolCallId: string; content: string }) => void`
- [x] 3.2 `agent/runner.ts` — 调用 `tool.execute(args, toolCtx, onUpdate)` 时传入 `onUpdate` 闭包，内部调 `params.onToolUpdate`
- [x] 3.3 `index.ts` — SSE stream handler 传入 `onToolUpdate`，调用 `send({ type: 'tool_update', toolCallId, content })`

## 4. 前端：接收 tool_update 事件

- [x] 4.1 `useGateway.ts` — `DeltaEvent` 类型新增 `type: 'tool_update'`
- [x] 4.2 `useGateway.ts` — chat-delta 监听器中处理 `tool_update`：调用 `onToolCall({ toolCallId, partial, status: 'running' })`
- [x] 4.3 `useGateway.ts` — `ToolCallEvent` 接口新增 `partial?: string` 字段

## 5. 前端：工具卡片显示实时输出

- [x] 5.1 `Chat.tsx` — 流式工具卡片（activeToolCalls）：当 `tc.partial` 存在且 `tc.status === 'running'` 时显示可折叠的输出区域
- [x] 5.2 `Chat.css` — 新增 `.tool-call-output` 样式：等宽字体、半透明、最大高度 3 行、溢出隐藏
- [x] 5.3 `Chat.tsx` — 历史消息工具卡片：不显示 partial（历史中只有最终 result）

## 6. 前端：设置页面

- [x] 6.1 `Settings.tsx` — 新增"高级设置"分组区域
- [x] 6.2 `Settings.tsx` — 三个数字输入框：BASH_TIMEOUT_MS、BASH_IDLE_TIMEOUT_MS、BASH_MAX_TIMEOUT_MS
- [x] 6.3 `Settings.tsx` — 每个输入框带说明文字和默认值提示
- [x] 6.4 `Settings.tsx` — 保存时通过 `/settings/api-key` 接口写入（复用现有保存逻辑）
- [x] 6.5 `Settings.css` — 高级设置区域样式（复用现有 provider-card 样式）

## 7. 验证

- [ ] 7.1 测试：bash 执行 `python -c "import time; [print(i, flush=True) or time.sleep(1) for i in range(10)]"` — 验证流式输出实时推送到前端
- [ ] 7.2 测试：bash 执行 `python -c "import time; time.sleep(200)"` — 验证 idle timeout 在 120s 后触发
- [ ] 7.3 测试：在设置中将 BASH_TIMEOUT_MS 改为 600000，执行长命令验证生效
- [ ] 7.4 测试：点击停止按钮 — 验证 abort + killTree 正常工作
- [ ] 7.5 测试：Excel Skill 完整执行 — 验证实时进度可见，任务完成不被超时杀
