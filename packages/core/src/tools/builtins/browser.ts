/**
 * tools/builtins/browser.ts — 浏览器控制工具
 *
 * Phase 4.5 V2: 内置 Playwright，开箱即用
 * 无需外部 browser server，直接驱动 Chromium
 *
 * 多会话隔离：共享一个 Browser 进程，每个 session 拥有独立的 BrowserContext，
 * 不同对话/定时任务互不干扰。
 */

import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { existsSync } from 'node:fs'
import type { ToolDefinition, ToolResult, ToolContext } from '../types.js'
import type { Browser, BrowserContext, Page } from 'playwright-core'
import { hasSecret, getSecret } from '../../config/secrets.js'

// ─── 懒加载 playwright-core ──────────────────────────────────────────────────

let _chromium: typeof import('playwright-core')['chromium'] | null = null

async function getChromium() {
  if (_chromium) return _chromium
  const pw = await import('playwright-core')
  _chromium = pw.chromium
  return _chromium
}

// ─── 共享 Browser 进程 + per-session BrowserContext ──────────────────────────

let _browser: Browser | null = null

/** sessionKey → 该 session 独占的 BrowserContext */
const _contexts = new Map<string, BrowserContext>()

/** 自动检测系统 Chrome / Edge 路径 */
function findBrowserExecutable(): string {
  const candidates = [
    // 优先从 settings.json 读取（用户在界面配置的）
    hasSecret('CHROME_PATH') ? getSecret('CHROME_PATH') : undefined,
    // 环境变量（兼容旧方式）
    process.env.CHROME_PATH,
    // Chrome 标准安装路径
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    // Edge
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ].filter(Boolean) as string[]

  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  throw new Error(
    '未找到 Chrome 或 Edge 浏览器。请在「设置 → 工具 → 浏览器工具」中填入 chrome.exe 的完整路径。',
  )
}

/** 确保共享 Browser 进程已启动 */
async function ensureBrowserProcess(): Promise<Browser> {
  if (_browser?.isConnected()) return _browser
  // 清理旧实例
  _browser = null
  _contexts.clear()

  const chromium = await getChromium()
  const executablePath = findBrowserExecutable()
  _browser = await chromium.launch({
    headless: false,
    executablePath,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
    ],
  })

  // 浏览器断开时清理所有 context
  _browser.on('disconnected', () => {
    _browser = null
    _contexts.clear()
  })

  return _browser
}

/** 获取（或创建）session 专属的 BrowserContext */
async function ensureContext(sessionKey: string): Promise<{ browser: Browser; context: BrowserContext }> {
  const browser = await ensureBrowserProcess()

  let context = _contexts.get(sessionKey)
  if (context && !context.pages) {
    // context 已被关闭
    _contexts.delete(sessionKey)
    context = undefined
  }

  if (!context) {
    const downloadPath = join(homedir(), 'Downloads')
    await mkdir(downloadPath, { recursive: true })
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      locale: 'zh-CN',
      acceptDownloads: true,
    })
    _contexts.set(sessionKey, context)

    // context 关闭时自动清理
    context.on('close', () => {
      _contexts.delete(sessionKey)
    })
  }

  return { browser, context }
}

/** 关闭某个 session 的浏览器 context */
export async function closeSessionBrowser(sessionKey: string): Promise<void> {
  const context = _contexts.get(sessionKey)
  if (context) {
    await context.close().catch(() => {})
    _contexts.delete(sessionKey)
  }
  // 如果没有任何 context 了，关闭整个 Browser 进程
  if (_contexts.size === 0 && _browser) {
    await _browser.close().catch(() => {})
    _browser = null
  }
}

/** 关闭所有浏览器（全部 session） */
export async function closeBrowser(): Promise<void> {
  for (const [key, ctx] of _contexts) {
    await ctx.close().catch(() => {})
  }
  _contexts.clear()
  if (_browser) {
    await _browser.close().catch(() => {})
    _browser = null
  }
}

