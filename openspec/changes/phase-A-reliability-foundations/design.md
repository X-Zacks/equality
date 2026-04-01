# Design: Phase A — 可靠性基础

> 依赖: [proposal.md](./proposal.md)

---

## A1. 编译错误自动重试

### 问题分析

当前 `runner.ts` 的 toolLoop 在收到所有工具结果后直接继续下一轮 LLM 调用。LLM 自身能看到错误结果并尝试修复，但有两个问题：

1. 部分模型（尤其是小参数模型）看到长错误输出后倾向于放弃而非修复
2. 没有框架层的"错误已识别，请修复"信号，模型可能跳到其他话题

### 设计方案

在 toolLoop 内、工具结果汇总完成后、下一轮 LLM 调用前，新增**编译错误检测 + 自动修复提示注入**：

```
toolLoop 迭代 N:
  1. LLM 生成 tool_calls
  2. 并发执行所有工具
  3. 汇总结果写入 messages
  4. [NEW] 检测是否有编译/测试错误 → 若有，注入修复提示
  5. continue → 下一轮 LLM（带修复提示）
```

### 错误识别规则

新增 `isCompileOrTestError(toolName: string, content: string, exitCode?: number): boolean`：

```typescript
// 仅对 bash 工具生效
if (toolName !== 'bash') return false
// 退出码非 0
if (exitCode === 0) return false

// 已知的编译/测试错误模式
const COMPILE_ERROR_PATTERNS = [
  /error TS\d+:/i,                    // TypeScript
  /SyntaxError|IndentationError/,     // Python
  /error\[E\d+\]/,                    // Rust
  /error: /i,                         // Go, C++
  /BUILD FAILED/i,                    // Gradle/Maven
  /FAILED.*\d+ (test|spec)/i,         // 测试框架
  /AssertionError|expect\(.*\)\.to/i, // 断言失败
  /Cannot find module/i,              // Node.js
  /ModuleNotFoundError/i,             // Python
]
```

### 修复提示注入

当检测到编译错误时，提取错误核心信息（最多 2000 字符）并注入：

```typescript
messages.push({
  role: 'user',
  content: `⚠️ 编译/测试失败，请修复以下错误后重试：\n\n${extractedErrors}\n\n请直接调用工具修复，不要解释。`,
})
```

### 重试保护

- `compileRetryUsed: boolean` 标志位，单次 runAttempt 最多触发 1 次自动重试
- 不与现有的 `forcedToolRetryUsed`（伪执行检测）冲突，两者独立

### 错误提取策略

`extractCompileErrors(content: string, maxChars = 2000): string`：

1. 按行扫描，收集匹配 `COMPILE_ERROR_PATTERNS` 的行及其前后各 2 行上下文
2. 去重（同一行不重复收集）
3. 截断到 maxChars
4. 如果没有具体匹配行，返回最后 2000 字符（通常错误在末尾）

---

## A2. 循环检测增强

### 现状

`loop-detector.ts` 已有四个检测器，功能完整。需要增强的是工程质量：

### A2.1 滑动窗口

当前 `history: ToolCallRecord[]` 无界增长。对于长时间运行的 Agent（50+ 工具调用），内存开销线性增加。

**改动**：增加 `HISTORY_WINDOW_SIZE = 30` 常量，在 `check()` 中 push 后裁剪：

```typescript
this.history.push(record)
if (this.history.length > HISTORY_WINDOW_SIZE) {
  this.history.shift()
}
```

所有检测器已在 `this.history` 上操作，无需修改检测逻辑。

### A2.2 结果哈希事后补填

OpenClaw 的设计允许先记录 (name, argsHash)，工具执行完毕后再补填 resultHash。这在并发执行场景中更自然：

```typescript
/**
 * 记录工具调用（执行前）。返回 index，用于后续 recordOutcome 补填。
 */
record(name: string, argsHash: string): number

/**
 * 补填工具执行结果哈希。
 */
recordOutcome(index: number, resultHash: string): void

/**
 * 执行所有检测。在 recordOutcome 之后调用。
 */
evaluate(index: number): DetectorVerdict
```

