# Proposal: dev.cmd 运行环境检测与自动修复

> **变更 ID**: dev-env-check  
> **创建日期**: 2026-04-08  
> **优先级**: P1（阻断新开发者入手）

---

## 背景

同事从 git 拉取 `master` 分支后运行 `dev.cmd`，遇到两个阻断性错误：

1. **Tauri 插件版本不匹配**  
   ```
   tauri-plugin-dialog (v2.6.0) : @tauri-apps/plugin-dialog (v2.7.0)
   ```
   Rust crate 锁定 2.6.0，但 npm 包的 `^2.6.0` semver 范围被解析到 2.7.0。

2. **MSVC 链接器缺失**  
   ```
   error: linker `link.exe` not found
   note: please ensure that Visual Studio 2017 or later, or Build Tools for Visual Studio were installed
   ```
   未安装 Visual Studio Build Tools 或未将其添加到 PATH。

当前 `dev.cmd` 只做了 `.env.local` 读取和端口清理，**没有任何前置环境检测**。新开发者 clone 后直接运行会遭遇不明确的编译错误。

## 目标

- **G1**: `dev.cmd` 在启动前自动检测所有必要工具链（Node.js、pnpm、Rust/Cargo、MSVC link.exe）
- **G2**: 缺失工具时给出明确的中文提示和一键安装命令
- **G3**: 自动检测并修复 `pnpm install` 未执行的情况
- **G4**: 修复 Tauri 插件版本不匹配问题（锁定 npm 侧版本）
- **G5**: 检测完成后再启动服务，避免浪费编译时间后才失败

## 不做什么

- 不自动安装 Visual Studio Build Tools（需要管理员权限和 ~6GB 下载，只给指引）
- 不自动安装 Rust（只检测并提示 rustup 安装命令）
- 不改变 Core 和 Desktop 的启动顺序

## 影响范围

| 文件 | 变更 |
|------|------|
| `dev.cmd` | 新增环境检测阶段 |
| `packages/desktop/package.json` | 锁定 `@tauri-apps/plugin-dialog` 版本 |
| `packages/desktop/src-tauri/Cargo.toml` | 对齐 Rust crate 版本 |
