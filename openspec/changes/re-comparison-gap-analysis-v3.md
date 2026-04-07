# Equality vs OpenClaw 再对比差距分析 V3

> 基于 Phase A-I 全部完成后（467 assertions, GAP-1~26 全部实现），对 OpenClaw `src/` 源码的系统性逐模块全量对比。
> V2 分析的 GAP-16~26 已全部实现并合入。本次识别 **Phase J 及以后** 的新差距。

---

## 一、已完成 GAP 汇总（确认 ✅）

| Phase | GAP | 名称 | 断言数 |
|-------|-----|------|--------|
| A | GAP-1 | 错误反馈自动重试 | — |
| A | GAP-2 | LSP 语义代码理解 | — |
| B | GAP-3 | 工具循环检测增强 | — |
| B | GAP-4 | Schema 跨 Provider 兼容 | — |
| C | GAP-5 | bash 执行安全管道 | — |
| C | GAP-6 | MCP 协议集成 | — |
| D | GAP-7 | Compaction 分段压缩 | — |
| D | GAP-8 | 多 Agent 编排 | — |
| E | GAP-9 | 后台任务注册中心 | 56 |
| E | GAP-10 | 七层工具策略管道 | — |
| E | GAP-11 | 可插拔上下文引擎 | — |
| E | GAP-12 | Provider Failover 策略 | 59 |
| E | GAP-13 | 写操作精确识别 | — |
| E | — | SubAgent 管理 | 34 |
| F | GAP-14 | 交互式 UI 载荷 | 37 |
| F | GAP-15 | Prompt 稳定性测试 | 22 |
| G | GAP-16 | 工作区引导文件加载 | 64 (G合计) |
| G | GAP-19 | 外部内容安全包装 | — |
| G | GAP-25 | Context Window Guard | — |
| H | GAP-17 | 子 Agent 孤儿恢复 | 79 (H合计) |
| H | GAP-18 | Task SQLite 持久化 | — |
| H | GAP-20 | API Key 轮换 | — |
| H | GAP-26 | 持久化 Tool Result 守卫 | — |
| I | GAP-21 | 工具目录/Profile | 124 (I合计) |
| I | GAP-22 | 安全审计框架 | — |
| I | GAP-23 | 缓存追踪/LLM 诊断 | — |
| I | GAP-24 | Agent 作用域配置 | — |

**总计：467 项断言，9 个测试套件，0 回归。**

---

## 二、OpenClaw 模块 × Equality 覆盖矩阵

### 🟢 已充分覆盖（无需新增）

| OpenClaw 模块 | Equality 对应 | 备注 |
|---------------|-------------|------|
| `agents/compaction.ts` (529行) | `context/compaction.ts` (369行) | 分段压缩+标识符保护+重试 |
| `agents/failover-policy.ts` | `providers/failover-policy.ts` | 9种错误分类+冷却 |
| `agents/model-fallback.ts` (899行) | `providers/fallback.ts` (183行) | Equality 更轻量但足够 |
| `agents/tool-loop-detection.ts` (624行) | `tools/loop-detector.ts` | 四重检测器 |
| `agents/tool-mutation.ts` (229行) | `tools/mutation.ts` (468行) | 写操作精确识别 |
| `agents/tool-catalog.ts` (359行) | `tools/catalog.ts` | 25 工具+9 section+4 profile |
| `agents/agent-scope.ts` (355行) | `config/agent-scope.ts` | 多 Agent 配置解析 |
| `agents/cache-trace.ts` (261行) | `diagnostics/cache-trace.ts` | 7阶段追踪+SHA256 |
| `agents/context-window-guard.ts` | `providers/context-window.ts` | per-model 上下文窗口 |
| `agents/api-key-rotation.ts` | `providers/key-rotation.ts` | 多 key 轮换 |
| `agents/subagent-orphan-recovery.ts` | `tasks/orphan-recovery.ts` | 孤儿恢复+重启调度 |
| `agents/system-prompt.ts` | `agent/system-prompt.ts` | 完整 prompt 组装 |
| `agents/workspace.ts` | `agent/workspace-bootstrap.ts` | AGENTS.md 等注入 |
| `security/audit.ts` (1505行) | `security/audit.ts` | 6类检查 |
| `security/external-content.ts` | `security/external-content.ts` | 注入检测+安全包装 |
| `tasks/task-registry.ts` | `tasks/registry.ts` | 状态机+事件 |
| `tasks/task-registry.store.sqlite.ts` | `tasks/sqlite-store.ts` | WAL 模式 SQLite |
| `context-engine/` | `context/` | 可插拔引擎+5生命周期 |
| `cron/` | `cron/` | 定时任务调度 |