function isBrowserRunning(sessionKey?: string): boolean {
  if (!_browser?.isConnected()) return false
  if (sessionKey) return _contexts.has(sessionKey)
  return _contexts.size > 0
}

// ─── 页面管理 ────────────────────────────────────────────────────────────────

async function getActivePage(context: BrowserContext, targetId?: string): Promise<Page> {
  const pages = context.pages()
  if (targetId) {
    const idx = parseInt(targetId, 10)
    if (!isNaN(idx) && pages[idx]) return pages[idx]
    // 也可能是 page 的标题匹配
    const byTitle = pages.find(p => p.url().includes(targetId))
    if (byTitle) return byTitle
    throw new Error(`标签页 ${targetId} 不存在。使用 tabs 查看所有标签页。`)
  }
  if (pages.length === 0) {
    return await context.newPage()
  }
  return pages[pages.length - 1]
}

// ─── ARIA Snapshot ───────────────────────────────────────────────────────────
// 使用 Playwright 新版 ariaSnapshot() API（旧 page.accessibility 已废弃）
// 返回格式如：
//   - textbox "搜索关键词"
//   - button "百度一下"
//   - link "新闻"
// act 操作通过 role + name 直接定位元素，不再需要 ref 映射

async function getAriaSnapshot(page: Page): Promise<string> {
  // 等待页面基本就绪
  await page.waitForLoadState('domcontentloaded').catch(() => {})

  // 重试最多 3 次
  let snapshot = ''
  for (let i = 0; i < 3; i++) {
    try {
      snapshot = await page.locator('body').ariaSnapshot()
    } catch {
      // ignore
    }
    if (snapshot && snapshot.trim().length > 10) break
    await page.waitForTimeout(1000)
  }

  if (!snapshot || snapshot.trim().length < 10) {
    return `# ${page.url()}\n\n(页面无障碍树为空。可能原因：页面仍在加载、页面内容为 iframe、或页面无可交互元素。\n建议：1) 等一下再试 snapshot  2) 用 act kind=evaluate fn="document.title" 确认页面已加载  3) 用 screenshot 看看当前页面)`
  }

  return `# ${page.url()}\n\n${snapshot}`
}

// ─── Act 操作 ────────────────────────────────────────────────────────────────

/** 通过 role + name 定位元素并操作（对应 snapshot 中的 `- role "name"` 格式） */
async function actByRole(
  page: Page,
  role: string,
  name: string | undefined,
  kind: string,
  input: Record<string, unknown>,
): Promise<string> {
  // 用 role + name 构建 Playwright locator
  const locator = name
    ? page.getByRole(role as any, { name, exact: false })
    : page.locator(`role=${role}`)

  const desc = name ? `${role} "${name}"` : role

  switch (kind) {
    case 'click': {
      // 同时监听可能的下载事件
      const downloadPromise = page.waitForEvent('download', { timeout: 3_000 }).catch(() => null)
      await locator.first().click({ timeout: 10_000 })
      const download = await downloadPromise
      if (download) {
        const savePath = join(homedir(), 'Downloads', download.suggestedFilename())
        await download.saveAs(savePath)
        return `已点击 ${desc} → 文件已下载: ${savePath}`
      }
      await page.waitForLoadState('load').catch(() => {})
      await page.waitForTimeout(500)
      return `已点击 ${desc}`
    }

    case 'fill':
      await locator.first().fill((input.text as string) ?? '')
      return `已在 ${desc} 中填入 "${input.text}"`

    case 'type':
      await locator.first().pressSequentially((input.text as string) ?? '', { delay: 50 })
      return `已在 ${desc} 中逐字输入 "${input.text}"`

    case 'press':
      await locator.first().press((input.key as string) ?? 'Enter')
      return `已在 ${desc} 上按下 ${input.key}`

    case 'hover':
      await locator.first().hover()
      return `已悬停 ${desc}`

    case 'select':
      await locator.first().selectOption((input.text as string) ?? '')
      return `已选择 "${input.text}"`

    case 'upload': {
      // 本地文件上传：text 为文件路径，多文件用逗号分隔
      const filePaths = ((input.text as string) ?? '').split(',').map(s => s.trim()).filter(Boolean)
      if (filePaths.length === 0) throw new Error('upload 需要 text 参数（本地文件路径，多文件用逗号分隔）')
      // 检查文件是否存在
      const { existsSync } = await import('node:fs')
      for (const fp of filePaths) {
        if (!existsSync(fp)) throw new Error(`文件不存在: ${fp}`)
      }
      await locator.first().setInputFiles(filePaths)
      return `已上传 ${filePaths.length} 个文件到 ${desc}: ${filePaths.join(', ')}`
    }

    default:
      throw new Error(`不支持的 act kind: ${kind}。支持: click/fill/type/press/hover/select/upload`)
  }
}

