# Phase 14 — Windows 一键安装部署

> 提案日期：2026-03-16
> 状态：✅ 已批准

## 动机

Equality 目前只能从源码运行（需要 Node.js + pnpm + Rust 工具链），无法分发给普通用户。
需要实现"双击安装、开箱即用"的 Windows 桌面体验。

## 当前架构

```
Equality 双进程架构：
┌─────────────────┐     HTTP/SSE      ┌──────────────────┐
│  Equality.exe   │ ←───────────────→ │ equality-core.exe│
│  (Tauri Shell)  │   localhost:18790  │  (Node.js SEA)   │
│  ~10 MB         │                    │  ~70 MB          │
└─────────────────┘                    └──────────────────┘
```

已有基础设施：
- `tauri.conf.json` 已配置 NSIS + MSI targets
- `build-sea.mjs` 已实现 Node.js SEA 打包（esbuild → blob → postject）
- `gateway.rs` release 模式自动启动/看护 Core 子进程
- `core_exe_path()` 已从 `resources/` 目录定位 Core exe

## 目标

1. **方案 A — NSIS 安装包**：单个 `Equality_x.x.x_x64-setup.exe`，双击安装
2. **方案 C — Portable 便携版**：`Equality-portable-x.x.x.zip`，解压即用
3. 两者共享同一构建流程，最后一步分叉

## 范围

| 模块 | 变更 |
|------|------|
| `packages/core/scripts/build-sea.mjs` | 完善原生模块（better-sqlite3.node）打包 |
| `packages/desktop/src-tauri/tauri.conf.json` | 配置 `bundle.resources` 将 Core exe + 依赖打入安装包 |
| `scripts/build-all.mjs` | 新增一键构建脚本（串联 Core SEA + Tauri build） |
| `scripts/build-portable.mjs` | 新增 Portable zip 打包脚本 |
| `packages/desktop/src-tauri/src/gateway.rs` | 微调 Core exe 查找逻辑 |

## 非目标

- 不做代码签名（后续 Phase）
- 不做自动更新（后续 Phase）
- 不做 macOS/Linux 构建
- 不做 CI/CD 流水线（可选后续加）