### 🟡 部分覆盖（有差距但非关键）

| OpenClaw 模块 | 差距描述 | 重要性 |
|---------------|---------|--------|
| `agents/identity.ts` (172行) | OpenClaw 有 Agent 身份名/emoji/消息前缀/ACK 反应；Equality 的 `agent-scope` 有基础身份但无 emoji/prefix | 低 |
| `agents/fast-mode.ts` | OpenClaw 支持 "快速模式"（跳过深思考）；Equality 无 | 低-中 |
| `agents/bootstrap-budget.ts` | OpenClaw 限制引导文件总 token 预算；Equality 的 workspace-bootstrap 有 2MB 大小限制但无 token 预算 | 低 |
| `agents/session-slug.ts` | 会话 slug 生成（用于 URL/文件名）；Equality `title-gen.ts` 已有标题生成 | 低 |
| `agents/lanes.ts` | 执行 Lane 路由（cron/nested/subagent 分离）；桌面单机不关键 | 低 |

### 🔴 未覆盖（新差距候选）

以下按 **对桌面应用的价值** 排序：

---

## 三、新发现差距清单

### GAP-27 🔴 结构化日志系统（Structured Logging）— P1

**OpenClaw 实现**（`src/logging/` — 12 个文件）：
- `logger.ts` (379行)：基于 tslog 的结构化日志器
- 分级日志（trace/debug/info/warn/error/fatal）
- **子系统日志器**（`subsystem.ts`）：每个模块独立命名空间
- 文件日志轮转（默认 500MB，24h 自动清理）
- 外部 transport 扩展点
- 日志敏感数据脱敏（`redact.ts`）
- 配置驱动：log level / console style / file path / max file size

**Equality 现状**：
- `console.log` / `console.warn` 散落使用
- 无统一日志级别控制
- 无文件日志
- 调试时需手动增删 console.log

**影响**：生产问题排查困难；无法按模块开关日志；日志会随 console 丢失。

---

### GAP-28 🔴 链接理解/URL 提取（Link Understanding）— P2

**OpenClaw 实现**（`src/link-understanding/` — 7 个文件）：
- `detect.ts`：从用户消息提取 URL（去除 markdown 语法）
- SSRF 防护（阻止内网 IP/hostname）
- 自动抓取网页内容 → 摘要后注入上下文
- 可配置 maxLinks 限制

**Equality 现状**：
- 有 web_search 工具但需要用户主动触发
- 消息中的 URL 不自动识别/抓取
- 无 SSRF 防护层

**影响**：用户发送"帮我看看这个链接 https://..."时，Agent 无法自动理解链接内容。

---

### GAP-29 🟡 Web 搜索抽象层（Web Search Runtime）— P2

**OpenClaw 实现**（`src/web-search/runtime.ts` — 246 行）：
- 多 provider 支持（Brave/Perplexity/Google/自定义）
- 自动检测可用 provider（按 API key 优先级）
- 沙箱模式内自动启用
- 统一的搜索结果格式
- Provider 注册中心（插件可扩展）