async function actGlobal(page: Page, kind: string, input: Record<string, unknown>): Promise<string> {
  switch (kind) {
    case 'wait': {
      const selector = input.selector as string | undefined
      if (selector) {
        await page.waitForSelector(selector, { timeout: 10_000 })
        return `元素 "${selector}" 已出现`
      }
      const ms = parseInt((input.text as string) ?? '1000', 10)
      await page.waitForTimeout(ms)
      return `已等待 ${ms}ms`
    }

    case 'evaluate': {
      const fn = input.fn as string
      if (!fn) throw new Error('evaluate 需要 fn 参数（JavaScript 代码）')
      const result = await page.evaluate(fn)
      const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
      return text?.slice(0, 5000) ?? '(undefined)'
    }

    case 'press': {
      const key = (input.key as string) ?? 'Enter'
      await page.keyboard.press(key)
      return `已按下 ${key}`
    }

    case 'click': {
      const selector = input.selector as string
      if (!selector) throw new Error('click 无 role 时需要 selector 参数')
      const downloadPromise = page.waitForEvent('download', { timeout: 3_000 }).catch(() => null)
      await page.click(selector, { timeout: 10_000 })
      const download = await downloadPromise
      if (download) {
        const savePath = join(homedir(), 'Downloads', download.suggestedFilename())
        await download.saveAs(savePath)
        return `已点击 "${selector}" → 文件已下载: ${savePath}`
      }
      return `已点击 "${selector}"`
    }

    case 'fill': {
      const selector = input.selector as string
      if (!selector) throw new Error('fill 无 ref 时需要 selector 参数')
      await page.fill(selector, (input.text as string) ?? '')
      return `已填入 "${input.text}"`
    }

    case 'upload': {
      // 通过 selector 或自动查找 input[type=file] 上传文件
      const filePaths = ((input.text as string) ?? '').split(',').map(s => s.trim()).filter(Boolean)
      if (filePaths.length === 0) throw new Error('upload 需要 text 参数（本地文件路径）')
      const { existsSync } = await import('node:fs')
      for (const fp of filePaths) {
        if (!existsSync(fp)) throw new Error(`文件不存在: ${fp}`)
      }
      const sel = (input.selector as string) || 'input[type="file"]'
      await page.locator(sel).first().setInputFiles(filePaths)
      return `已上传 ${filePaths.length} 个文件: ${filePaths.join(', ')}`
    }

    default:
      throw new Error(`不支持的全局 act kind: ${kind}。提供 role 参数可使用更多操作。`)
  }
}

// ─── 工具定义 ────────────────────────────────────────────────────────────────

function truncate(text: string, max = 8000): ToolResult {
  return { content: text.length > max ? text.slice(0, max) + '\n...(已截断)' : text }
}

