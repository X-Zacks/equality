# Equality OpenSpec

> 本目录是 equality 项目的规格驱动开发（Spec-Driven Development）工作区。  
> 所有实现代码必须有对应的 spec 作为依据。

---

## 架构概览

```
渠道（飞书/钉钉/桌面GUI）
        ↓ NormalizedMessage
    routing/spec.md
        ↓ SessionKey
    session/spec.md
        ↓
    agent-runner/spec.md
      ├── context-engine/spec.md  （组装历史消息）
      ├── tools/spec.md           （工具调用 + 循环检测）
      ├── skills/spec.md          （领域知识注入）
      ├── compaction/spec.md      （上下文压缩）
      └── llm-provider/spec.md   （调用 LLM API）
                ↓
    cost-ledger/spec.md           （记录费用）
        ↓
    gateway/spec.md               （对外 HTTP 接口）
```

---

## specs/（当前系统行为的权威来源）

> specs 按**领域**组织，不按 phase 编号。每个 spec 文件是该领域的完整行为描述。  
> 同一 spec 中可能包含跨多个 phase 的 Requirements（spec 内会标注 Phase 归属）。

| 领域 | 规格文件 | 描述 | 涉及 Phase |
|------|---------|------|-----------|
| Session 模型 | [specs/session/spec.md](specs/session/spec.md) | Session 标识、存储、持久化、并发控制 | Phase 1, 11 |
| Agent Runner | [specs/agent-runner/spec.md](specs/agent-runner/spec.md) | 单次运行生命周期、流式输出、错误处理 | Phase 1 |
| Gateway | [specs/gateway/spec.md](specs/gateway/spec.md) | 进程模型、启动序列、HTTP API | Phase 1, 13.1 |
| 路由系统 | [specs/routing/spec.md](specs/routing/spec.md) | 消息规范化、SessionKey 解析、渠道适配器接口 | Phase 13, 13.2 |
| Tools | [specs/tools/spec.md](specs/tools/spec.md) | 工具注册、截断、Context Guard、**循环检测** | Phase 2, **6** |
| Skills | [specs/skills/spec.md](specs/skills/spec.md) | 文件格式、加载优先级、System Prompt 注入、自动沉淀 | Phase 2 |
| Skills V2 | [specs/skills/skills-v2-spec.md](specs/skills/skills-v2-spec.md) | 安全扫描、Watcher 优化、状态报告、skill-creator、安装器 | Phase 7 |
| Compaction | [specs/compaction/spec.md](specs/compaction/spec.md) | 触发条件、压缩算法、超时保护 | Phase 3 |
| Context Engine | [specs/context-engine/spec.md](specs/context-engine/spec.md) | 可插拔接口、assemble()、token 预算 | Phase 12.1 |
| LLM Provider | [specs/llm-provider/spec.md](specs/llm-provider/spec.md) | Provider 接口、PRC 模型、Fallback、费率 | Phase 3, 8, 15 |
| Cost Ledger | [specs/cost-ledger/spec.md](specs/cost-ledger/spec.md) | 成本记录、持久化、预算限额 | Phase 3.1 |

---

## changes/（进行中和已完成的变更）

### 已完成

| 阶段 | 变更目录 | 状态 | 说明 |
|------|---------|------|------|
| Phase 0 | [phase-0-tauri-shell/](changes/phase-0-tauri-shell/) | ✅ 完成 | Tauri 桌面壳、系统托盘、快捷键 |
| Phase 1 | [phase-1-agent-core/](changes/phase-1-agent-core/) | ✅ 完成 | Agent Runner、Session 持久化、Gateway |
| — | [copilot-provider/](changes/copilot-provider/) | ✅ 完成 | GitHub Copilot Provider + Device Flow |
| — | [standard-window-redesign/](changes/standard-window-redesign/) | ✅ 完成 | 标准窗口三栏布局（会话列表+对话+设置） |
| Phase 2 | [phase-2-tools-skills/](changes/phase-2-tools-skills/) | ✅ 完成 | 8 个内置工具 + Skills 加载引擎 |
| Phase 3 | [phase-3-multi-provider-compaction/](changes/phase-3-multi-provider-compaction/) | ✅ 完成 | 5 Provider + Compaction + Settings + 代码块 + 对话体验 |
| Phase 3.1 | [phase-3.1-image-pdf/](changes/phase-3.1-image-pdf/) | ✅ 完成 | Cost 统计 + read_image + read_pdf |
| Phase 3.2 | [phase-3.2-tool-parity/](changes/phase-3.2-tool-parity/) | ✅ 完成 | Tool Parity（13→15 工具: edit_file, grep, list_dir, web_search, process, apply_patch, bash 增强） |
| Phase 3.3 | [phase-3.3-file-attachment/](changes/phase-3.3-file-attachment/) | ✅ 完成 | 文件附件（📎 按钮 + 拖拽） |
| Phase 4 | [phase-4-cron-scheduler/](changes/phase-4-cron-scheduler/) | ✅ 完成 | 定时任务 cron 工具 + CronScheduler + SSE 通知 |
| Phase 5 | [phase-5-browser-tool/](changes/phase-5-browser-tool/) | ✅ 完成 | 浏览器控制（Playwright-core + 系统 Chrome，含上传/下载） |
| — | Skill 自动沉淀 | ✅ 完成 | System Prompt 注入沉淀指令，对话中 write_file 保存 SKILL.md |
| Phase 6 | [phase-6-tool-loop-detection/](changes/phase-6-tool-loop-detection/) | ✅ 完成 | 工具调用循环检测（4 个检测器 + SHA-256 Hash） |
| Phase 7 | [phase-7-skills-v2/](changes/phase-7-skills-v2/) | ✅ 完成 | Skills V2（安全扫描 + Watcher 5s 防抖 + 状态报告 + skill-creator） |
| Phase 8 | [phase-8-model-fallback/](changes/phase-8-model-fallback/) | ✅ 完成 | Model Fallback 降级链（FallbackProvider + 错误分类 + 30s 冷却） |
| Phase 9 | [phase-9-stream-decorator/](changes/phase-9-stream-decorator/) | ✅ 完成 | Stream Decorator 洋葱模型（5 个装饰器 + 自动管道构建） |
| Phase 10 | [phase-10-smart-routing/](changes/phase-10-smart-routing/) | ✅ 完成 | 智能模型路由（复杂度分类 + 路由表 + @model 覆盖） |
| Phase 11 | [phase-11-session-queue/](changes/phase-11-session-queue/) | ✅ 完成 | Session 并发队列（per-Key 链式 Promise 队列） |
| Phase 12 | [phase-12-memory/](changes/phase-12-memory/) | ✅ 完成 | Memory/RAG（SQLite+FTS5 + 自动 Recall/Capture + 2 个工具） |
| Phase 12.1 | [phase-12.1-context-engine/](changes/phase-12.1-context-engine/) | ✅ 完成 | Context Engine 可插拔接口（DefaultContextEngine + runner 重构） |

