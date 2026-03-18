# Phase 14 — 设计文档

## 架构

```
构建流程：

  scripts/build-all.mjs
  ├─ Step 1: Core SEA
  │   ├─ esbuild bundle (TS → CJS)
  │   ├─ node --experimental-sea-config → blob
  │   ├─ copy node.exe → equality-core.exe
  │   ├─ postject inject blob
  │   └─ copy better-sqlite3.node → dist/
  │
  ├─ Step 2: Copy Core artifacts → Tauri resources
  │   └─ packages/desktop/src-tauri/resources/
  │       ├── equality-core.exe
  │       └── better-sqlite3.node
  │
  ├─ Step 3: Frontend build
  │   └─ pnpm --filter @equality/desktop build
  │
  └─ Step 4: Tauri build
      └─ cargo tauri build
          ├── target/release/bundle/nsis/Equality_x.x.x_x64-setup.exe
          └── target/release/bundle/msi/Equality_x.x.x_x64.msi

  scripts/build-portable.mjs (可选, 在 Step 4 之后)
  └─ 从 target/release/ 提取文件 → dist/Equality-portable-x.x.x.zip
```

## 1. better-sqlite3 原生模块处理

Node.js SEA 不能内嵌 `.node` 原生模块（C++ addon），必须外置。

**方案**：运行时从 exe 同级目录加载。

```javascript
// build-sea.mjs 中 esbuild 配置
'--external:better-sqlite3'  // 已有，保持不变

// Core 运行时 — 在 memory/db.ts 或入口文件顶部
// better-sqlite3 的 require 会自动查找：
//   1. node_modules/better-sqlite3/build/Release/better_sqlite3.node
//   2. 通过 bindings 模块查找
//
// SEA 模式下 node_modules 不存在，需要配置 bindings 路径
```

实际做法：esbuild 保持 `--external:better-sqlite3`，然后在打包时把编译好的 `.node` 文件复制到 exe 旁边。Node.js SEA 的 `require()` 会通过 `node-gyp-build` 或 `bindings` 按约定路径查找。

**备选方案**：如果默认查找失败，在 `src/index.ts` 入口添加路径 hint：

```typescript
// SEA 模式下设置原生模块搜索路径
if (process.isSea?.()) {
  const exeDir = path.dirname(process.execPath)
  process.env.BETTER_SQLITE3_BINDING = path.join(exeDir, 'better-sqlite3.node')
}
```

## 2. tauri.conf.json Resources 配置

```json
{
  "bundle": {
    "resources": [
      {
        "path": "resources/equality-core.exe",
        "target": "resources/equality-core.exe"
      },
      {
        "path": "resources/better-sqlite3.node",
        "target": "resources/better-sqlite3.node"
      }
    ]
  }
}
```

Tauri build 时会把 `resources/` 下的文件打入安装包。
安装后位于 `{install_dir}/resources/`。

## 3. gateway.rs 路径查找优化

```rust
fn core_exe_path(app: &AppHandle) -> PathBuf {
    // 1. 环境变量（dev 模式）
    if let Ok(p) = std::env::var("EQUALITY_CORE_BIN") {
        return PathBuf::from(p);
    }
    // 2. Tauri resource_dir（NSIS 安装版）
    if let Ok(dir) = app.path().resource_dir() {
        let p = dir.join("equality-core.exe");
        if p.exists() { return p; }
    }
    // 3. exe 同级 resources/（Portable 便携版）
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let p = dir.join("resources").join("equality-core.exe");
            if p.exists() { return p; }
        }
    }
    // 4. fallback
    PathBuf::from("equality-core.exe")
}
```

## 4. NSIS 安装器配置

```json
"windows": {
  "nsis": {
    "installMode": "currentUser",
    "displayLanguageSelector": false,
    "oneClick": true
  }
}
```

- `currentUser`：不需要管理员权限，安装到 `AppData\Local`
- `oneClick`：双击即装，无向导页面

## 5. Portable zip 结构

```
Equality-portable-0.1.0/
├── Equality.exe                    ← Tauri shell
└── resources/
    ├── equality-core.exe           ← Node.js SEA
    └── better-sqlite3.node         ← 原生模块
```

## 6. 安装包体积预估

| 组件 | 预估大小 |
|------|----------|
| Equality.exe (Tauri + WebView2 loader) | ~8 MB |
| equality-core.exe (Node.js SEA) | ~70 MB |
| better-sqlite3.node | ~2 MB |
| NSIS 安装器开销 | ~1 MB |
| **总计（压缩后）** | **~50-60 MB** |

NSIS 安装器自带 LZMA 压缩，~80 MB 裸文件可压到 ~50 MB。

## 7. WebView2 依赖

Tauri 2 在 Windows 上依赖 WebView2 Runtime：
- Windows 10 21H2+ 和 Windows 11 已预装
- 旧版 Windows：Tauri NSIS 安装器可配置自动下载安装 WebView2

配置（默认行为，无需额外设置）：
```json
"windows": {
  "webviewInstallMode": { "type": "downloadBootstrapper" }
}
```
