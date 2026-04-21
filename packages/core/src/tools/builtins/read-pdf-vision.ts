/**
 * tools/builtins/read-pdf-vision.ts — PDF 视觉识别工具
 *
 * 将 PDF 逐页渲染为图片，调用视觉 LLM 识别文字和表格。
 * 适用于扫描件、纯图片 PDF 等无文字层的文档。
 *
 * 渲染使用 pdf-parse v2 内置的 getScreenshot()（自带 canvas factory）。
 * 视觉模型优先用 Copilot GPT-4o，否则降级到用户当前模型。
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import os from 'node:os'
import type { ToolDefinition, ToolResult, ToolContext } from '../types.js'
import { getVisionProvider } from '../../providers/index.js'

const MAX_PDF_SIZE = 20 * 1024 * 1024  // 20MB
const MAX_PAGES = 10  // 视觉识别成本高，限制页数
const RENDER_SCALE = 2.0  // ~200 DPI

const VISION_PROMPT = '请识别图片中的所有文字和表格，表格用 Markdown 格式输出。保持原文内容和结构，不要添加解释。'

// ─── 缓存 ──────────────────────────────────────────────────────────────────────

interface PageCache {
  filePath: string
  fileMtime: number
  fileSize: number
  totalPages: number
  pages: Record<string, string>  // pageNum → recognized text
}

function getCacheKey(absPath: string, mtime: number, size: number): string {
  const hash = crypto.createHash('sha256').update(`${absPath}|${mtime}|${size}`).digest('hex')
  return hash.slice(0, 16)
}

function getCachePath(cacheKey: string): string {
  return path.join(os.tmpdir(), `.equality-pdf-cache-${cacheKey}.json`)
}

function loadCache(cachePath: string): PageCache | null {
  try {
    if (fs.existsSync(cachePath)) {
      return JSON.parse(fs.readFileSync(cachePath, 'utf-8'))
    }
  } catch { /* corrupt cache, ignore */ }
  return null
}

function saveCache(cachePath: string, cache: PageCache): void {
  try {
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf-8')
  } catch { /* best effort */ }
}

// ─── 页码解析 ──────────────────────────────────────────────────────────────────

function parsePageRange(rangeStr: string, totalPages: number): number[] {
  const pages = new Set<number>()
  const parts = rangeStr.split(',').map(s => s.trim())
  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-')
      const start = Math.max(1, parseInt(startStr, 10) || 1)
      const end = Math.min(totalPages, parseInt(endStr, 10) || totalPages)
      for (let i = start; i <= end; i++) pages.add(i)
    } else {
      const p = parseInt(part, 10)
      if (p >= 1 && p <= totalPages) pages.add(p)
    }
  }
  return [...pages].sort((a, b) => a - b)
}

// ─── Tool Definition ──────────────────────────────────────────────────────────

