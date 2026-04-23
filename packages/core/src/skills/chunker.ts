/**
 * skills/chunker.ts — Skill Markdown 分块器
 *
 * 按 markdown 标题（# / ## / ###）将 Skill body 分割为语义块，
 * 用于 RAG embedding 索引。
 */

export interface SkillChunk {
  skillName: string
  chunkId: string
  heading: string
  content: string
}

const HEADING_RE = /^(#{1,3})\s+(.+)$/
const MAX_CHUNK_SIZE = 2000

/**
 * 将单个 Skill 拆分为 chunk 列表。
 *
 * 规则：
 *  1. description 单独作为一个 chunk（metadata chunk）
 *  2. body 按 # / ## / ### 标题分割
 *  3. 无标题的 body → 整体为 1 chunk
 *  4. 单个 chunk > 2000 字符 → 按空行二次分割
 */
export function chunkSkill(
  skillName: string,
  description: string,
  body: string
): SkillChunk[] {
  const chunks: SkillChunk[] = []

  // 1. description chunk
  if (description.trim()) {
    chunks.push({
      skillName,
      chunkId: `${skillName}#description`,
      heading: 'description',
      content: description.trim(),
    })
  }

  // 2. body 按标题分割
  if (!body.trim()) return chunks

  const lines = body.split('\n')
  const sections: { heading: string; slug: string; lines: string[] }[] = []
  let current: { heading: string; slug: string; lines: string[] } | null = null

  for (const line of lines) {
    const match = line.match(HEADING_RE)
    if (match) {
      if (current) sections.push(current)
      const headingText = match[2].trim()
      const slug = headingText
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fff]+/g, '-')
        .replace(/^-|-$/g, '')
      current = { heading: headingText, slug, lines: [] }
    } else {
      if (!current) {
        current = { heading: 'body', slug: 'body', lines: [] }
      }
      current.lines.push(line)
    }
  }
  if (current) sections.push(current)

  // 3. 生成 chunks
  for (const section of sections) {
    const content = section.lines.join('\n').trim()
    if (!content) continue

    if (content.length <= MAX_CHUNK_SIZE) {
      chunks.push({
        skillName,
        chunkId: `${skillName}#${section.slug}`,
        heading: section.heading,
        content,
      })
    } else {
      // 4. 大块按空行二次分割
      const subChunks = splitByParagraphs(content, MAX_CHUNK_SIZE)
      subChunks.forEach((sub, i) => {
        chunks.push({
          skillName,
          chunkId: `${skillName}#${section.slug}-${i}`,
          heading: section.heading,
          content: sub,
        })
      })
    }
  }

  return chunks
}

/**
 * 按空行分割文本，合并相邻段落使每块不超过 maxSize。
 */
function splitByParagraphs(text: string, maxSize: number): string[] {
  const paragraphs = text.split(/\n\s*\n/)
  const result: string[] = []
  let current = ''

  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed) continue
    if (current && current.length + trimmed.length + 2 > maxSize) {
      result.push(current)
      current = trimmed
    } else {
      current = current ? current + '\n\n' + trimmed : trimmed
    }
  }
  if (current) result.push(current)

  return result
}
