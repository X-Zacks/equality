/**
 * media/types.ts — 媒体理解 类型定义
 *
 * Phase M1 (GAP-30): 多媒体文件统一处理类型。
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type MediaType = 'image' | 'audio' | 'pdf'

export interface MediaInput {
  type: MediaType
  filePath: string
  mimeType: string
  sizeBytes: number
}

export interface MediaResult {
  type: MediaType
  content: string          // 转录文本 / 图片描述 / PDF 文本
  provider: string         // provider id
  processingMs: number
  cached?: boolean
  metadata?: Record<string, unknown>
}

export interface MediaProvider {
  readonly id: string
  readonly supportedTypes: MediaType[]
  readonly maxSizeBytes: Partial<Record<MediaType, number>>
  isAvailable(): boolean | Promise<boolean>
  process(input: MediaInput): Promise<MediaResult>
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const SUPPORTED_MEDIA_TYPES: readonly MediaType[] = ['image', 'audio', 'pdf'] as const

/**
 * 扩展名 → MediaType 映射
 */
export const EXTENSION_MAP: Record<string, MediaType> = {
  // image
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  bmp: 'image',
  // audio
  mp3: 'audio',
  wav: 'audio',
  m4a: 'audio',
  ogg: 'audio',
  flac: 'audio',
  webm: 'audio',
  // pdf
  pdf: 'pdf',
}

/**
 * 默认大小限制 (bytes)
 */
export const DEFAULT_SIZE_LIMITS: Record<MediaType, number> = {
  image: 10 * 1024 * 1024,   // 10MB
  audio: 25 * 1024 * 1024,   // 25MB
  pdf: 20 * 1024 * 1024,     // 20MB
}