export const readPdfVisionTool: ToolDefinition = {
  name: 'read_pdf_vision',
  description: '将 PDF 逐页渲染为图片并用视觉模型识别文字和表格。适用于扫描件或纯图片 PDF。支持断点续传（缓存已识别页面）。最大 20MB，最多 10 页。',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'PDF 文件路径（绝对路径或相对于工作目录）',
      },
      pages: {
        type: 'string',
        description: '页码范围，如 "1-5" 或 "1,3,5"。默认读取全部页面（最多 10 页）',
      },
    },
    required: ['path'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const filePath = String(input.path ?? '')
    const pagesStr = input.pages ? String(input.pages) : ''

    if (!filePath.trim()) {
      return { content: 'Error: path is required', isError: true }
    }

    const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(ctx.workspaceDir, filePath)

    if (absPath.includes('..')) {
      return { content: 'Error: path must not contain ".."', isError: true }
    }
    if (!fs.existsSync(absPath)) {
      return { content: `Error: file not found: ${absPath}`, isError: true }
    }
    if (!absPath.toLowerCase().endsWith('.pdf')) {
      return { content: 'Error: file must be a .pdf file', isError: true }
    }

    const stat = fs.statSync(absPath)
    if (stat.size > MAX_PDF_SIZE) {
      return { content: `Error: file too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Maximum: 20MB`, isError: true }
    }

    // 获取视觉 provider
    let visionProvider
    try {
      visionProvider = getVisionProvider(ctx.provider)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { content: `Error: 无法获取视觉模型 — ${msg}`, isError: true }
    }

    // 加载 pdf-parse
    let PDFParse: any
    try {
      const mod = await (import('pdf-parse' as string) as Promise<any>)
      PDFParse = mod.PDFParse
      if (typeof PDFParse !== 'function') throw new Error('PDFParse class not found')
    } catch (e) {
      return { content: `Error: pdf-parse 库加载失败 — ${(e as Error).message}`, isError: true }
    }

    // 解析 PDF 并获取截图
    let screenshots: any
    let totalPages: number
    try {
      const buffer = fs.readFileSync(absPath)
      const parser = new PDFParse(new Uint8Array(buffer))
      await parser.load()

      const info = await parser.getInfo()
      totalPages = info?.total ?? 1

      // 确定要处理的页面
      let targetPages: number[]
      if (pagesStr) {
        targetPages = parsePageRange(pagesStr, totalPages)
      } else {
        targetPages = Array.from({ length: Math.min(totalPages, MAX_PAGES) }, (_, i) => i + 1)
      }

      if (targetPages.length > MAX_PAGES) {
        targetPages = targetPages.slice(0, MAX_PAGES)
      }

      // 使用 pdf-parse v2 内置 getScreenshot 渲染
      screenshots = await parser.getScreenshot({
        scale: RENDER_SCALE,
        imageDataUrl: true,
        partial: targetPages,
      })

      parser.destroy?.()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { content: `Error: PDF 渲染失败 — ${msg}`, isError: true }
    }

    // 缓存机制
    const cacheKey = getCacheKey(absPath, stat.mtimeMs, stat.size)
    const cachePath = getCachePath(cacheKey)
    const cache: PageCache = loadCache(cachePath) ?? {
      filePath: absPath,
      fileMtime: stat.mtimeMs,
      fileSize: stat.size,
      totalPages,
      pages: {},
    }

    // 逐页调用视觉 LLM
    const results: Array<{ pageNum: number; text: string; fromCache: boolean }> = []
    const pages = screenshots?.pages ?? []

    for (const page of pages) {
      const pageNum = page.pageNumber ?? page.num ?? 0

      // 检查缓存
      if (cache.pages[String(pageNum)]) {
        results.push({ pageNum, text: cache.pages[String(pageNum)], fromCache: true })
        continue
      }

      // 获取 data URL
      const dataUrl = page.dataUrl
      if (!dataUrl) {
        results.push({ pageNum, text: '(渲染失败：无图片数据)', fromCache: false })
        continue
      }

      // 调用视觉模型（带 1 次重试）
      let recognized = ''
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          if (ctx.abortSignal?.aborted) {
            // 保存已完成部分
            saveCache(cachePath, cache)
            return { content: formatResults(absPath, totalPages, stat.size, results, true), isError: false }
          }

          const resp = await visionProvider.chat({
            messages: [{
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
                { type: 'text', text: VISION_PROMPT },
              ],
            }],
          })
          recognized = resp.content
          break
        } catch (err) {
          if (attempt === 1) {
            recognized = `(识别失败: ${err instanceof Error ? err.message : String(err)})`
          }
          // 第一次失败，等 1 秒后重试
          await new Promise(r => setTimeout(r, 1000))
        }
      }

      results.push({ pageNum, text: recognized, fromCache: false })

      // 每页完成后立即写入缓存
      cache.pages[String(pageNum)] = recognized
      saveCache(cachePath, cache)
    }

    // 所有页面完成，删除缓存文件
    const allSuccess = results.every(r => !r.text.startsWith('(识别失败') && !r.text.startsWith('(渲染失败'))
    if (allSuccess) {
      try { fs.unlinkSync(cachePath) } catch { /* ignore */ }
    }

    return { content: formatResults(absPath, totalPages, stat.size, results, false) }
  },
}

// ─── 格式化输出 ────────────────────────────────────────────────────────────────

function formatResults(
  absPath: string,
  totalPages: number,
  fileSize: number,
  results: Array<{ pageNum: number; text: string; fromCache: boolean }>,
  aborted: boolean,
): string {
  const header = `[PDF Vision: ${path.basename(absPath)} | ${totalPages} 页 | ${(fileSize / 1024).toFixed(0)}KB | 识别 ${results.length} 页]\n`

  const body = results.map(r => {
    const tag = r.fromCache ? ' (缓存)' : ''
    return `\n=== 第 ${r.pageNum} 页${tag} ===\n${r.text}`
  }).join('\n')

  const footer = aborted ? '\n\n[⚠️ 已中断，部分结果已缓存，重新调用可断点续传]' : ''

  return header + body + footer
}
