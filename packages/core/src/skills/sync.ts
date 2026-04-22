/**
 * skills/sync.ts — Skills 同步器
 *
 * 将 bundled skills 同步到用户 Workspace Dir 的 .equality/skills/ 目录，
 * 解决沙箱环境下 Agent 无法访问 equality 安装目录中脚本的问题。
 *
 * 同步策略：
 * - 仅同步 bundled source 的 skills
 * - 使用 mtime 比较，跳过未变更文件
 * - 写入 .sync-manifest.json 记录同步状态
 * - 新增/更新复制，删除不处理（用户可能自定义）
 */

import fs from 'node:fs'
import path from 'node:path'
import { getBundledSkillsDir } from './loader.js'

interface SyncManifest {
  syncedAt: string
  sourceDir: string
  skills: Record<string, { mtime: number; files: number }>
}

const MANIFEST_NAME = '.sync-manifest.json'

/**
 * 将 bundled skills 同步到 <workspaceDir>/.equality/skills/
 * 返回同步的 skill 数量。
 */
export function syncBundledSkills(workspaceDir: string): { synced: number; skipped: number; total: number } {
  const sourceDir = getBundledSkillsDir()
  if (!sourceDir || !fs.existsSync(sourceDir)) {
    return { synced: 0, skipped: 0, total: 0 }
  }

  const targetDir = path.join(workspaceDir, '.equality', 'skills')
  fs.mkdirSync(targetDir, { recursive: true })

  // 读取现有 manifest
  const manifestPath = path.join(targetDir, MANIFEST_NAME)
  let manifest: SyncManifest = { syncedAt: '', sourceDir: '', skills: {} }
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  } catch { /* 首次同步 */ }

  // 扫描 source 目录
  let items: fs.Dirent[]
  try {
    items = fs.readdirSync(sourceDir, { withFileTypes: true })
  } catch {
    return { synced: 0, skipped: 0, total: 0 }
  }

  let synced = 0
  let skipped = 0
  const newManifest: SyncManifest = {
    syncedAt: new Date().toISOString(),
    sourceDir,
    skills: {},
  }

  for (const item of items) {
    if (!item.isDirectory()) continue

    const skillSourceDir = path.join(sourceDir, item.name)
    const skillTargetDir = path.join(targetDir, item.name)

    // 检查 source 目录 mtime
    const sourceMtime = getLatestMtime(skillSourceDir)
    const cached = manifest.skills[item.name]

    if (cached && cached.mtime === sourceMtime) {
      // 未变更，跳过
      newManifest.skills[item.name] = cached
      skipped++
      continue
    }

    // 需要同步 — 递归复制
    const fileCount = copyDirRecursive(skillSourceDir, skillTargetDir)
    newManifest.skills[item.name] = { mtime: sourceMtime, files: fileCount }
    synced++
  }

  // 写入 manifest
  try {
    fs.writeFileSync(manifestPath, JSON.stringify(newManifest, null, 2), 'utf-8')
  } catch (e) {
    console.warn('[skills/sync] Failed to write manifest:', e)
  }

  const total = synced + skipped
  if (synced > 0) {
    console.log(`[skills/sync] 同步完成: ${synced} synced, ${skipped} skipped (共 ${total} skills) → ${targetDir}`)
  }

  return { synced, skipped, total }
}

/** 递归获取目录中最新文件的 mtime */
function getLatestMtime(dir: string): number {
  let latest = 0
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true })
    for (const item of items) {
      const full = path.join(dir, item.name)
      if (item.isDirectory()) {
        latest = Math.max(latest, getLatestMtime(full))
      } else {
        try {
          const stat = fs.statSync(full)
          latest = Math.max(latest, stat.mtimeMs)
        } catch { /* skip */ }
      }
    }
  } catch { /* skip */ }
  return Math.floor(latest)
}

/** 递归复制目录，返回文件数 */
function copyDirRecursive(src: string, dest: string): number {
  fs.mkdirSync(dest, { recursive: true })
  let count = 0

  const items = fs.readdirSync(src, { withFileTypes: true })
  for (const item of items) {
    const srcPath = path.join(src, item.name)
    const destPath = path.join(dest, item.name)

    if (item.isDirectory()) {
      count += copyDirRecursive(srcPath, destPath)
    } else {
      try {
        fs.copyFileSync(srcPath, destPath)
        count++
      } catch (e) {
        console.warn(`[skills/sync] copy failed: ${srcPath} → ${destPath}:`, e)
      }
    }
  }

  return count
}
