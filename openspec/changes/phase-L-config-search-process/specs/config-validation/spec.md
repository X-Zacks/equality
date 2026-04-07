# Delta Spec: Config Schema Validation

> Phase L1 — GAP-33

## ADDED Requirements

### Requirement: 配置 Schema 定义

系统 MUST 为全部配置项定义结构化 Schema。

每个配置字段 MUST 包含：
- `type` — 值类型（`string | number | boolean | string[] | json`）
- `required` — 是否必填（默认 false）
- `default` — 默认值
- `description` — 人类可读描述

每个配置字段 MAY 包含：
- `validate` — 自定义验证函数
- `deprecated` — 废弃说明
- `since` — 引入版本

#### Scenario: Schema 覆盖全部配置项
- GIVEN 内置 `EQUALITY_CONFIG_SCHEMA`
- WHEN 检查 schema 的 key 列表
- THEN MUST 包含 `CUSTOM_API_KEY`、`CUSTOM_BASE_URL`、`CUSTOM_MODEL` 等全部已知配置项

### Requirement: 配置验证

系统 MUST 在启动时验证配置。

- `validateConfig(raw, schema)` — 返回验证结果
- 类型不匹配 MUST 报 error
- 必填项缺失 MUST 报 error
- 未知的 key SHOULD 报 warning
- deprecated 的 key MUST 报 warning
- 验证失败 MUST NOT 阻止启动（使用默认值）

#### Scenario: 有效配置
- GIVEN 配置包含所有必填项且类型正确
- WHEN `validateConfig(config, schema)` 被调用
- THEN MUST 返回 `{ valid: true, errors: [], warnings: [] }`

#### Scenario: 类型不匹配
- GIVEN 配置 `{ CUSTOM_MODEL: 123 }`（应为 string）
- WHEN 验证
- THEN `errors` MUST 包含 `{ key: 'CUSTOM_MODEL', message: '...' }`

#### Scenario: 缺少必填项
- GIVEN 配置缺少 `CUSTOM_API_KEY`（假设为 required）
- WHEN 验证
- THEN `errors` MUST 包含该字段的缺失错误

#### Scenario: 默认值填充
- GIVEN 配置未设置 `CUSTOM_MODEL`，schema 定义 default 为 `'gpt-4o'`
- WHEN 验证
- THEN `applied.CUSTOM_MODEL` MUST 为 `'gpt-4o'`

### Requirement: 配置迁移

系统 MUST 支持版本升级时的配置自动迁移。

- `migrateConfig(config, fromVersion, migrations[])` — 按顺序执行迁移
- 每个 `ConfigMigration` 包含 `fromVersion`、`toVersion`、`migrate(config)`
- 迁移 MUST 按 version 顺序执行
- 迁移结果 MUST 写回存储

#### Scenario: 版本迁移
- GIVEN 配置版本为 1，当前版本为 3
- AND 存在 v1→v2 和 v2→v3 两个迁移
- WHEN `migrateConfig(config, 1, migrations)` 被调用
- THEN 两个迁移 MUST 按顺序执行
- AND 返回版本 3 的配置

#### Scenario: 无需迁移
- GIVEN 配置版本已为最新
- WHEN `migrateConfig()` 被调用
- THEN MUST 直接返回原配置（不执行任何迁移）
