/**
 * skills/index.ts — Skills 模块 barrel export
 */

export type { Skill, SkillEntry, SkillSource, SkillMetadata, SkillInstallSpec, SkillScanFinding, SkillScanSummary, SkillScanSeverity, SkillStatusEntry, SkillStatusReport } from './types.js'
export { parseSkillFile } from './frontmatter.js'
export { loadAllSkills, getSkillsDirs, getBundledSkillsDir, getManagedSkillsDir } from './loader.js'
export { buildSkillsPromptBlock } from './prompt.js'
export { buildInstallCommand } from './prc-install.js'
export { SkillsWatcher, type SkillsWatcherOptions, type SkillsChangeEvent } from './watcher.js'
export { scanSkillDir, scanSkillDirNoCache } from './scanner.js'
export { buildSkillStatus, checkBinExists, checkEnvExists } from './status.js'
export { fetchGallery, installSkill, uninstallSkill, scanSkillContent, TRUSTED_REPOS, type GallerySkill, type TrustedRepo, type ScanResult } from './gallery.js'
export { syncBundledSkills } from './sync.js'
