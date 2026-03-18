# Design: Phase 4.5 V2 — 浏览器控制（内置 Playwright）

---

## 1. 文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `packages/core/src/tools/builtins/browser.ts` | **重写** | HTTP client → Playwright API + ARIA snapshot |
| `packages/core/package.json` | 修改 | 添加 `playwright-core` 依赖 |
| `packages/core/src/tools/builtins/index.ts` | 不变 | browserTool 已注册 |

**不需要**改 Tauri 端、Rust 端、前端。改动完全在 Core 内部。

---

## 2. 浏览器生命周期管理

### 全局单例

```typescript
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'

let _browser: Browser | null = null
let _context: BrowserContext | null = null

async function ensureBrowser(): Promise<{ browser: Browser; context: BrowserContext }> {
  if (_browser && _browser.isConnected()) {
    return { browser: _browser, context: _context! }
  }
  
  // 查找 Chromium 路径（playwright-core 不自带浏览器，需要显式指定或用 playwright install）
  _browser = await chromium.launch({
    headless: false,        // 用户可见
    args: [
      '--disable-blink-features=AutomationControlled',  // 减少被检测
      '--no-first-run',
      '--no-default-browser-check',
    ],
  })
  _context = await _browser.newContext({
    viewport: { width: 1280, height: 720 },
    locale: 'zh-CN',
  })
  
  return { browser: _browser, context: _context }
}

async function closeBrowser(): Promise<void> {
  if (_browser) {
    await _browser.close().catch(() => {})
    _browser = null
    _context = null
  }
}
```

### 页面管理

```typescript
async function getActivePage(context: BrowserContext, targetId?: string): Promise<Page> {
  const pages = context.pages()
  if (targetId) {
    // targetId 是页面在 pages 数组中的索引（字符串形式）
    const idx = parseInt(targetId, 10)
    if (pages[idx]) return pages[idx]
    throw new Error(`标签页 ${targetId} 不存在`)
  }
  // 默认用最后一个（最新的）
  if (pages.length === 0) {
    return await context.newPage()
  }
  return pages[pages.length - 1]
}
```

---

## 3. ARIA Snapshot

### 核心逻辑

使用 Playwright 的 `page.accessibility.snapshot()` 获取无障碍树，格式化为 LLM 友好的文本。

```typescript
interface AriaNode {
  role: string
  name: string
  ref: string          // e1, e2, e3...
  children?: AriaNode[]
  value?: string
  description?: string
  checked?: boolean
  disabled?: boolean
  expanded?: boolean
  level?: number
  pressed?: boolean | 'mixed'
  selected?: boolean
}

let _refCounter = 0
const _refToLocator = new Map<string, string>()  // ref → selector

function resetRefs(): void {
  _refCounter = 0
  _refToLocator.clear()
}

async function getAriaSnapshot(page: Page): Promise<string> {
  resetRefs()
  
  // Playwright accessibility snapshot
  const snapshot = await page.accessibility.snapshot({ interestingOnly: true })
  if (!snapshot) return '(页面为空或无法获取无障碍树)'
  
  const lines: string[] = []
  formatNode(snapshot, lines, 0)
  return lines.join('\n')
}

function formatNode(node: any, lines: string[], depth: number): void {
  const ref = `e${++_refCounter}`
  const indent = '  '.repeat(depth)
  const role = node.role || 'unknown'
  const name = node.name ? ` "${node.name}"` : ''
  const value = node.value ? ` value="${node.value}"` : ''
  
  // 记录 ref → 定位信息（用于 act 操作）
  _refToLocator.set(ref, buildLocator(node))
  
  // 输出格式: [e1] button "提交"
  lines.push(`${indent}[${ref}] ${role}${name}${value}`)
  
  if (node.children) {
    for (const child of node.children) {
      formatNode(child, lines, depth + 1)
    }
  }
}
```

### 输出示例

