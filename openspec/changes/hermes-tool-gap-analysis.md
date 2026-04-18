# Hermes Agent 工具体系扫描 & Equality 差距分析

> 扫描日期：2026-04-18  
> Hermes 版本：hermes-agent（example/ 目录）  
> Equality 当前工具数：33 个  
> Hermes 工具数：约 55 个直接可调用工具 + 20+ 基础设施模块

---

## 一、Hermes 完整工具清单

### 🌐 Web 工具

| 工具名 | 描述 | 后端支持 |
|--------|------|---------|
| `web_search` | 搜索网络信息 | Exa / Firecrawl / Tavily / Parallel；LLM 摘要提取 |
| `web_extract` | 从指定 URL 提取网页内容（Markdown 格式） | 多后端；LLM 智能精简 |
| `web_crawl` | 按指令深度爬取整个网站 | 仅 Firecrawl/Tavily |

### 💻 终端/进程工具

| 工具名 | 描述 |
|--------|------|
| `terminal` | 执行命令；支持 local/Docker/Modal/SSH/Singularity/Daytona 六种后端 |
| `process` | 管理后台进程：轮询状态/读取滚动日志(200KB)/kill/崩溃恢复检查点 |

### 📁 文件工具

| 工具名 | 描述 |
|--------|------|
| `read_file` | 支持 offset/limit 分段；阻塞设备黑名单；二进制检测；敏感内容脱敏 |
| `write_file` | 写入路径拒绝列表（~/.ssh/~/.aws 等）；原子写入；触发 Checkpoint |
| `patch` | 支持 unified diff 和 V4A (codex) 格式；模糊匹配定位 |
| `search_files` | 正则/字面搜索；glob 文件过滤 |

### 👁️ 视觉/图像

| 工具名 | 描述 |
|--------|------|
| `vision_analyze` | 分析图像 URL 内容；多 LLM 后端（Anthropic/OpenRouter/Nous）；SSRF 防护 |
| `image_generate` | 文生图（FAL.ai FLUX 2 Pro）；自动 2× 超分辨率；横/方/竖比例 |

### 🌏 浏览器自动化（10 个工具）

| 工具名 | 描述 |
|--------|------|
| `browser_navigate` | 导航到 URL；本地 Chromium/Browserbase/Browser Use 三种后端 |
| `browser_snapshot` | 获取页面可访问性树（无需视觉模型，基于 ariaSnapshot） |
| `browser_click` | 点击页面元素（通过元素引用 @e1 等） |
| `browser_type` | 在元素中输入文本 |
| `browser_scroll` | 滚动页面（上/下/特定元素） |
| `browser_back` | 浏览器后退 |
| `browser_key` | 按键盘按键（Enter/Tab/Escape） |
| `browser_get_images` | 获取页面所有图像链接 |
| `browser_vision` | 页面截图 + LLM 视觉分析一体化 |
| `browser_console` | 在页面执行 JavaScript |

### 🧠 Skills 工具（3 个）

| 工具名 | 描述 |
|--------|------|
| `skills_list` | 列出所有技能元数据（渐进披露第 1 层）；平台过滤 |
| `skill_view` | 加载技能完整内容（第 2-3 层）；自动注册环境变量 |
| `skill_manage` | 创建/编辑/打补丁/删除技能文件；写入后自动安全扫描 |

### 💾 记忆工具

| 工具名 | 描述 |
|--------|------|
| `memory` | 操作：save/search/list/delete；双存储（MEMORY.md 事实 + 用户画像）；注入检测；System Prompt 冻结快照 |

### ✅ 任务规划工具

| 工具名 | 描述 |
|--------|------|
| `todo` | 会话内任务列表：write(替换/合并)/read；状态：not-started/in-progress/completed/blocked；上下文压缩后自动恢复 |

### 🔍 会话搜索

| 工具名 | 描述 |
|--------|------|
| `session_search` | SQLite FTS5 全文检索历史对话；LLM 摘要 Top-N；100K 上下文截断 |

### ❓ 澄清工具

| 工具名 | 描述 |
|--------|------|
| `clarify` | 向用户提问（最多 4 个预设选项或开放式）；CLI 箭头键导航；消息平台编号列表 |

### 🐍 代码执行工具

| 工具名 | 描述 |
|--------|------|
| `execute_code` | 运行可调用 Hermes 工具的 Python 脚本；本地 UDS RPC；最大 300s/50 次工具调用；中间结果不污染上下文 |

### 🤖 子代理委托

| 工具名 | 描述 |
|--------|------|
| `delegate_task` | 派生独立上下文子代理；批量并行（最多 3 并发）；最大嵌套深度 2；子代理不可使用 memory/clarify/todo |

