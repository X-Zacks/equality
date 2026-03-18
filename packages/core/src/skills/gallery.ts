/**
 * skills/gallery.ts — 安全的 Skill 安装（可信仓库白名单）
 *
 * 设计原则：
 * 1. 只从白名单仓库下载 — 拒绝任意 URL
 * 2. 下载后扫描危险内容 — 检测已知 prompt injection 模式
 * 3. 安装到 managed 目录 — %APPDATA%/Equality/skills/
 * 4. 用户需确认后才能激活
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// ─── 可信仓库白名单 ──────────────────────────────────────────────────────────

export interface TrustedRepo {
  /** 唯一 ID */
  id: string
  /** 显示名称 */
  name: string
  /** 描述 */
  description: string
  /** GitHub owner/repo */
  repo: string
  /** Skills 所在的目录路径（仓库内路径） */
  skillsPath: string
  /** 默认分支 */
  branch: string
  /** 信任等级 */
  trust: 'official' | 'verified' | 'community'
}

/**
 * 白名单仓库列表
 *
 * 只有在这个列表中的仓库才允许下载 Skills。
 * 新增仓库需要经过安全审计。
 */
export const TRUSTED_REPOS: TrustedRepo[] = [
  {
    id: 'anthropic-claude',
    name: 'Anthropic Claude Skills',
    description: 'Claude 官方推荐的 Skills 集合',
    repo: 'anthropics/claude-code',
    skillsPath: 'skills',
    branch: 'main',
    trust: 'official',
  },
  {
    id: 'equality-community',
    name: 'Equality 社区 Skills',
    description: 'Equality 社区维护的 Skills',
    repo: 'anthropics/claude-code',
    skillsPath: 'skills',
    branch: 'main',
    trust: 'official',
  },
]

// ─── Gallery 条目（可安装的 Skill） ──────────────────────────────────────────

export interface GallerySkill {
  /** Skill 名称 */
  name: string
  /** 描述 */
  description: string
  /** 来自哪个仓库 */
  repoId: string
  /** 仓库内的文件路径 */
  remotePath: string
  /** 下载 URL */
  downloadUrl: string
  /** 信任等级 */
  trust: TrustedRepo['trust']
  /** 是否已安装 */
  installed: boolean
}

// ─── 安全扫描 ─────────────────────────────────────────────────────────────────

/**
 * 已知的危险模式 — 用于检测 prompt injection
 *
 * 这些模式不应出现在合法的 Skill 中
 */
const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  // 试图覆盖系统指令
  { pattern: /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i, reason: '尝试覆盖系统指令' },
  { pattern: /forget\s+(all\s+)?(previous|prior|above)\s+(instructions?|context)/i, reason: '尝试清除上下文' },
  { pattern: /you\s+are\s+now\s+(a\s+)?different/i, reason: '角色劫持' },
  { pattern: /new\s+system\s+prompt/i, reason: '伪造系统提示' },
  { pattern: /\[SYSTEM\]/i, reason: '伪造系统消息标记' },

  // 试图窃取数据
  { pattern: /cat\s+~\/\.(ssh|aws|gnupg|env)/i, reason: '读取敏感文件 (SSH/AWS/GPG)' },
  { pattern: /\$HOME\/\.(ssh|aws|config)/i, reason: '引用敏感目录' },
  { pattern: /GITHUB_TOKEN|OPENAI_API_KEY|AWS_SECRET/i, reason: '引用敏感环境变量' },
  { pattern: /curl\s+.*\|\s*(sh|bash)/i, reason: '下载并执行脚本' },
  { pattern: /eval\s*\(/i, reason: '使用 eval' },
  { pattern: /base64\s+(-d|--decode)/i, reason: '解码隐藏内容' },

  // 试图外传数据
  { pattern: /curl\s+(-X\s+POST|-d\s+).*\.(ru|cn\.cc|tk|ml)\b/i, reason: '向可疑域名发送数据' },
  { pattern: /webhook\.site|requestbin|pipedream/i, reason: '使用数据收集服务' },
  { pattern: /nc\s+-e|ncat\s+-e|reverse.?shell/i, reason: '反向 Shell' },

  // 隐形指令
  { pattern: /\u200B|\u200C|\u200D|\uFEFF/g, reason: '包含零宽字符（可能隐藏指令）' },
  { pattern: /<!--[\s\S]*?(exec|curl|wget|fetch|eval)[\s\S]*?-->/i, reason: 'HTML 注释中隐藏可执行内容' },
]

