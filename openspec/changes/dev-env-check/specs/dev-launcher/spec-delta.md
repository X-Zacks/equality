# Delta Spec: Dev Launcher 环境检测

## ADDED Requirements

### Requirement: Node.js 可用性检测

dev.cmd MUST 在启动前验证 `node` 命令可用且版本 >= 18。

#### Scenario: Node.js 未安装
- GIVEN 开发者 PATH 中不存在 `node`
- WHEN 运行 `dev.cmd`
- THEN 显示错误 `[FAIL] Node.js 未安装` 并给出下载链接
- AND 脚本退出，不启动任何服务

#### Scenario: Node.js 版本过低
- GIVEN `node --version` 返回 v16.x
- WHEN 运行 `dev.cmd`
- THEN 显示警告 `[WARN] Node.js 版本过低(v16.x)，建议 >= 18`

### Requirement: pnpm 可用性检测

dev.cmd MUST 验证 `pnpm` 命令可用。

#### Scenario: pnpm 未安装
- GIVEN PATH 中不存在 `pnpm`
- WHEN 运行 `dev.cmd`
- THEN 显示错误并提示 `npm install -g pnpm`
- AND 脚本退出

### Requirement: Rust/Cargo 可用性检测

dev.cmd MUST 验证 `cargo` 命令可用（含 `%USERPROFILE%\.cargo\bin` 路径扩展）。

#### Scenario: Rust 未安装
- GIVEN `cargo` 命令不可用
- WHEN 运行 `dev.cmd`
- THEN 显示错误并提示 `https://rustup.rs` 安装链接
- AND 脚本退出

### Requirement: MSVC 链接器检测

dev.cmd MUST 验证 `link.exe`（MSVC linker）可通过 Visual Studio 环境访问。

#### Scenario: link.exe 不可用
- GIVEN `link.exe` 不在 PATH 中且 VS Build Tools 未安装
- WHEN 运行 `dev.cmd`
- THEN 显示错误 `[FAIL] MSVC link.exe 未找到`
- AND 显示安装指引：`winget install Microsoft.VisualStudio.2022.BuildTools`
- AND 脚本退出

#### Scenario: VS Build Tools 已安装但未在 PATH
- GIVEN VS Build Tools 已安装在默认路径
- WHEN 运行 `dev.cmd`
- THEN 自动查找并加载 `vcvarsall.bat` 设置编译环境
- AND 继续正常启动

### Requirement: pnpm install 状态检测

dev.cmd MUST 检测 `node_modules` 是否存在，缺失时自动执行 `pnpm install`。

#### Scenario: 首次 clone 未执行 pnpm install
- GIVEN 根目录不存在 `node_modules` 文件夹
- WHEN 运行 `dev.cmd`
- THEN 自动执行 `pnpm install`
- AND 安装成功后继续启动

### Requirement: 检测结果汇总

所有检测完成后 MUST 显示一个汇总表，列出每项检测的通过/失败状态。

#### Scenario: 全部通过
- GIVEN 所有必要工具链均可用
- WHEN 检测阶段完成
- THEN 显示汇总表（全部 `[OK]`）
- AND 继续启动 Core 和 Desktop

#### Scenario: 存在失败项
- GIVEN 某个必要工具未安装
- WHEN 检测阶段完成
- THEN 显示汇总表（失败项标记 `[FAIL]`）
- AND 脚本退出并返回非零退出码

## ADDED Requirements (Version Alignment)

### Requirement: Tauri 插件版本一致

Rust crate 和 npm 包的 Tauri 插件版本 MUST 保持同一 major.minor 版本。

#### Scenario: plugin-dialog 版本对齐
- GIVEN Cargo.toml 中 `tauri-plugin-dialog = "2"`
- AND package.json 中 `@tauri-apps/plugin-dialog: "~2.6.0"`
- WHEN pnpm install 执行
- THEN npm 侧版本解析为 2.6.x（不会跳到 2.7.0）
