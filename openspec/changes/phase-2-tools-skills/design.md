# Design: Phase 2 — Tools + Skills

## 技术栈增量

| 组件 | 选型 | 理由 |
|------|------|------|
| YAML 解析 | `yaml` npm 包 | 解析 SKILL.md frontmatter，轻量可靠 |
| glob 匹配 | `fast-glob` | 高性能 glob 实现，Windows 兼容好 |
| HTML 提取 | `cheerio` | web_fetch 提取网页正文 |
| 文件监听 | `chokidar` | Skills 热更新，跨平台文件监听 |
| 代理支持 | `https-proxy-agent`（已有） | web_fetch 走企业代理 |
| 子进程 | Node.js `child_process` | bash 工具执行命令 |

## 目录结构（新增部分）

```
packages/
└── core/
    └── src/
        ├── tools/
        │   ├── registry.ts          ← 工具注册表 + 容错匹配
        │   ├── types.ts             ← ToolDefinition / ToolResult / ToolContext 类型
        │   ├── truncation.ts        ← Tool Result 截断逻辑
        │   ├── policy.ts            ← 工具策略（白名单/黑名单）
        │   ├── loop.ts              ← Agent Runner tool-call 循环（集成到 runner）
        │   └── builtins/
        │       ├── bash.ts          ← bash / shell 执行
        │       ├── read-file.ts     ← 读文件
        │       ├── write-file.ts    ← 写文件
        │       ├── glob.ts          ← 文件搜索
        │       └── web-fetch.ts     ← 网页抓取
        ├── skills/
        │   ├── types.ts             ← Skill / SkillEntry / SkillMetadata 类型
        │   ├── frontmatter.ts       ← SKILL.md 解析（frontmatter + body）
        │   ├── loader.ts            ← 6 级优先级加载
        │   ├── prompt.ts            ← System Prompt 组装（注入 Skills）
        │   ├── watcher.ts           ← 文件变化监听 + 30s 防抖
        │   └── prc-install.ts       ← PRC 镜像安装命令映射
        └── agent/
            ├── runner.ts            ← 升级：Tool Call Loop
            └── system-prompt.ts     ← 升级：注入 Skills

skills/                              ← 内置 Skills（随安装包分发）
├── git/
│   └── SKILL.md
├── python/
│   └── SKILL.md
├── nodejs/
│   └── SKILL.md
├── coding/
│   └── SKILL.md
├── wechat-push/                     ← PRC 专属
│   └── SKILL.md
├── dingtalk/                        ← PRC 专属
│   └── SKILL.md
├── aliyun-oss/                      ← PRC 专属
│   └── SKILL.md
└── ...
```

---

## A. Tools 模块详细设计

### A1. 类型定义（tools/types.ts）

```typescript
/** JSON Schema 子集，用于 LLM Function Calling */
interface ToolInputSchema {
  type: 'object'
  properties: Record<string, {
    type: string
    description: string
    enum?: string[]
    default?: unknown
  }>
  required?: string[]
}

/** 工具上下文，执行时注入 */
interface ToolContext {
  workspaceDir: string          // 当前工作目录
  abortSignal?: AbortSignal     // 取消信号
  proxyUrl?: string             // HTTPS_PROXY（给 web_fetch 用）
  env?: Record<string, string>  // 额外环境变量
}

/** 工具定义 */
interface ToolDefinition {
  name: string                   // 全局唯一，字母数字下划线
  description: string            // 给 LLM 看的功能描述
  inputSchema: ToolInputSchema
  execute: (input: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>
}

/** 工具执行结果 */
interface ToolResult {
  content: string                // 主要输出内容
  isError?: boolean              // 是否为错误结果
  metadata?: {
    truncated?: boolean          // 是否被截断
    originalLength?: number      // 截断前的原始长度
    durationMs?: number          // 执行耗时
  }
}
```

### A2. 工具注册表（tools/registry.ts）