export interface ScanResult {
  safe: boolean
  warnings: Array<{ pattern: string; reason: string; line: number }>
}

/**
 * 扫描 Skill 内容是否包含危险模式
 */
export function scanSkillContent(content: string): ScanResult {
  const warnings: ScanResult['warnings'] = []
  const lines = content.split('\n')

  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        warnings.push({
          pattern: pattern.source.slice(0, 50),
          reason,
          line: i + 1,
        })
      }
    }
  }

  return {
    safe: warnings.length === 0,
    warnings,
  }
}

// ─── 安装目录 ─────────────────────────────────────────────────────────────────

function getManagedSkillsDir(): string {
  const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming')
  return path.join(appData, 'Equality', 'skills')
}

// ─── Gallery API ──────────────────────────────────────────────────────────────

/**
 * 从可信仓库获取可安装的 Skills 列表
 */
export async function fetchGallery(proxyUrl?: string): Promise<GallerySkill[]> {
  const managedDir = getManagedSkillsDir()
  const installedNames = new Set<string>()

  // 检查已安装的 Skills
  if (fs.existsSync(managedDir)) {
    for (const item of fs.readdirSync(managedDir, { withFileTypes: true })) {
      if (item.isDirectory()) {
        const skillMd = path.join(managedDir, item.name, 'SKILL.md')
        if (fs.existsSync(skillMd)) installedNames.add(item.name)
      }
    }
  }

  const gallery: GallerySkill[] = []

  for (const repo of TRUSTED_REPOS) {
    try {
      const skills = await fetchRepoSkills(repo, proxyUrl)
      for (const skill of skills) {
        gallery.push({
          ...skill,
          installed: installedNames.has(skill.name),
        })
      }
    } catch (err) {
      console.warn(`[gallery] 获取仓库 ${repo.id} 失败:`, err)
    }
  }

  return gallery
}

/**
 * 从 GitHub 仓库目录列出 Skills
 */
async function fetchRepoSkills(repo: TrustedRepo, proxyUrl?: string): Promise<Omit<GallerySkill, 'installed'>[]> {
  // GitHub API: 列出目录内容
  const apiUrl = `https://api.github.com/repos/${repo.repo}/contents/${repo.skillsPath}?ref=${repo.branch}`

  const fetchOptions: RequestInit = {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Equality-Desktop/0.2.1',
    },
  }

  // 代理支持
  if (proxyUrl) {
    try {
      const { ProxyAgent } = await import('undici')
      const agent = new ProxyAgent(proxyUrl)
      ;(fetchOptions as Record<string, unknown>).dispatcher = agent
    } catch { /* 无代理则直连 */ }
  }

  const resp = await fetch(apiUrl, fetchOptions)
  if (!resp.ok) {
    throw new Error(`GitHub API error: ${resp.status} ${resp.statusText}`)
  }

  const items = await resp.json() as Array<{ name: string; type: string; path: string }>
  const skills: Omit<GallerySkill, 'installed'>[] = []

  for (const item of items) {
    if (item.type !== 'dir') continue

    // 检查子目录是否含 SKILL.md
    const skillMdUrl = `https://api.github.com/repos/${repo.repo}/contents/${item.path}/SKILL.md?ref=${repo.branch}`
    try {
      const mdResp = await fetch(skillMdUrl, fetchOptions)
      if (!mdResp.ok) continue

      const mdData = await mdResp.json() as { download_url: string; content?: string }
      let description = item.name

      // 尝试从 content 解析描述
      if (mdData.content) {
        try {
          const decoded = Buffer.from(mdData.content, 'base64').toString('utf8')
          const descMatch = decoded.match(/description:\s*(.+)/i)
          if (descMatch) description = descMatch[1].trim()
        } catch { /* ignore */ }
      }

      skills.push({
        name: item.name,
        description,
        repoId: repo.id,
        remotePath: item.path,
        downloadUrl: mdData.download_url,
        trust: repo.trust,
      })
    } catch { /* 该子目录没有 SKILL.md，跳过 */ }
  }

  return skills
}