### ⏰ 定时任务

| 工具名 | 描述 |
|--------|------|
| `cronjob` | create/list/delete/pause/resume/trigger；平台投递；Prompt 注入扫描；自然语言 schedule 解析 |

### 📨 消息发送

| 工具名 | 描述 |
|--------|------|
| `send_message` | 向 Telegram/Discord/Slack/WhatsApp/Signal/飞书/WeCom 等平台发送消息；图片/视频/音频附件 |

### 🏠 Home Assistant（4 个工具）

| 工具名 | 描述 |
|--------|------|
| `ha_list_entities` | 列出 HA 实体；domain/area 过滤 |
| `ha_get_state` | 获取实体详细状态 |
| `ha_list_services` | 列出可用服务/动作 |
| `ha_call_service` | 调用 HA 服务（turn_on/off/temperature 等）；阻止高危域 |

### 🗣️ 语音工具

| 工具名 | 描述 |
|--------|------|
| `text_to_speech` | 文字转语音；Edge TTS（免费）/ElevenLabs/OpenAI/MiniMax/NeuTTS 本地；输出 Opus/MP3 |
| `transcription` | 语音转文字；faster-whisper(本地)/Groq/OpenAI/Mistral Voxtral；mp3/mp4/wav/ogg |

### 🧩 MCP 集成

| 工具名 | 描述 |
|--------|------|
| `[动态 MCP 工具]` | 连接外部 MCP 服务器，自动发现并注册工具；stdio/HTTP/StreamableHTTP；自动重连 |

### 🧪 Mixture-of-Agents

| 工具名 | 描述 |
|--------|------|
| `mixture_of_agents` | 多 LLM 并行解决复杂问题（Claude Opus/Gemini Pro/GPT-5/DeepSeek 并行 + 汇总） |

### 🎓 强化学习工具（10 个，高度专业化）

`rl_list_envs`, `rl_select_env`, `rl_view_config`, `rl_update_config`, `rl_start_training`, `rl_view_status`, `rl_stop_training`, `rl_get_results`, `rl_list_runs`, `rl_test_inference`

---

## 二、Equality vs Hermes 工具对照

### Equality 现有 33 个工具

| 类别 | 工具 |
|------|------|
| 文件 | `read_file`, `write_file`, `edit_file`, `apply_patch`, `list_dir`, `glob`, `grep`, `read_pdf` |
| 运行时 | `bash`, `process` |
| LSP | `lsp_definition`, `lsp_references`, `lsp_hover`, `lsp_diagnostics` |
| Web | `web_search`, `web_fetch` |
| 记忆 | `memory_save`, `memory_search` |
| 子代理 | `subagent_spawn`, `subagent_list`, `subagent_steer`, `subagent_kill` |
| 浏览器 | `browser` |
| 媒体 | `read_image`, `read_pdf` |
| 自动化 | `cron` |
| 搜索 | `codebase_search`, `session_search` |
| 技能 | `skill_view` |

---

## 三、差距分析与优先级

### 🔴 P1 — 高价值、实现成本低（建议优先实现）

| Hermes 工具 | Equality 当前状态 | 差距说明 | 实现思路 |
|------------|-----------------|---------|---------|
| `web_crawl` | `web_fetch`（单页） | Hermes 可递归爬取整个网站，Equality 只能单页 | 调用 Firecrawl/Jina Reader API |
| `vision_analyze` | `read_image`（附件读取） | Hermes 支持给 URL 让视觉模型分析；Equality `read_image` 只处理本地附件 | 扩展 `read_image` 支持 URL 输入；调用 LLM vision endpoint |
| `todo` | 无专用工具 | Hermes 有结构化任务列表，上下文压缩后自动恢复；Equality 无等价工具 | 轻量实现：会话级 JSON 存储；状态机 not-started/in-progress/completed |
| `memory` (delete/list) | `memory_save`/`memory_search` | Equality 缺少 `memory_delete` 和 `memory_list`，管理能力弱 | 在现有 memory 工具添加 `action` 参数 |

### 🟡 P2 — 高价值、实现成本中等

| Hermes 工具 | Equality 当前状态 | 差距说明 | 实现思路 |
|------------|-----------------|---------|---------|
| `image_generate` | 无 | 文生图能力完全缺失 | 接入 FAL.ai / Replicate / DALL-E API；桌面端展示生成图片 |
| `clarify` | 有 InteractivePayload（按钮/下拉） | Equality 的交互式块更丰富，但需要模型主动构造 XML；Hermes 有专用工具更易触发 | 封装一个 `ask_user` 工具，调用现有 InteractivePayload 机制 |
| MCP 集成 | 无 | Hermes 可动态接入任意 MCP 服务器（70+ 社区 MCP 工具）；Equality 完全缺失 | 接入 MCP SDK；在 Settings 中配置 MCP 服务器列表 |
| `send_message` | 作为 Skill 实现（wechat-push/dingtalk） | Hermes 是内置工具，直接可调用；Equality 依赖 Skill | 将通知发送提升为内置工具；支持更多平台 |

