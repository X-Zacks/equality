# Proposal: Bash 超时重构 & 流式输出（Bash Timeout & Streaming）

## 意图

当前 bash 工具的默认超时是 30 秒、硬上限 2 分钟。这导致：

1. **正常任务被误杀**：`pip install pandas`、Excel 数据分析等常见操作轻松超过 30 秒
2. **超时杀不掉进程树**（已修 killTree）但修完后更糟——Python 脚本正在跑就被强杀了
3. **用户看不到进度**：8 分钟的 Excel 分析期间，工具卡片只有一个 spinner，不知道在做什么
4. **超时不可配置**：写死在代码里，用户无法根据场景调整

### 真实案例

用户调用 `excel-quarterly-cost-diff-analysis` Skill：
- Python 脚本执行了 488 秒（两个大 Excel 文件的多维度分析）
- 期间持续有 stdout 输出（JSON 结果 45690 字符）
- 但 bash 超时在 120 秒触发 → SIGTERM → Windows 上杀不掉 → 最终等到 Python 跑完
- 用户 8 分钟内只看到 `⏳ bash ─ python xxx.py [spinner]`

### OpenClaw 参考

OpenClaw 的解决方案：
- bash 单条命令：**无默认超时**（pi-coding-agent）或 **30 分钟**（exec 工具）
- 无输出看门狗：180s~600s 无 stdout → 判定卡死
- 流式输出：onUpdate 回调逐块推送 stdout 到前端
- Agent 整体超时：默认 10 分钟，可配到 24 小时

## 范围

### 变更内容

1. **超时模型重构**：单一超时 → 双超时（总超时 + 无输出超时）
2. **超时值大幅提升**：对齐 OpenClaw（默认 5 分钟，上限 30 分钟）
3. **流式 stdout 推送**：bash 执行期间实时将输出推到前端
4. **超时可配置**：通过 settings.json 暴露配置项，前端设置页面可改

### 不做的事

- Agent 整体超时（Equality 是交互式桌面应用，用户可随时点停止）
- 自动后台化 / yield（OpenClaw 的 exec 后台模式，复杂度高，后续再做）
- process 工具的超时管理（已有独立的 background 模式）

## 高层方案

```
                 ┌──────────────────────────────┐
  bash 启动      │   双超时保护                   │
  python ──────► │   ① 总超时（默认 5min）         │
                 │   ② 无输出超时（默认 120s）      │
                 │                                │
  stdout ──────► │   每行/每块 → onUpdate 回调     │
                 │        ↓                       │
                 │   SSE: tool_update 事件         │
                 │        ↓                       │
                 │   前端：工具卡片显示最新输出行    │
                 └──────────────────────────────┘

  settings.json:
  {
    "BASH_TIMEOUT_MS": "300000",
    "BASH_IDLE_TIMEOUT_MS": "120000",
    "BASH_MAX_TIMEOUT_MS": "1800000"
  }
```