```typescript
class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map()
  
  register(tool: ToolDefinition): void
  unregister(name: string): void
  
  /** 容错查找：精确 → 标准化 → 命名空间剥离 → 大小写不敏感 */
  resolve(name: string): ToolDefinition | null
  
  /** 获取所有工具的 schema（给 LLM 的 tools 参数） */
  getToolSchemas(): OpenAIToolSchema[]
  
  /** 列出所有已注册工具名 */
  list(): string[]
}
```

**容错匹配算法：**

```
resolve("mcp.shell.bash"):
  1. 精确匹配 → 查 "mcp.shell.bash" → miss
  2. 标准化    → "mcp_shell_bash" → miss
  3. 命名空间  → 取最后一段 "bash" → hit ✓
  4. 大小写    → 上面已命中，跳过
```

### A3. Tool Result 截断（tools/truncation.ts）

```typescript
const MAX_TOOL_RESULT_CHARS = 400_000  // 约 10 万 tokens

function truncateToolResult(content: string, maxChars?: number): {
  content: string
  truncated: boolean
  originalLength: number
} {
  const limit = maxChars ?? MAX_TOOL_RESULT_CHARS
  if (content.length <= limit) {
    return { content, truncated: false, originalLength: content.length }
  }
  
  const halfLimit = Math.floor(limit / 2)
  const head = content.slice(0, halfLimit)
  const tail = content.slice(-halfLimit)
  const marker = `\n\n[...内容已截断，原始输出 ${content.length} 字符，显示前 ${halfLimit} 和后 ${halfLimit} 字符...]\n\n`
  
  return {
    content: head + marker + tail,
    truncated: true,
    originalLength: content.length
  }
}
```

### A4. 工具策略（tools/policy.ts）

Phase 2 简化版——只实现全局级别白名单/黑名单：

```typescript
interface ToolPolicy {
  /** 白名单模式：只允许这些工具 */
  allow?: string[]
  /** 黑名单模式：禁止这些工具 */
  deny?: string[]
}

function applyToolPolicy(tools: ToolDefinition[], policy?: ToolPolicy): ToolDefinition[]
```

策略优先级：`deny` 优先于 `allow`（安全先行）。

配置来源（`settings.json` 或未来的 `equality.config.yaml`）：

```json
{
  "tools": {
    "policy": {
      "deny": ["bash"]
    }
  }
}
```

> **扩展预留**：接口设计时预留 `scope: 'global' | 'agent' | 'provider' | 'group'` 字段，  
> Phase 4+ 添加 per-agent / per-provider / per-group 策略时只需扩展，不改接口。

### A5. 5 个内置工具详细设计

#### bash（builtins/bash.ts）

```typescript
name: "bash"
description: "在本地执行 shell 命令。Windows 下使用 PowerShell，可配置。"
inputSchema: {
  command: { type: "string", description: "要执行的 shell 命令" }
  timeout_ms: { type: "number", description: "超时毫秒数", default: 30000 }
}
```

实现要点：
- Windows 默认使用 PowerShell（`powershell.exe -NoProfile -NonInteractive -Command`）
- 可选配置使用 `cmd.exe /c`
- 超时默认 30 秒，最大 120 秒
- 环境变量继承 `HTTPS_PROXY`、`HTTP_PROXY`（企业代理场景）
- stdout + stderr 合并输出
- 退出码非零时 `isError: true`
- 使用 `child_process.spawn`，支持 AbortSignal 取消

**安全策略（Phase 2 简化版）：**
- 工作目录限制在 `workspaceDir` 下
- 不做命令白名单（桌面场景，用户本机执行）
- 后续 Phase 4 渠道场景再添加沙箱

#### read_file（builtins/read-file.ts）

```typescript
name: "read_file"
description: "读取文件内容。支持指定行范围。"
inputSchema: {
  path: { type: "string", description: "文件路径（相对或绝对）" }
  start_line: { type: "number", description: "起始行号（1-based，可选）" }
  end_line: { type: "number", description: "结束行号（1-based，可选）" }
}
```

