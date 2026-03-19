# Tasks: CORS Dev Origin Bug 修复

## 修复

- [x] **1.1** `packages/core/src/index.ts`  
  移除 `process.env.NODE_ENV === 'development'` 判断  
  直接允许所有 `http://localhost:*` 和 `http://127.0.0.1:*`  
  commit: `3508236`

- [x] **1.2** `.gitignore` 补全  
  新增：`tmp_*`、`*.equality-bak`、`openspec/*.html`、`openspec/*_files/`、`OpenClaw_*.md`、`example/`  
  commit: `3508236`

## 排查记录（走了弯路）

- [x] 误判为 DPAPI 实现问题 → revert `400c2b9`、`5345099`、`3f861ce`（commit `0bf73a0`）
- [x] revert 后问题依然存在 → 确认与 DPAPI 无关
- [x] 通过 `curl -H "Origin: http://localhost:1420"` 验证 → 确认 CORS 403
- [x] 定位到 `NODE_ENV` 未设置是根因

## 验证

- [x] `http://localhost:1420` origin → 200 ✅
- [x] `https://evil.com` origin → 403 ✅  
- [x] 重启后模型列表、工具、Skills、历史、token 统计全部正常 ✅