**Equality 现状**：
- `tools/builtins/web-search.ts` 有基础 web 搜索
- 但硬编码单一搜索方式
- 无 provider 注册/切换机制

**影响**：无法灵活切换搜索引擎；无法支持多种搜索 provider。

---

### GAP-30 🟡 媒体理解管道（Media Understanding）— P3

**OpenClaw 实现**（`src/media-understanding/` — 50+ 文件, 810 行 runner）：
- 图片识别（Vision API）：自动路由到支持 vision 的模型
- 音频转录：Deepgram/OpenAI Whisper 等多 provider
- 视频处理：关键帧提取 → vision 分析
- 附件缓存与规范化
- 多模态 provider 注册中心
- 跳过策略（太小的音频/不支持的格式）

**Equality 现状**：
- Provider 层面支持 vision（图片可以通过 message content 传入）
- 无音频转录、无视频处理
- 无自动媒体路由

**影响**：桌面应用中，用户粘贴图片/拖入文件时 Agent 的理解能力有限。

---

### GAP-31 🔴 TTS 语音合成（Text-to-Speech）— P3

**OpenClaw 实现**（`src/tts/` — 15 个文件）：
- 多 provider 语音合成（ElevenLabs/OpenAI/本地 sherpa-onnx）
- 自动模式（检测对话类型，语音回复 → TTS）
- 语音选择与配置
- 电话模式 TTS（Telephony）
- 长文本自动摘要后再合成

**Equality 现状**：
- 无 TTS 功能

**影响**：桌面应用的语音交互缺失，但可以通过 Tauri 前端集成 Web Speech API 部分弥补。

---

### GAP-32 🔴 插件系统（Plugin SDK + Registry）— P1

**OpenClaw 实现**（`src/plugins/` + `src/plugin-sdk/` — 数百个文件）：
- **Plugin SDK**：完整的插件接口（provider/channel/hook/tool/memory）
- **插件注册中心**：安装/卸载/启用/禁用/版本管理
- **安全扫描**：安装时扫描恶意代码
- **钩子系统**：before-agent-start / before-tool-call / after-tool-call / compaction / session 等
- **Provider 插件**：自定义 LLM provider（Ollama/xAI/Deepseek/Moonshot 等）
- **Web Search 插件**：自定义搜索 provider

**Equality 现状**：
- `providers/` 有 Copilot + 自定义 OpenAI 兼容 provider
- `tools/mcp/` 支持 MCP 协议工具扩展
- **但无统一的插件框架**：无 SDK、无注册中心、无钩子系统、无安装/卸载

**影响**：扩展性的天花板——每添加一个 provider 或功能都需要修改核心代码。

---

### GAP-33 🟡 配置模式验证（Config Schema + Validation）— P2

**OpenClaw 实现**（`src/config/` — 200+ 文件）：
- Zod schema 验证（`zod-schema.ts` 等 30+ 文件）
- 配置合并/补丁（`merge-patch.ts`）
- 环境变量替换（`env-substitution.ts`）
- 配置热重载（`gateway/config-reload.ts`）
- 配置备份/轮换（`backup-rotation.ts`）
- 配置差异展示（markdown 表格）
- 遗留配置自动迁移（`legacy-migrate.ts`）

**Equality 现状**：
- `config/secrets.ts` + `config/proxy.ts` + `config/agent-scope.ts`
- 无 schema 验证
- 无配置合并
- 无热重载
- 无迁移机制

**影响**：配置错误难以提前发现；版本升级时配置格式变更无自动迁移。

---

### GAP-34 🟡 进程管理与监控（Process Supervision）— P2

**OpenClaw 实现**（`src/process/` — 16 个文件 + `src/daemon/` — 60+ 文件）：
- 子进程启动/监控/kill tree
- 命令队列（限并发）
- Windows 命令兼容（`windows-command.ts`）
- Daemon 模式：systemd / launchd / schtasks 服务化
- 进程重启恢复
- 端口检测与占用处理