实现要点：
- 支持相对路径（基于 `workspaceDir`）
- 自动检测编码（UTF-8 / GBK），国内项目常见 GBK
- 行号从 1 开始，未指定则读取全文
- 结果带行号前缀（`  1 | const a = 1`），方便 LLM 定位
- 单文件上限 400K 字符（截断保护）

#### write_file（builtins/write-file.ts）

```typescript
name: "write_file"
description: "创建或覆盖文件。自动创建中间目录。"
inputSchema: {
  path: { type: "string", description: "文件路径" }
  content: { type: "string", description: "文件内容" }
}
```

实现要点：
- 目录不存在时自动 `mkdirSync` 递归创建
- 默认 UTF-8 编码写入
- 写入前备份（`<file>.equality-bak`），仅保留最近一份
- 返回：写入的字节数 + 文件绝对路径

#### glob（builtins/glob.ts）

```typescript
name: "glob"
description: "搜索匹配模式的文件路径。"
inputSchema: {
  pattern: { type: "string", description: "glob 模式（如 **/*.ts）" }
  cwd: { type: "string", description: "搜索起始目录（可选，默认工作区根）" }
}
```

实现要点：
- 使用 `fast-glob` 库
- 默认忽略 `node_modules`、`.git`、`dist`、`build`
- 结果最多返回 500 条（防止输出爆炸）
- 返回相对路径列表

#### web_fetch（builtins/web-fetch.ts）

```typescript
name: "web_fetch"
description: "抓取网页内容（HTTP GET），返回纯文本摘要。"
inputSchema: {
  url: { type: "string", description: "目标 URL" }
  max_chars: { type: "number", description: "最大返回字符数", default: 50000 }
}
```

实现要点：
- 使用 Node.js `fetch`（Node 22 原生）+ `https-proxy-agent`
- 自动使用已配置的 `HTTPS_PROXY`（企业代理）
- TLS 选项继承全局 `rejectUnauthorized` 设置
- HTML → 提取 `<body>` 纯文本（使用 `cheerio` 去标签）
- 非 HTML（JSON / 纯文本）直接返回
- 超时：15 秒
- User-Agent 伪装浏览器（避免被反爬）
- 结果截断到 `max_chars`（默认 50,000）

### A6. Agent Runner Tool Loop 升级

当前 `runner.ts` 是单次 LLM 调用。Phase 2 升级为循环：

```
runAttempt(session, userMessage):
  messages = [system_prompt, ...history, user_message]
  totalToolCalls = 0
  
  loop:
    response = await provider.streamChat(messages, { tools: registry.getToolSchemas() })
    
    if response.hasToolCalls:
      for each toolCall in response.toolCalls:
        tool = registry.resolve(toolCall.name)
        if !tool:
          result = { content: "未知工具: ${toolCall.name}", isError: true }
        else:
          result = await tool.execute(toolCall.args, ctx)
          result = truncateToolResult(result)
        
        messages.push({ role: "assistant", tool_calls: [toolCall] })
        messages.push({ role: "tool", tool_call_id, content: result.content })
        totalToolCalls++
      
      if totalToolCalls >= 30:  // 全局断路器
        messages.push({ role: "tool", content: "⚠️ 已达到工具调用上限（30次），终止循环" })
        break
      
      continue  // 继续循环
    
    else:
      break  // LLM 输出纯文本，结束循环
  
  // 追加 assistant 最终回复到 session
  session.messages.push(response.assistantMessage)
  persist(session)
```

**关键变更：**
- `LLMProvider.streamChat()` 返回类型需扩展，支持 `tool_calls`
- Provider 的 `tools` 参数传入工具 schema 列表
- 流式输出：工具调用阶段仍可推送 status delta（"正在执行 bash..."）
- onDelta 回调在最终回复阶段仍然生效

### A7. Provider 接口扩展

