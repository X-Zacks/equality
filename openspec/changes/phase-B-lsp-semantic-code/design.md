# Design: Phase B — LSP 语义代码理解

> 依赖: [proposal.md](./proposal.md)

---

## 总体架构

```
Agent (runner.ts)
    │
    │  调用工具
    ▼
lsp_hover / lsp_definition / lsp_references / lsp_diagnostics
    │
    │  通过 LspLifecycle 获取客户端
    ▼
LspLifecycle（会话级进程池）
    │
    │  缓存/启动/超时关闭
    ▼
LspClient（JSON-RPC stdio 传输）
    │
    │  Content-Length 帧协议
    ▼
语言服务器进程（tsserver / pyright / gopls ...）
```

核心设计原则：
- **工具层（builtins）**：只做参数解析 + 结果格式化，不了解 LSP 协议细节
- **生命周期层（lifecycle）**：负责进程池管理，工具层通过 `getOrStartServer(workspaceDir, lang)` 获取已就绪的客户端
- **客户端层（client）**：负责 JSON-RPC 帧协议，暴露 `request(method, params)` 和 `notify(method, params)`

---

## B1. LSP JSON-RPC 客户端

### 文件：`tools/lsp/client.ts`

#### Content-Length 帧协议

LSP 使用 HTTP 风格的 header 分隔消息体：

```
Content-Length: 97\r\n
\r\n
{"jsonrpc":"2.0","id":1,"method":"textDocument/hover","params":{...}}
```

解析器状态机：

```
HEADER → 读到 \r\n\r\n → BODY(length) → 解析 JSON → 派发
```

#### 类型定义

```typescript
interface LspRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: unknown
}

interface LspResponse {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

interface LspNotification {
  jsonrpc: '2.0'
  method: string
  params?: unknown
}
```

#### LspClient 类

```typescript
export class LspClient {
  private process: ChildProcess
  private pending: Map<number, { resolve, reject, timeoutHandle }>
  private idCounter = 0
  private buffer = ''

  constructor(serverProcess: ChildProcess)

  // 发送请求，等待响应（默认 10s 超时）
  async request<T>(method: string, params?: unknown, timeoutMs = 10_000): Promise<T>

  // 发送通知（无响应）
  notify(method: string, params?: unknown): void

  // 关闭客户端（发送 shutdown + exit）
  async dispose(): Promise<void>

  // 内部：解析 stdout 数据，触发 pending 回调
  private onData(chunk: Buffer): void

  // 内部：发送帧
  private send(message: object): void
}
```

#### 错误处理

- 请求超时（10s）：reject 并从 pending 中清除，**不关闭整个客户端**
- 进程意外退出（stderr 输出 + 'close' 事件）：reject 所有 pending 请求，标记 `disposed = true`
- JSON 解析失败：记录 console.warn，跳过该帧，继续处理后续数据

---

## B2. 语言服务器配置

### 文件：`tools/lsp/server-configs.ts`

#### 支持的语言

| 语言 | 服务器命令 | 检测方式 |
|------|-----------|---------|
| TypeScript/JS | `npx typescript-language-server --stdio` | `package.json` 存在 / `.ts` 文件 |
| Python | `pyright-langserver --stdio` 或 `pylsp --tcp` | `*.py` 文件 |
| Go | `gopls` | `go.mod` 存在 |

#### ServerConfig 类型

```typescript
export interface LspServerConfig {
  language: string
  /** 检测工作区是否适用该语言 */
  detect(workspaceDir: string): boolean
  /** 构建启动命令 */
  command(workspaceDir: string): { cmd: string; args: string[]; env?: Record<string, string> }
  /** 初始化参数（传给 initialize 请求） */
  initOptions?: unknown
}
```

#### TypeScript 服务器配置

```typescript
{
  language: 'typescript',
  detect(dir) {
    return fs.existsSync(path.join(dir, 'tsconfig.json'))
      || fs.existsSync(path.join(dir, 'package.json'))
  },
  command(dir) {
    // 优先使用项目本地的 typescript-language-server
    const local = path.join(dir, 'node_modules', '.bin', 'typescript-language-server')
    const cmd = fs.existsSync(local) ? local : 'typescript-language-server'
    return { cmd, args: ['--stdio'] }
  },
  initOptions: { preferences: { includeInlayParameterNameHints: 'none' } }
}
```

