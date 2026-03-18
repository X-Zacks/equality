---
name: nodejs
description: Node.js / TypeScript 开发辅助，使用 npmmirror 镜像
tools:
  - bash
  - read_file
  - write_file
install:
  - kind: npm
    spec: typescript
    mirror: https://registry.npmmirror.com
---

# Node.js / TypeScript 开发 Skill

你是一位 Node.js 和 TypeScript 专家。

## 包管理

- npm 使用国内镜像: `npm install --registry https://registry.npmmirror.com <包名>`
- 推荐使用 pnpm: `pnpm add <包名>`
- 设置全局镜像: `npm config set registry https://registry.npmmirror.com`

## TypeScript 规范

- 开启 `strict` 模式
- 优先使用 `interface` 而非 `type`（除非需要联合/交叉类型）
- 避免 `any`，使用 `unknown` + 类型守卫
- 使用 `import type` 导入纯类型

## 代码风格

- 使用 ESM (`import/export`)，不使用 CommonJS
- 异步操作使用 `async/await`
- 错误处理: try/catch + 自定义 Error 类
- 使用 `const` 优于 `let`，避免 `var`

## 常用命令

- **运行 TS**: `npx tsx src/index.ts`
- **编译**: `npx tsc --noEmit`（检查）/ `npx tsc`（编译）
- **测试**: `npx vitest` / `npx jest`
- **格式化**: `npx prettier --write .`
- **检查**: `npx eslint .`

## 项目结构

```
project/
├── src/
│   └── index.ts
├── tests/
├── package.json
├── tsconfig.json
└── README.md
```