```typescript
// 新增 tool_calls 相关类型
interface ToolCallDelta {
  id: string
  name: string
  arguments: string  // JSON string，可能分多个 delta
}

interface StreamChatOptions {
  messages: ChatMessage[]
  abortSignal?: AbortSignal
  tools?: OpenAIToolSchema[]  // 新增
}

// streamChat 返回的 delta 扩展
interface ChatDelta {
  content?: string
  toolCalls?: ToolCallDelta[]  // 新增
  finishReason?: 'stop' | 'tool_calls' | 'length'  // 新增
}
```

---

## B. Skills 模块详细设计

### B1. 类型定义（skills/types.ts）

```typescript
interface SkillMetadata {
  name: string                    // 必填，全局唯一
  description: string             // 必填，LLM 路由用描述（≤120 字符）
  tools?: string[]                // 依赖的工具名列表
  userInvocable?: boolean         // 能否通过 /skill-name 调用（默认 true）
  always?: boolean                // 始终注入（不受 Top-K 限制）
  emoji?: string                  // 显示用图标
  requires?: {
    bins?: string[]               // 依赖的系统命令
    env?: string[]                // 依赖的环境变量
    config?: string[]             // 依赖的配置项
  }
  install?: SkillInstallSpec[]    // 安装指令
}

interface SkillInstallSpec {
  kind: 'pip' | 'npm' | 'go' | 'conda' | 'apt' | 'download'
  spec: string                    // 包名/URL
  mirror?: string                 // PRC 镜像源（如果与默认不同）
}

interface Skill {
  name: string                    // 来自 frontmatter
  description: string
  filePath: string                // SKILL.md 绝对路径
  baseDir: string                 // Skill 所在目录
  body: string                    // Markdown 正文（注入 System Prompt）
  metadata: SkillMetadata
}

interface SkillEntry {
  skill: Skill
  source: SkillSource             // 来源层级
}

type SkillSource = 
  | 'workspace'                   // 优先级 6
  | 'project-agents'              // 优先级 5
  | 'personal-agents'             // 优先级 4
  | 'managed'                     // 优先级 3
  | 'bundled'                     // 优先级 2
  | 'extra'                       // 优先级 1
```

### B2. SKILL.md 解析器（skills/frontmatter.ts）

```typescript
function parseSkillFile(filePath: string): Skill | null {
  const raw = fs.readFileSync(filePath, 'utf-8')
  const { frontmatter, body } = splitFrontmatter(raw)
  
  // frontmatter 解析
  const meta = yaml.parse(frontmatter)
  if (!meta?.name || !meta?.description) return null
  
  // 安全验证（防止恶意注入）
  validateSkillName(meta.name)           // ^[a-z0-9_-]{1,64}$
  validateDescription(meta.description)   // ≤120 字符
  validateInstallSpecs(meta.install)      // 白名单验证包名/URL
  
  return { ... }
}
```

**安全验证规则：**
- Skill name：只允许 `[a-z0-9_-]`，最长 64 字符
- 安装命令 spec 验证：
  - pip: `^[a-zA-Z0-9_-]+(\\[.+\\])?(==|>=|<=|~=)?[\\d.]*$`
  - npm: `^(@[a-z0-9-]+/)?[a-z0-9-]+(\\@.+)?$`
  - go: `^[a-z0-9.-]+(/[a-z0-9._-]+)+(@.+)?$`
  - download: URL 白名单（仅允许 HTTPS）

### B3. Skills 加载器（skills/loader.ts）

```typescript
const SKILLS_LOAD_ORDER: Array<{
  source: SkillSource
  resolveDir: (workspaceDir: string) => string
}> = [
  { source: 'extra',            resolveDir: () => configExtraDirs() },
  { source: 'bundled',          resolveDir: () => bundledSkillsDir() },
  { source: 'managed',          resolveDir: () => path.join(APPDATA, 'Equality', 'skills') },
  { source: 'personal-agents',  resolveDir: () => path.join(os.homedir(), '.agents', 'skills') },
  { source: 'project-agents',   resolveDir: (ws) => path.join(ws, '.agents', 'skills') },
  { source: 'workspace',        resolveDir: (ws) => path.join(ws, 'skills') },
]

function loadAllSkills(workspaceDir: string, config?: EqualityConfig): SkillEntry[]
```