/**
 * 安全安装一个 Skill
 *
 * 1. 验证来自白名单仓库
 * 2. 下载内容
 * 3. 安全扫描
 * 4. 安装到 managed 目录
 */
export async function installSkill(
  gallerySkill: Pick<GallerySkill, 'name' | 'repoId' | 'downloadUrl' | 'remotePath'>,
  proxyUrl?: string,
): Promise<{ ok: boolean; message: string; scanResult?: ScanResult }> {

  // 1. 验证仓库在白名单中
  const repo = TRUSTED_REPOS.find(r => r.id === gallerySkill.repoId)
  if (!repo) {
    return { ok: false, message: `仓库 ${gallerySkill.repoId} 不在可信白名单中` }
  }

  // 2. 验证 downloadUrl 确实指向白名单仓库
  const expectedPrefix = `https://raw.githubusercontent.com/${repo.repo}/`
  if (!gallerySkill.downloadUrl.startsWith(expectedPrefix)) {
    return { ok: false, message: `下载 URL 不匹配可信仓库: ${gallerySkill.downloadUrl}` }
  }

  // 3. 下载内容
  let content: string
  try {
    const fetchOptions: RequestInit = {
      headers: { 'User-Agent': 'Equality-Desktop/0.2.1' },
    }
    if (proxyUrl) {
      try {
        const { ProxyAgent } = await import('undici')
        ;(fetchOptions as Record<string, unknown>).dispatcher = new ProxyAgent(proxyUrl)
      } catch { /* 直连 */ }
    }

    const resp = await fetch(gallerySkill.downloadUrl, fetchOptions)
    if (!resp.ok) {
      return { ok: false, message: `下载失败: ${resp.status} ${resp.statusText}` }
    }
    content = await resp.text()
  } catch (err) {
    return { ok: false, message: `网络错误: ${err instanceof Error ? err.message : String(err)}` }
  }

  // 4. 安全扫描
  const scanResult = scanSkillContent(content)
  if (!scanResult.safe) {
    const reasons = scanResult.warnings.map(w => `  L${w.line}: ${w.reason}`).join('\n')
    return {
      ok: false,
      message: `⚠️ 安全扫描未通过:\n${reasons}`,
      scanResult,
    }
  }

  // 5. 写入 managed 目录
  const managedDir = getManagedSkillsDir()
  const skillDir = path.join(managedDir, gallerySkill.name)

  if (!fs.existsSync(skillDir)) {
    fs.mkdirSync(skillDir, { recursive: true })
  }

  const skillFile = path.join(skillDir, 'SKILL.md')
  fs.writeFileSync(skillFile, content, 'utf8')

  // 6. 写入来源元数据（便于审计）
  const metaFile = path.join(skillDir, '.origin.json')
  fs.writeFileSync(metaFile, JSON.stringify({
    repoId: gallerySkill.repoId,
    repoName: repo.name,
    remotePath: gallerySkill.remotePath,
    downloadUrl: gallerySkill.downloadUrl,
    trust: repo.trust,
    installedAt: new Date().toISOString(),
    scanResult: { safe: true, warningCount: 0 },
  }, null, 2), 'utf8')

  return {
    ok: true,
    message: `✅ ${gallerySkill.name} 已安装到 ${skillDir}`,
    scanResult,
  }
}

/**
 * 卸载一个已安装的 Skill
 */
export function uninstallSkill(name: string): { ok: boolean; message: string } {
  const skillDir = path.join(getManagedSkillsDir(), name)
  if (!fs.existsSync(skillDir)) {
    return { ok: false, message: `Skill "${name}" 未安装` }
  }

  try {
    fs.rmSync(skillDir, { recursive: true, force: true })
    return { ok: true, message: `已卸载 ${name}` }
  } catch (err) {
    return { ok: false, message: `卸载失败: ${err instanceof Error ? err.message : String(err)}` }
  }
}