export const browserTool: ToolDefinition = {
  name: 'browser',
  description: `控制浏览器进行网页交互（使用系统 Chrome/Edge，零依赖下载）。
操作流程: start → navigate → snapshot → act → snapshot（循环）→ screenshot → stop
- start/stop: 启动/关闭浏览器（可见窗口）
- navigate: 导航到 URL
- snapshot: 获取 ARIA 无障碍快照（返回 - role "name" 格式的页面结构）
- act: 交互操作（click/fill/type/press/hover/select/upload/wait/evaluate），用 role+name 引用 snapshot 中的元素
- act kind=upload: 上传本地文件到网页（text 为本地文件路径，如 C:\\files\\doc.docx，多文件用逗号分隔）
- screenshot: 截图保存到文件
- tabs/open/focus/close: 标签页管理
- console: 获取控制台日志
典型用法:
  填表: snapshot 看到 \`- textbox "搜索"\`，再 act kind=fill role=textbox name=搜索 text=天气
  上传: 用 act kind=upload text=C:\\files\\doc.docx 上传文件（自动找到 input[type=file]，或指定 role+name 定位上传按钮）`,
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: '操作类型',
        enum: ['status', 'start', 'stop', 'navigate', 'screenshot',
               'snapshot', 'act', 'console', 'tabs', 'open', 'focus', 'close'],
      },
      url: { type: 'string', description: 'URL（navigate/open 时必填）' },
      targetId: { type: 'string', description: '标签页索引（从 0 开始）' },
      kind: {
        type: 'string',
        description: 'act 操作类型: click/fill/type/press/hover/select/upload/wait/evaluate',
      },
      role: { type: 'string', description: '元素角色（来自 snapshot，如 textbox/button/link/checkbox 等）。与 name 配合定位元素' },
      name: { type: 'string', description: '元素名称（来自 snapshot 中引号内的文本，如 "百度一下"）。与 role 配合定位元素' },
      text: { type: 'string', description: '文本（fill/type 时填入的内容，wait 时为等待毫秒数）' },
      key: { type: 'string', description: '按键名（press），如 Enter/Tab/Escape' },
      selector: { type: 'string', description: 'CSS 选择器（无 ref 时的 click/fill/wait 备选定位方式）' },
      fn: { type: 'string', description: 'JavaScript 代码（evaluate 时使用）' },
      fullPage: { type: 'string', description: '全页截图 true/false（默认 false）' },
    },
    required: ['action'],
  },

  execute: async (input: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> => {
    const action = input.action as string
    const sk = _ctx.sessionKey ?? 'default'

    try {
      switch (action) {
        // ─── 生命周期 ────────────────────────────────────────────
        case 'status': {
          const running = isBrowserRunning(sk)
          const context = _contexts.get(sk)
          const pages = context?.pages() ?? []
          return truncate(JSON.stringify({
            running,
            sessionKey: sk,
            activeSessions: [..._contexts.keys()],
            tabs: pages.map((p, i) => ({ id: i, url: p.url(), title: '' })),
          }, null, 2))
        }

        case 'start': {
          const { context } = await ensureContext(sk)
          const pages = context.pages()
          return { content: `浏览器已启动（Chromium, session: ${sk}）。当前 ${pages.length} 个标签页。` }
        }

        case 'stop': {
          await closeSessionBrowser(sk)
          return { content: `浏览器已关闭（session: ${sk}）。` }
        }

        // ─── 导航 ────────────────────────────────────────────────
        case 'navigate': {
          const url = input.url as string
          if (!url) return { content: '请提供 url 参数', isError: true }
          const { context } = await ensureContext(sk)
          const page = await getActivePage(context, input.targetId as string | undefined)
          await page.goto(url, { waitUntil: 'load', timeout: 30_000 })
          // 额外等待一下，让 JS 渲染完成（SPA 站点需要）
          await page.waitForTimeout(800)
          return { content: `已导航到 ${page.url()}` }
        }

        // ─── ARIA 快照 ──────────────────────────────────────────
        case 'snapshot': {
          if (!isBrowserRunning(sk)) return { content: '浏览器未启动，请先执行 start', isError: true }
          const context = _contexts.get(sk)!
          const page = await getActivePage(context, input.targetId as string | undefined)
          const text = await getAriaSnapshot(page)
          return truncate(text)
        }

        // ─── 交互操作 ───────────────────────────────────────────
        case 'act': {
          const kind = input.kind as string
          if (!kind) return { content: '请提供 kind 参数（如 click/fill/type/press/wait/evaluate）', isError: true }
          if (!isBrowserRunning(sk)) return { content: '浏览器未启动，请先执行 start', isError: true }
          const context = _contexts.get(sk)!
          const page = await getActivePage(context, input.targetId as string | undefined)
          const role = input.role as string | undefined
          let result: string
          if (role) {
            result = await actByRole(page, role, input.name as string | undefined, kind, input)
          } else {
            result = await actGlobal(page, kind, input)
          }
          return { content: result }
        }

        // ─── 截图 ───────────────────────────────────────────────
        case 'screenshot': {
          if (!isBrowserRunning(sk)) return { content: '浏览器未启动，请先执行 start', isError: true }
          const context = _contexts.get(sk)!
          const page = await getActivePage(context, input.targetId as string | undefined)
          const dir = join(tmpdir(), 'equality-screenshots')
          await mkdir(dir, { recursive: true })
          const filename = `screenshot-${Date.now()}.png`
          const filepath = join(dir, filename)
          await page.screenshot({
            path: filepath,
            fullPage: input.fullPage === 'true',
          })
          return { content: `截图已保存: ${filepath}` }
        }

        // ─── 控制台 ─────────────────────────────────────────────
        case 'console': {
          if (!isBrowserRunning(sk)) return { content: '浏览器未启动', isError: true }
          return { content: '提示：可使用 act kind=evaluate fn="JSON.stringify(performance.getEntriesByType(\'resource\').map(e=>e.name))" 获取页面资源信息，或用 evaluate 执行任意 JS。' }
        }

        // ─── 标签页管理 ─────────────────────────────────────────
        case 'tabs': {
          if (!isBrowserRunning(sk)) return { content: '浏览器未启动', isError: true }
          const context = _contexts.get(sk)!
          const pages = context.pages()
          const list = pages.map((p, i) => `[${i}] ${p.url()}`)
          return { content: list.length > 0 ? list.join('\n') : '(无标签页)' }
        }

        case 'open': {
          const url = input.url as string
          if (!url) return { content: '请提供 url 参数', isError: true }
          const { context } = await ensureContext(sk)
          const page = await context.newPage()
          await page.goto(url, { waitUntil: 'load', timeout: 30_000 })
          await page.waitForTimeout(800)
          const idx = context.pages().indexOf(page)
          return { content: `已打开新标签页 [${idx}]: ${page.url()}` }
        }

        case 'focus': {
          const targetId = input.targetId as string
          if (!targetId) return { content: '请提供 targetId 参数（标签页索引）', isError: true }
          if (!isBrowserRunning(sk)) return { content: '浏览器未启动', isError: true }
          const context = _contexts.get(sk)!
          const page = await getActivePage(context, targetId)
          await page.bringToFront()
          return { content: `已切换到标签页 [${targetId}]: ${page.url()}` }
        }

        case 'close': {
          if (!isBrowserRunning(sk)) return { content: '浏览器未启动', isError: true }
          const context = _contexts.get(sk)!
          const targetId = input.targetId as string | undefined
          const page = await getActivePage(context, targetId)
          const url = page.url()
          await page.close()
          return { content: `已关闭标签页: ${url}` }
        }

        default:
          return { content: `未知操作: ${action}。支持: status/start/stop/navigate/screenshot/snapshot/act/console/tabs/open/focus/close`, isError: true }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // 浏览器未找到的特殊提示
      if (msg.includes('未找到 Chrome') || msg.includes('Executable doesn\'t exist') || msg.includes('browserType.launch')) {
        return {
          content: `未找到可用浏览器。请确保已安装 Chrome 或 Edge，或设置环境变量:\n  $env:CHROME_PATH="C:\\path\\to\\chrome.exe"`,
          isError: true,
        }
      }
      return { content: `browser 操作失败: ${msg}`, isError: true }
    }
  },
}