> **运行时修复（未单独建目录）**：pdf-parse v2 API 适配、GPT-5.x Responses API 支持

### 后续路线图

> **编号规则**：已完成 Phase 0~12.1，后续从 Phase 13 开始连续递增，不跳号。

| 阶段 | 主要内容 | 优先级 | Spec 位置 | 对标 OpenClaw |
|------|----------|--------|-----------|-------------|
| **Phase 13** | **渠道适配器（飞书/钉钉/企微）** | 🟠 P2 | [specs/routing/spec.md](specs/routing/spec.md) | telegram/discord/slack |
| Phase 13.1 | Gateway WebSocket 控制平面 | 🟠 P2 | [specs/gateway/spec.md](specs/gateway/spec.md) | gateway ws |
| Phase 13.2 | 路由系统（Binding 优先级匹配） | 🟠 P2 | [specs/routing/spec.md](specs/routing/spec.md) | routing |
| **Phase 14** | **Windows 一键安装部署（NSIS + Portable）** | 🟠 P2 | [phase-14-windows-installer/](changes/phase-14-windows-installer/) | — |
| Phase 15 | 多代理编排（sessions_spawn / sessions_send） | 🔵 P3 | 待写 spec | sessions-spawn-tool |
| — | [task-orchestration/](changes/task-orchestration/) | 🔵 P3 | 待写 spec | — (Equality 差异化) |
| Phase 16 | 更多 Provider（智谱 GLM / Moonshot / 百川 / Yi） | 🔵 P3 | [specs/llm-provider/spec.md](specs/llm-provider/spec.md) | volcengine/minimax |
| Phase 16 | Windows 特有能力（右键菜单、截图分析、DPAPI 加密） | ⚪ P4 | 待写 spec | — |

### OpenClaw 工具对比（delta 分析）

| OpenClaw 工具 | Equality 状态 | 说明 |
|--------------|--------------|------|
| read_file / write_file / edit_file | ✅ 有 | — |
| bash / glob / grep / list_dir | ✅ 有 | bash 支持 background 模式 |
| web_fetch / web_search | ✅ 有 | Brave + DDG 双引擎 |
| read_image / pdf_tool | ✅ 有 | read_image + read_pdf |
| apply_patch | ✅ 有 | 4 级 fuzzy matching |
| process (list/poll/kill) | ✅ 有 | 后台进程管理 |
| **cron (定时任务)** | ✅ **有** | Phase 4: cron/every/at + notify/chat/agent + SSE 通知 |
| **browser_tool (Playwright)** | ✅ **有** | Phase 5: 复用 OpenClaw browser server，HTTP client ~150 行 |
| memory_tool (RAG) | ✅ **有** | Phase 12: SQLite+FTS5, memory_save + memory_search |
| message_tool (多渠道发消息) | ❌ 缺少 | Phase 13 |
| sessions_spawn (子代理) | ❌ 缺少 | Phase 14 |
| tts_tool (文本转语音) | ❌ 缺少 | 低优先级 |
| image_tool (图片生成) | ❌ 缺少 | 低优先级 |
| nodes_tool (IoT 设备) | ❌ 缺少 | 不适用 |
| discord/telegram/slack_actions | ❌ 缺少 | Phase 13 渠道 |
