/**
 * db-loader.ts — better-sqlite3 加载封装
 *
 * 策略：检测 exe 同级目录是否有 better-sqlite3.node，
 *   - 有：SEA 环境，用 process.dlopen 直接加载，传 addon 对象给 nativeBinding
 *   - 没有：dev 环境，返回 {}，走默认 bindings 路径
 */

import BetterSqlite3 from 'better-sqlite3'
import path from 'node:path'
import { existsSync } from 'node:fs'

type DatabaseConstructor = typeof BetterSqlite3

export function getDatabase(): DatabaseConstructor {
  return BetterSqlite3
}

export function getDbOptions(): BetterSqlite3.Options {
  // 按优先级检测 .node 文件位置（兼容便携版平铺和安装版 resources 子目录）
  const exeDir = path.dirname(process.execPath)
  const candidates = [
    path.join(exeDir, 'better-sqlite3.node'),
    path.join(exeDir, 'better_sqlite3.node'),
    path.join(exeDir, 'resources', 'better-sqlite3.node'),
    path.join(exeDir, 'resources', 'better_sqlite3.node'),
  ]

  for (const nodePath of candidates) {
    if (!existsSync(nodePath)) continue
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod = { exports: {} } as any
      process.dlopen(mod, nodePath)
      console.log('[db-loader] 加载原生模块:', nodePath)
      return { nativeBinding: mod.exports }
    } catch (e) {
      console.error('[db-loader] dlopen 失败:', nodePath, e)
    }
  }

  // 未找到，走默认路径（dev 模式）
  return {}
}