**Equality 现状**：
- `tools/bash-sandbox.ts` 有基础子进程执行
- 无进程 kill tree
- 无命令队列/并发限制
- 无 daemon/service 模式
- **Tauri 进程管理由桌面壳层处理**

**影响**：bash 工具执行的子进程泄漏风险；后台运行能力受限。部分由 Tauri 弥补。

---

### GAP-35 🟡 会话生命周期事件（Session Lifecycle Events）— P2

**OpenClaw 实现**（`src/sessions/` — 15 个文件）：
- 结构化会话事件（create/send/receive/archive/delete）
- 会话 ID 解析与验证
- Model overrides per session
- 发送策略（rate limit / debounce）
- Transcript 事件（tool result persist hook）
- Input provenance（追踪消息来源）

**Equality 现状**：
- `session/store.ts` 有基础的 getOrCreate/reap
- `session/persist.ts` 有持久化
- 无结构化事件系统
- 无 per-session model override
- 无 input provenance

**影响**：无法构建会话审计日志；会话相关的扩展点不足。

---

### GAP-36 🔴 钩子/生命周期系统（Hooks Framework）— P1

**OpenClaw 实现**（`src/hooks/` — 40+ 文件）：
- 完整的钩子框架：fire-and-forget / install / load / workspace
- **消息钩子**：before/after message send/receive
- **插件钩子**：before-agent-start / before-tool-call / after-tool-call
- **内部钩子**：compaction / session lifecycle / model override
- Gmail/Webhook 集成钩子
- 钩子策略（选择性执行）

**Equality 现状**：
- `runner.ts` 有 `beforeToolCall` 单一钩子点
- `tools/policy-pipeline.ts` 有策略过滤
- **但无通用钩子框架**：其他扩展点需硬编码

**影响**：添加新的扩展点（如 before-session / after-compaction）需大量修改核心代码。

---

### GAP-37 🟡 Memory 增强（Memory Search + Embeddings）— P2

**OpenClaw 实现**（`agents/memory-search.ts` 399行 + plugin-sdk memory 模块）：
- 向量搜索（embeddings + SQLite FTS）
- 混合搜索（vector + text weight）
- MMR 多样性重排
- 自动同步（会话 → memory DB）
- Chunking 策略（token 级切分）
- 多模态记忆

**Equality 现状**：
- `memory/db.ts`：基于 JSON 的简单 K/V 存储
- 文本搜索（indexOf）
- 无向量搜索、无 embeddings、无智能检索

**影响**：记忆检索质量低——只有精确匹配，无语义搜索。

---

## 四、差距优先级矩阵

| 优先级 | GAP | 名称 | 工作量 | 对桌面应用的价值 |
|--------|-----|------|--------|-----------------|
| **P1** | GAP-27 | 结构化日志系统 | 中 | 🔴 调试/排查必需 |
| **P1** | GAP-32 | 插件系统 | 大 | 🔴 扩展性天花板 |
| **P1** | GAP-36 | 钩子/生命周期系统 | 中 | 🔴 扩展点基础设施 |
| **P2** | GAP-28 | 链接理解/URL 提取 | 小 | 🟡 用户体验提升 |
| **P2** | GAP-29 | Web 搜索抽象层 | 中 | 🟡 多搜索引擎 |
| **P2** | GAP-33 | 配置模式验证 | 中 | 🟡 健壮性 |
| **P2** | GAP-34 | 进程管理与监控 | 中 | 🟡 bash 工具安全 |
| **P2** | GAP-35 | 会话生命周期事件 | 中 | 🟡 审计/扩展 |
| **P2** | GAP-37 | Memory 向量搜索增强 | 大 | 🟡 智能记忆检索 |
| **P3** | GAP-30 | 媒体理解管道 | 大 | 🟡 多模态体验 |
| **P3** | GAP-31 | TTS 语音合成 | 中 | 🟡 语音交互 |