**决策**：当前 `check(name, argsHash, resultHash)` 一步完成的 API 已经在 runner.ts 中使用且稳定。Phase A 不改变 API 签名，仅内部增加滑动窗口。事后补填模式留作后续优化。

### A2.3 三级阈值标准化

当前检测器已经有 warn/terminate 两级，与 OpenClaw 对齐。确认不需要增加 critical 级别——OpenClaw 的 warning/critical 只影响日志级别，实际行为都是继续执行。

---

## A3. 工具 Schema 跨 Provider 兼容

### 问题分析

不同 LLM Provider 对 JSON Schema 的支持差异很大：

| 特性 | OpenAI | Gemini | xAI (Grok) | 通义/DeepSeek |
|------|--------|--------|------------|--------------|
| `anyOf`/`oneOf` | ✅ | ❌ | ❌ | ⚠️ 部分 |
| `pattern` | ✅ | ❌ | ❌ | ✅ |
| `maxLength`/`minLength` | ✅ | ❌ | ❌ | ✅ |
| `examples` | ✅ | ❌ | ✅ | ✅ |
| `$ref` | ❌ | ❌ | ❌ | ❌ |
| 空 `properties` | ✅ | ❌ | ✅ | ✅ |

### 设计方案

新增 `tools/schema-compat.ts`，导出：

```typescript
export function cleanToolSchemas(
  schemas: OpenAIToolSchema[],
  providerId: string,
): OpenAIToolSchema[]
```

### 兼容规则

#### 通用规则（所有 provider）

1. **打平 `anyOf`/`oneOf`**：合并所有分支的 properties 为一个 object
2. **注入缺失字段**：无 `type` 时补 `"object"`，无 `properties` 时补 `{}`
3. **移除 `$ref`**：内联引用（递归深度上限 5 层）
4. **描述截断**：description 超过 1024 字符时截断

#### Gemini 专用

5. **移除验证关键字**：`pattern`, `examples`, `title`, `default`, `$schema`
6. **移除字符串约束**：`maxLength`, `minLength`, `format`
7. **限制 enum 数量**：超过 50 个值时截断

#### xAI 专用

8. **移除字符串约束**：`pattern`, `maxLength`, `minLength`
9. **保留 enum**（但限制 ≤ 100）

#### 豆包/通义/DeepSeek

10. 无特殊处理（兼容 OpenAI 标准）

### Provider 识别

通过 `provider.providerId` 字符串匹配：

```typescript
function resolveProviderFamily(providerId: string): 'openai' | 'gemini' | 'xai' | 'standard' {
  const id = providerId.toLowerCase()
  if (id.includes('gemini') || id.includes('google')) return 'gemini'
  if (id.includes('xai') || id.includes('grok')) return 'xai'
  return 'standard'  // OpenAI, DeepSeek, Qwen, Volc 等
}
```

### 集成点

在 `runner.ts` 的 `streamParams` 构造处：

```typescript
// 现有代码
const streamParams = {
  messages,
  abortSignal: abort.signal,
  ...(hasTools ? { tools: toolSchemas } : {}),
}

// 改为
const cleanedSchemas = hasTools
  ? cleanToolSchemas(toolSchemas!, provider.providerId)
  : undefined
const streamParams = {
  messages,
  abortSignal: abort.signal,
  ...(cleanedSchemas ? { tools: cleanedSchemas } : {}),
}
```

---

## 风险与缓解

| 风险 | 缓解措施 |
|------|---------|
| 编译错误误判（非编译的 bash 错误触发重试） | 正则严格匹配已知模式，未知错误不触发 |
| Schema 打平破坏工具功能 | 仅在非 OpenAI provider 时执行，OpenAI 保持原样 |
| 滑动窗口丢失早期循环信号 | 30 条窗口足够覆盖检测需要（最大阈值 20） |
| 自动重试导致额外 token 消耗 | 单次限 1 轮，最多多消耗一次 LLM 调用 |
