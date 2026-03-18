# Design: Phase 4.5 — 浏览器控制（复用 OpenClaw）

---

## 1. 新增文件

| 文件 | 用途 | 预估行数 |
|------|------|---------|
| `packages/core/src/tools/builtins/browser.ts` | browser 工具（HTTP client） | ~150 行 |

### 需修改文件

| 文件 | 修改内容 |
|------|---------|
| `packages/core/src/tools/builtins/index.ts` | 注册 browserTool |

就这些。不需要新增 Tauri 插件、不需要 Playwright 依赖、不需要新模块。

---

## 2. 核心实现 (`tools/builtins/browser.ts`)

### HTTP Client

```typescript
const DEFAULT_BROWSER_URL = 'http://127.0.0.1:9222'

async function callBrowserApi(
  baseUrl: string,
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = 30_000,
): Promise<unknown> {
  const url = `${baseUrl.replace(/\/$/, '')}${path}`
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Browser API ${res.status}: ${text.slice(0, 500)}`)
  }
  const contentType = res.headers.get('content-type') ?? ''
  if (contentType.includes('json')) return res.json()
  return res.text()
}

async function checkServerAvailable(baseUrl: string): Promise<boolean> {
  try {
    await callBrowserApi(baseUrl, 'GET', '/', undefined, 2000)
    return true
  } catch {
    return false
  }
}
```

### 工具定义

```typescript
export const browserTool: ToolDefinition = {
  name: 'browser',
  description: `控制浏览器进行网页交互（通过 OpenClaw browser server 驱动）。
支持: status/start/stop — 浏览器生命周期
      navigate — 导航到 URL
      screenshot — 截图
      snapshot — 获取 ARIA 无障碍快照（LLM 可读的页面结构）
      act — 交互操作（click/type/fill/press/hover/select/wait/evaluate）
      tabs/open/focus/close — 标签页管理
      console — 获取控制台日志
使用前需要 OpenClaw browser server 在本机运行。`,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: '操作类型',
        enum: ['status', 'start', 'stop', 'navigate', 'screenshot',
               'snapshot', 'act', 'console', 'tabs', 'open', 'focus', 'close'],
      },
      url: { type: 'string', description: 'URL (navigate/open 时必填)' },
      targetId: { type: 'string', description: '标签页 ID (focus/close/act 时可选)' },
      kind: {
        type: 'string',
        description: 'act 操作类型: click/type/fill/press/hover/select/drag/wait/evaluate/close',
      },
      ref: { type: 'string', description: '元素 ref (来自 snapshot 返回的 ref ID)' },
      text: { type: 'string', description: '文本 (type/fill)' },
      key: { type: 'string', description: '按键 (press), 如 Enter/Tab/Escape' },
      selector: { type: 'string', description: 'CSS 选择器' },
      fn: { type: 'string', description: 'JavaScript 代码 (evaluate)' },
      fullPage: { type: 'string', description: '全页截图 (true/false)' },
      profile: { type: 'string', description: '浏览器 profile (chrome/openclaw)' },
    },
    required: ['action'],
  },
  execute: browserExecute,
}
```

### execute 分发

```typescript
async function browserExecute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const baseUrl = ctx.env?.BROWSER_CONTROL_URL ?? DEFAULT_BROWSER_URL
  const action = input.action as string
  const profile = input.profile as string | undefined
  const profileQs = profile ? `?profile=${encodeURIComponent(profile)}` : ''

  // 先检查 server 可用性
  if (!(await checkServerAvailable(baseUrl))) {
    return {
      content: `无法连接 OpenClaw browser server (${baseUrl})。\n\n请确保已启动：\n1. 安装: npm i -g @anthropic-ai/claude-code\n2. 配置: 在 ~/.openclaw/openclaw.json 中设置 browser.enabled=true\n3. 启动: openclaw`,
      isError: true,
    }
  }

  try {
    switch (action) {
      case 'status':
        return jsonResult(await callBrowserApi(baseUrl, 'GET', `/${profileQs}`))

      case 'start':
        await callBrowserApi(baseUrl, 'POST', `/start${profileQs}`)
        return jsonResult(await callBrowserApi(baseUrl, 'GET', `/${profileQs}`))

      case 'stop':
        await callBrowserApi(baseUrl, 'POST', `/stop${profileQs}`)
        return { content: '浏览器已关闭' }

      case 'navigate': {
        const url = input.url as string
        if (!url) return { content: '请提供 url', isError: true }
        const targetId = input.targetId as string | undefined
        return jsonResult(await callBrowserApi(baseUrl, 'POST', '/navigate', { url, targetId, profile }))
      }

      case 'screenshot': {
        const result = await callBrowserApi(baseUrl, 'POST', '/screenshot', {
          targetId: input.targetId, fullPage: input.fullPage === 'true', profile,
        }) as { path?: string }
        return { content: result.path ? `截图已保存: ${result.path}` : JSON.stringify(result) }
      }

      case 'snapshot': {
        const qs = new URLSearchParams()
        if (profile) qs.set('profile', profile)
        if (input.selector) qs.set('selector', input.selector as string)
        const qsStr = qs.toString() ? `?${qs.toString()}` : ''
        return jsonResult(await callBrowserApi(baseUrl, 'GET', `/snapshot${qsStr}`))
      }

      case 'act': {
        const request: Record<string, unknown> = { kind: input.kind }
        for (const key of ['ref', 'text', 'key', 'selector', 'fn', 'targetId']) {
          if (input[key]) request[key] = input[key]
        }
        return jsonResult(await callBrowserApi(baseUrl, 'POST', '/act', { ...request, profile }))
      }

      case 'console': {
        return jsonResult(await callBrowserApi(baseUrl, 'GET', `/console${profileQs}`))
      }

      case 'tabs':
        return jsonResult(await callBrowserApi(baseUrl, 'GET', `/tabs${profileQs}`))

      case 'open': {
        const url = input.url as string
        if (!url) return { content: '请提供 url', isError: true }
        return jsonResult(await callBrowserApi(baseUrl, 'POST', '/tabs/open', { url, profile }))
      }

      case 'focus':
        return jsonResult(await callBrowserApi(baseUrl, 'POST', '/tabs/focus', { targetId: input.targetId, profile }))

      case 'close': {
        const targetId = input.targetId as string
        if (targetId) {
          await callBrowserApi(baseUrl, 'DELETE', `/tabs/${encodeURIComponent(targetId)}${profileQs}`)
        } else {
          await callBrowserApi(baseUrl, 'POST', '/act', { kind: 'close', profile })
        }
        return { content: '标签页已关闭' }
      }

      default:
        return { content: `未知操作: ${action}`, isError: true }
    }
  } catch (err) {
    return { content: `browser 操作失败: ${err instanceof Error ? err.message : String(err)}`, isError: true }
  }
}

function jsonResult(data: unknown): ToolResult {
  return { content: JSON.stringify(data, null, 2) }
}
```

---

## 3. 配置

通过 settings API 配置，存入 secrets：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `BROWSER_CONTROL_URL` | `http://127.0.0.1:9222` | OpenClaw browser server 地址 |

---

## 4. 错误处理

| 场景 | 错误信息 |
|------|---------|
| server 未启动 | "无法连接 OpenClaw browser server... 请确保已启动" |
| 浏览器未启动 | 转发 OpenClaw 原始错误（"Browser control is disabled"） |
| 元素未找到 | 转发 Playwright 原始错误 |
| 导航超时 | 转发超时错误 |

所有错误直接透传 OpenClaw 的错误信息，不做二次包装（OpenClaw 的错误信息对 LLM 友好）。

---

## 5. 零新依赖

| 之前方案 | 复用方案 |
|---------|---------|
| `playwright-core` (~3MB) | ❌ 不需要 |
| Chromium 二进制 (~150MB) | ❌ 不需要 |
| `tauri-plugin-notification` | ❌ 不需要 |
| 5 个新文件 | **1 个文件 ~150 行** |
