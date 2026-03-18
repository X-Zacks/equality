# @equality/desktop

Equality 桌面应用的 Tauri 壳层，负责提供原生窗口、系统托盘、以及与 Core 智能体的 HTTP 通信。

## 技术栈

- **Tauri 2.x** — Rust 原生桌面框架
- **React 18 + TypeScript** — 前端 UI
- **Vite** — 构建工具

## 目录结构

```
packages/desktop/
├── src/                  # React 前端
│   ├── Chat.tsx          # 主对话界面（支持流式输出、文件附件、剪贴板粘贴）
│   ├── SessionPanel.tsx  # 会话列表侧边栏
│   ├── Settings.tsx      # 设置面板（模型/工具/代理配置）
│   ├── useGateway.ts     # 与 Core HTTP API 通信的 hooks
│   └── Markdown.tsx      # Markdown 渲染组件
├── src-tauri/            # Rust 后端
│   ├── src/lib.rs        # Tauri 命令注册（含 write_temp_file 等）
│   ├── src/gateway.rs    # Core 进程启动与管理
│   ├── src/tray.rs       # 系统托盘
│   ├── src/window.rs     # 窗口管理（单例）
│   ├── src/proxy.rs      # 代理设置
│   ├── capabilities/     # Tauri 权限配置
│   ├── resources/skills/ # 打包进安装包的内置技能
│   └── tauri.conf.json   # Tauri 构建配置
└── vite.config.ts
```

## 开发

```bash
# 在项目根目录
pnpm dev:desktop
```

## 推荐 IDE 插件

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
