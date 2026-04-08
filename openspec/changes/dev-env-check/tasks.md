# Tasks: dev.cmd 环境检测与自动修复

> **变更 ID**: dev-env-check  
> **创建日期**: 2026-04-08

---

## Phase 1: 修复版本不匹配

- [ ] **T1.1** `packages/desktop/package.json` — 将 `@tauri-apps/plugin-dialog` 从 `^2.6.0` 改为 `~2.6.0`
- [ ] **T1.2** `packages/desktop/src-tauri/Cargo.toml` — 将 `tauri-plugin-dialog` 从 `"2.6.0"` 改为 `"2"`（由 Cargo.lock 控制具体版本）

## Phase 2: 实现 dev.cmd 环境检测

- [ ] **T2.1** dev.cmd — 新增 Phase 1 环境检测：Node.js 版本检查
- [ ] **T2.2** dev.cmd — 新增 pnpm 可用性检查
- [ ] **T2.3** dev.cmd — 新增 Cargo/Rust 可用性检查（含 PATH 扩展）
- [ ] **T2.4** dev.cmd — 新增 MSVC link.exe 检测 + vcvarsall.bat 自动查找
- [ ] **T2.5** dev.cmd — 新增 node_modules 检测 + 自动 pnpm install
- [ ] **T2.6** dev.cmd — 检测结果汇总表输出；有 FAIL 则退出

## Phase 3: 验证

- [ ] **T3.1** 在已配置环境的机器上运行 dev.cmd，确认检测全部通过并正常启动
- [ ] **T3.2** 提交并合并到 master

---

## 依赖关系

```
T1.1 ─┬─► T1.2
      │
T2.1 ─► T2.2 ─► T2.3 ─► T2.4 ─► T2.5 ─► T2.6
                                            │
T1.2 ──────────────────────────────────────►├─► T3.1 ─► T3.2
```
