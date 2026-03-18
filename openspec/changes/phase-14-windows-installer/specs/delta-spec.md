# Phase 14 — Delta Spec

> 基于现有 build-sea.mjs + tauri.conf.json 的增量规格

## ADDED Requirements

### Requirement: 一键构建脚本

系统 SHALL 提供 `scripts/build-all.mjs` 脚本，执行以下步骤：

1. 构建 Core SEA（`equality-core.exe`）
2. 复制原生模块（`better-sqlite3.node`）到 Core 旁
3. 构建前端（`pnpm --filter @equality/desktop build`）
4. 执行 `cargo tauri build`，输出 NSIS 安装包

#### Scenario: 全新环境构建
- GIVEN 已安装 Node.js 22+、pnpm、Rust 工具链
- WHEN 运行 `node scripts/build-all.mjs`
- THEN 在 `target/release/bundle/nsis/` 生成 `Equality_x.x.x_x64-setup.exe`

#### Scenario: 增量构建
- GIVEN 已经构建过一次
- WHEN 只修改了前端代码后再次运行 `node scripts/build-all.mjs`
- THEN Rust 层增量编译，总构建时间显著减少

### Requirement: Portable 便携版

系统 SHALL 提供 `scripts/build-portable.mjs` 脚本。

#### Scenario: 生成 Portable zip
- GIVEN NSIS 构建已完成
- WHEN 运行 `node scripts/build-portable.mjs`
- THEN 在 `dist/` 生成 `Equality-portable-x.x.x.zip`
- AND zip 内结构为 `Equality/Equality.exe` + `Equality/resources/equality-core.exe` + 原生模块

#### Scenario: 免安装运行
- GIVEN 用户解压 zip 到任意目录
- WHEN 双击 `Equality.exe`
- THEN 应用正常启动，Core 子进程自动运行

### Requirement: 原生模块打包

`equality-core.exe`（Node.js SEA）SHALL 能在运行时加载 `better-sqlite3.node` 原生模块。

#### Scenario: SEA 加载原生模块
- GIVEN `better-sqlite3.node` 位于 `equality-core.exe` 同目录
- WHEN Core 启动并使用 SQLite 功能
- THEN 模块正常加载，无 "Cannot find module" 错误

### Requirement: Tauri Resources 配置

`tauri.conf.json` SHALL 配置 `bundle.resources` 将以下文件打入安装包：
- `equality-core.exe`
- `better-sqlite3.node`

#### Scenario: 安装后文件布局
- GIVEN 用户通过 NSIS 安装
- WHEN 安装完成
- THEN 安装目录包含：
  ```
  C:\Users\{user}\AppData\Local\Equality\
  ├── Equality.exe
  └── resources/
      ├── equality-core.exe
      └── better-sqlite3.node
  ```

## MODIFIED Requirements

### Requirement: Core 进程查找路径

`gateway.rs` 的 `core_exe_path()` SHALL 同时查找 `resources/` 和 exe 同级目录。

#### Scenario: 安装版
- GIVEN Equality 通过 NSIS 安装
- WHEN Tauri 启动
- THEN 从 `{resource_dir}/equality-core.exe` 找到 Core

#### Scenario: 便携版
- GIVEN Equality 从 zip 解压运行
- WHEN Tauri 启动
- THEN 从 `{exe_dir}/resources/equality-core.exe` 找到 Core

### Requirement: SEA 构建脚本

`build-sea.mjs` SHALL 在构建完 exe 后，自动复制 `better-sqlite3.node` 到 `dist/` 目录。

#### Scenario: 构建产物完整性
- GIVEN 运行 `pnpm build:sea`
- WHEN 构建完成
- THEN `dist/` 目录包含 `equality-core.exe` 和 `better-sqlite3.node`
