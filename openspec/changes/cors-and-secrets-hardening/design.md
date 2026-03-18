# Design: CORS 收紧 + Secrets 加密存储

## 1. CORS Origin 白名单

### 方案

用 `@fastify/cors` 的函数形式替换 `origin: true`：

```typescript
// packages/core/src/index.ts
await app.register(cors, {
  origin: (origin, cb) => {
    // 无 Origin（本机直接请求、Tauri IPC 路径）
    if (!origin || origin === 'null') return cb(null, true)
    // Tauri WebView（Windows: https://tauri.localhost，macOS: tauri://localhost）
    if (origin === 'https://tauri.localhost' || origin === 'tauri://localhost') return cb(null, true)
    // 开发模式：Vite dev server（仅 NODE_ENV=development）
    if (process.env.NODE_ENV === 'development') {
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return cb(null, true)
      }
    }
    // 其余一律拒绝
    cb(new Error('CORS: origin not allowed'), false)
  },
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Type'],
  credentials: false,
})
```

### 为什么不用字符串数组？

`@fastify/cors` 的 `origin: string[]` 形式不支持通配符端口（`http://localhost:*`），
函数形式可以精确控制逻辑，且更容易在测试中 mock。

### 影响评估

| 场景 | 变更前 | 变更后 |
|------|-------|-------|
| Tauri WebView 请求 | ✅ 通过 | ✅ 通过 |
| `pnpm dev` 模式 | ✅ 通过 | ✅ 通过（开发模式白名单）|
| 外部网页跨域请求 | ⚠️ 通过 | ✅ 403 拒绝 |
| `curl localhost` 直接调用 | ✅ 通过 | ✅ 通过（无 Origin 头）|

---

## 2. Secrets DPAPI 加密（Phase 2 设计，本次不实现）

### 背景

Windows DPAPI 通过 `CryptProtectData` / `CryptUnprotectData` 系统调用，
使用当前登录用户的主密钥加密数据，无需用户管理密码。

- 加密密钥与 Windows 用户账号绑定
- 其他用户账号无法解密
- 进程隔离无法绕过
- 支持 Node.js 原生模块 `node-dpapi`

### 实现路径

```
secrets.ts 当前：
  setSecret(name, value) → 明文写入 settings.json

Phase 2 目标：
  setSecret(name, value)
    → Windows: dpapi.protectData(Buffer.from(value)) → base64 → settings.json
    → 其他: 明文（fallback）

  getSecret(name)
    → Windows: dpapi.unprotectData(Buffer.from(stored, 'base64')).toString()
    → 其他: 直接读取
```

### SEA 兼容性风险

`node-dpapi` 是原生 `.node` 模块，在 Node.js SEA（Single Executable Application）下，
需要把 `.node` 文件随 exe 一起分发，并在运行时动态 `require`。  
这需要额外的构建步骤，且需验证与当前 `build-sea.mjs` 的兼容性。

**风险**：若 SEA 无法加载原生模块，需要 fallback 到明文，影响安全承诺。

### 替代方案（如 DPAPI 不可行）

1. **凭证文件权限收紧**：`chmod 600 settings.json`（Windows 等效：设置 ACL 只允许当前用户读取）
2. **系统 Keychain**：Windows Credential Manager（`keytar` 包），比 DPAPI 更标准但依赖更重

### 本次决策

Phase 2 实现 DPAPI。本次变更仅：
1. 在 `secrets.ts` 注释里标注 Phase 2 接入点
2. 在 `/settings` 响应里加 `storageMode: 'plaintext'`，为 UI 展示占坑
