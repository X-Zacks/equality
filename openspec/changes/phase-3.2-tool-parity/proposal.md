# Proposal: Phase 3.2 — 内置工具全面对齐 OpenClaw

## 动机

将 Equality 的内置工具与 OpenClaw（运行于 macOS 的全功能 AI 助手）全面对齐。
OpenClaw 拥有约 30 个内置工具，涵盖文件系统、运行时、网络、媒体、记忆、会话、浏览器、自动化等类别。
Equality 在 Phase 2 仅实现了 5 个基础工具（bash、read_file、write_file、glob、web_fetch），
在 Phase 3.1 新增了 2 个媒体工具（read_image、read_pdf），但仍缺少多个关键工具。

## OpenClaw vs Equality 完整对照

### 第一梯队：核心编码工具（Phase 2 + 本次补齐）

| OpenClaw 工具 | Equality 状态 | 优先级 |
|---|---|---|
| `read_file` | ✅ Phase 2 已有 | — |
| `write_file` | ✅ Phase 2 已有 | — |
| `edit_file` (search-and-replace) | ❌ **缺失** → 本次新增 | P0 |
| `bash` / `exec` | ✅ Phase 2 已有（基础版） | — |
| `grep` (文本搜索) | ❌ **缺失** → 本次新增 | P0 |
| `glob` / `find` (文件搜索) | ✅ Phase 2 已有 | — |
| `list_dir` (目录列表) | ❌ **缺失** → 本次新增 | P0 |

### 第二梯队：网络工具

| OpenClaw 工具 | Equality 状态 | 优先级 |
|---|---|---|
| `web_fetch` | ✅ Phase 2 已有 | — |
| `web_search` (Brave/DDG) | ❌ **缺失** → 本次新增 | P0 |

### 第三梯队：媒体工具（Phase 3.1 已完成）

| OpenClaw 工具 | Equality 状态 | 优先级 |
|---|---|---|
| `read_image` (视觉分析) | ✅ Phase 3.1 已有 | — |
| `read_pdf` (PDF 提取) | ✅ Phase 3.1 已有 | — |
| `tts` (文字转语音) | ❌ 缺失 | P2 |

### 第四梯队：进程管理（本次增强 + 新增）

| OpenClaw 工具 | Equality 状态 | 优先级 |
|---|---|---|
| `exec` (后台进程支持) | ⚠️ bash 缺后台支持 → 本次增强 | P1 |
| `process` (后台进程管理) | ❌ **缺失** → 本次新增 | P1 |

### 第五梯队：高级功能（后续 Phase 实现）

| OpenClaw 工具 | Equality 状态 | 优先级 |
|---|---|---|
| `apply_patch` (多文件补丁) | ❌ 缺失 | P1 |
| `web_search` 多引擎 | ⚠️ 当前仅 Brave+DDG | P2 |
| `memory_search` / `memory_get` | ❌ 缺失 | P2 |
| `sessions_*` (多会话通信) | ❌ 缺失 | P3 |
| `browser` (浏览器自动化) | ❌ 缺失 | P3 |
| `cron` (定时任务) | ❌ 缺失 | P3 |
| `nodes` (设备控制) | ❌ 缺失 | P3 |
| `canvas` (画布操作) | ❌ 缺失 | P3 |
| `agents_list` | ❌ 缺失 | P3 |

## 本次范围 (Phase 3.2)

### In Scope — P0 优先级（核心编码工具）
1. **`edit_file`** — 精确文本替换（两级模糊匹配，借鉴 OpenClaw 的 seekSequence）
2. **`grep`** — 文本搜索（纯 JS 实现，不依赖 ripgrep 二进制）
3. **`list_dir`** — 目录列表（排序 + 大小显示）
4. **`web_search`** — 网页搜索（Brave Search API + DuckDuckGo 回退）

### In Scope — P1 优先级（进程管理 + 补丁）
5. **bash 增强** — 后台进程支持（background 模式、yield 机制）
6. **`process`** — 后台进程管理（list/poll/kill）
7. **`apply_patch`** — 多文件补丁应用（OpenAI patch 格式，四级模糊匹配）

### Out of Scope（后续 Phase）
- P2: memory 系统、TTS、web_search 多引擎
- P3: browser、sessions、cron、nodes、canvas

## OpenClaw 关键设计借鉴点

### edit_file — 两级模糊匹配
- 第 1 级：精确文本匹配（唯一性检查）
- 第 2 级：Unicode 归一化后匹配（智能引号→ASCII引号、Unicode破折号→`-`、Unicode空格→普通空格 + trimEnd）

### grep — ripgrep 设计简化版
- OpenClaw 用外部 ripgrep 二进制 + JSONL 模式解析
- 我们用纯 JS（fast-glob + fs.readFileSync）替代，零依赖
- 保留核心特性：regex/literal、大小写不敏感、上下文行、文件过滤、二进制跳过

### web_search — 多 Provider 架构
- OpenClaw 支持 5 个引擎（Brave/Perplexity/Grok/Kimi/Gemini）
- 我们先实现 Brave + DuckDuckGo HTML 抓取作为回退
- 后续可扩展 Perplexity 等

### apply_patch — 四级回退匹配
- 第 1 级：精确匹配
- 第 2 级：trimEnd
- 第 3 级：trim
- 第 4 级：trim + Unicode 标点归一化（normalizePunctuation）

### bash 后台进程 — yield 机制
- OpenClaw 的 exec 支持 `background: true` 和 `yieldMs: N`
- yield 后命令继续后台运行，返回 sessionId
- 通过 process 工具的 poll/log/kill 跟进

## 安全考虑
- `edit_file`：唯一性检查防止替换到错误位置；备份机制
- `grep`：二进制文件自动跳过；输出截断保护
- `web_search`：结果缓存防止滥用；DuckDuckGo 抓取不泄露 API key
- `apply_patch`：workspace 边界限制；模糊匹配有严格级别递增
- `process`：进程作用域隔离；kill 前确认

## 依赖
- fast-glob（已有）— grep 文件遍历
- undici（已有）— web_search 代理穿透
- 无新外部依赖（P0 工具全部纯 JS 实现）
