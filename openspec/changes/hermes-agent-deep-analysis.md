# Hermes-Agent 深度分析报告

> 分析对象: [hermes-agent](https://github.com/NousResearch/hermes-agent) by Nous Research  
> 分析日期: 2025 年  
> 目的: 为 Equality 的 Agent 架构演进提供竞品参考

---

## 目录

1. [项目概览](#1-项目概览)
2. [核心架构：AIAgent 循环](#2-核心架构aiagent-循环)
3. [System Prompt 构建](#3-system-prompt-构建)
4. [记忆系统](#4-记忆系统)
5. [技能系统（Skills）](#5-技能系统skills)
6. [子代理委派（Delegation）](#6-子代理委派delegation)
7. [上下文压缩](#7-上下文压缩)
8. [会话存储与搜索](#8-会话存储与搜索)
9. [多平台网关](#9-多平台网关)
10. [定时任务（Cron）](#10-定时任务cron)
11. [工具系统](#11-工具系统)
12. [智能路由（Smart Routing）](#12-智能路由smart-routing)
13. [Prompt 缓存策略](#13-prompt-缓存策略)
14. [安全防护](#14-安全防护)
15. [Profiles 多实例](#15-profiles-多实例)
16. [版本演进脉络](#16-版本演进脉络)
17. [与 Equality 的对比分析](#17-与-equality-的对比分析)
18. [可借鉴的设计模式](#18-可借鉴的设计模式)

---

## 1. 项目概览

Hermes-Agent 是 Nous Research 开发的"自我改进型 AI Agent"。核心定位是一个**全栈个人代理**——集 CLI 工具、多平台消息机器人、RL 训练数据生成器于一身。

### 关键特征

| 维度 | 描述 |
|------|------|
| **语言** | Python (同步为主，gateway 层用 asyncio) |
| **LLM 接口** | OpenAI chat completions API (兼容 200+ 模型) |
| **平台** | CLI, Telegram, Discord, Slack, WhatsApp, Signal, Email, SMS, Matrix, 飞书, 企业微信, Home Assistant |
| **终端后端** | 本地 shell, Docker, SSH, Daytona, Singularity, Modal |
| **存储** | SQLite + WAL + FTS5 (会话), MEMORY.md/USER.md (记忆), YAML (配置) |
| **测试** | ~3,000+ pytest 测试 |
| **代码量** | run_agent.py 9,611 行, 总计约 50,000+ 行 Python |

### "自我改进"闭环

```
用户对话 → 学到新方法 → 自动创建 Skill → 下次同类任务自动激活 Skill
    ↑                                           ↓
    └─── Session Search 回顾历史 ←─── Memory Nudge 提示持久化 ───┘
```

这是 hermes-agent 最核心的差异化卖点：**它在运行过程中不断积累经验并自我进化。**

---

## 2. 核心架构：AIAgent 循环

### 文件: `run_agent.py` (9,611 行)

AIAgent 是整个系统的心脏。核心循环完全**同步**：

```python
class AIAgent:
    def run_conversation(self, user_message, system_message=None, ...):
        while api_call_count < max_iterations and budget.remaining > 0:
            response = client.chat.completions.create(
                model=model, messages=messages, tools=tool_schemas
            )
            if response.tool_calls:
                for tool_call in response.tool_calls:
                    result = handle_function_call(name, args, task_id)
                    messages.append(tool_result_message(result))
            else:
                return response.content  # 对话结束
```

### 关键设计

1. **IterationBudget** — 线程安全的迭代预算计数器  
   - 父代理默认 90 次, 子代理默认 50 次  
   - `execute_code` 工具的迭代可以 refund (不计入预算)
   - 70% 时 nudge, 90% 时 urgent warning

2. **并行工具执行** — `_should_parallelize_tool_batch()` 判断安全性  
   - `_PARALLEL_SAFE_TOOLS`: read_file, web_search 等只读工具可并行  
   - `_PATH_SCOPED_TOOLS`: write_file 等需路径不重叠才可并行  
   - `_NEVER_PARALLEL_TOOLS`: clarify 等交互工具永不并行  
   - 最大 8 个并行 worker

3. **API 模式自动检测**  
   - `chat_completions` (默认)  
   - `codex_responses` (OpenAI GPT-5/Codex 走 Responses API)  
   - `anthropic_messages` (Anthropic 原生 Messages API)

4. **代理级工具拦截** — `todo`, `memory` 在进入通用 `handle_function_call()` 之前被 AIAgent 自身拦截处理

### 与 Equality 的对比

| 维度 | Hermes | Equality |
|------|--------|----------|
| 循环模型 | 同步 while + budget | 异步 SSE stream |
| 迭代预算 | 有 (IterationBudget) | 无 (无限制) |
| 并行工具 | 有 (ThreadPoolExecutor) | 无 (串行) |
| 工具拦截 | 有 (todo, memory) | 无 |

---

## 3. System Prompt 构建

### 文件: `agent/prompt_builder.py` (991 行)

System prompt 由多个模块化组件拼装而成：

```
Identity (DEFAULT_AGENT_IDENTITY)
  + Platform Hints (PLATFORM_HINTS[platform])
  + SOUL.md (用户个性文件, 类似 AGENTS.md)
  + Context Files (AGENTS.md, .cursorrules, .hermes.md)
  + Skills Index (已安装技能的元数据摘要)
  + Memory Snapshot (MEMORY.md + USER.md 冻结快照)
  + Tool-Use Enforcement (按模型注入不同的引导)
  + Ephemeral Prompt (单会话额外指令)
```

### 亮点设计

1. **按模型家族注入不同引导**:
   - GPT/Codex → `OPENAI_MODEL_EXECUTION_GUIDANCE` (12 个子节, XML 标签包裹)
   - Gemini/Gemma → `GOOGLE_MODEL_OPERATIONAL_GUIDANCE`
   - 通用 → `TOOL_USE_ENFORCEMENT_GUIDANCE`

2. **提示注入扫描** (`_scan_context_content`):
   - 10 种正则模式检测 prompt injection
   - 不可见 Unicode 字符检测
   - 命中时整个文件被替换为 `[BLOCKED]` 占位符

3. **HERMES.md 发现机制**: 从 cwd 向上搜索到 git root, 类似 `.gitignore` 的查找逻辑

4. **Skills 提示缓存**: LRU + 磁盘快照 (`_SKILLS_PROMPT_CACHE`), 冷启动从磁盘恢复

5. **Developer Role**: GPT-5/Codex 自动使用 `developer` 角色替代 `system`

### 与 Equality 的对比

Equality 的 `system-prompt.ts` 约 200 行, 组件较少:
- Identity + 工具引导 + 长期记忆引导 + 任务感知规则
- **缺少**: 按模型分别引导、提示注入扫描、context file 层级发现

---

## 4. 记忆系统

### 架构层次

```
MemoryManager (orchestrator)
  ├── BuiltinMemoryProvider (always active)
  │     └── MemoryStore → MEMORY.md + USER.md
  └── [1 external provider] (optional, e.g. mem0, honcho, supermemory...)
```

### 内置记忆 (tools/memory_tool.py)

- **两个文件**: `MEMORY.md` (Agent 观察笔记) + `USER.md` (用户画像)
- **条目分隔符**: `§` (section sign)
- **容量限制**: MEMORY 2,200 字符, USER 1,375 字符
- **冻结快照模式**: 
  - 会话开始时 `load_from_disk()` → 捕获 `_system_prompt_snapshot`
  - 整个会话期间 system prompt 中的记忆内容不变 (保护 prompt cache)
  - 工具调用写入磁盘, 但 **不更新** system prompt
  - 下个会话才会看到新写入的记忆

### Memory Provider 插件

8 个已有插件: `byterover`, `hindsight`, `holographic`, `honcho`, `mem0`, `openviking`, `retaindb`, `supermemory`

Provider 接口 (`agent/memory_provider.py`):
- `system_prompt_block()` → 注入 system prompt
- `prefetch(query)` → 每轮 user message 触发相关记忆召回
- `sync_turn(user, assistant)` → 对话轮次后同步
- `on_pre_compress()` → 压缩前通知
- `on_delegation()` → 子代理完成后通知
- `get_tool_schemas()` → 提供额外记忆工具

### Memory Guidance (prompt_builder.py)

```python
MEMORY_GUIDANCE = """
Save durable facts using the memory tool: user preferences, environment details,
tool quirks, stable conventions.
Prioritize what reduces future user steering — the most valuable memory is one
that prevents the user from having to correct or remind you again.
Do NOT save task progress, session outcomes, completed-work logs, or temporary TODO.
If you've discovered a new way to do something, save it as a skill.
"""
```

### 安全防护

`_scan_memory_content()` — 与 prompt_builder 类似的注入检测, 防止通过记忆条目注入恶意指令。

### 与 Equality 的对比

| 维度 | Hermes | Equality |
|------|--------|----------|
| 存储 | MEMORY.md + USER.md (§分隔) | memory_save/search (kv式) |
| 容量 | 2,200 + 1,375 字符硬限 | 无限制 |
| 冻结快照 | ✅ (保护 prompt cache) | ❌ (每轮重新注入) |
| 插件化 | ✅ (8 个第三方 Provider) | ❌ |
| 安全扫描 | ✅ | ❌ |
| Guidance | 精确 (区分 memory vs skill vs session_search) | 已改善 (Phase 7 修复) |

**关键启示**: Hermes 的**冻结快照模式**是个极好的设计——既能保护 prompt cache 又能确保一致性。Equality 应考虑类似的机制。

---

## 5. 技能系统（Skills）

### 文件: `tools/skills_tool.py` (1,377 行)

Skills 是 hermes-agent 最具创新性的系统——**Agent 在解决问题后自动将解法持久化为可复用的"技能"**。

### 目录结构

```
~/.hermes/skills/
├── category/
│   └── my-skill/
│       ├── SKILL.md          # 主指令 (YAML frontmatter + Markdown body)
│       ├── references/       # 参考文档
│       ├── templates/        # 输出模板
│       └── assets/           # 辅助文件
```

### SKILL.md 格式

```yaml
---
name: skill-name            # ≤64 字符
description: Brief desc     # ≤1024 字符
version: 1.0.0
platforms: [macos, linux]   # 平台过滤
prerequisites:
  env_vars: [API_KEY]
  commands: [curl, jq]
---

# 完整指令...
```

### 三层渐进式披露 (Progressive Disclosure)

1. **Tier 1 — 元数据**: `skills_list` 只返回 name + description (token 高效)
2. **Tier 2 — 完整指令**: `skill_view(name)` 加载 SKILL.md 全文
3. **Tier 3 — 链接文件**: `skill_view(name, "references/api.md")` 按需加载

### 技能触发机制

- `skill_manage(action='create')` — Agent 主动创建
- `skill_manage(action='patch')` — 发现技能过时时即时修补
- Skills Index 注入 system prompt, LLM 看到后按需调用 `skill_view`

### Slash 命令激活

```
~/.hermes/skills/ 下的技能自动注册为 slash 命令
/skill_name → 作为 user message 注入 (不是 system prompt, 保护缓存)
```

### Skills Guidance

```python
SKILLS_GUIDANCE = """
After completing a complex task (5+ tool calls), fixing a tricky error,
or discovering a non-trivial workflow, save the approach as a skill.
When using a skill and finding it outdated, immediately patch it.
Skills that aren't maintained become liabilities.
"""
```

### 与 Equality 的对比

Equality 目前**没有 Skills 系统**。这是最大的差距之一。hermes-agent 的 Skills 类似于"可编程的 few-shot examples"——Agent 自己编写、自己维护、自己使用。

**建议**: Equality Phase P 可以实现一个简化版的 Skills 系统:
- `packages/core/src/skills/` — 技能目录
- 在 AGENTS.md 中注册技能元数据
- Agent 完成复杂任务后提示创建 skill

---

## 6. 子代理委派（Delegation）

### 文件: `tools/delegate_tool.py` (979 行)

### 架构

```
Parent Agent (depth=0)
  ├── delegate_task(goal, context, toolsets)
  │     ├── Child Agent (depth=1, isolated context)
  │     │     └── goal-focused system prompt
  │     ├── Child Agent (depth=1, parallel)
  │     └── Child Agent (depth=1, parallel)
  └── receives summary results
```

### 关键设计

1. **完全隔离**: 子代理获得全新对话历史, 不共享父代理上下文
2. **受限工具集**: 
   ```python
   DELEGATE_BLOCKED_TOOLS = frozenset([
       "delegate_task",   # 禁止递归委派
       "clarify",         # 禁止用户交互
       "memory",          # 禁止写入共享记忆
       "send_message",    # 禁止跨平台副作用
       "execute_code",    # 强制逐步推理
   ])
   ```
3. **深度限制**: MAX_DEPTH=2, 防止无限递归
4. **并行执行**: 最多 3 个子代理并发 (ThreadPoolExecutor)
5. **工具集继承**: 子代理 toolset ⊆ 父代理 toolset (交集)
6. **凭证路由**: 可配置子代理使用不同的 provider:model 对 (如廉价模型)
7. **进度回调**: 子代理的工具调用实时中继到父代理的 spinner/gateway 显示

### 子代理 System Prompt

```python
def _build_child_system_prompt(goal, context, workspace_path):
    return f"""
    You are a focused subagent working on a specific delegated task.
    
    YOUR TASK: {goal}
    CONTEXT: {context}
    WORKSPACE PATH: {workspace_path}
    
    Complete this task. When finished, provide a clear summary of:
    - What you did
    - What you found or accomplished
    - Any files created or modified
    - Any issues encountered
    """
```

### 与 Equality 的对比

| 维度 | Hermes | Equality |
|------|--------|----------|
| 子代理隔离 | ✅ 全新对话 | ⚠️ 共享 session, sub-session key |
| 工具限制 | ✅ 5 种阻止工具 | ❌ 全量工具 |
| 深度限制 | ✅ MAX_DEPTH=2 | ❌ |
| 并行执行 | ✅ 3 concurrent | ❌ 串行 |
| 凭证路由 | ✅ 不同 model | ❌ 同 model |
| 进度追踪 | ✅ 实时中继 | ❌ |

**关键启示**: Hermes 的子代理设计非常成熟, 特别是"blocked tools"和"parallel batch mode"。Equality 的 SubagentManager 可以借鉴这些模式。

---

## 7. 上下文压缩

### 文件: `agent/context_compressor.py` (746 行)

### 算法

```
1. 预剪枝: 替换旧 tool result 为 "[Old tool output cleared]"
2. 保护头部: system prompt + 第一轮交换 (protect_first_n=3)
3. 保护尾部: 最近 ~20K token (token budget, 非固定消息数)
4. 摘要中间: 结构化 LLM prompt 生成摘要
5. 迭代更新: 后续压缩基于上次摘要增量更新
```

### 摘要模板

```
Goal, Progress, Decisions, Files, Next Steps
```

### 关键参数

- `threshold_percent = 0.50` — 使用 50% 上下文时触发压缩
- `protect_first_n = 3` — 保护前 3 条消息
- `tail_token_budget` — 按 token 预算保护尾部 (非固定消息数)
- `_MIN_SUMMARY_TOKENS = 2,000` — 摘要最少 token
- `_SUMMARY_TOKENS_CEILING = 12,000` — 摘要最多 token
- 压缩失败后 10 分钟冷却期 (`_SUMMARY_FAILURE_COOLDOWN_SECONDS`)

### 上下文探测 (Context Probing)

当收到 "context too long" 错误时, 自动缩小上下文窗口 (`get_next_probe_tier`), 逐步找到实际可用的上下文大小。

### 与 Equality 的对比

Equality 目前**没有上下文压缩**。对于长对话, 这是关键缺失。

---

## 8. 会话存储与搜索

### 文件: `hermes_state.py` (1,305 行)

### SQLite Schema

```sql
sessions (id, source, model, started_at, title, ...)
messages (session_id, role, content, tool_calls, reasoning, ...)
messages_fts USING fts5(content)  -- 全文搜索
```

### 设计亮点

1. **WAL 模式**: 支持并发读写 (网关多平台场景)
2. **FTS5**: 全文搜索, 自动触发器维护索引
3. **写竞争处理**: 随机 jitter 重试替代 SQLite 内置的确定性退避 (避免 convoy effect)
4. **定期 WAL checkpoint**: 每 50 次写入触发一次 passive checkpoint
5. **Schema 迁移**: `SCHEMA_VERSION = 6`, 支持版本升级

### Session Search Tool

```python
Flow:
  1. FTS5 搜索匹配消息 (按相关性排名)
  2. 按 session 分组, 取 top 3
  3. 加载对话, 截断到 ~100K 字符 (围绕匹配点)
  4. 用 Gemini Flash 生成摘要
  5. 返回结构化的每 session 摘要
```

### 与 Equality 的对比

| 维度 | Hermes | Equality |
|------|--------|----------|
| 存储 | SQLite + WAL | JSON 文件 |
| 搜索 | FTS5 全文 + LLM 摘要 | 无搜索 |
| 元数据 | tokens, cost, model, platform | 基本 |

---

## 9. 多平台网关

### 目录: `gateway/`

支持 14+ 平台的统一消息网关:

```
gateway/
├── run.py              # 主网关循环
├── session.py          # 每平台会话管理
├── delivery.py         # 消息投递
├── hooks.py            # 钩子系统
├── mirror.py           # 跨平台镜像
├── pairing.py          # 设备配对
├── stream_consumer.py  # 流式消费
└── platforms/
    ├── telegram.py
    ├── discord.py
    ├── slack.py
    ├── whatsapp.py
    ├── signal.py
    ├── matrix.py
    ├── mattermost.py
    ├── email_adapter.py
    ├── sms.py
    ├── dingtalk.py
    ├── feishu.py
    ├── wecom.py
    ├── bluebubbles.py
    └── homeassistant.py
```

每个平台适配器遵循统一接口:
- `connect()` / `disconnect()`
- 消息接收 → 标准化为内部格式 → 路由到 AIAgent
- 响应 → 平台特定格式化 → 投递

### 网关缓存

AIAgent 实例在网关中被缓存 (而非每消息新建), 保留 Anthropic prompt cache 跨轮次。

---

## 10. 定时任务（Cron）

### 目录: `cron/`

```python
# 自然语言定义定时任务
/cron add "每周一早上 9 点总结邮箱" deliver=telegram

# 架构
scheduler.py  # tick() 每 60 秒检查到期任务
jobs.py       # JSON 文件存储任务定义 + 状态
```

关键设计:
- 文件锁防止并发 tick
- `SILENT_MARKER = "[SILENT]"` — 无新内容时抑制投递
- 结果可投递到 origin 平台、指定平台、或仅本地保存
- Cron Agent 运行时 platform hint 为 "cron" (无用户交互)

---

## 11. 工具系统

### 三文件模式

```
1. tools/your_tool.py     → 定义 handler + registry.register()
2. model_tools.py          → _discover_tools() 导入
3. toolsets.py             → 加入 _HERMES_CORE_TOOLS 或自定义 toolset
```

### Registry (`tools/registry.py`)

```python
registry.register(
    name="example_tool",
    toolset="example",
    schema={...},
    handler=lambda args, **kw: ...,
    check_fn=check_requirements,   # 可用性检查
    requires_env=["API_KEY"],      # 环境变量依赖
)
```

### 核心工具清单 (60+)

```python
_HERMES_CORE_TOOLS = [
    # Web: web_search, web_extract
    # Terminal: terminal, process
    # File: read_file, write_file, patch, search_files
    # Vision: vision_analyze, image_generate
    # Skills: skills_list, skill_view, skill_manage
    # Browser: 10 个浏览器自动化工具
    # TTS: text_to_speech
    # Planning: todo, memory
    # History: session_search
    # Interaction: clarify
    # Code: execute_code, delegate_task
    # Cron: cronjob
    # Messaging: send_message
    # Smart Home: 4 个 Home Assistant 工具
]
```

### 工具结果存储

`tool_result_storage.py` — 超大工具输出保存到临时文件, 返回引用而非全文。

---

## 12. 智能路由（Smart Routing）

### 文件: `agent/smart_model_routing.py` (195 行)

**核心思想**: 简单消息 → 廉价模型, 复杂消息 → 强模型。

```python
def choose_cheap_model_route(user_message, routing_config):
    # 短消息 (≤160字符, ≤28词, ≤1行)
    # 无代码标记 (无 ```)
    # 无 URL
    # 无复杂关键词 (debug, implement, refactor, analyze...)
    → 路由到 cheap_model
    
    # 否则 → 保持主模型
```

### 复杂性检测关键词

```python
_COMPLEX_KEYWORDS = {
    "debug", "implement", "refactor", "patch", "traceback",
    "analyze", "architecture", "optimize", "review",
    "terminal", "tool", "pytest", "plan", "delegate", "cron", ...
}
```

### 与 Equality 的对比

这正是用户要求的**"任务 vs 闲聊"检测**的一个参考实现！但 hermes 的方案是**关键词+规则型**的, 比较粗糙。Equality 可以做得更智能:

```
方案 A: 规则型 (类似 hermes) — 关键词 + 长度启发式
方案 B: 分类型 — 小模型一次调用分类 intent
方案 C: 混合型 — 规则初筛 + LLM 确认
```

---

## 13. Prompt 缓存策略

### 核心原则

> **Prompt caching must not break.**

hermes-agent 把这作为**最重要的架构约束**之一:

1. **不可中途更改上下文** — 记忆用冻结快照
2. **不可中途切换工具集** — toolset 在会话开始时固定
3. **不可中途重建 system prompt** — 只有压缩时才更改
4. **Skill slash 命令作为 user message 注入** — 不污染 system prompt 前缀

Anthropic prompt caching 对 Claude 模型自动启用, TTL 5 分钟, 减少约 75% 输入成本。

### 与 Equality 的对比

Equality 每轮都重新构建完整 messages 数组, **没有考虑 prompt caching**。如果使用 Claude 或支持 prompt caching 的模型, 这是巨大的成本浪费。

---

## 14. 安全防护

### 多层防御

1. **Prompt 注入检测** (prompt_builder.py + memory_tool.py):
   - 10 种正则模式检测
   - 不可见 Unicode 字符检测
   - Context file 和 memory 入口都有扫描

2. **记忆内容扫描** — 防止通过 memory write 注入恶意指令

3. **工具审批系统** — 危险命令需要用户确认, 学习安全命令

4. **跨工具引用防护** — schema description 中不硬编码其他工具名 (避免 LLM 幻觉不存在的工具)

5. **子代理工具封锁** — 5 种工具永远不给子代理

6. **凭证保护** — URL/base64 泄露阻断, 密钥目录锁定

7. **SSRF 防护, 时序攻击缓解, tar 遍历防护**

---

## 15. Profiles 多实例

```bash
hermes -p work     # 工作 profile (有 Slack 网关)
hermes -p personal # 个人 profile (有 Telegram 网关)
hermes -p dev      # 开发 profile (不同 API key)
```

每个 profile 完全隔离: config, memory, sessions, skills, gateway tokens。

核心机制: `_apply_profile_override()` 在模块导入前设置 `HERMES_HOME` 环境变量, 所有 119+ 处 `get_hermes_home()` 调用自动作用域到当前 profile。

Token lock 防止两个 profile 使用同一 gateway 凭证。

---

## 16. 版本演进脉络

```
v0.2 (3/12) — 基础: 多平台网关 + MCP + Skills + 3289 测试
v0.3 (3/17) — 流式: 统一 streaming + 插件架构 + Anthropic 原生 + 语音
v0.4 (3/23) — 扩展: API 服务器 + 6 新平台 + @ 引用 + 上下文压缩大修
v0.5 (3/28) — 加固: Nous Portal + HF + 供应链安全 + GPT 引导
v0.6 (3/30) — 多实例: Profiles + MCP Server + Docker + 飞书/企微
v0.7 (4/3)  — 弹性: Memory Provider 插件 + 凭证池 + Camofox + Diff 预览
v0.8 (4/8)  — 智能: 后台通知 + 模型切换 + GPT 自优化 + OAuth + 安全加固
```

**节奏**: 约 1 个月内 7 个大版本, 迭代极快。

---

## 17. 与 Equality 的对比分析

### 全维度对比表

| 维度 | Hermes-Agent | Equality | 差距评级 |
|------|--------------|----------|---------|
| **核心循环** | 同步 + budget + 并行工具 | 异步 SSE | 🟡 中等 |
| **System Prompt** | 991 行, 模块化, 按模型分支 | ~200 行, 单一模板 | 🔴 大 |
| **记忆** | 冻结快照 + 8 个插件 | kv 记忆, 无缓存保护 | 🔴 大 |
| **技能** | 自动创建/修补/激活 | ❌ 无 | 🔴 极大 |
| **子代理** | 隔离+限制+并行+深度控制 | 基本实现 | 🟡 中等 |
| **上下文压缩** | 结构化摘要+迭代+预剪枝 | ❌ 无 | 🔴 大 |
| **会话搜索** | SQLite FTS5 + LLM 摘要 | ❌ 无跨会话搜索 | 🔴 大 |
| **平台网关** | 14+ 平台 | 仅 Desktop | 🟢 非目标 |
| **定时任务** | 自然语言 cron | ❌ 无 | 🟡 中等 |
| **工具系统** | 60+ 工具, registry 模式 | ~15 工具, 手动注册 | 🟡 中等 |
| **智能路由** | 关键词启发式 | ❌ 无 | 🟡 中等 |
| **Prompt 缓存** | 冻结快照+TTL | ❌ 无 | 🔴 大 |
| **安全防护** | 6 层防御 | 基本 | 🟡 中等 |
| **测试** | 3000+ pytest | ~1300 assertions | 🟡 中等 |

### Equality 的优势

1. **桌面体验**: Tauri 原生应用, hermes 是 CLI/消息为主
2. **TypeScript 生态**: 前后端统一语言, hermes 是 Python
3. **React UI**: 富交互界面, hermes CLI 受限于终端
4. **LSP 集成**: 代码智能分析, hermes 无
5. **Codebase Search**: 本地代码搜索, hermes 依赖 terminal grep

---

## 18. 可借鉴的设计模式

### 优先级 P0 (立即可用)

#### 18.1 冻结记忆快照
```
会话开始 → 捕获 memory snapshot → 整个会话 system prompt 不变
write → 更新磁盘, 不更新 system prompt
下个会话 → 新快照
```
好处: 保护 prompt cache, 防止中途行为变化

#### 18.2 迭代预算 + 压力警告
```
IterationBudget { max: 30, used: 0 }
70% → 注入 "[BUDGET: 21/30, start wrapping up]"
90% → 注入 "[BUDGET: 27/30, respond NOW]"
```
好处: 防止 Agent 无限循环, 优雅终止

#### 18.3 Memory Guidance 明确三分法
```
- memory → 持久事实 (user preference, env details)
- skill  → 可复用方法 (自动创建/修补)  
- session_search → 历史回顾 (跨会话搜索)
```

### 优先级 P1 (近期实现)

#### 18.4 上下文压缩
```
threshold 50% → 
  1. 剪枝旧工具输出
  2. 保护头尾
  3. LLM 摘要中间部分
  4. 迭代更新摘要
```

#### 18.5 任务/闲聊意图检测
基于 hermes 的 `smart_model_routing.py`, 但做得更好:
```typescript
function detectIntent(firstMessage: string): 'task' | 'chat' {
  // 规则层
  if (message.length > 200 || hasCodeBlock || hasURL) return 'task'
  if (TASK_KEYWORDS.some(k => lower.includes(k))) return 'task'
  
  // 可选: LLM 分类层
  // classify(message) → task | chat
  
  return 'chat'
}
```
task → 自动创建 Agent workspace + AGENTS.md  
chat → 轻量对话模式

#### 18.6 子代理工具封锁
```typescript
const BLOCKED_FOR_SUBAGENT = new Set([
  'memory_save',     // 不写共享记忆
  'spawn_subagent',  // 不递归委派
])
```

### 优先级 P2 (长期规划)

#### 18.7 简化版 Skills 系统
#### 18.8 Session Search (FTS5 或 SQLite full-text)
#### 18.9 并行工具执行
#### 18.10 Prompt 注入检测

---

---

## 19. 任务/闲聊意图自动检测 — Equality 实施方案

### 19.1 需求背景

用户提出: **"在开始对话的时候看用户是想通过对话做任务还是漫无目的的闲聊。如果是做任务就有必要形成一个 Agent。"**

Hermes-Agent 的 `smart_model_routing.py` 提供了一个参考实现 (关键词 + 规则型), 但过于粗糙。Equality 可以做得更好。

### 19.2 意图分类定义

| Intent | 描述 | 行为 |
|--------|------|------|
| `task` | 有明确目标的工作请求 | 自动创建 Agent workspace, 注入 AGENTS.md, 启用完整工具集 |
| `chat` | 闲聊/问答/无目标对话 | 轻量模式, 可选不注入 AGENTS.md, 减少 system prompt 体积 |
| `ambiguous` | 无法判断 | 默认按 `task` 处理 (安全保底) |

### 19.3 检测策略: 三层漏斗

```
Layer 1: 快速规则 (0ms, 无 LLM 调用)
  ↓ 无法判断
Layer 2: 关键词分析 (0ms)
  ↓ 仍无法判断
Layer 3: 首轮 LLM 推断 (利用已有 system prompt 中的引导)
```

#### Layer 1: 快速规则

```typescript
function quickRuleDetect(message: string): 'task' | 'chat' | null {
  const trimmed = message.trim()
  
  // 明确的 task 信号
  if (trimmed.length > 500) return 'task'                    // 长消息 = 复杂需求
  if (/```/.test(trimmed)) return 'task'                      // 代码块
  if (/https?:\/\//.test(trimmed)) return 'task'              // URL
  if (/\[@\w+\]/.test(trimmed)) return 'task'                 // @ mention
  if (/\[#\w+\]/.test(trimmed)) return 'task'                 // # 工具指定
  if (trimmed.split('\n').length > 5) return 'task'           // 多行 = 结构化需求
  
  // 明确的 chat 信号
  if (trimmed.length < 10 && /^(hi|hello|你好|嗨|hey)/i.test(trimmed)) return 'chat'
  
  return null // 无法判断
}
```

#### Layer 2: 关键词分析

```typescript
const TASK_KEYWORDS_ZH = new Set([
  '帮我', '请', '写', '创建', '实现', '修改', '修复', '分析', '生成',
  '部署', '配置', '搜索', '查找', '转换', '计算', '优化', '重构',
  '调试', '测试', '编译', '运行', '安装', '设置', '解决', '处理',
])

const TASK_KEYWORDS_EN = new Set([
  'help', 'create', 'write', 'implement', 'fix', 'build', 'deploy',
  'configure', 'search', 'find', 'convert', 'calculate', 'optimize',
  'refactor', 'debug', 'test', 'compile', 'run', 'install', 'setup',
  'solve', 'analyze', 'generate', 'make', 'add', 'remove', 'update',
])

const CHAT_KEYWORDS_ZH = new Set([
  '是什么', '为什么', '怎么样', '怎样', '什么是', '解释', '介绍',
  '你觉得', '你认为', '聊聊', '说说', '讲讲', '谈谈',
])

function keywordDetect(message: string): 'task' | 'chat' | null {
  const lower = message.toLowerCase()
  const words = new Set(lower.split(/[\s,，。！？!?.;；：:]+/).filter(Boolean))
  
  let taskScore = 0
  let chatScore = 0
  
  for (const w of words) {
    if (TASK_KEYWORDS_ZH.has(w) || TASK_KEYWORDS_EN.has(w)) taskScore++
    if (CHAT_KEYWORDS_ZH.has(w)) chatScore++
  }
  
  // 文件路径模式
  if (/\.(ts|js|py|rs|go|md|json|yaml|toml)\b/.test(lower)) taskScore += 2
  // 命令模式
  if (/\b(npm|pnpm|cargo|pip|git|docker)\b/.test(lower)) taskScore += 2
  
  if (taskScore >= 2 && taskScore > chatScore) return 'task'
  if (chatScore >= 2 && chatScore > taskScore) return 'chat'
  return null
}
```

#### Layer 3: LLM 推断 (被动式)

**不额外调用 LLM**, 而是在 system prompt 中引导 LLM 在首轮回复时自行判断:

```
如果这是会话的第一条消息, 且用户的需求涉及代码编写、文件操作、命令执行等任务型工作,
请在回复开始前先调用 todo 工具来规划任务步骤。如果只是简单问答或闲聊, 直接回答即可。
```

这样 LLM 自身就成为了最准确的意图分类器, 而且**零额外成本**。

### 19.4 检测结果的影响

```typescript
interface IntentResult {
  intent: 'task' | 'chat' | 'ambiguous'
  confidence: number    // 0-1
  signals: string[]     // 检测到的信号
}

function applyIntentResult(result: IntentResult, runParams: RunAttemptParams) {
  if (result.intent === 'task') {
    // 1. 确保 AGENTS.md 已注入
    // 2. 启用完整工具集
    // 3. 未来: 自动创建 Agent workspace
    console.log(`[intent] task detected (${result.confidence}): ${result.signals.join(', ')}`)
  } else if (result.intent === 'chat') {
    // 1. 简化 system prompt (可选)
    // 2. 减少工具注入 (只保留 memory, web_search)
    // 3. 降低 max_turns (防止闲聊消耗太多轮次)
    console.log(`[intent] chat detected (${result.confidence}): ${result.signals.join(', ')}`)
  }
}
```

### 19.5 插入点

在 `packages/core/src/agent/runner.ts` 的 `runAttempt()` 中, 步骤 4 (追加用户消息) 和步骤 5 (组装上下文) 之间:

```typescript
// 4. 追加用户消息
session.messages.push({ role: 'user', content: actualMessage })

// 4.6 NEW: 首轮意图检测
if (session.messages.filter(m => m.role === 'user').length === 1) {
  const intent = detectIntent(actualMessage)
  if (intent.intent === 'chat') {
    // 标记 session 为 chat 模式
    session.metadata ??= {}
    session.metadata.mode = 'chat'
  }
}

// 5. Context Engine: 组装消息列表
```

### 19.6 渐进式实施计划

| Phase | 内容 | 工作量 |
|-------|------|--------|
| **P0** | 在 system prompt 中加一句引导, 让 LLM 自行判断 | 1 行 |
| **P1** | 实现 quickRuleDetect + keywordDetect, log 结果 | 半天 |
| **P2** | chat 模式减少工具注入, 降低 max_turns | 1 天 |
| **P3** | task 模式自动创建 Agent workspace + AGENTS.md | 2 天 |
| **P4** | UI 显示当前模式, 允许用户手动切换 | 1 天 |

---

## 总结

Hermes-Agent 是目前开源 Agent 项目中**架构最完整**的之一。它的核心差异化不在于某个单一功能, 而在于**"自我改进闭环"**的完整实现:

```
对话 → 学习 → 记忆 → 技能化 → 历史搜索 → 更好的对话
```

对 Equality 而言, 最有价值的借鉴是:

1. **冻结记忆快照** — 保护 prompt cache 的优雅模式
2. **迭代预算** — 防止 Agent 失控的安全网
3. **上下文压缩** — 长对话的必要基础设施
4. **Skills 系统** — Agent 自我进化的关键
5. **意图检测** — 从简单的关键词规则开始, 逐步增强

这些都是可以渐进式实现的, 不需要一次性重构整个架构。
