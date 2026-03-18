# Design: Phase 3.2 — 内置工具全面对齐 OpenClaw

---

## Section 1: edit_file — 精确文本替换工具

### 1.1 工具 Schema

```typescript
{
  name: "edit_file",
  description: "精确替换文件中的一段文本。old_string 必须在文件中唯一出现。",
  parameters: {
    path: string,       // 文件路径
    old_string: string,  // 要替换的精确原文（空字符串 = 追加模式）
    new_string: string   // 替换后的新文本
  },
  required: ["path", "old_string", "new_string"]
}
```

### 1.2 两级模糊匹配

借鉴 OpenClaw 的 `edit_file` 工具（而非更复杂的 `apply_patch` 四级回退）：

| 级别 | 策略 | 说明 |
|------|------|------|
| 1 | 精确匹配 | `content.indexOf(oldString)` 直接搜索 |
| 2 | Unicode 归一化 | 智能引号→ASCII引号、Unicode破折号→`-`、Unicode空格→普通空格、trimEnd |

每级匹配后都做 **唯一性检查**：
- 0 次匹配 → 降到下一级
- 1 次匹配 → 执行替换
- ≥2 次匹配 → 报错提示"请提供更多上下文"

### 1.3 CRLF 兼容

- 读取时检测原始行尾（CRLF or LF）
- 处理时归一化为 LF
- 写入时还原原始行尾

### 1.4 追加模式

当 `old_string` 为空字符串：
- 文件存在 → `fs.appendFileSync`
- 文件不存在 → `fs.writeFileSync`（创建新文件）

### 1.5 反馈

执行后返回 unified diff 预览（±3 行上下文），方便 LLM 确认修改正确。

---

## Section 2: grep — 文本搜索工具

### 2.1 工具 Schema

```typescript
{
  name: "grep",
  description: "在文件中搜索文本模式。支持正则表达式和字面量搜索。",
  parameters: {
    pattern: string,       // 搜索模式（regex 或字面量）
    path?: string,         // 搜索目录或文件（默认工作区根）
    include?: string,      // 文件名 glob 过滤（如 "*.ts"）
    ignore_case?: boolean, // 忽略大小写（默认 false）
    literal?: boolean,     // 字面量模式（默认 false，即默认 regex）
    context_lines?: number,// 上下文行数（默认 0，最大 10）
    max_results?: number   // 最大匹配数（默认 100，最大 500）
  },
  required: ["pattern"]
}
```

### 2.2 实现策略

OpenClaw 用 ripgrep 二进制 + JSONL 解析。我们选择 **纯 JS 实现**：

```
fast-glob (已有依赖)  →  遍历文件列表
        ↓
  fs.readFileSync     →  读取单个文件
        ↓
   RegExp.test()      →  逐行匹配
        ↓
  格式化输出           →  按文件分组 + 行号 + 上下文
```

### 2.3 性能保护

- 默认忽略：`node_modules/`、`.git/`、`dist/`、`build/`、`*.min.js`、`*.min.css`
- 二进制跳过：按扩展名（png/jpg/zip/exe 等 30+ 种）+ null byte 检测
- 长行截断：500 字符
- 输出上限：50,000 字符（truncateToolResult）

### 2.4 输出格式

```
找到 15 条匹配（3 个文件）

📄 src/tools/builtins/bash.ts
  12: import { spawn } from 'node:child_process'
  45: const child = spawn(shell, shellArgs, {

📄 src/agent/runner.ts
> 23 |     const child = spawn('node', ['--inspect'])
  24 |     child.on('exit', () => { ... })
```

单文件模式（path 指向文件）直接搜索该文件。

---

## Section 3: list_dir — 目录列表工具

### 3.1 工具 Schema

```typescript
{
  name: "list_dir",
  description: "列出目录内容。显示文件名、类型和大小。",
  parameters: {
    path?: string,        // 目录路径（默认工作区根）
    max_entries?: number   // 最大条目数（默认 500）
  }
}
```

### 3.2 排序规则

借鉴 OpenClaw 的 `ls` 工具：
1. 目录在前，文件在后
2. 同类型内按字母排序（大小写不敏感 `localeCompare`）

### 3.3 输出格式

```
目录: /path/to/dir (12 条)

📁 src/
📁 tests/
📄 package.json  (1.2KB)
📄 tsconfig.json  (345B)
🔗 link-name
```

---

## Section 4: web_search — 网页搜索工具

### 4.1 工具 Schema

```typescript
{
  name: "web_search",
  description: "搜索网页，返回结果列表（标题+URL+摘要）。",
  parameters: {
    query: string,        // 搜索关键词
    count?: number,       // 结果数量（默认 10，最大 20）
    language?: string     // 搜索语言（默认 "zh-CN"）
  },
  required: ["query"]
}
```

### 4.2 多 Provider 架构

借鉴 OpenClaw 的多搜索引擎设计，但简化为两级：

```
BRAVE_SEARCH_API_KEY 存在?
  ├── Yes → Brave Search API (https://api.search.brave.com/res/v1/web/search)
  └── No  → DuckDuckGo HTML 抓取 (https://html.duckduckgo.com/html/)
```

### 4.3 Brave Search API

