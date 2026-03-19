# Proposal: CORS Dev Origin Bug 修复

## 背景

`cors-and-secrets-hardening` 变更（commit `f4b6aab`）在收紧 CORS 配置时引入了一个 bug，
导致应用在 `pnpm dev` 模式下所有前端 `fetch()` 请求被 403 拒绝，
表现为模型列表、工具列表、Skills、历史对话、token 统计全部无法加载。

## 现象

| 界面元素 | 表现 |
|---------|------|
| 模型选择下拉 | 一直显示"加载中…" |
| 工具 Tab | 已注册工具列表为空 |
| Skills Tab | 已加载 SKILLS (0) |
| 关于 Tab | token 消耗统计不显示 |
| 历史对话 | 无法显示 |

底部状态栏显示"Core 在线"，说明 Core 进程正常，问题在 CORS 层。

## 根本原因

Tauri dev 模式下，WebView 从 Vite dev server（`http://localhost:1420`）加载页面。
该页面发出的所有 `fetch()` 请求，Origin 头为 `http://localhost:1420`。

`cors-and-secrets-hardening` 引入的 CORS 代码：

```typescript
// 有 bug 的版本
if (process.env.NODE_ENV === 'development') {
  if (origin.startsWith('http://localhost:')) return cb(null, true)
}
```

**`tsx` / `pnpm dev` 不会设置 `NODE_ENV`**，所以这个条件永远是 `false`，
`http://localhost:1420` 不在任何白名单中，被拒绝返回 403。

排查过程中曾误以为是 DPAPI 实现（Task 2.5+2.6）导致的，
revert 了三个 commit 后问题依然存在，最终通过以下命令确认了真正原因：

```powershell
# 返回 403 → 确认是 CORS 问题
Invoke-WebRequest -Uri "http://localhost:18790/models" `
  -Headers @{"Origin"="http://localhost:1420"} -UseBasicParsing
```

## 修复方案

去掉 `NODE_ENV` 判断，直接允许所有 `localhost:*` 和 `127.0.0.1:*`：

```typescript
// 修复后
if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
  return cb(null, true)
}
```

**安全性分析**：本机回环地址本来就是可信的。
任何能访问 `localhost:18790` 的进程，已经具备本地访问权限。
开发/生产模式区分对安全性无实质影响。
外部网页（非 localhost origin）仍然被 403 拒绝。

## 关联改动

- `fix(cors)` commit `3508236`：修复 `index.ts` CORS 逻辑
- `.gitignore` 补全：`tmp_*`、`*.equality-bak`、`example/`、`openspec/*.html`
