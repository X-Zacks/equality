# Phase 4.5 — 浏览器控制（Browser Tool）

> **状态**: V1 完成（HTTP client）→ **V2 重构（内置 Playwright）**
> **优先级**: 🔴 P0
> **依赖**: Phase 2（Tools 基础设施）
> **方案**: ~~复用 OpenClaw browser server~~ → **内置 Playwright，开箱即用**

---

## 1. 问题陈述

用户用 Equality 做自动化测试或信息采集，**AI 需要能自动打开浏览器操控网页**。

| 场景 | 用户说法 | 期望行为 |
|------|---------|---------|
| 自动化测试 | "帮我测试这个查询功能" | 打开浏览器 → 找到入口 → 填表 → 验证结果 |
| 页面调试 | "这个页面样式不对" | 截图 + snapshot → 分析问题 |
| 信息采集 | "帮我从这个网站抓取商品列表" | 导航 → snapshot → 提取数据 |
| E2E 测试 | "帮我跑一下 E2E 测试" | navigate → 填表 → 点击 → 验证结果 |

---

## 2. V1 → V2 方案变更

### V1（已废弃）

HTTP client wrapper → 调用 OpenClaw browser server (127.0.0.1:9222)

**问题**：
- 用户需要额外安装 OpenClaw + 手动启动 browser server
- 对"技能平权"目标来说门槛过高

### V2（当前方案）

**内置 Playwright，零外部依赖，开箱即用**。

| 对比 | V1 (OpenClaw HTTP) | V2 (内置 Playwright) |
|------|-------------------|---------------------|
| 用户操作 | 装 OpenClaw + 配置 + 启动 | **无需任何操作** |
| 新增依赖 | 无 | playwright-core ~3MB（Chromium 首次自动下载 ~150MB） |
| 可控性 | 依赖 OpenClaw 版本 | **完全自主** |
| 内网访问 | ✅ | ✅ |
| 场景覆盖 | 与 OpenClaw 相同 | 相同（自动化测试、采集、调试） |

---

## 3. Schema 兼容

工具 name、description、inputSchema **不变**。底层从 HTTP fetch 改为直接 Playwright API。对 LLM 和用户零感知变化。

---

## 4. Scope

### V2 做什么

- 替换 `browser.ts`（HTTP client → Playwright API）
- 新增 `playwright-core` 依赖
- 实现简化版 ARIA snapshot（格式兼容 OpenClaw，LLM 已有训练数据）
- 实现 ref → 元素映射（snapshot 产生 ref，act 消费 ref）
- 浏览器 `headless: false`（用户可见操作过程）
- 全局单例浏览器实例 + 懒初始化
- 首次使用自动下载 Chromium

### V2 不做

- ❌ Chrome extension relay（接管用户 Chrome）
- ❌ multi-profile
- ❌ CDP 模式
- ❌ PDF 导出
