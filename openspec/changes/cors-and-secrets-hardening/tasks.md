# Tasks: CORS 收紧 + Secrets 加密存储

## Phase 1：CORS 白名单（立即实施）

- [x] **1.1** `packages/core/src/index.ts`  
  将 `origin: true` 替换为 Origin 白名单函数  
  允许：`null`、`https://tauri.localhost`、`tauri://localhost`、开发模式 `localhost:*`  
  拒绝：其他所有 origin

- [ ] **1.2** 手动验证  
  - `pnpm dev` 模式下 Tauri WebView 可正常发送消息  
  - `curl -H "Origin: https://evil.com" http://localhost:18790/health` 返回 403

## Phase 2：Secrets 存储加固（后续实施）

- [x] **2.1** `packages/core/src/config/secrets.ts`  
  加入 `getStorageMode(): 'plaintext' | 'dpapi'` 函数（当前始终返回 `'plaintext'`）  
  文件头补充安全说明和 Phase 2 接入点注释

- [x] **2.2** `packages/core/src/index.ts`  
  `/settings` 接口响应加入 `storageMode` 字段

- [x] **2.3** `packages/desktop/src/useGateway.ts`  
  `SettingsState` 接口加入 `storageMode?: 'plaintext' | 'dpapi'`

- [x] **2.4** `packages/desktop/src/Settings.tsx`  
  「关于」Tab 展示存储模式：`🔒 加密存储（DPAPI）` 或 `⚠️ 明文存储`

- [ ] **2.5** 引入 `node-dpapi`，验证在 Node.js SEA 构建下的兼容性  
  若兼容，实现 `secrets.ts` 的 DPAPI 加密路径

- [ ] **2.6** `scripts/build-sea.mjs` / `build-all.mjs`  
  若需要，添加 `.node` 原生模块的打包和分发步骤

## 验证标准

- V1：外部网页无法跨域调用 `/chat/stream` 发起工具调用
- V2：Tauri 内正常对话不受影响
- V3：`pnpm dev` 开发模式正常工作
- V4（Phase 2）：`settings.json` 中 API Key 值为 base64 密文，非明文
- V5（Phase 2）：「关于」页正确显示存储模式