**加载限制：**

| 参数 | 默认值 | 说明 |
|------|--------|------|
| maxSkillsPerSource | 200 | 每个来源最多加载 |
| maxSkillsInPrompt | 150 | 注入 System Prompt 最多 |
| maxSkillsPromptChars | 30,000 | Skills 文本总字符上限 |
| maxSkillFileBytes | 256,000 | 单个 SKILL.md 文件大小上限 |

**同名覆盖规则：** 高优先级来源同名 Skill 覆盖低优先级。例如工作区的 `git` Skill 覆盖内置的 `git` Skill。

### B4. System Prompt 组装（skills/prompt.ts）

> **架构决策变更**（基于 OpenClaw 深入研究后修正）：  
> 原设计将 Skills 全文 body 注入 System Prompt，会消耗大量 tokens（可能 10-50K）。  
> OpenClaw 实际采用 **XML 索引 + 懒加载** 模式：System Prompt 只注入 name/description/location 索引，  
> 模型在需要详细内容时，通过 `read_file` 工具按需读取 SKILL.md 文件。  
> 150 个 Skills 的索引仅消耗 ~3,600 tokens（150 × 24 tokens），极其高效。  
> **Equality 采用相同模式。**

#### XML 索引格式

```xml
<available_skills>
  <skill>
    <name>git</name>
    <description>使用 Git 进行版本控制</description>
    <location>~/.agents/skills/git/SKILL.md</location>
  </skill>
  <skill>
    <name>python</name>
    <description>Python 开发（pip 清华源）</description>
    <location>~/.agents/skills/python/SKILL.md</location>
  </skill>
</available_skills>
```

#### Token 成本公式

- 基础开销：195 字符（XML 骨架，当 ≥1 个 skill 时）
- 每个 skill：97 字符 + len(name) + len(description) + len(location) ≈ **24 tokens**
- XML 转义：`& < > " '` → HTML entities

#### 实现

```typescript
function formatSkillsForPrompt(skills: Skill[]): string {
  if (skills.length === 0) return ''
  
  let xml = '<available_skills>\n'
  for (const skill of skills) {
    xml += '  <skill>\n'
    xml += `    <name>${escapeXml(skill.name)}</name>\n`
    xml += `    <description>${escapeXml(skill.description)}</description>\n`
    xml += `    <location>${escapeXml(skill.filePath)}</location>\n`
    xml += '  </skill>\n'
  }
  xml += '</available_skills>'
  return xml
}

function buildSkillsPromptBlock(skills: Skill[]): string {
  // 1. 路径压缩：home 目录替换为 ~（节省 400-600 tokens）
  const compacted = compactSkillPaths(skills)
  
  // 2. 应用限制（150 个 / 30K 字符）
  //    二分搜索找到在字符预算内的最大 skills 前缀
  const { selected, truncated } = applySkillsLimits(compacted, {
    maxCount: 150,
    maxChars: 30_000
  })
  
  // 3. 生成 XML 索引（NOT 全文注入）
  return formatSkillsForPrompt(selected)
}
```

在 `system-prompt.ts` 中集成：

```typescript
function buildSystemPrompt(options: { 
  skills?: Skill[]
  workspaceDir?: string 
}): string {
  let prompt = BASE_SYSTEM_PROMPT      // 现有基础 prompt
  prompt += '\n\n' + TOOL_INSTRUCTIONS  // 新增：工具使用说明
  
  // 注入当前工作目录（参考 OpenClaw ACP 的 cwd 前缀模式）
  if (options.workspaceDir) {
    prompt += `\n\n[Working directory: ${compactPath(options.workspaceDir)}]`
  }
  
  if (options.skills?.length) {
    prompt += '\n\n# Available Skills\n\n'
    prompt += 'Below are available skills. To use a skill, read its file with read_file.\n\n'
    prompt += buildSkillsPromptBlock(options.skills)
  }
  return prompt
}
```

