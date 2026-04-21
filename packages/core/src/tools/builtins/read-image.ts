/**
 * tools/builtins/read-image.ts — 图片读取与视觉分析工具
 *
 * 读取本地图片文件，用视觉模型（如 gpt-4o）分析内容。
 * 支持 OCR、截图理解、图表解读等场景。
 */

import fs from 'node:fs'
import path from 'node:path'
import { guardPath } from './path-guard.js'
import type { ToolDefinition, ToolResult, ToolContext } from '../types.js'
import { getVisionProvider } from '../../providers/index.js'

const MAX_IMAGE_SIZE = 10 * 1024 * 1024  // 10MB

const SUPPORTED_FORMATS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp',
])

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
}

export const readImageTool: ToolDefinition = {
  name: 'read_image',
  description: '读取图片并用视觉模型分析。支持本地文件路径和 URL。可用于 OCR 识别文字、理解截图、解读图表等。支持 png/jpg/gif/webp/bmp 格式，最大 10MB。',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '图片文件路径（绝对或相对于工作目录）或图片 URL（http/https）',
      },
      prompt: {
        type: 'string',
        description: '分析提示词，如"描述这张图片"、"提取图中的文字"、"这个图表说了什么"。默认：描述这张图片的内容',
      },
    },
    required: ['path'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const filePath = String(input.path ?? '')
    const prompt = String(input.prompt ?? '描述这张图片的内容。如果包含文字请提取出来。')

    if (!filePath.trim()) {
      return { content: 'Error: path is required', isError: true }
    }

    // ─── URL 模式 ──────────────────────────────────────────────────────
    const isUrl = /^https?:\/\//i.test(filePath)
    let dataUrl: string
    let label: string

    if (isUrl) {
      // SSRF 防护：禁止内网地址
      const urlObj = new URL(filePath)
      const host = urlObj.hostname.toLowerCase()
      if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.startsWith('10.') || host.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
        return { content: 'Error: internal/private URLs are not allowed (SSRF protection)', isError: true }
      }

      try {
        const resp = await fetch(filePath, { signal: ctx.abortSignal })
        if (!resp.ok) return { content: `Error: failed to fetch URL: ${resp.status}`, isError: true }
        const contentType = resp.headers.get('content-type') ?? 'image/png'
        if (!contentType.startsWith('image/')) {
          return { content: `Error: URL content-type is "${contentType}", not an image`, isError: true }
        }
        const buf = Buffer.from(await resp.arrayBuffer())
        if (buf.length > MAX_IMAGE_SIZE) {
          return { content: `Error: image too large (${(buf.length / 1024 / 1024).toFixed(1)}MB). Max: 10MB`, isError: true }
        }
        dataUrl = `data:${contentType};base64,${buf.toString('base64')}`
        label = `[Image: ${filePath.split('/').pop()?.split('?')[0] ?? 'url'} (${(buf.length / 1024).toFixed(0)}KB)]`
      } catch (err) {
        return { content: `Error fetching image URL: ${err instanceof Error ? err.message : err}`, isError: true }
      }
    } else {
      // ─── 本地文件模式 ──────────────────────────────────────────────────

    // 解析绝对路径 + 边界校验
    const guard = guardPath(filePath, ctx.workspaceDir)
    if ('error' in guard) return { content: guard.error, isError: true }
    const absPath = guard.absPath

    // 文件存在性
    if (!fs.existsSync(absPath)) {
      return { content: `Error: file not found: ${absPath}`, isError: true }
    }

    // 格式检查
    const ext = path.extname(absPath).toLowerCase()
    if (!SUPPORTED_FORMATS.has(ext)) {
      return { content: `Error: unsupported format "${ext}". Supported: ${[...SUPPORTED_FORMATS].join(', ')}`, isError: true }
    }

    // 大小检查
    const stat = fs.statSync(absPath)
    if (stat.size > MAX_IMAGE_SIZE) {
      return { content: `Error: file too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Maximum: 10MB`, isError: true }
    }

    // 读取为 base64
    const buffer = fs.readFileSync(absPath)
    const base64 = buffer.toString('base64')
    const mime = MIME_MAP[ext] ?? 'image/png'
    dataUrl = `data:${mime};base64,${base64}`
    label = `[Image: ${path.basename(absPath)} (${(stat.size / 1024).toFixed(0)}KB)]`
    } // end local file block

    // Provider 检查：自动选择支持视觉的 provider
    let visionProvider
    try {
      visionProvider = getVisionProvider(ctx.provider)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { content: `Error: ${msg}`, isError: true }
    }

    // 调用视觉模型
    try {
      const result = await visionProvider.chat({
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: dataUrl, detail: 'auto' },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
      })

      const header = `${label}\n\n`
      return { content: header + result.content }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // 如果当前模型不支持 vision，给出有用的提示
      if (msg.includes('image') || msg.includes('vision') || msg.includes('multimodal')) {
        return { content: `Error: current model may not support vision. ${msg}`, isError: true }
      }
      return { content: `Error analyzing image: ${msg}`, isError: true }
    }
  },
}
