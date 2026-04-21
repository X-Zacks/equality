/**
 * tools/builtins/read-pdf.ts — PDF 文档读取工具
 *
 * 提取 PDF 文本内容。支持指定页码范围。
 * 对于纯扫描件（无文字层）PDF，提示用户用 read_image 工具。
 *
 * 使用 pdf-parse v2 库（基于 pdfjs-dist）。
 * v2 API: new PDFParse(Uint8Array) → load() → getText() → { pages: {text,num}[], text, total }
 */

import fs from 'node:fs'
import path from 'node:path'
import { guardPath } from './path-guard.js'
import type { ToolDefinition, ToolResult, ToolContext } from '../types.js'
import { truncateToolResult } from '../truncation.js'

const MAX_PDF_SIZE = 20 * 1024 * 1024  // 20MB
const MAX_PAGES = 20

/**
 * 解析页码范围字符串
 * 支持: "1-5", "1,3,5", "1-3,5,7-9"
 */
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

export const readPdfTool: ToolDefinition = {
  name: 'read_pdf',
  description: '读取本地 PDF 文件，提取文本内容。支持指定页码范围。最大 20MB，最多 20 页。',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'PDF 文件的路径（绝对路径或相对于工作目录的相对路径）',
      },
      pages: {
        type: 'string',
        description: '页码范围，如 "1-5" 或 "1,3,5" 或 "1-3,5,7-9"。默认读取全部页面',
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

    // 解析绝对路径 + 边界校验
    const guard = guardPath(filePath, ctx.workspaceDir)
    if ('error' in guard) return { content: guard.error, isError: true }
    const absPath = guard.absPath

    // 文件存在性
    if (!fs.existsSync(absPath)) {
      return { content: `Error: file not found: ${absPath}`, isError: true }
    }

    // 格式检查
    if (!absPath.toLowerCase().endsWith('.pdf')) {
      return { content: 'Error: file must be a .pdf file', isError: true }
    }

    // 大小检查
    const stat = fs.statSync(absPath)
    if (stat.size > MAX_PDF_SIZE) {
      return { content: `Error: file too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Maximum: 20MB`, isError: true }
    }

    // 动态导入 pdf-parse v2
    let PDFParse: any
    try {
      const mod = await (import('pdf-parse' as string) as Promise<any>)
      PDFParse = mod.PDFParse
      if (typeof PDFParse !== 'function') {
        throw new Error('PDFParse class not found in module')
      }
    } catch (e) {
      return {
        content: `Error: pdf-parse 库加载失败 — ${(e as Error).message}\n\n请在 packages/core 目录运行: pnpm add pdf-parse`,
        isError: true,
      }
    }

    // 读取和解析 PDF
    let parser: any
    try {
      const buffer = fs.readFileSync(absPath)
      const uint8 = new Uint8Array(buffer)  // pdf-parse v2 要求 Uint8Array

      parser = new PDFParse(uint8)
      await parser.load()

      // 获取页面信息
      const info = await parser.getInfo()
      const totalPages: number = info?.total ?? 1

      // 获取文本（按页分组）
      // v2 getText() 返回 { pages: {text: string, num: number}[], text: string, total: number }
      const textResult = await parser.getText()
      const rawPages: Array<{ text: string; num: number }> = textResult?.pages ?? []
      const pageTexts: string[] = rawPages.map((p: any) => (typeof p === 'string' ? p : p?.text ?? ''))
      const fullText: string = textResult?.text ?? ''

      // 检查是否为扫描件 → 自动降级到 read_pdf_vision
      if (fullText.trim().length < 50) {
        return {
          content: `[PDF: ${path.basename(absPath)} (${totalPages} 页, ${(stat.size / 1024).toFixed(0)}KB)]\n\n⚠️ 此 PDF 几乎没有可提取的文本（可能是扫描件或纯图片 PDF）。\n\n正在自动使用视觉识别……请调用 read_pdf_vision 工具并传入相同路径以识别内容。`,
        }
      }

      let resultText: string

      if (pagesStr) {
        // 指定页码范围
        const selectedPages = parsePageRange(pagesStr, totalPages)

        if (selectedPages.length === 0) {
          return { content: `Error: no valid pages in range "${pagesStr}". Total pages: ${totalPages}`, isError: true }
        }

        const parts: string[] = []
        for (const p of selectedPages) {
          const pageText = pageTexts[p - 1]?.trim() || '(空白页)'
          parts.push(`=== 第 ${p} 页 ===\n${pageText}`)
        }
        resultText = parts.join('\n\n')
      } else {
        // 全部页面
        if (pageTexts.length > MAX_PAGES) {
          const parts = pageTexts.slice(0, MAX_PAGES).map((text, i) =>
            `=== 第 ${i + 1} 页 ===\n${text.trim() || '(空白页)'}`
          )
          resultText = parts.join('\n\n') + `\n\n[⚠️ 已截断：仅显示前 ${MAX_PAGES} 页，共 ${totalPages} 页]`
        } else if (pageTexts.length > 1) {
          resultText = pageTexts.map((text, i) =>
            `=== 第 ${i + 1} 页 ===\n${text.trim() || '(空白页)'}`
          ).join('\n\n')
        } else {
          resultText = fullText
        }
      }

      // 信息头
      const header = `[PDF: ${path.basename(absPath)} | ${totalPages} 页 | ${(stat.size / 1024).toFixed(0)}KB | ${fullText.length.toLocaleString()} 字符]\n\n`

      // 截断保护
      const truncated = truncateToolResult(header + resultText)
      return { content: truncated.content }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { content: `Error parsing PDF: ${msg}`, isError: true }
    } finally {
      // 清理资源
      try { parser?.destroy() } catch { /* ignore */ }
    }
  },
}
