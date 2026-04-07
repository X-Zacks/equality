# Delta Spec: Plugin SDK (Lite)

> Phase K1 — GAP-32

## ADDED Requirements

### Requirement: 插件清单格式

系统 MUST 定义 `PluginManifest` 格式，以 `manifest.json` 文件描述插件元数据。

清单字段：
- `id` — 唯一标识符（MUST 符合 `^[a-z0-9-]+$` 格式）
- `name` — 显示名称
- `version` — 语义化版本号（semver）
- `type` — 插件类型，MUST 为 `'provider' | 'tool' | 'hook'` 之一
- `entry` — ESM 入口文件相对路径
- `config` — 可选的配置 schema

#### Scenario: 有效的 manifest
- GIVEN `manifest.json` 包含 `{ id: "my-plugin", name: "My Plugin", version: "1.0.0", type: "tool", entry: "index.js" }`
- WHEN `validateManifest(manifest)` 被调用
- THEN MUST 返回 `{ valid: true }`

#### Scenario: 无效的 manifest（缺少必填字段）
- GIVEN `manifest.json` 缺少 `type` 字段
- WHEN `validateManifest(manifest)` 被调用
- THEN MUST 返回 `{ valid: false, errors: [...] }`

#### Scenario: 无效的 plugin id 格式
- GIVEN `id` 包含大写字母或空格
- WHEN `validateManifest(manifest)` 被调用
- THEN MUST 返回 `{ valid: false }` 并包含格式错误信息

### Requirement: 插件生命周期

系统 MUST 通过 `PluginHost` 管理插件的完整生命周期。

生命周期状态：`loaded → active → unloaded`（异常时 → `error`）

- `PluginHost.loadFromDirectory(dir)` — 扫描目录，加载所有合法插件
- `PluginHost.load(pluginDir)` — 加载单个插件
- `PluginHost.unload(pluginId)` — 卸载插件
- `PluginHost.list()` — 列出所有已加载插件及其状态
- `PluginHost.getPlugin(pluginId)` — 获取指定插件信息

#### Scenario: 加载插件
- GIVEN 磁盘上存在 `~/.equality/plugins/my-tool/manifest.json` 和 `index.js`
- WHEN `PluginHost.load('~/.equality/plugins/my-tool/')` 被调用
- THEN 插件 MUST 被 `import()` 加载
- AND `activate(ctx)` MUST 被调用
- AND 插件状态 MUST 变为 `'active'`

#### Scenario: 卸载插件
- GIVEN 插件 `my-tool` 处于 `active` 状态
- WHEN `PluginHost.unload('my-tool')` 被调用
- THEN `deactivate()` MUST 被调用（如果存在）
- AND 插件注册的 hook/tool MUST 被移除
- AND 插件状态 MUST 变为 `'unloaded'`

#### Scenario: 插件 activate 异常
- GIVEN 插件的 `activate()` 抛出异常
- WHEN 加载时
- THEN 插件状态 MUST 变为 `'error'`
- AND 异常 MUST 被记录到 warn 日志
- AND MUST NOT 影响其他插件加载

### Requirement: 插件上下文

系统 MUST 向每个插件提供 `PluginContext` 对象。

- `ctx.logger` — 以插件 id 为 module 的 scoped logger
- `ctx.hooks` — HookRegistry 实例（hook 类插件用于注册 hook）
- `ctx.config` — 用户提供的配置值

#### Scenario: 插件使用 logger
- GIVEN 插件 `my-plugin` 已 activate
- WHEN 插件调用 `ctx.logger.info('started')`
- THEN 日志 MUST 包含 `module: 'plugin:my-plugin'`

### Requirement: 三类插件注册

- `type: 'provider'` — activate 时 MUST 返回或注册一个 LLM provider 工厂
- `type: 'tool'` — activate 时 MUST 注册工具定义到 ToolRegistry
- `type: 'hook'` — activate 时 MUST 通过 ctx.hooks 注册 hook handler

#### Scenario: tool 类插件注册工具
- GIVEN 插件 type 为 `'tool'`，entry 导出 `activate(ctx)` 并调用注册
- WHEN 插件加载完成
- THEN 新工具 MUST 在 `ToolRegistry.resolve()` 中可用

### Requirement: PLUGIN_STATES 常量

- 系统 MUST 导出 `PLUGIN_STATES` 常量
- 值 MUST 为 `['loaded', 'active', 'error', 'unloaded']`（只读数组）
