/**
 * links/detect.ts — URL 自动提取
 *
 * Phase K3 (GAP-28): 从用户消息中提取 URL。
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ExtractedLink {
  url: string
  source: 'user-message' | 'tool-result'
  index: number
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** 每条消息最多提取的 URL 数 */
export const MAX_LINKS_PER_MESSAGE = 3

// URL 正则（匹配 http:// 和 https://）
const URL_RE = /https?:\/\/[^\s)<>\]"'`]+/gi

// Markdown 图片语法：![alt](url)
const MD_IMAGE_RE = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/gi

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * 从文本中提取 URL。
 *
 * - 去重
 * - 排除 markdown 图片中的 URL
 * - 最多返回 MAX_LINKS_PER_MESSAGE 个
 */
export function detectLinks(
  text: string,
  source: 'user-message' | 'tool-result' = 'user-message',
): ExtractedLink[] {
  if (!text) return []

  // 1. 收集 markdown 图片 URL（需排除）
  const imageUrls = new Set<string>()
  let imgMatch: RegExpExecArray | null
  const imgRe = new RegExp(MD_IMAGE_RE.source, 'gi')
  while ((imgMatch = imgRe.exec(text)) !== null) {
    imageUrls.add(imgMatch[1])
  }

  // 2. 提取所有 URL
  const allUrls: string[] = []
  let urlMatch: RegExpExecArray | null
  const urlRe = new RegExp(URL_RE.source, 'gi')
  while ((urlMatch = urlRe.exec(text)) !== null) {
    // 清理尾部标点
    let url = urlMatch[0].replace(/[.,;:!?））]+$/, '')
    // 排除 markdown 图片 URL
    if (!imageUrls.has(url)) {
      allUrls.push(url)
    }
  }

  // 3. 去重
  const seen = new Set<string>()
  const unique: string[] = []
  for (const url of allUrls) {
    if (!seen.has(url)) {
      seen.add(url)
      unique.push(url)
    }
  }

  // 4. 截断到上限
  return unique.slice(0, MAX_LINKS_PER_MESSAGE).map((url, index) => ({
    url,
    source,
    index,
  }))
}
