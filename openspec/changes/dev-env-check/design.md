# Design: dev.cmd 环境检测与自动修复

> **变更 ID**: dev-env-check  
> **架构决策日期**: 2026-04-08

---

## 1. 整体架构

```
dev.cmd 执行流程（修改后）：

┌─────────────────────────────────────┐
│ Phase 0: 读取 .env.local            │  ← 保持不变
├─────────────────────────────────────┤
│ Phase 1: 环境检测（NEW）             │
│  ├─ 1.1 检测 Node.js (>= 18)       │
│  ├─ 1.2 检测 pnpm                   │
│  ├─ 1.3 检测 Cargo (含 PATH 扩展)   │
│  ├─ 1.4 检测 MSVC link.exe          │
│  │       └─ 自动查找 vcvarsall.bat  │
│  ├─ 1.5 检测 node_modules           │
│  │       └─ 缺失时自动 pnpm install │
│  └─ 1.6 汇总输出                    │
│          └─ 有 FAIL 则退出          │
├─────────────────────────────────────┤
│ Phase 2: 清理旧进程                  │  ← 保持不变
├─────────────────────────────────────┤
│ Phase 3: 启动 Core + Desktop         │  ← 保持不变
└─────────────────────────────────────┘
```

## 2. 检测逻辑设计

### 2.1 Node.js 检测

```bat
node --version 2>nul
:: 解析主版本号，>= 18 则 OK
```

### 2.2 pnpm 检测

```bat
pnpm --version 2>nul
:: 存在即 OK
```

### 2.3 Cargo 检测

```bat
:: 先扩展 PATH 包含 %USERPROFILE%\.cargo\bin
set PATH=%PATH%;%USERPROFILE%\.cargo\bin
cargo --version 2>nul
```

### 2.4 MSVC link.exe 检测

这是最复杂的一项。策略：

1. **直接检测**：`where link.exe` — 如果已在 PATH 中（用户已通过 VS Developer Command Prompt 启动）
2. **自动查找 vcvarsall.bat**：扫描常见安装路径：
   ```
   C:\Program Files\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat
   C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvarsall.bat
   C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\VC\Auxiliary\Build\vcvarsall.bat
   ```
   找到后执行 `call vcvarsall.bat x64` 设置编译环境。
3. **均未找到**：提示安装 Build Tools。

### 2.5 node_modules 检测

```bat
if not exist "%~dp0node_modules" (
    echo [INFO] 首次运行，正在安装依赖...
    pnpm install
)
```

### 2.6 汇总输出格式

```
═══════════════════════════════════════
  Equality 开发环境检测
═══════════════════════════════════════
  [OK]   Node.js    v22.16.0
  [OK]   pnpm       v10.12.1
  [OK]   Cargo      v1.87.0
  [OK]   MSVC       link.exe found
  [OK]   依赖       node_modules 已安装
═══════════════════════════════════════
```

失败时：
```
  [FAIL] MSVC       link.exe 未找到
         → 请安装 Visual Studio Build Tools:
           winget install Microsoft.VisualStudio.2022.BuildTools --override "--add Microsoft.VisualStudio.Workload.VCTools"
```

## 3. 版本不匹配修复

### 3.1 问题根因

| 文件 | 当前值 | 问题 |
|------|--------|------|
| `Cargo.toml` | `tauri-plugin-dialog = "2.6.0"` | 精确锁定 2.6.0 |
| `package.json` | `"@tauri-apps/plugin-dialog": "^2.6.0"` | `^` 允许升级到 2.7.0 |

### 3.2 修复方案

两侧统一使用兼容范围：
- `Cargo.toml`: `tauri-plugin-dialog = "2"` — 由 Cargo.lock 锁定具体版本
- `package.json`: `"@tauri-apps/plugin-dialog": "~2.6.0"` — `~` 只允许 patch 升级 (2.6.x)

此外也检查 `tauri-plugin-notification`，确保一致。

## 4. 不变的部分

- `.env.local` 读取逻辑
- Core 和 Desktop 启动命令
- 端口清理逻辑
- `run-tauri-dev.cmd`（简化版启动脚本，不加检测）
