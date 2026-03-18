# Phase 14 — 实施清单

> 状态：🚧 部分完成（待端到端验证）

## 实施清单

### 1. Core SEA 构建完善

- [x] 1.1 `build-sea.mjs`: 构建完成后自动复制 `better-sqlite3.node` 到 `dist/`
- [x] 1.2 `build-sea.mjs`: 添加 `process.isSea` 检测 + 原生模块路径设置（在 `src/index.ts` 入口）
- [ ] 1.3 验证 `equality-core.exe` 独立运行（不依赖 node_modules）

### 2. Tauri 打包配置

- [x] 2.1 `tauri.conf.json`: 添加 `bundle.resources` 配置
- [x] 2.2 创建 `src-tauri/resources/` 目录（构建时填充，含 .gitkeep）
- [x] 2.3 `tauri.conf.json`: 确认 NSIS `oneClick` + `currentUser` 配置
- [x] 2.4 `.gitignore`: 忽略 `src-tauri/resources/*.exe` 和 `*.node`

### 3. gateway.rs 路径优化

- [x] 3.1 `core_exe_path()`: 增加 exe 同级 `resources/` 查找（Portable 兼容）
- [ ] 3.2 测试：NSIS 安装版路径正确
- [ ] 3.3 测试：Portable 版路径正确

### 4. 一键构建脚本

- [x] 4.1 创建 `scripts/build-all.mjs`（Step 1-4 串联）
- [x] 4.2 创建 `scripts/build-portable.mjs`（zip 打包）
- [x] 4.3 `package.json`: 添加 `build:installer` 和 `build:portable` 脚本

### 5. 端到端验证

- [ ] 5.1 全新 Windows 机器安装 NSIS 安装包 → 启动正常
- [ ] 5.2 Portable zip 解压 → 双击 Equality.exe → Core 自动启动
- [ ] 5.3 发送消息 → 收到 AI 回复（Core 通信正常）
- [ ] 5.4 Cron 通知弹出（SSE 通信正常）
- [ ] 5.5 SQLite 内存功能正常（better-sqlite3.node 加载正常）