```
[e1] WebArea "用户管理系统"
  [e2] navigation "主导航"
    [e3] link "首页"
    [e4] link "用户管理"
    [e5] link "系统设置"
  [e6] main
    [e7] heading "用户查询" level=1
    [e8] textbox "请输入工号"
    [e9] button "查询"
    [e10] table "查询结果"
      [e11] row "工号 | 姓名 | 部门"
      [e12] row "A12345 | 张三 | 研发部"
```

---

## 4. Act 操作

### ref → 元素定位

snapshot 时用 `page.accessibility.snapshot()` 获取的节点无法直接映射回 DOM。
改用 **role + name 组合定位**：

```typescript
async function actByRef(page: Page, ref: string, action: ActAction): Promise<string> {
  const locatorStr = _refToLocator.get(ref)
  if (!locatorStr) {
    throw new Error(`ref ${ref} 未找到。请先执行 snapshot 获取最新的元素列表。`)
  }
  
  const locator = page.locator(locatorStr)
  
  switch (action.kind) {
    case 'click':
      await locator.click()
      return `已点击 ${ref}`
    case 'fill':
      await locator.fill(action.text ?? '')
      return `已填入 "${action.text}"`
    case 'type':
      await locator.pressSequentially(action.text ?? '', { delay: 50 })
      return `已输入 "${action.text}"`
    case 'press':
      await locator.press(action.key ?? 'Enter')
      return `已按下 ${action.key}`
    case 'hover':
      await locator.hover()
      return `已悬停 ${ref}`
    case 'select':
      await locator.selectOption(action.text ?? '')
      return `已选择 "${action.text}"`
    // ...
  }
}

function buildLocator(node: any): string {
  // 用 role + name 组合构建 Playwright locator
  const role = node.role
  const name = node.name
  if (name) return `role=${role}[name="${name}"]`
  return `role=${role}`
}
```

### 不依赖 ref 的操作

```typescript
case 'wait':
  // 等待指定时间或选择器
  if (action.selector) {
    await page.waitForSelector(action.selector, { timeout: 10000 })
  } else {
    await page.waitForTimeout(parseInt(action.text ?? '1000', 10))
  }
  return '等待完成'

case 'evaluate':
  // 在页面执行 JS
  const result = await page.evaluate(action.fn!)
  return JSON.stringify(result, null, 2)
```

---

## 5. Chromium 管理

### playwright-core vs playwright

- `playwright-core`：纯 API 库，不自带浏览器（~3MB）
- `playwright`：API + 自动下载浏览器（~150MB）

**选择 `playwright`**（带浏览器），因为"开箱即用"是核心需求。

```bash
pnpm add playwright
# 自动下载 Chromium 到 %LOCALAPPDATA%/ms-playwright/
```

如果用户已有 Chrome/Edge，也可以配置 `executablePath` 复用：

```typescript
chromium.launch({
  executablePath: process.env.BROWSER_PATH, // 可选：用户自己的 Chrome
  headless: false,
})
```

---

## 6. 截图

```typescript
case 'screenshot': {
  const page = await getActivePage(context, targetId)
  const screenshotDir = path.join(os.tmpdir(), 'equality-screenshots')
  await fs.mkdir(screenshotDir, { recursive: true })
  const filename = `screenshot-${Date.now()}.png`
  const filepath = path.join(screenshotDir, filename)
  await page.screenshot({
    path: filepath,
    fullPage: input.fullPage === 'true',
  })
  return { content: `截图已保存: ${filepath}` }
}
```

---

## 7. 错误处理

| 场景 | 处理 |
|------|------|
| Chromium 未下载 | 提示运行 `npx playwright install chromium` |
| 浏览器崩溃 | 清空单例，下次自动重启 |
| 元素未找到 | "ref eN 未找到，请先执行 snapshot" |
| 页面导航超时 | 30s 超时，返回错误 |
| snapshot 时没有 ref | "请先执行 snapshot" |

---

## 8. 进程清理

Core 退出时关闭浏览器：

```typescript
// index.ts
process.on('SIGINT', async () => {
  await closeBrowser()
  process.exit(0)
})
```
