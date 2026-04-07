/**
 * plugins/host.ts — 插件宿主
 *
 * Phase K1 (GAP-32): 管理插件生命周期（load/activate/deactivate/unload）。
 */

import { createLogger } from '../diagnostics/logger.js'
import { globalHookRegistry, type HookRegistry } from '../hooks/index.js'
import {
  validateManifest,
  type PluginManifest,
  type PluginExport,
  type PluginContext,
  type PluginState,
  type PluginInfo,
} from './types.js'

const logger = createLogger('plugin-host')

// ─── Internal Plugin Record ─────────────────────────────────────────────────

interface PluginRecord {
  manifest: PluginManifest
  state: PluginState
  error?: string
  activatedAt?: number
  pluginExport?: PluginExport
  unregisterHooks?: Array<() => void>
}

// ─── PluginHost ─────────────────────────────────────────────────────────────

export class PluginHost {
  private plugins = new Map<string, PluginRecord>()
  private hookRegistry: HookRegistry

  constructor(opts?: { hookRegistry?: HookRegistry }) {
    this.hookRegistry = opts?.hookRegistry ?? globalHookRegistry
  }

  /**
   * 从 manifest 对象加载插件（不涉及磁盘读取，便于测试）。
   */
  async loadFromManifest(
    manifest: PluginManifest,
    pluginExport: PluginExport,
  ): Promise<PluginInfo> {
    // 1. 验证 manifest
    const validation = validateManifest(manifest)
    if (!validation.valid) {
      const info: PluginInfo = {
        manifest,
        state: 'error',
        error: `Invalid manifest: ${validation.errors.join('; ')}`,
      }
      return info
    }

    // 2. 检查重复
    if (this.plugins.has(manifest.id)) {
      return {
        manifest,
        state: 'error',
        error: `Plugin "${manifest.id}" already loaded`,
      }
    }

    // 3. 创建 record（loaded 状态）
    const record: PluginRecord = {
      manifest,
      state: 'loaded',
      pluginExport,
    }
    this.plugins.set(manifest.id, record)

    // 4. Activate
    try {
      const ctx: PluginContext = {
        logger: createLogger(`plugin:${manifest.id}`),
        hooks: this.hookRegistry,
        config: {},
      }
      await pluginExport.activate(ctx)
      record.state = 'active'
      record.activatedAt = Date.now()
      logger.info(`Plugin "${manifest.id}" activated`, { type: manifest.type, version: manifest.version })
    } catch (err) {
      record.state = 'error'
      record.error = err instanceof Error ? err.message : String(err)
      logger.warn(`Plugin "${manifest.id}" activation failed`, { error: record.error })
    }

    return this.toInfo(record)
  }

  /**
   * 卸载插件。
   */
  async unload(pluginId: string): Promise<boolean> {
    const record = this.plugins.get(pluginId)
    if (!record) return false

    // 调用 deactivate（如果存在）
    if (record.state === 'active' && record.pluginExport?.deactivate) {
      try {
        await record.pluginExport.deactivate()
      } catch (err) {
        logger.warn(`Plugin "${pluginId}" deactivation error`, {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    // 移除 hook 注册
    if (record.unregisterHooks) {
      for (const unreg of record.unregisterHooks) {
        try { unreg() } catch { /* ignore */ }
      }
    }

    record.state = 'unloaded'
    this.plugins.delete(pluginId)
    logger.info(`Plugin "${pluginId}" unloaded`)
    return true
  }

  /**
   * 列出所有插件。
   */
  list(): PluginInfo[] {
    return [...this.plugins.values()].map(r => this.toInfo(r))
  }

  /**
   * 获取指定插件信息。
   */
  getPlugin(pluginId: string): PluginInfo | undefined {
    const record = this.plugins.get(pluginId)
    return record ? this.toInfo(record) : undefined
  }

  /**
   * 已加载插件数量。
   */
  get size(): number {
    return this.plugins.size
  }

  /**
   * 清除所有插件（测试用）。
   */
  async clear(): Promise<void> {
    for (const id of [...this.plugins.keys()]) {
      await this.unload(id)
    }
  }

  private toInfo(record: PluginRecord): PluginInfo {
    return {
      manifest: record.manifest,
      state: record.state,
      error: record.error,
      activatedAt: record.activatedAt,
    }
  }
}
