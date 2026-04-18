# Equality — AI Desktop Assistant

[中文](./README_CN.md)

> A local AI Agent desktop app for Windows. 29 built-in tools, multi-Agent DAG orchestration, cross-session memory, automatic skill crystallization — more than a chatbot, it's an **AI work partner that evolves with you**.

---

## 🎯 Philosophy: Skill Equality

When a powerful model (e.g. GPT-5) completes a complex task, Equality automatically distills the execution method into a "skill document". Afterward, a cheaper model (e.g. DeepSeek V3) can read that skill and accomplish the same task. **The longer you use it, the smarter it gets — while costs keep dropping.**

---

## ✨ Core Capabilities

### 🤖 29 Built-in Tools — Agent Execution Engine

| Category | Tools |
|----------|-------|
| **File System** | `read_file` · `write_file` · `edit_file` · `apply_patch` · `list_dir` · `glob` · `grep` |
| **Code Intelligence** | `codebase_search` (semantic) · `lsp_hover` · `lsp_definition` · `lsp_references` · `lsp_diagnostics` |
| **Execution** | `bash` (sandboxed) · `browser` (Playwright) · `web_search` · `web_fetch` |
| **Memory** | `memory_save` · `memory_search` · `session_search` |
| **Multi-Agent** | `subagent_spawn` · `subagent_list` · `subagent_steer` · `subagent_kill` |
| **Media** | `read_image` · `read_pdf` · `skill_view` · `cron` |

- Automatic compile-error retry, tool loop detection, fake-execution interception
- `Promise.allSettled` parallel tool execution — one failure won't block others

### 🧠 Long-term Memory

- **Embedding Hybrid Search**: vector embedding + SQLite FTS5 keyword fusion
- Cross-session persistence: conversations and memories survive restarts
- Memory security: 14 THREAT_PATTERNS prevent injection attacks
- Unified management in Settings: view, edit, export/import

### 📝 Skills System

- **Auto-crystallization**: After complex tasks (≥5 tool calls), AI proposes saving as a reusable skill
- **Progressive disclosure**: System prompt injects metadata only; `skill_view` loads full instructions on demand
- **Skill Gallery**: Remote download + local install + security scanning
- **Hot reload**: SkillWatcher detects file changes, updates take effect immediately
- **Multi-layer priority**: Workspace > Personal > System

### 🎭 Multi-Agent Orchestration

- **6 built-in roles**: Planner · Architect · Coder · Runner · Reviewer · Researcher
- **Plan DAG engine**: Complex tasks decomposed into a directed acyclic graph, auto-parallelized
- **Runtime control**: `subagent_steer` to redirect, `subagent_kill` to terminate
- **Depth safety**: `toolDenyPrefixes` blocks recursive delegation + `maxDepth` limit

### 🔐 7-Layer Security

| Layer | Protection |
|-------|-----------|
| Policy Pipeline | Configurable allow/deny rules for tool calls |
| Change Classification | Auto-detect read/write/execute; high-risk requires approval |
| Sandbox Isolation | Bash commands guard against path traversal + symlink attacks |
| Injection Defense | 14 Prompt Injection pattern detectors |
| Network Protection | SSRF blocking, prevents access to internal addresses |
| Memory Safety | THREAT_PATTERNS scan all writes |
| Fact Checking | Answer Evidence Guard rejects unverified claims |

### 📊 Cost Tracking (Cost Ledger)

- Every LLM call recorded: token count, latency, CNY cost
- Three-level aggregation: per-session / daily / global
- Built-in pricing for Chinese models (DeepSeek / Qwen / Volcengine / MiniMax)
- Copilot models automatically marked as zero-cost

---

## 🌏 Supported Model Providers

| Provider | Highlights |
|----------|-----------|
| 🐙 **GitHub Copilot** | Free (with GitHub subscription) · GPT-4o/4.1/5, Claude, Gemini, o3/o4-mini |
| 🔮 **DeepSeek** | V3 / R1 reasoning models, visible thinking process |
| 🌟 **Qwen** | qwen3-coder-plus and other coding-enhanced models |
| 🌋 **Volcengine** | ByteDance Doubao series |
| 🤖 **MiniMax** | MiniMax-M1, supports thinking display |
| 🔌 **Custom** | Any OpenAI-compatible API |

**Smart Routing**: Light / Standard / Heavy auto-switching · `@model-name` override · multi-key rotation · seamless rate-limit fallback

---

## ⚔️ Equality vs Hermes-Agent

Hermes-Agent is a well-known open-source Python CLI Agent (763 .py files, 60+ tools). Head-to-head comparison:

