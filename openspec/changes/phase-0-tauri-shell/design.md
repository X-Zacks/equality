# Design: Phase 0 — Tauri Windows Shell

## 技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| 桌面框架 | Tauri 2.x | 安装包 ~8MB，用系统 WebView2，原生系统 API |
| 前端 | React 18 + TypeScript | 团队熟悉，组件化 |
| 样式 | Tailwind CSS | 原子化，悬浮窗小界面适合 |
| 构建 | Vite | Tauri 官方推荐，热更新快 |
| 安装包 | NSIS via `tauri-bundler` | 轻量，支持自定义安装步骤 |

## 目录结构

```
packages/
└── desktop/                    ← Tauri 项目根
    ├── src-tauri/
    │   ├── src/
    │   │   ├── main.rs         ← Tauri 主进程入口
    │   │   ├── tray.rs         ← 系统托盘管理
    │   │   ├── hotkey.rs       ← 全局快捷键注册
    │   │   ├── gateway.rs      ← 启动/守护 Gateway 子进程
    │   │   └── window.rs       ← 悬浮窗生命周期管理
    │   ├── Cargo.toml
    │   └── tauri.conf.json
    ├── src/
    │   ├── App.tsx             ← 根组件（路由到不同窗口）
    │   ├── windows/
    │   │   ├── FloatInput.tsx  ← 悬浮输入框
    │   │   └── Settings.tsx    ← 设置面板（Phase 1 完善）
    │   ├── hooks/
    │   │   └── useGateway.ts   ← Gateway 连接状态管理
    │   └── styles/
    └── package.json
```

## 核心流程

### 启动流程
```
Tauri 主进程启动
    │
    ├── 注册系统托盘（常驻）
    ├── 注册全局快捷键 Alt+Space
    │
    ▼
gateway.rs: 启动 equality-core.exe 子进程
    │
    ├── 等待 GET http://localhost:18790/health 返回 200（最多 10s）
    ├── 成功 → 设置托盘图标为"就绪"状态
    └── 失败 → 托盘图标显示错误，悬浮窗显示错误提示
```

### 快捷键触发流程
```
用户按 Alt+Space
    │
    ▼
hotkey.rs: 触发 "toggle-float-window" 事件
    │
    ▼
window.rs: 判断悬浮窗当前状态
    ├── 隐藏中 → 显示（居中，带淡入动画）
    └── 显示中 → 隐藏（带淡出动画）
```

### 消息发送流程（Phase 0 Mock 版）
```
用户输入文字 + 回车
    │
    ▼
useGateway.ts: POST /chat/stream（SSE）
    │
    ├── Gateway 未就绪 → 显示 "⚠️ 服务未启动，请稍候..."
    └── Gateway 就绪（Phase 1 后）→ 流式显示回复
```

## Tauri 配置要点

```json
// tauri.conf.json 关键配置
{
  "windows": [
    {
      "label": "float-input",
      "visible": false,           // 启动时隐藏
      "decorations": false,       // 无标题栏
      "transparent": true,        // 透明背景（毛玻璃效果）
      "alwaysOnTop": true,
      "center": true,
      "width": 680,
      "height": 80                // 初始高度，回复展开后动态调整
    }
  ],
  "systemTray": {
    "iconPath": "icons/tray.ico"
  }
}
```

## 安装包目标

```
EqualitySetup-0.1.0-x64.exe  (~25MB)
  ├── equality.exe            ← Tauri 主程序（~8MB，含 WebView2 检测）
  ├── equality-core.exe       ← Node.js SEA stub（Phase 0 只返回 {"status":"ok"}）
  └── resources/
      └── icons/
```

> Phase 0 的 `equality-core.exe` 是一个极简 stub，只监听 18790 端口并返回 health check，
> 真正的 Agent Core 在 Phase 1 替换进来。
