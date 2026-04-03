/**
 * context/identifier-shield.ts — 标识符保护（Phase D.3）
 *
 * 在 Compaction 过程中保护关键标识符（UUID、文件路径、URL、Git hash）
 * 不被 LLM 缩写或改写。
 *
 * 策略：
 * 1. 预提取：从压缩区消息中提取所有关键标识符
 * 2. 注入：在摘要 prompt 中列出需保留的标识符
 * 3. 验证：摘要后检查缺失的标识符，追加到摘要末尾
 */

// ─── 标识符提取 ──────────────────────────────────────────────────────────────

/** 匹配模式 */
const IDENTIFIER_PATTERNS: RegExp[] = [
  // UUID v4（最常见）
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
  // URL（http/https/ftp）
  /(?:https?:\/\/|ftp:\/\/)[^\s"'<>)\]]+/gi,
  // Windows 文件路径（C:\path\to\file.ext）
  /[A-Za-z]:\\(?:[^\s"'<>|:*?\\]+\\)*[^\s"'<>|:*?\\]+\.\w+/g,
  // Unix 文件路径（/path/to/file.ext 或 ./relative/path.ext）
  /(?:\.{0,2}\/)[^\s"'<>|:*?]+\.\w+/g,
  // Git commit hash（7-40 位十六进制，前后非字母数字——\b 在 CJK 字符旁不工作）
  /(?<![0-9a-zA-Z])[0-9a-f]{7,40}(?![0-9a-zA-Z])/gi,
]

/** 容易误匹配的短 hex 字符串过滤（避免把普通英文单词当成 hash） */
const COMMON_HEX_WORDS = new Set([
  'abcdef', 'abcdefg', 'deadbeef', 'default', 'deleted', 'enabled',
  'created', 'changed', 'checked', 'defined', 'decoded',
])

/**
 * 从文本中提取所有关键标识符
 *
 * @param text - 要扫描的文本
 * @returns 去重后的标识符列表
 */
export function extractIdentifiers(text: string): string[] {
  const result = new Set<string>()

  for (const pattern of IDENTIFIER_PATTERNS) {
    // 重置 lastIndex（全局正则需要）
    pattern.lastIndex = 0
    for (const match of text.matchAll(pattern)) {
      const id = match[0]

      // 过滤极短 hex（< 7 位——7 位是 Git short hash 最小长度）
      if (/^[0-9a-f]+$/i.test(id) && id.length < 7) continue
      // 过滤常见英文单词
      if (COMMON_HEX_WORDS.has(id.toLowerCase())) continue
      // 过滤纯数字（不是有效标识符）
      if (/^\d+$/.test(id)) continue

      result.add(id)
    }
  }

  return [...result]
}

// ─── 标识符验证 ──────────────────────────────────────────────────────────────

/**
 * 验证摘要中是否保留了关键标识符
 *
 * @param summary - LLM 生成的摘要
 * @param expected - 预期应保留的标识符
 * @returns 摘要中缺失的标识符列表
 */
export function validateIdentifiers(summary: string, expected: string[]): string[] {
  return expected.filter(id => !summary.includes(id))
}

// ─── Prompt 注入 ─────────────────────────────────────────────────────────────

/**
 * 生成标识符保护指令，注入到摘要 prompt 中
 *
 * @param identifiers - 需要保留的标识符列表
 * @returns prompt 片段；如果无标识符则返回空字符串
 */
export function buildProtectionPrompt(identifiers: string[]): string {
  if (identifiers.length === 0) return ''

  // 限制数量，避免 prompt 过长
  const limited = identifiers.slice(0, 50)
  const lines = limited.map(id => `  - ${id}`)

  return `\n⚠️ 以下标识符 MUST 原样保留（不可缩写、改写或省略）：\n${lines.join('\n')}\n`
}