---

## B3. 会话级生命周期管理

### 文件：`tools/lsp/lifecycle.ts`

#### 设计目标

- 同一 `workspaceDir + language` 的多次工具调用，复用同一个已初始化的 LspClient
- 空闲超时（默认 5 分钟）后自动关闭进程
- 启动失败（命令不存在、进程崩溃）时返回 `null`，工具层转为友好错误提示

#### LspLifecycle 类（单例）

```typescript
interface ServerEntry {
  client: LspClient
  language: string
  lastUsed: number         // Date.now()
  idleTimer: NodeJS.Timeout
}

export class LspLifecycle {
  private static instance: LspLifecycle
  private servers: Map<string, ServerEntry>  // key = `${workspaceDir}:${language}`

  static getInstance(): LspLifecycle

  /**
   * 获取或启动 LSP 服务器
   * @returns LspClient 或 null（服务器不可用时）
   */
  async getOrStart(workspaceDir: string, language: string): Promise<LspClient | null>

  /**
   * 关闭指定 workspaceDir 的所有 LSP 服务器
   * （runner 结束时调用，可选）
   */
  async closeAll(workspaceDir: string): Promise<void>

  private async startServer(workspaceDir: string, config: LspServerConfig): Promise<LspClient>

  private resetIdleTimer(key: string): void
}
```

#### LSP 初始化握手流程

```
1. spawn 服务器进程
2. 发送 initialize 请求（含 rootUri、capabilities）
3. 等待 initialize 响应（获取 serverCapabilities）
4. 发送 initialized 通知
5. 标记为 ready，注册 ServerEntry
```

#### 客户端能力声明（发送给服务器）

```typescript
const CLIENT_CAPABILITIES = {
  textDocument: {
    hover:       { contentFormat: ['plaintext'] },
    definition:  { linkSupport: false },
    references:  {},
    publishDiagnostics: { relatedInformation: false },
  },
  workspace: {
    workspaceFolders: false,
  },
}
```

#### 打开文件（textDocument/didOpen）

LSP 需要客户端先"打开"文件，才能响应该文件的请求。每次工具调用前：

1. 检查文件是否已在 `openedFiles` Set 中
2. 若未打开：读取文件内容，发送 `textDocument/didOpen` 通知
3. 缓存已打开文件，避免重复发送

---

## B4. 四个 LSP 工具

### lsp_hover（`tools/builtins/lsp-hover.ts`）

**用途**：获取指定位置符号的类型签名和文档注释

**参数**：
```typescript
{
  file: string      // 文件路径（相对或绝对）
  line: number      // 行号（1-based）
  column: number    // 列号（1-based）
}
```

**LSP 请求**：`textDocument/hover`

**输出格式**：
```
类型: (parameter) name: string
文档: The name of the user. Used for display purposes.
位置: src/models/user.ts:12:5
```

**降级策略**：
- LSP 不可用 → `"LSP 服务器不可用，请确保已安装 typescript-language-server（npm i -g typescript-language-server typescript）"`
- hover 结果为 null（光标不在符号上）→ `"该位置没有符号信息"`

---

### lsp_definition（`tools/builtins/lsp-definition.ts`）

**用途**：跳转到符号的定义位置

**参数**：
```typescript
{
  file: string
  line: number      // 1-based
  column: number    // 1-based
}
```

**LSP 请求**：`textDocument/definition`

**输出格式**：
```
定义位置 (共 1 处):
  → src/utils/format.ts:45:10
     export function formatDate(date: Date, pattern: string): string {
```

多处定义（接口 + 实现）时，全部列出。

---

### lsp_references（`tools/builtins/lsp-references.ts`）

**用途**：查找符号的所有引用

