/**
 * tools/builtins/image-generate.ts — AI 图片生成工具
 *
 * Phase Y3.1: 使用 MiniMax image-01 模型进行文生图
 * API: https://platform.minimaxi.com/docs/guides/image-generation
 */

import fs from 'node:fs'
import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import type { ToolDefinition, ToolResult, ToolContext } from '../types.js'
import { hasSecret, getSecret } from '../../config/secrets.js'

const MINIMAX_API_URL = 'https://api.minimaxi.com/v1/image_generation'
const VALID_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4'] as const

export const imageGenerateTool: ToolDefinition = {
  name: 'image_generate',
  description:
    'Generate images from text descriptions (AI text-to-image). Uses MiniMax image-01 model. ' +
    'Requires MINIMAX_API_KEY in settings. ' +
    'Supported aspect ratios: 1:1 (default), 16:9, 9:16, 4:3, 3:4. ' +
    'Generated images are saved to the generated-images/ folder in workspace.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'Image description (English works best). Example: "A serene mountain landscape with cherry blossoms at sunset"',
      },
      aspect_ratio: {
        type: 'string',
        enum: VALID_RATIOS as unknown as string[],
        description: 'Aspect ratio, default 1:1. Options: 1:1, 16:9, 9:16, 4:3, 3:4',
      },
      save_to: {
        type: 'string',
        description: 'Optional: custom save path (relative to workspace). Auto-generates filename by default.',
      },
    },
    required: ['prompt'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const prompt = String(input.prompt ?? '').trim()
    if (!prompt) {
      return { content: 'Error: prompt is required', isError: true }
    }

    // 检查 API Key
    if (!hasSecret('MINIMAX_API_KEY')) {
      return {
        content: 'Error: 未配置 MINIMAX_API_KEY。请在「设置 → 模型」中配置 MiniMax API Key。',
        isError: true,
      }
    }
    const apiKey = getSecret('MINIMAX_API_KEY')

    // 验证宽高比
    const aspectRatio = String(input.aspect_ratio ?? '1:1')
    if (!VALID_RATIOS.includes(aspectRatio as typeof VALID_RATIOS[number])) {
      return { content: `Error: invalid aspect_ratio "${aspectRatio}". Valid: ${VALID_RATIOS.join(', ')}`, isError: true }
    }

    // 准备保存路径
    const saveDir = path.join(ctx.workspaceDir, 'generated-images')
    await mkdir(saveDir, { recursive: true })

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const defaultFilename = `img-${timestamp}.jpeg`
    const savePath = input.save_to
      ? path.resolve(ctx.workspaceDir, String(input.save_to))
      : path.join(saveDir, defaultFilename)

    // 确保保存目录存在
    await mkdir(path.dirname(savePath), { recursive: true })

    // 构建代理
    let fetchOptions: RequestInit & { agent?: unknown } = {}
    if (ctx.proxyUrl) {
      try {
        const { HttpsProxyAgent } = await import('https-proxy-agent')
        fetchOptions = { agent: new HttpsProxyAgent(ctx.proxyUrl) } as any
      } catch {
        // 无代理支持，直连
      }
    }

    // 调用 MiniMax API
    try {
      const response = await fetch(MINIMAX_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'image-01',
          prompt,
          aspect_ratio: aspectRatio,
          response_format: 'base64',
        }),
        ...fetchOptions,
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown')
        return {
          content: `Error: MiniMax API returned ${response.status}: ${errorText}`,
          isError: true,
        }
      }

      const data = await response.json() as {
        data?: { image_base64?: string[] }
        base_resp?: { status_code?: number; status_msg?: string }
      }

      // 检查错误响应
      if (data.base_resp?.status_code && data.base_resp.status_code !== 0) {
        return {
          content: `Error: MiniMax API error: ${data.base_resp.status_msg ?? 'unknown'}`,
          isError: true,
        }
      }

      const images = data.data?.image_base64
      if (!images || images.length === 0) {
        return { content: 'Error: MiniMax API returned no images', isError: true }
      }

      // 解码 base64 并保存
      const buffer = Buffer.from(images[0], 'base64')
      fs.writeFileSync(savePath, buffer)

      const sizeKB = (buffer.length / 1024).toFixed(0)
      const relPath = path.relative(ctx.workspaceDir, savePath)

      return {
        content: `✅ 图片已生成并保存\n\n` +
          `- **文件**: ${relPath}\n` +
          `- **大小**: ${sizeKB} KB\n` +
          `- **宽高比**: ${aspectRatio}\n` +
          `- **Prompt**: ${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}\n` +
          `- **绝对路径**: ${savePath}`,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { content: `Error generating image: ${msg}`, isError: true }
    }
  },
}