```
GET https://api.search.brave.com/res/v1/web/search
  ?q={query}&count={count}&search_lang=zh&result_filter=web
Headers:
  Accept: application/json
  X-Subscription-Token: {BRAVE_SEARCH_API_KEY}
```

免费版每月 2000 次查询，足够个人使用。

### 4.4 DuckDuckGo 回退

HTML 抓取模式（无需 API key）：
- GET `https://html.duckduckgo.com/html/?q={query}`
- 解析 `class="result"` 块提取 title/url/snippet
- 处理 DuckDuckGo 的 `uddg=` 重定向 URL

### 4.5 缓存

内存缓存，key = `query|count|language`，TTL 5 分钟。

### 4.6 输出格式

```
🔍 搜索: "TypeScript generics" (Brave Search, 10 条结果)

1. **TypeScript Generics - TypeScript Handbook**
   https://www.typescriptlang.org/docs/handbook/2/generics.html
   Generics are one of the main tools in the toolbox for creating reusable components...

2. **Understanding TypeScript Generics — Smashing Magazine**
   https://www.smashingmagazine.com/2023/05/understanding-typescript-generics/
   A comprehensive guide to understanding and using generics in TypeScript...
```

---

## Section 5: bash 增强 — 后台进程支持

### 5.1 新增参数

```typescript
// 在现有 bash 工具的 inputSchema 中新增：
{
  background: { type: 'boolean', description: '后台执行（立即返回 sessionId）' },
  timeout_ms: { type: 'number', description: '超时毫秒（后台模式默认 300000）' }
}
```

### 5.2 后台执行流程

```
background: true
    ↓
spawn 进程，分配 sessionId
    ↓
立即返回: "后台进程已启动 [sessionId: xxx]\n使用 process 工具查看状态。"
    ↓
进程在后台继续运行，stdout/stderr 持续收集
    ↓
超时（默认 5 分钟）后自动 SIGTERM → SIGKILL
```

### 5.3 进程状态存储

```typescript
interface BackgroundProcess {
  id: string           // 8 位随机 hex
  command: string
  pid: number
  status: 'running' | 'exited'
  exitCode?: number
  stdout: string       // 累积输出
  stderr: string
  startedAt: number
  endedAt?: number
}
```

用 `Map<string, BackgroundProcess>` 存储在内存中（进程级生命周期）。

---

## Section 6: process — 后台进程管理工具

### 6.1 工具 Schema

```typescript
{
  name: "process",
  description: "管理 bash 工具启动的后台进程。",
  parameters: {
    action: "list" | "poll" | "log" | "write" | "kill",
    id?: string,          // 进程 ID（list 不需要）
    input?: string,       // write 操作的 stdin 输入
    timeout_ms?: number   // poll 超时（默认 5000）
  },
  required: ["action"]
}
```

### 6.2 操作详情

| action | 功能 | 返回 |
|--------|------|------|
| `list` | 列出所有后台进程 | id + command + status + 运行时长 |
| `poll` | 等待新输出（增量） | 自上次 poll 以来的新输出 |
| `log` | 查看完整日志 | 截断后的 stdout + stderr |
| `write` | 向 stdin 写入 | 确认 |
| `kill` | 终止进程 | 确认 + 退出码 |

### 6.3 poll 机制

借鉴 OpenClaw 的 process.poll：
- 记录上次 poll 位置（offset）
- 返回增量输出
- 如果无新输出，等待最多 timeout_ms（默认 5s）
- 返回时携带状态（running/exited）

---

## Section 7: apply_patch — 多文件补丁工具

### 7.1 工具 Schema

```typescript
{
  name: "apply_patch",
  description: "应用多文件补丁。使用 *** Begin Patch / *** End Patch 格式。",
  parameters: {
    patch: string  // 补丁内容
  },
  required: ["patch"]
}
```

### 7.2 补丁格式（OpenAI 格式）

```
*** Begin Patch
*** Add File: src/new-file.ts
+import fs from 'node:fs'
+export function hello() { return 'world' }

*** Update File: src/existing.ts
@@ import type { Config } from './config'
 
-const DEFAULT_TIMEOUT = 30_000
+const DEFAULT_TIMEOUT = 60_000
 
@@ export function run() {
-  console.log('old')
+  console.log('new')

*** Delete File: src/deprecated.ts

*** End Patch
```

### 7.3 四级回退匹配（seekSequence）

借鉴 OpenClaw 的 `apply-patch-update.ts`：

| 级别 | 变换函数 | 说明 |
|------|---------|------|
| 1 | `v => v` | 精确匹配 |
| 2 | `v => v.trimEnd()` | 忽略行尾空白 |
| 3 | `v => v.trim()` | 忽略首尾空白 |
| 4 | `v => normalizePunctuation(v.trim())` | Unicode 标点归一化 |

### 7.4 操作类型

| 操作 | 解析方式 | 执行方式 |
|------|---------|---------|
| `*** Add File: path` | 收集 `+` 开头的行 | 创建文件，写入内容 |
| `*** Delete File: path` | 无后续行 | 删除文件 |
| `*** Update File: path` | 解析 `@@` 上下文 + `-/+/空格` 行 | 逐 hunk 替换（逆序 splice） |

### 7.5 安全限制

- 所有路径必须在 workspace 内（禁止 `..` 遍历）
- Update 前自动备份（.equality-bak）
- Add 不覆盖已存在的文件（报错提示用 Update）