**参数**：
```typescript
{
  file: string
  line: number      // 1-based
  column: number    // 1-based
  include_declaration?: boolean  // 是否包含声明本身，默认 false
}
```

**LSP 请求**：`textDocument/references`

**输出格式**：
```
引用 (共 5 处):
  → src/components/Header.tsx:23:12
     const label = formatDate(new Date(), 'YYYY-MM-DD')
  → src/utils/export.ts:67:8
     return formatDate(row.createdAt, pattern)
  ...（超过 20 处时截断并提示）
```

**截断保护**：最多返回 50 处引用，超出时提示 `"(仅显示前 50 处，共 N 处)"`

---

### lsp_diagnostics（`tools/builtins/lsp-diagnostics.ts`）

**用途**：获取文件或整个工作区的诊断信息（无需运行 tsc）

**参数**：
```typescript
{
  file?: string     // 指定文件，省略则返回所有已打开文件的诊断
  severity?: 'error' | 'warning' | 'all'  // 默认 'error'
}
```

**LSP 机制**：

诊断是 LSP 服务器主动推送的（`textDocument/publishDiagnostics` 通知），不是请求-响应模式。LspClient 需要：

1. 监听 `textDocument/publishDiagnostics` 通知
2. 维护 `diagnostics: Map<fileUri, Diagnostic[]>` 缓存
3. `lsp_diagnostics` 工具直接读取缓存（不发出新请求）

**触发诊断更新**：当 `file` 参数指定时：
1. 发送 `textDocument/didOpen` 或 `textDocument/didChange`（内容不变）
2. 等待最多 3 秒，直到该文件的诊断通知到来
3. 返回缓存的诊断结果

**输出格式**：
```
src/agent/runner.ts 诊断 (3 个错误):
  ❌ 第 45 行: Type 'string' is not assignable to type 'number'. [TS2322]
  ❌ 第 78 行: Cannot find name 'unknownFn'. [TS2304]
  ⚠️  第 102 行: 'result' is declared but its value is never read. [TS6133]
```

---

## B5. 集成到工具注册

### 修改 `tools/builtins/index.ts`

```typescript
// 新增导入
import { lspHoverTool } from './lsp-hover.js'
import { lspDefinitionTool } from './lsp-definition.js'
import { lspReferencesTool } from './lsp-references.js'
import { lspDiagnosticsTool } from './lsp-diagnostics.js'

// 在 builtinTools 数组末尾追加
// LSP 语义代码理解 (Phase B)
lspHoverTool,
lspDefinitionTool,
lspReferencesTool,
lspDiagnosticsTool,
```

---

## B6. 缺失依赖的自动安装机制

当检测到语言服务器未安装时，系统采用两阶段流程：

### 阶段 1：检测 + 提示

```
LspLifecycle.startServer() 尝试 spawn 服务器进程时：
  if (error.code === 'ENOENT') {  // 命令不存在
    return {
      success: false,
      missingCommand: 'typescript-language-server',
      installCommand: 'npm install -g typescript-language-server typescript',
      guideUrl: 'https://github.com/typescript-language-server/typescript-language-server'
    }
  }
```

工具层（如 `lsp_hover`）接收到此信息后：

```typescript
if (result.missingCommand) {
  // 返回交互式操作提示（含 "自动安装" 按钮）
  return {
    content: `🔧 ${result.missingCommand} 未安装\n\n` +
             `安装命令:\n` +
             `${result.installCommand}\n\n` +
             `文档: ${result.guideUrl}`,
    isError: false,
    metadata: {
      actionable: true,
      suggestedCommand: result.installCommand
    }
  }
}
```

### 阶段 2：用户确认安装

Agent 看到提示后可以：

**选项 A（推荐）**：让用户确认，然后调用 `bash` 工具执行安装
```
用户消息: "帮我安装 TypeScript 语言服务器"
↓
Agent 调用 bash: npm install -g typescript-language-server typescript
↓
安装完成，Agent 重试 lsp_hover
```