### 🟢 P3 — 有价值但非核心

| Hermes 工具 | Equality 当前状态 | 差距说明 | 备注 |
|------------|-----------------|---------|------|
| `text_to_speech` | 无 | Hermes 支持多平台 TTS；桌面端 Equality 可以语音播报回答 | 桌面应用场景更适合 |
| `transcription` | 无 | 语音输入；Hermes 支持本地 Whisper | Tauri 支持麦克风权限，可实现 |
| `execute_code` | `bash`（通用命令执行） | Hermes 的 `execute_code` 允许 Python 脚本内部调用工具，中间状态不污染主上下文 | 适合长链任务隔离 |
| `browser_snapshot` | `browser`（截图+视觉） | Hermes 的 accessibility tree 模式不需要视觉模型，Token 消耗更低 | 改进现有 browser 工具 |
| `browser_console` | 无 | 页面内执行 JS；适合高级 Web 自动化场景 | 可扩展现有 browser 工具 |

### ⚪ P4 — 低优先级或不适合 Equality

| Hermes 工具 | 原因 |
|------------|------|
| `homeassistant` (4个) | 高度垂直场景，IoT 控制；Equality 定位是开发者工具，不是智能家居 |
| `rl_*` (10个) | 强化学习训练工具，极度专业化；与 Equality 产品定位不符 |
| `mixture_of_agents` | 已分析：需要多 LLM API 密钥并发；成本高；复杂任务可用 subagent 替代 |
| `voice_mode` | 完整语音交互（录音+STT+TTS）；桌面端可考虑但优先级低 |

---

## 四、基础设施能力差距

Hermes 有若干**框架级**能力值得参考：

| Hermes 基础设施 | Equality 现状 | 建议 |
|---------------|-------------|------|
| **Checkpoint（文件快照回滚）** | 无 | 写文件前 git shadow 快照；Undo 能力；高价值安全特性 |
| **V4A 补丁格式** | 只支持 unified diff | V4A（`*** Begin Patch` 格式）是 codex/cline 等工具用的格式；支持可提高兼容性 |
| **工具输出预算分层**（单结果 100K / 单轮 200K） | 有工具输出截断但不够精细 | 参考 Hermes 的三层防护：工具内截断 → 溢出存沙箱文件 → 单轮聚合预算 |
| **Tirith 预执行安全扫描** | 有 Prompt Injection 检测 | Hermes 的同形字攻击检测（ℯ ≠ e）值得参考 |
| **危险命令审批系统** | 有变更分类（读/写/执行）但没有命令级白名单 | 持久化白名单避免重复确认；LLM 自动审批低风险命令 |
| **技能安全扫描（5 级规则）** | 有基础安全扫描（Phase 7） | Hermes 的数据外泄/持久化/混淆检测更完善 |

---

## 五、实施建议优先级

```
Phase Y（下一个）:
  Y1. todo 工具 — 结构化任务列表（轻量，高频需求）
  Y2. memory_delete + memory_list — 完善记忆工具
  Y3. vision_analyze URL 模式 — 扩展 read_image 支持 URL
  Y4. web_crawl — 接入 Jina Reader /r/ 前缀实现深度爬取

Phase Z:
  Z1. image_generate — 接入 FAL.ai 或 DALL-E
  Z2. ask_user 工具 — 封装 InteractivePayload 为专用工具
  Z3. browser_console + browser_snapshot(aria) — 扩展 browser 工具
  Z4. MCP 集成框架 — Settings 配置 + 动态工具注册

长期:
  - TTS/STT 语音工具（桌面专属优势）
  - Checkpoint 文件快照回滚
  - send_message 提升为内置工具
```

---

## 六、结论

Hermes 的 60+ 工具中：
- **10 个工具**对 Equality 有直接价值（P1/P2），其中 `todo`、`vision_analyze URL`、`web_crawl`、`memory` 完善 成本最低、效果最明显
- **MCP 集成**是架构级差距，一旦实现可接入社区数百个 MCP 工具，弥补工具数量差
- **15 个 Hermes 独有工具**（HA/RL/MoA/语音）与 Equality 当前定位（开发者 AI 助手）不重叠，暂不需要
- Equality 对 Hermes 的核心优势（LSP 代码智能、桌面 UI、Cost Ledger、Diff 预览）在 Hermes 工具中完全没有对应实现