| Dimension | Hermes | Equality | Verdict |
|-----------|--------|----------|---------|
| Core Loop | Sync while + 8 worker parallel | Async SSE + Promise.allSettled parallel | 🟢 Parity |
| Memory | FTS5 + frozen snapshot | FTS5 + **Embedding hybrid search** + frozen snapshot | 🟢 **Ahead** |
| Context Compression | LLM summary + pre-pruning | LLM chunked summary + **Identifier Shield** | 🟢 **Ahead** |
| Smart Routing | Keyword heuristic | Light/Standard/Heavy + `@model` + Fallback | 🟢 **Ahead** |
| Security | 6 layers | 7 layers + 14 injection detectors + memory threat scan | 🟢 **Ahead** |
| Code Intelligence | terminal grep | LSP hover/definition/references + codebase_search | 🟢 **Unique** |
| Sub-agent Control | Wait until done | steer redirect + kill terminate | 🟢 **Unique** |
| Cost Tracking | usage_pricing estimate | Cost Ledger (SQLite + 3-level aggregation) | 🟢 **Unique** |
| UI | CLI | Tauri desktop + React rich UI + Diff preview | 🟢 **Unique** |
| Tool Count | 60+ | 29 | 🟡 Hermes has more |
| Platform | CLI + 14 gateways | Desktop only | 🟡 Hermes wider |
| MoA | ✅ Multi-LLM collaborative reasoning | ❌ | 🟡 Hermes only |

**Out of 15 dimensions: 10 at parity or ahead, 3 partial gaps (non-core), 2 open gaps (MoA/Profiles, non-core).**

---

## ⚔️ Equality vs OpenClaw (Claw Code)

OpenClaw / Claw Code is an open-source Claude Code harness tool (50K+ stars) focused on extracting and repackaging Claude Code's system prompts and tool definitions. Comparison:

| Dimension | OpenClaw | Equality | Verdict |
|-----------|----------|----------|---------|
| Architecture | System prompt extraction + tool harness | Full Agent framework with own tool implementations | 🟢 **Equality: independent** |
| Model Support | Claude-only (depends on extracted prompts) | Multi-provider: Copilot, DeepSeek, Qwen, MiniMax, any OpenAI-compatible | 🟢 **Equality: wider** |
| Tool System | Mirrors Claude Code's tools verbatim | 29 self-implemented tools with security pipeline | 🟢 **Equality: original** |
| Skills/Learning | ❌ None | Auto-crystallization + Gallery + Hot reload | 🟢 **Equality: unique** |
| Memory | ❌ None | Embedding hybrid search + cross-session persistence | 🟢 **Equality: unique** |
| Multi-Agent | ❌ None | 6 roles + Plan DAG + steer/kill control | 🟢 **Equality: unique** |
| Security | Relies on Claude Code's built-in safety | 7-layer security + injection detection + memory threat scan | 🟢 **Equality: stronger** |
| Cost Tracking | ❌ None | Cost Ledger with 3-level aggregation | 🟢 **Equality: unique** |
| Desktop UI | ❌ CLI only | Tauri + React with Diff preview, themes, attachments | 🟢 **Equality: unique** |
| Sustainability | Depends on reverse-engineered prompts; may break on updates | Self-contained; no dependency on proprietary prompt extraction | 🟢 **Equality: sustainable** |
| Community | 50K+ stars, high visibility | Early stage | 🟡 OpenClaw has more users |

**Key advantage**: Equality is a self-contained, provider-agnostic AI Agent that owns its entire stack — not a wrapper around another product's leaked internals.

---

## 🖥️ Desktop Experience

- **Streaming chat**: AI replies and tool calls visible in real-time
- **Diff preview**: Line-level diffs before file writes, accept or reject
- **Interactive UI**: Buttons and dropdowns embedded in conversation
- **File attachments**: Drag-and-drop files, paste screenshots (images/PDF/text), up to 5
- **Pause & redirect**: Pause mid-execution, provide new instructions
- **Session management**: Multi-session switching, grouped by date
- **Themes & zoom**: Light/Dark/System, 50%–200% zoom
- **Lightweight**: ~25MB installer, system tray resident

---

## 🚀 Quick Start

### Prerequisites

Windows with:
- [Visual Studio Build Tools 2022](https://aka.ms/vs/17/release/vs_BuildTools.exe) (select "Desktop development with C++")
- Rust toolchain (`winget install Rustlang.Rustup`)
- Node.js ≥ 18 + pnpm ≥ 8

### Install & Run

```bash
pnpm install
pnpm dev:core      # Terminal 1: Start Agent Core backend
pnpm dev:desktop   # Terminal 2: Start desktop app
```

### First Use

1. Click **⚙️ Settings** → **Models** tab, configure at least one API key
   - Fastest: Click GitHub Copilot "Sign In", complete browser auth (free)
   - Recommended: Configure both Copilot + DeepSeek, enable smart routing

2. Return to chat and describe what you want to do

3. Explore:
   - `@` to invoke skill selector, `#` for tool selector
   - "Remind me to check emails every day at 9am" — AI auto-creates a cron job
   - Settings → **Memory** tab to manage cross-session memories

---

## 📄 License

MIT