**选项 B（自动）**：直接调用 bash 安装（需用户明确授权）
```
lsp_* 工具返回 actionable=true
↓ 
Agent 自动判断：可以尝试自动安装吗?
↓ 
如果 allowAutoInstall 配置=true：
  调用 bash 执行安装
  等待完成
  重试 LSP 请求
```

### 实现细节

在 `LspLifecycle` 中增加缓存：

```typescript
private notInstalledLanguages: Set<string> = new Set()  // 本次会话已确认不可用的语言

async startServer(workspaceDir: string, config: LspServerConfig) {
  // 快速路径：已确认不可用则不再尝试
  if (this.notInstalledLanguages.has(config.language)) {
    return null
  }

  try {
    const process = spawn(config.command.cmd, config.command.args, {...})
    // 初始化...
  } catch (err) {
    if (err.code === 'ENOENT') {
      this.notInstalledLanguages.add(config.language)
      return {
        missingCommand: config.command.cmd,
        installCommand: this.suggestInstall(config.language),
        guideUrl: this.getGuideUrl(config.language)
      }
    }
    throw err
  }
}

private suggestInstall(language: string): string {
  const installs = {
    'typescript': 'npm install -g typescript-language-server typescript',
    'python': 'pip install pyright',
    'go': 'go install github.com/golang/tools/gopls@latest'
  }
  return installs[language] || ''
}
```

---

## B7. 错误处理矩阵

| 场景 | 行为 |
|------|------|
| 语言服务器未安装（命令不存在） | 返回缺失信息（含安装命令），标记 actionable=true，允许 Agent 调用 bash 安装 |
| 服务器启动超时（>15s） | 返回超时提示，标记该语言不可用（本次会话内不再尝试） |
| 服务器进程崩溃 | 下次调用时重新启动 |
| 请求超时（单次 10s） | 返回超时提示，客户端继续存活 |
| 文件不存在 | 提前检查，返回文件不存在错误 |
| 符号位置无内容 | 返回"该位置没有符号信息" |
| 诊断等待超时（3s） | 返回"诊断加载中，请稍后重试" |

---

## B8. 性能与资源管理

- **进程数上限**：每个 workspaceDir 每种语言最多 1 个进程（共享同一会话）
- **空闲超时**：5 分钟无调用后自动发送 `shutdown` → `exit`，释放内存
- **启动缓存**：同一 key 正在启动时，后续请求等待同一个 Promise（防重复启动）
- **打开文件上限**：同一会话最多追踪 100 个已打开文件（LRU 淘汰），防止内存泄漏
- **不可用语言缓存**：本会话内已确认不可用的语言（缺失依赖）不再重试启动（避免每次都超时等待）

---

## B9. 审查补充：6 个注意事项

### 注意 1：Windows 路径 → file:// URI 转换

LSP 协议要求使用 `file:///` URI（如 `file:///c%3A/software/equality/src/agent/runner.ts`），而非操作系统原生路径。Windows 上尤其需要注意：

- 反斜杠 `\` 必须转为正斜杠 `/`
- 盘符 `C:` 中的冒号需要 percent-encode 为 `%3A`
- 路径开头加 `file:///`

```typescript
function pathToFileUri(absPath: string): string {
  const normalized = absPath.replace(/\\/g, '/')
  // Windows: c:/foo → file:///c%3A/foo
  if (/^[a-zA-Z]:/.test(normalized)) {
    return `file:///${normalized[0]}%3A${normalized.slice(2)}`
  }
  return `file://${normalized}`
}

function fileUriToPath(uri: string): string {
  const url = new URL(uri)
  // Windows: file:///c%3A/foo → c:/foo
  return process.platform === 'win32'
    ? url.pathname.slice(1) // 去掉开头的 /
    : url.pathname
}
```

这个工具函数放在 `tools/lsp/types.ts` 中导出。

### 注意 2：ToolResultMetadata 需要扩展

当前 `ToolResultMetadata` 无 `actionable` 和 `suggestedCommand` 字段。需要追加：

```typescript
export interface ToolResultMetadata {
  truncated?: boolean
  originalLength?: number
  durationMs?: number
  // Phase B 新增
  actionable?: boolean
  suggestedCommand?: string
}
```

这是 additive change，不影响已有工具。

### 注意 3：Buffer 解析 vs String 解析

LspClient.onData 接收 `Buffer` 数据（stdout 原始字节流）。帧解析应工作在 **Buffer 级别**而非 String 级别，因为 Content-Length 表示的是字节数（不是字符数）。如果有多字节 UTF-8 字符，字节数 ≠ 字符数，字符串模式的 `.length` 会出错。

```typescript
private rawBuffer = Buffer.alloc(0)

