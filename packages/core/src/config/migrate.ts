/**
 * config/migrate.ts — 配置迁移
 *
 * Phase L1 (GAP-33): 版本升级时的配置自动迁移。
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ConfigMigration {
  fromVersion: number
  toVersion: number
  migrate(config: Record<string, unknown>): Record<string, unknown>
  description?: string
}

export interface MigrationResult {
  config: Record<string, unknown>
  fromVersion: number
  toVersion: number
  migrationsApplied: number
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * 按版本顺序执行配置迁移。
 *
 * @param config — 当前配置
 * @param currentVersion — 配置当前版本号
 * @param migrations — 可用的迁移列表
 */
export function migrateConfig(
  config: Record<string, unknown>,
  currentVersion: number,
  migrations: ConfigMigration[],
): MigrationResult {
  // 按 fromVersion 排序
  const sorted = [...migrations].sort((a, b) => a.fromVersion - b.fromVersion)

  let result = { ...config }
  let version = currentVersion
  let applied = 0

  for (const migration of sorted) {
    if (migration.fromVersion === version) {
      result = migration.migrate({ ...result })
      version = migration.toVersion
      applied++
    }
  }

  return {
    config: result,
    fromVersion: currentVersion,
    toVersion: version,
    migrationsApplied: applied,
  }
}
