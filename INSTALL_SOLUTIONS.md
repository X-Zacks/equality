# Equality Windows 安装部署方案对比

> 记录日期：2026-03-16
> 决策：方案 A + C 组合

---

## 当前架构

```
Equality 双进程架构：
┌─────────────────┐     HTTP/SSE      ┌──────────────────┐
│  Equality.exe   │ ←───────────────→ │ equality-core.exe│
│  (Tauri Shell)  │   localhost:18790  │  (Node.js SEA)   │
│  ~10 MB         │                    │  ~70 MB          │
└─────────────────┘                    └──────────────────┘
```

已有：
- `tauri.conf.json` 配置了 NSIS + MSI 打包
- `build-sea.mjs` 把 Core 打成 Node.js SEA 单 exe
- `gateway.rs` release 模式自动启动/看护 Core 子进程

---

## 方案 A：Tauri 原生 NSIS 安装包 ⭐ 推荐

**原理**：利用 Tauri 2 内置 bundle 系统，把 `equality-core.exe` 作为 resource 一起打包。

**产物**：`Equality_0.1.0_x64-setup.exe`（~50-60 MB），双击安装到 `AppData\Local\Equality`

| 优点 | 缺点 |
|------|------|
| Tauri 原生支持，最少代码改动 | 体积较大（Node.js SEA ~70MB + Tauri ~10MB） |
| 自动处理开始菜单、卸载程序 | 需要 WebView2 Runtime（Win10+ 已自带） |
| NSIS 安装器用户最熟悉 | better-sqlite3 的 .node 原生模块需一起打包 |
| `gateway.rs` 已写好子进程管理 | — |
| 后续可加 Tauri 自动更新 | — |

**额外工作量**：2-3 小时

---

## 方案 B：全嵌入 Rust（Core 内联到 Tauri 进程）

**原理**：用 `napi-rs` 嵌入 Node.js 运行时到 Tauri 进程，或用 Rust 重写 Core。

| 优点 | 缺点 |
|------|------|
| 单进程，架构最简洁 | 工作量巨大（重写 Core 或嵌入 Node） |
| 安装包更小 | 放弃 TypeScript 生态（openai SDK 等） |
| — | 得不偿失，当前架构运行良好 |

**工作量**：数周 → ❌ 不推荐

---

## 方案 C：Portable 便携版（免安装 zip）

**原理**：不走安装程序，直接把所有文件打成 zip，解压即用。

| 优点 | 缺点 |
|------|------|
| 零安装，解压就跑 | 没有开始菜单、桌面快捷方式 |
| 适合企业内部分发 | 没有自动更新 |
| 可放 U 盘随身携带 | 没有卸载程序 |
| — | 用户体验不如安装包 |

**工作量**：1-2 小时（在方案 A 基础上额外加 zip 步骤）

---

## 决策：方案 A + C 组合

先做 **方案 A**（NSIS 安装包）作为主分发方式，同时出 **方案 C**（Portable zip）给不想安装的用户。两者共享同一构建流程。

**实施详情见**：[openspec/changes/phase-14-windows-installer/](openspec/changes/phase-14-windows-installer/)

### 构建流程

```
node scripts/build-all.mjs
├─ Step 1: pnpm --filter @equality/core build:sea  → equality-core.exe
├─ Step 2: Copy artifacts → src-tauri/resources/
├─ Step 3: pnpm --filter @equality/desktop build    → frontend dist
└─ Step 4: cargo tauri build                         → NSIS installer

node scripts/build-portable.mjs  (可选)
└─ 从 build 产物提取 → Equality-portable-x.x.x.zip
```

### 安装包体积预估

| 组件 | 大小 |
|------|------|
| Equality.exe (Tauri) | ~8 MB |
| equality-core.exe (SEA) | ~70 MB |
| better-sqlite3.node | ~2 MB |
| NSIS 开销 | ~1 MB |
| **总计（LZMA 压缩后）** | **~50-60 MB** |

### 关键技术点

1. **better-sqlite3.node**：Node.js SEA 不能内嵌原生模块，需外置到 exe 同目录
2. **WebView2**：Win10 21H2+ 已预装，旧版由 NSIS 自动下载
3. **免管理员权限**：`installMode: "currentUser"` 安装到用户目录
4. **gateway.rs**：已有子进程管理 + 崩溃重启，只需微调路径查找
