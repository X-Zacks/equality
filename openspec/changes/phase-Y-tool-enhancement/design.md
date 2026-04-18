# Design: Phase Y — 工具体系补强

## Y0: Bash 沙箱安全增强

### 问题分析

当前 `bash-sandbox.ts` 的 `extractPathArgs()` 仅对 `PATH_COMMANDS` 中列出的命令（cat/ls/rm 等）提取路径参数并验证。以下攻击向量可绕过：

```bash
# 解释器类 — 路径在脚本内部，静态分析无法提取
python -c "open('/etc/passwd').read()"
node -e "require('fs').readFileSync('C:\\secrets\\file')"
curl file:///C:/Windows/System32/config/SAM

# 管道类 — 数据流绕过
cat workspace/ok.txt | python -c "import sys; ..."

# 环境变量读取 — 无路径但泄露信息
powershell -c "$env:MINIMAX_API_KEY"
echo $MINIMAX_API_KEY
```

### 设计方案：双层防御

**第 1 层：解释器命令限制（新增）**

对已知脚本解释器（python/node/ruby/perl/php/curl/wget/powershell），强制限制其 cwd 必须在 workspace 内。同时，对内联脚本（-c/-e 参数）中的路径引用做正则扫描。

```typescript
const INTERPRETER_COMMANDS = new Set([
  'python', 'python3', 'py', 'node', 'ruby', 'perl', 'php',
  'curl', 'wget',
])

// 在内联脚本中扫描绝对路径和敏感路径
const DANGEROUS_PATH_PATTERNS = [
  /(?:\/etc\/|\/root\/|\/home\/|C:\\Windows|C:\\Users\\[^\\]+\\AppData|~\/\.|\.ssh|\.aws|\.gnupg)/i,
  /file:\/\/\//i,  // file:// 协议
]
```

**第 2 层：环境变量泄露防护（新增）**

bash 子进程的环境变量中剔除敏感 API Key，仅保留代理和 PATH。

```typescript
const ENV_DENYLIST = /_(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i
```

### 实现位置
- `packages/core/src/tools/bash-sandbox.ts` — 新增 `checkInterpreterSafety()` + `sanitizeEnv()`
- `packages/core/src/tools/builtins/bash.ts` — 调用 sanitizeEnv 处理 env

---

## Y1.1: todo 工具

### 数据模型
```typescript
interface TodoItem {
  id: string           // 模型自选的唯一标识
  content: string      // 任务描述
  status: 'pending' | 'in_progress' | 'completed' | 'blocked'
  createdAt: number    // 时间戳
}
```

### 存储
- 绑定 Session：在 `SessionState` 中新增 `todos: TodoItem[]`
- 通过 `ctx.sessionKey` 读写当前会话的 todo 列表
- persist.ts 自动持久化到 SQLite

### 工具接口
```typescript
{
  action: 'write' | 'read' | 'clear',
  todos?: TodoItem[],  // write 时必需
  merge?: boolean,     // write 时可选，默认 false（替换）
}
```

### 上下文恢复
在 `system-prompt.ts` 的 System Prompt 末尾，如果当前 session 有 todo 列表，自动追加：
```xml
<current_todos>
[{id:"1", content:"...", status:"pending"}, ...]
</current_todos>
```

---

## Y1.2: memory 增强

### 变更
将 `memory_save` + `memory_search` 合并为单一 `memory` 工具，通过 `action` 参数分发。

保留旧工具名为别名（向后兼容），新增 `list` 和 `delete` action。

### 接口
```typescript
{
  action: 'save' | 'search' | 'list' | 'delete',
  content?: string,   // save
  query?: string,     // search
  id?: number,        // delete（记忆 ID）
  limit?: number,     // list/search，默认 20
}
```

### 实现
在现有 `memory.ts` 中新增 `memoryTool` 导出，内部复用现有 `memorySaveTool` 和 `memorySearchTool` 的逻辑。

---

## Y1.3: read_image URL 支持

### 变更
`read_image` 新增 `url` 参数。当提供 `url` 时：
1. HTTP GET 下载图片（带 SSRF 检测）
2. 保存到 `%TEMP%/equality-images/{hash}.{ext}`
3. 后续流程与本地文件相同

### 安全
复用 `url-safety.ts`（如有）或新建，检测：
- localhost / 127.0.0.1 / ::1
- 内网 IP（10.x / 172.16-31.x / 192.168.x）
- 169.254.169.254（cloud metadata）

---

## Y3.1: image_generate (MiniMax)

### API 规格（来自 platform.minimaxi.com）
```
POST https://api.minimaxi.com/v1/image_generation
Authorization: Bearer {MINIMAX_API_KEY}

{
  "model": "image-01",
  "prompt": "描述文字",
  "aspect_ratio": "1:1" | "16:9" | "9:16" | "4:3" | "3:4",
  "response_format": "base64"
}

Response: { "data": { "image_base64": ["base64string"] } }
```

### 工具接口
```typescript
{
  prompt: string,
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4',  // 默认 '1:1'
  saveTo?: string,    // 可选保存路径
}
```

### 实现
- 调用 MiniMax API 生成 base64 图片
- 保存到 `{workspaceDir}/generated-images/{timestamp}.jpeg`
- 返回文件路径 + 图片大小信息
- 前端 Chat 中通过现有图片渲染逻辑显示

### 依赖
- `MINIMAX_API_KEY` 在 Settings 中已有配置位
- 使用现有 `https-proxy-agent` 处理代理