---

## 五、建议实施路线图

### Phase J：基础设施增强（GAP-27, GAP-36, GAP-35）
**主题**：日志、钩子、事件——为后续所有扩展打基础

1. **J1 — Structured Logger**：统一日志系统（分级、子系统命名空间、文件轮转）
2. **J2 — Hooks Framework**：通用钩子注册/触发机制（sync + async + fire-and-forget）
3. **J3 — Session Lifecycle Events**：结构化会话事件（create/send/archive/delete）

预估：~8 个文件新增/修改，~20 个测试函数

### Phase K：扩展性与智能（GAP-32, GAP-37, GAP-28）
**主题**：插件系统 + 记忆增强 + 链接理解

4. **K1 — Plugin SDK (Lite)**：轻量插件框架（provider/tool/hook 三类插件），适配桌面应用
5. **K2 — Memory Embeddings**：向量搜索（本地 embedding 或 API），混合检索
6. **K3 — Link Understanding**：URL 自动提取 + SSRF 防护 + 网页摘要注入

### Phase L：配置与搜索（GAP-33, GAP-29, GAP-34）
**主题**：配置健壮性 + Web 搜索抽象 + 进程管理

7. **L1 — Config Schema Validation**：Zod schema + 合并 + 热重载
8. **L2 — Web Search Abstraction**：多 provider 注册/切换
9. **L3 — Process Kill Tree**：子进程树管理 + 命令队列

### Phase M：多模态与语音（GAP-30, GAP-31）— 可选
**主题**：桌面应用的多模态交互

10. **M1 — Media Understanding**：图片/音频/视频自动识别与路由
11. **M2 — TTS Integration**：可通过 Tauri 前端 Web Speech API 或本地引擎

---

## 六、暂不追齐的 OpenClaw 特性（维持 V2 判断）

| 特性 | 原因 |
|------|------|
| Channel 系统（Telegram/Discord/Slack 等 40+ 渠道） | 桌面应用不需要消息渠道 |
| Gateway 分布式架构 + WebSocket 协议 | 单机本地架构 |
| Docker/SSH 沙箱后端 | Windows 桌面用户 Docker 不普及 |
| Auth profiles + 设备配对 + OAuth 流程 | 单用户桌面，无需多用户认证 |
| OpenAI Responses API 兼容层 | 不需要对外暴露 API |
| ACP（Anthropic Control Protocol） | 特定于 Anthropic 生态 |
| 执行 Lane 路由 | 单机不需要分离 |
| Skills ClawhHub 市场 | 可用本地 skills + MCP 替代 |
| CLI / TUI 终端界面 | Tauri 桌面 GUI 替代 |
| Wizard 初始化向导 | 桌面应用自有 onboarding |
| i18n 国际化 | 可后续按需添加 |
| Canvas Host | 桌面自有渲染层 |

---

## 七、量化总结

| 维度 | 数量 |
|------|------|
| 原始 GAP (Phase A~F) | 15/15 ✅ |
| V2 新增 GAP (Phase G~I) | 11/11 ✅ |
| **V3 新增 GAP (待做)** | **11** |
| 其中 P1 | 3（GAP-27, 32, 36） |
| 其中 P2 | 6（GAP-28, 29, 33, 34, 35, 37） |
| 其中 P3 | 2（GAP-30, 31） |
| 暂不追齐特性 | 12 类 |
| **总覆盖率**（按核心能力） | **~65%** |

### 覆盖率说明
- OpenClaw 有 ~70 个顶层模块目录，大量是渠道/平台特定的
- 按 **桌面应用相关的核心能力** 算，Equality 已覆盖约 65%
- 完成 Phase J-L 后预计达到 **~85%**
- Phase M 多模态后达到 **~90%**
- 剩余 10% 为渠道/分布式/平台特定功能，桌面应用不需要
