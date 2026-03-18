# Delta for Tools

> 变更：bash-timeout-streaming  
> 基线：[openspec/specs/tools/spec.md](../../../specs/tools/spec.md)

---

## MODIFIED Requirements

### Requirement: Bash 工具超时控制

系统 SHALL 对 bash 工具实施**双层超时**保护：

1. **总超时（overall timeout）**：命令从启动到完成的最大允许时长。
   - 默认值：300,000 ms（5 分钟）
   - 上限值：1,800,000 ms（30 分钟）
   - 下限值：5,000 ms（5 秒）

2. **无输出超时（idle timeout）**：命令在没有任何 stdout/stderr 输出的情况下允许的最长沉默时间。
   - 默认值：120,000 ms（2 分钟）
   - 无上限（但不能超过总超时）

超时触发时，系统 MUST 使用进程树杀（Windows: `taskkill /F /T /PID`，Unix: `kill -SIGTERM -pgid`）终止整个进程树。

（Previously: 单一超时，默认 30 秒，硬上限 120 秒。使用 SIGTERM + SIGKILL 只杀直接子进程。）

#### Scenario: Python 脚本持续有输出，执行超过 5 分钟
- GIVEN bash 工具执行 `python analyze.py`
- AND 总超时设为 300,000 ms
- AND 无输出超时设为 120,000 ms
- AND Python 脚本每 10 秒输出一行进度
- AND 脚本总运行时间为 480 秒
- WHEN 总超时（300s）到达
- THEN 系统 SHALL 触发进程树杀
- AND 返回已收集的部分输出 + 超时提示

#### Scenario: Python 脚本在 120 秒内有输出，总时间未超时
- GIVEN bash 工具执行 `python analyze.py`
- AND 脚本每 30 秒输出一行（间隔 < idle timeout 120s）
- AND 脚本总运行时间为 480 秒
- AND 总超时设为 600,000 ms（10 分钟）
- WHEN 脚本在 480 秒后正常退出
- THEN 系统 SHALL 返回完整输出
- AND 不触发任何超时

#### Scenario: 命令卡死无输出
- GIVEN bash 工具执行 `python stuck.py`
- AND 脚本启动后不输出任何内容
- WHEN 无输出超时（120s）到达
- THEN 系统 SHALL 触发进程树杀
- AND 返回 `⚠️ 命令无输出超时（120000ms 内无 stdout/stderr）`

#### Scenario: LLM 指定自定义超时
- GIVEN LLM 调用 bash 工具并传入 `timeout_ms: 600000`
- WHEN 系统处理超时参数
- THEN 总超时 SHALL 使用 min(600000, BASH_MAX_TIMEOUT_MS)
- AND 无输出超时 SHALL 使用默认值（不受 LLM 参数影响）

---

## ADDED Requirements

### Requirement: Bash 流式输出推送

系统 SHALL 在 bash 工具执行期间，将 stdout/stderr 内容**实时推送**到前端。

推送机制：
1. bash 进程每收到一个 stdout/stderr 数据块，SHALL 调用 `onUpdate(text)` 回调
2. Runner 层 SHALL 将 `onUpdate` 转为 SSE 事件 `tool_update`
3. 前端 SHALL 在工具卡片中显示最新输出内容

推送内容约束：
- 单次推送截断到最近 **500 字符**（防止大量输出淹没 SSE）
- 推送频率 SHALL 节流（throttle）到最多 **每 500ms 一次**
- 推送内容 SHALL 只显示在前端 UI，不注入 LLM 上下文

#### Scenario: Python 脚本逐行输出进度
- GIVEN bash 工具执行 `python analyze.py`
- AND 脚本输出：`Reading Q3 file... 1204 rows`
- WHEN 前端收到 `tool_update` 事件
- THEN 工具卡片 SHALL 显示：
  ```
  ⏳ bash ─ python analyze.py
    Reading Q3 file... 1204 rows         [spinner]
  ```

#### Scenario: 大量输出
- GIVEN bash 进程在 100ms 内输出了 10KB 内容
- WHEN onUpdate 被调用
- THEN 推送内容 SHALL 截断到最后 500 字符
- AND 推送频率 SHALL 不超过每 500ms 一次

---

### Requirement: Bash 超时配置化

系统 SHALL 通过 `settings.json` 暴露以下 bash 超时配置项：

| 配置项 Key | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `BASH_TIMEOUT_MS` | number (string) | `"300000"` | bash 前台命令的默认总超时（毫秒）。LLM 未指定 timeout_ms 时使用此值。最小 5000，最大受 BASH_MAX_TIMEOUT_MS 限制。 |
| `BASH_IDLE_TIMEOUT_MS` | number (string) | `"120000"` | bash 命令无输出超时（毫秒）。命令在此时间内无任何 stdout/stderr 输出则判定卡死并终止。设为 0 禁用无输出超时。最小 10000（启用时）。 |
| `BASH_MAX_TIMEOUT_MS` | number (string) | `"1800000"` | bash 单条命令允许的最大总超时（毫秒）。防止 LLM 传入过大的 timeout_ms。最小 60000。 |

配置值以字符串形式存储在 `settings.json`（与现有 API Key 存储格式一致），运行时解析为数字。

前端设置页面 SHALL 为每个配置项显示：
- 配置项名称（中文）
- 当前值（可编辑输入框）
- 说明文字
- 默认值提示

#### Scenario: 用户修改 bash 默认超时为 10 分钟
- GIVEN 用户在设置页面将 BASH_TIMEOUT_MS 改为 `600000`
- WHEN 用户保存设置
- THEN settings.json 中 SHALL 写入 `"BASH_TIMEOUT_MS": "600000"`
- AND 后续 bash 命令的默认总超时 SHALL 为 600,000 ms

#### Scenario: 配置值非法
- GIVEN settings.json 中 BASH_TIMEOUT_MS 为 `"abc"`
- WHEN bash 工具读取配置
- THEN 系统 SHALL 忽略非法值，使用默认值 300,000 ms
- AND 在日志中记录警告

#### Scenario: 配置值超出范围
- GIVEN settings.json 中 BASH_TIMEOUT_MS 为 `"1000"`（小于最小值 5000）
- WHEN bash 工具读取配置
- THEN 系统 SHALL 钳位到最小值 5000 ms

---

### Requirement: 工具流式更新回调接口

ToolDefinition 的 execute 函数 SHALL 支持可选的 `onUpdate` 回调参数：

```typescript
interface ToolDefinition {
  execute: (
    input: Record<string, unknown>,
    ctx: ToolContext,
    onUpdate?: (partial: string) => void,  // 新增
  ) => Promise<ToolResult>;
}
```

Runner 层调用工具时 SHALL 传入 `onUpdate`，并将回调内容转为 `onToolUpdate` 事件。

#### Scenario: 工具不使用 onUpdate
- GIVEN 工具 `read_file` 不调用 onUpdate
- WHEN Runner 传入 onUpdate 回调
- THEN 不产生任何 `tool_update` SSE 事件
- AND 工具行为不受影响