> **懒加载工作原理**：模型看到 `<available_skills>` 索引后，如果用户问题涉及某个 skill  
> （如 "帮我配置 Git"），模型会自主调用 `read_file` 读取 `~/.agents/skills/git/SKILL.md`  
> 获取详细指令。这避免了将所有 skill 全文注入 prompt 的 token 浪费。

### B5. PRC 安装命令映射（skills/prc-install.ts）

```typescript
const PRC_MIRRORS: Record<SkillInstallSpec['kind'], string> = {
  pip: 'https://pypi.tuna.tsinghua.edu.cn/simple',
  npm: 'https://registry.npmmirror.com',
  go: 'https://goproxy.cn',
  conda: 'https://mirrors.tuna.tsinghua.edu.cn/anaconda',
  apt: '',        // apt 走系统源
  download: '',   // download 无需镜像
}

function buildInstallCommand(spec: SkillInstallSpec): string {
  switch (spec.kind) {
    case 'pip':
      return `pip install -i ${PRC_MIRRORS.pip} ${spec.spec}`
    case 'npm':
      return `npm install --registry ${PRC_MIRRORS.npm} ${spec.spec}`
    case 'go':
      return `GOPROXY=${PRC_MIRRORS.go} go install ${spec.spec}`
    case 'conda':
      return `conda install -c ${PRC_MIRRORS.conda} ${spec.spec}`
    case 'apt':
      return `apt install -y ${spec.spec}`
    case 'download':
      return `curl -fsSLO ${spec.spec}`
  }
}
```

### B6. Skills 热更新（skills/watcher.ts）

```typescript
class SkillsWatcher {
  private watcher: FSWatcher | null = null
  private debounceTimer: NodeJS.Timeout | null = null
  private snapshot: SkillEntry[] = []
  
  /** 启动监听 */
  start(dirs: string[], onReload: (entries: SkillEntry[]) => void): void {
    this.watcher = chokidar.watch(dirs, {
      ignored: ['**/node_modules/**', '**/.git/**'],
      ignoreInitial: true,
    })
    
    const scheduleReload = () => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer)
      this.debounceTimer = setTimeout(() => {
        const entries = loadAllSkills(workspaceDir)
        this.snapshot = entries
        onReload(entries)
      }, 30_000)  // 30 秒防抖
    }
    
    this.watcher
      .on('add', scheduleReload)
      .on('change', scheduleReload)
      .on('unlink', scheduleReload)
  }
  
  /** 获取当前快照（用于正在运行的 Agent） */
  getSnapshot(): SkillEntry[] { return this.snapshot }
  
  stop(): void { ... }
}
```

---

## C. 数据流（完整 Tool Loop）

```
POST /chat/stream
    │
    ▼
session/queue.ts: enqueue(sessionKey)
    │
    ▼
agent/runner.ts: runAttempt()
    │
    ├── 1. 加载 Skills 快照
    ├── 2. 构建 System Prompt（含 Skills + Tool Instructions）
    ├── 3. 获取工具 Schema 列表（经 Policy 过滤）
    │
    ▼ ─── Tool Loop 开始 ───
    │
    ├── 4. 调用 provider.streamChat(messages, { tools })
    │     ├── 如果 finishReason == 'tool_calls':
    │     │     ├── 解析 tool_calls
    │     │     ├── 工具名容错匹配（registry.resolve）
    │     │     ├── 执行工具（tool.execute）
    │     │     ├── 截断结果（truncateToolResult）
    │     │     ├── 注入 messages（assistant + tool result）
    │     │     ├── 推送状态 delta（"🔧 正在执行 bash..."）
    │     │     ├── 检查全局断路器（totalCalls >= 30?）
    │     │     └── continue loop
    │     │
    │     └── 如果 finishReason == 'stop':
    │           ├── 推送回复 delta（正常文本流）
    │           └── break loop
    │
    ▼ ─── Tool Loop 结束 ───
    │
    ├── 5. 追加 assistant 回复到 session
    ├── 6. 计算总 token / 费用（含工具调用的所有往返）
    ├── 7. 记录成本
    └── 8. 持久化 session
```

