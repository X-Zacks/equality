/**
 * tools/builtins/web-fetch.ts — 网页抓取工具
 *
 * Node 22 原生 fetch + 企业代理 + HTML 提取纯文本。
 */

import type { ToolDefinition, ToolResult, ToolContext } from '../types.js'
import { ProxyAgent } from 'undici'
import * as cheerio from 'cheerio'

const DEFAULT_MAX_CHARS = 50_000
const FETCH_TIMEOUT_MS = 15_000
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

export const webFetchTool: ToolDefinition = {
  name: 'web_fetch',
  description: '抓取网页内容（HTTP GET），返回纯文本。HTML 自动提取正文，JSON/纯文本直接返回。支持企业代理。',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '目标 URL（http:// 或 https://）' },
      max_chars: { type: 'number', description: '最大返回字符数（默认 50000）', default: DEFAULT_MAX_CHARS },
    },
    required: ['url'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const url = String(input.url ?? '')
    if (!url.trim()) {
      return { content: 'Error: url is required', isError: true }
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return { content: 'Error: url must start with http:// or https://', isError: true }
    }

    const maxChars = Math.max(Number(input.max_chars) || DEFAULT_MAX_CHARS, 1000)
    const startMs = Date.now()

    try {
      // 构造 fetch 选项
      const fetchOpts: RequestInit = {
        method: 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
        signal: ctx.abortSignal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }

      // 企业代理：Node 22 原生 fetch 必须通过 undici ProxyAgent dispatcher 才能走代理
      if (ctx.proxyUrl) {
        (fetchOpts as Record<string, unknown>).dispatcher = new ProxyAgent({
          uri: ctx.proxyUrl,
          connect: { rejectUnauthorized: false },
        })
      }

      const resp = await fetch(url, fetchOpts)

      if (!resp.ok) {
        return {
          content: `HTTP ${resp.status} ${resp.statusText}`,
          isError: true,
          metadata: { durationMs: Date.now() - startMs },
        }
      }

      const contentType = resp.headers.get('content-type') ?? ''
      const raw = await resp.text()
      const durationMs = Date.now() - startMs

      let text: string

      if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
        // HTML → 提取纯文本
        text = extractTextFromHtml(raw)
      } else if (contentType.includes('application/json')) {
        // JSON → 格式化显示
        try {
          text = JSON.stringify(JSON.parse(raw), null, 2)
        } catch {
          text = raw
        }
      } else {
        // 纯文本 / 其他
        text = raw
      }

      // 截断
      if (text.length > maxChars) {
        text = text.slice(0, maxChars) + `\n\n[...内容已截断，原始 ${text.length} 字符，显示前 ${maxChars} 字符]`
      }

      return {
        content: `URL: ${url}\nContent-Type: ${contentType}\n\n${text}`,
        metadata: { durationMs },
      }
    } catch (err) {
      const msg = (err as Error).message
      // 超时友好提示
      if (msg.includes('abort') || msg.includes('timeout') || msg.includes('TimeoutError')) {
        return {
          content: `Error: 请求超时（${FETCH_TIMEOUT_MS / 1000}s）: ${url}`,
          isError: true,
          metadata: { durationMs: Date.now() - startMs },
        }
      }
      return {
        content: `Error fetching ${url}: ${msg}`,
        isError: true,
        metadata: { durationMs: Date.now() - startMs },
      }
    }
  },
}

// ─── HTML 提取 ────────────────────────────────────────────────────────────────

/** 从 HTML 中提取正文纯文本（去标签、去脚本/样式） */
function extractTextFromHtml(html: string): string {
  const $ = cheerio.load(html)

  // 移除不需要的元素
  $('script, style, nav, footer, header, noscript, iframe, svg').remove()

  // 提取正文：优先 <main> / <article>，否则 <body>
  let root = $('main').length ? $('main') : $('article').length ? $('article') : $('body')
  let text = root.text()

  // 清理：合并空行、trim
  text = text
    .replace(/[ \t]+/g, ' ')          // 合并空格
    .replace(/\n{3,}/g, '\n\n')       // 合并多个换行
    .trim()

  return text
}
