/**
 * plugins/loader.ts — 磁盘插件加载器
 *
 * Phase I.5b G8: 从目录加载插件（读 manifest.json → 验证 → dynamic import → 注册到 PluginHost）。
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { join, resolve as pathResolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createLogger } from '../diagnostics/logger.js'
import { validateManifest, type PluginManifest, type PluginExport } from './types.js'
import type { PluginHost } from './host.js'

const logger = createLogger('plugin-loader')

export interface LoadFromDirectoryResult {
  loaded: string[]
  errors: Array<{ dir: string; error: string }>
}

/**
 * 从目录加载所有插件。
 *
 * 约定目录结构：
 *   pluginsDir/
 *     plugin-a/
 *       manifest.json   ← PluginManifest
 *       index.js         ← entry file
 *     plugin-b/
 *       manifest.json
 *       main.js
 *
 * @param pluginsDir — 插件根目录
 * @param host — PluginHost 实例
 */
export async function loadFromDirectory(
  pluginsDir: string,
  host: PluginHost,
): Promise<LoadFromDirectoryResult> {
  const result: LoadFromDirectoryResult = { loaded: [], errors: [] }

  // 1. 列出子目录
  let entries: string[]
  try {
    entries = await readdir(pluginsDir)
  } catch (err) {
    // 目录不存在 → 静默返回空
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.info(`插件目录不存在，跳过: ${pluginsDir}`)
      return result
    }
    throw err
  }

  for (const name of entries) {
    const pluginDir = join(pluginsDir, name)

    // 跳过非目录
    try {
      const s = await stat(pluginDir)
      if (!s.isDirectory()) continue
    } catch {
      continue
    }

    const manifestPath = join(pluginDir, 'manifest.json')

    // 2. 读取 manifest.json
    let raw: string
    try {
      raw = await readFile(manifestPath, 'utf-8')
    } catch {
      result.errors.push({ dir: name, error: `manifest.json not found` })
      continue
    }

    let manifestObj: unknown
    try {
      manifestObj = JSON.parse(raw)
    } catch {
      result.errors.push({ dir: name, error: `manifest.json is not valid JSON` })
      continue
    }

    // 3. 验证 manifest
    const validation = validateManifest(manifestObj)
    if (!validation.valid) {
      result.errors.push({ dir: name, error: `Invalid manifest: ${validation.errors.join('; ')}` })
      continue
    }

    const manifest = manifestObj as PluginManifest

    // 4. Dynamic import entry file
    const entryPath = pathResolve(pluginDir, manifest.entry)
    let pluginExport: PluginExport
    try {
      const mod = await import(pathToFileURL(entryPath).href)
      // 支持 default export 或具名 export
      pluginExport = mod.default ?? mod
      if (typeof pluginExport.activate !== 'function') {
        result.errors.push({ dir: name, error: `Entry file does not export activate()` })
        continue
      }
    } catch (err) {
      result.errors.push({ dir: name, error: `Import failed: ${(err as Error).message}` })
      continue
    }

    // 5. 注册到 PluginHost
    try {
      const info = await host.loadFromManifest(manifest, pluginExport)
      if (info.state === 'error') {
        result.errors.push({ dir: name, error: info.error ?? 'unknown error' })
      } else {
        result.loaded.push(manifest.id)
        logger.info(`插件已加载: ${manifest.id}@${manifest.version}`)
      }
    } catch (err) {
      result.errors.push({ dir: name, error: `Host load failed: ${(err as Error).message}` })
    }
  }

  return result
}