---

## D. 前端集成（desktop 包变更）

### D1. Chat 组件升级

- 工具调用阶段显示中间状态：
  ```
  🔧 正在执行 read_file: src/index.ts ...
  📄 读取了 125 行
  🔧 正在执行 bash: npm test ...
  ✅ 测试通过
  ```
- 工具结果可折叠（默认折叠长结果，用户点击展开）
- 最终 assistant 回复正常显示

### D2. SSE 协议扩展

现有 SSE 事件类型：`data`（文本 delta）、`done`（完成）、`error`（错误）

新增事件：
```
event: tool_start
data: { "name": "bash", "args": { "command": "npm test" }, "toolCallId": "tc_1" }

event: tool_update
data: { "toolCallId": "tc_1", "partialResult": "Running test suite...\n", "status": "in_progress" }

event: tool_result  
data: { "toolCallId": "tc_1", "name": "bash", "content": "All tests passed", "isError": false, "status": "completed" }

event: delta
data: { "content": "测试结果显示..." }

event: done
data: { "costLine": "💰 ¥0.0045 | 12,345 tokens" }
```

> **三阶段工具事件**（参考 OpenClaw ACP 的 start/update/result 模式）：  
> `tool_start` → 工具开始执行（UI 显示 spinner）  
> `tool_update` → 长时间运行工具的中间进度（如 bash 编译输出）  
> `tool_result` → 工具执行完成（UI 显示结果）

---

## E. 配置（settings.json 扩展）

```json
{
  "TOOLS_ENABLED": true,
  "TOOLS_POLICY_DENY": [],
  "TOOLS_BASH_SHELL": "powershell",
  "TOOLS_BASH_TIMEOUT_MS": 30000,
  "TOOLS_BASH_MAX_TIMEOUT_MS": 120000,
  "TOOLS_MAX_LOOP_COUNT": 30,
  "SKILLS_ENABLED": true,
  "SKILLS_EXTRA_DIRS": []
}
```

---

## F. 与现有代码的交互

| 现有文件 | 变更 |
|---------|------|
| `agent/runner.ts` | 重构为 Tool Loop（最大变更） |
| `agent/system-prompt.ts` | 注入 Skills + Tool Instructions |
| `providers/types.ts` | 扩展 `StreamChatOptions` / `ChatDelta` 支持 tools |
| `providers/copilot.ts` | 添加 tools 参数透传 |
| `providers/deepseek.ts`（未来） | 同上 |
| `config/secrets.ts` | 新增 TOOLS_* / SKILLS_* 配置项 |
| `index.ts`（Gateway 入口） | 初始化 ToolRegistry + SkillsWatcher |
| desktop `Chat.tsx` | 渲染工具调用中间态 |
| desktop `useGateway.ts` | 处理新 SSE 事件类型 |

---

## G. 测试策略

| 模块 | 测试方式 |
|------|---------|
| tools/registry.ts | 单元测试：容错匹配所有路径 |
| tools/truncation.ts | 单元测试：各种长度边界 |
| builtins/bash.ts | 集成测试：真实执行 `echo hello`、超时、取消 |
| builtins/read-file.ts | 单元测试：行范围、截断、不存在的文件 |
| builtins/glob.ts | 集成测试：真实文件系统 |
| builtins/web-fetch.ts | 集成测试：真实 HTTP + Mock 代理 |
| skills/frontmatter.ts | 单元测试：各种合法/非法 frontmatter |
| skills/loader.ts | 集成测试：6 级加载 + 同名覆盖 |
| agent/runner.ts (loop) | 集成测试：Mock Provider 模拟多轮 tool_calls |