private onData(chunk: Buffer): void {
  this.rawBuffer = Buffer.concat([this.rawBuffer, chunk])
  this.parseFrames()
}

private parseFrames(): void {
  while (true) {
    const headerEnd = this.rawBuffer.indexOf('\r\n\r\n')
    if (headerEnd < 0) break
    const header = this.rawBuffer.subarray(0, headerEnd).toString('ascii')
    const match = header.match(/Content-Length:\s*(\d+)/i)
    if (!match) { this.rawBuffer = this.rawBuffer.subarray(headerEnd + 4); continue }
    const bodyLen = parseInt(match[1], 10)
    const totalLen = headerEnd + 4 + bodyLen
    if (this.rawBuffer.length < totalLen) break // 数据未到齐
    const body = this.rawBuffer.subarray(headerEnd + 4, totalLen).toString('utf-8')
    this.rawBuffer = this.rawBuffer.subarray(totalLen)
    this.dispatchMessage(JSON.parse(body))
  }
}
```

### 注意 4：文件修改后需要 didChange 同步

当 Agent 通过 `write_file` 或 `edit_file` 修改了代码后再调用 LSP 工具，如果 LSP 服务器看到的还是旧内容，结果会不准确。

解决方案：每次 LSP 工具调用前，重新读取文件内容，与上次 didOpen 的内容比较。如果有变化，发送 `textDocument/didChange` 通知：

```typescript
// lifecycle.ts 中的 ensureFileOpen 方法
async ensureFileOpen(client: LspClient, filePath: string): Promise<void> {
  const content = await fs.readFile(filePath, 'utf-8')
  const uri = pathToFileUri(filePath)
  if (this.openedFiles.has(uri)) {
    if (this.fileContents.get(uri) !== content) {
      client.notify('textDocument/didChange', {
        textDocument: { uri, version: this.nextVersion(uri) },
        contentChanges: [{ text: content }]  // 全量替换
      })
      this.fileContents.set(uri, content)
    }
  } else {
    client.notify('textDocument/didOpen', {
      textDocument: { uri, languageId: this.detectLangId(filePath), version: 1, text: content }
    })
    this.openedFiles.add(uri)
    this.fileContents.set(uri, content)
  }
}
```

### 注意 5：自动检测语言 — 基于文件扩展名

`detectLanguage(filePath)` 应该从文件扩展名推导，不应该要求用户手动指定：

```typescript
function detectLanguage(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase()
  const map: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'typescript', '.js': 'typescript', '.jsx': 'typescript',
    '.py': 'python', '.pyi': 'python',
    '.go': 'go',
  }
  return map[ext] ?? null
}
```

4 个 LSP 工具的 `file` 参数自动推导语言，用户不需要手动传 language。

### 注意 6：安装后清除不可用缓存

`notInstalledLanguages` 缓存可能在 Agent 调用 `bash` 安装完依赖后过时。需要在 LSP 工具检测到 `actionable` 结果 + Agent 执行了 `bash` 安装命令后，清除该缓存：

```typescript
// lifecycle.ts
clearNotInstalled(language: string): void {
  this.notInstalledLanguages.delete(language)
}
```

工具层在返回 `actionable` 结果时，同时在 content 中提示 Agent：
```
安装完成后请重新调用此工具即可。
```

LspLifecycle 的 `getOrStart` 增加 `forceRetry` 参数：
```typescript
async getOrStart(workspaceDir: string, language: string, forceRetry = false): Promise<...> {
  if (forceRetry) this.notInstalledLanguages.delete(language)
  // ...
}
```
