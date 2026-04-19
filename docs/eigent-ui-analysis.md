# Eigent UI 风格分析与 Equality 改进建议

> 分析日期：2026-04-19  
> 对象：`example/eigent/` — 一个基于 Electron + React 的 AI Agent 桌面应用  
> 目的：提取可借鉴的视觉设计模式，为 Equality 界面优化提供参考

---

## 一、Eigent 技术栈

| 层面 | 技术 |
|------|------|
| CSS 框架 | **Tailwind CSS** + 插件 |
| UI 基础库 | **shadcn/ui** (new-york 风格) + Radix UI primitives |
| 组件变体 | CVA (class-variance-authority) |
| 动画 | **Framer Motion** + CSS keyframes |
| 图标 | Lucide React (`stroke-width: 1.5`) |
| 字体 | **Inter** (无衬线), SFMono-Regular / Menlo (等宽) |
| 主题 | CSS 变量三层 token 系统 (primitive → semantic → component) |

**Equality 当前栈**：纯手写 CSS + React + Tauri WebView2，无 CSS 框架和 UI 库。

---

## 二、色彩体系对比

### Eigent Dark 主题 — 深海蓝调

| Token | 色值 | 用途 |
|-------|------|------|
| 页面背景 | `#0d1424` | 最深层 |
| 一级背景 | `#121a2a` | 主容器 |
| 二级背景 | `#161f30` | 子区域 |
| 三级背景 | `#1c2640` | 卡片/抬升 |
| 主表面 | `#131b2b` | 面板 |
| 次表面 | `#1b2435` | 侧边栏等 |
| 三级表面 | `#222d41` | 卡片内部 |
| 正文文字 | `#f4f6ff` | 蓝白色 |
| 标题文字 | `#e8ecff` | 略亮 |
| 次要文字 | `#b0bdd8` | 淡蓝灰 |
| 禁用文字 | `rgba(148,163,184,0.35)` | 半透明 |
| 主边框 | `rgba(148,163,184,0.24)` | 半透明 |
| 次边框 | `rgba(148,163,184,0.12)` | 更淡 |
| 信息蓝 | `#7ab3ff` | 链接/高亮 |
| 成功绿 | `#4ade80` | 完成状态 |
| 警告黄 | `#facc15` | 提示 |
| 错误红 | `#f87171` | 报错 |

### Equality 当前色彩

| 用途 | 色值 | 问题 |
|------|------|------|
| 页面背景 | `#0f0f1a` | 偏紫黑，较为单调 |
| 卡片背景 | `#1a1a2e` | 只有两层层次 |
| 文字 | `#fff` / `rgba(255,255,255,0.5)` | 纯白，缺乏蓝调柔和感 |
| 边框 | `rgba(255,255,255,0.08~0.12)` | OK |
| 强调色 | `#0a84ff` | 系统蓝，可保留 |

### 💡 改进建议

**高优先级**：将背景色替换为深海蓝调 — `#0d1424` → `#131b2b` → `#1b2435` → `#222d41` 四级递进，文字改用 `#f4f6ff` 蓝白色，视觉更柔和高级。

---

## 三、排版系统

### Eigent

| 级别 | 字号 | 行高 |
|------|------|------|
| 正文 | 13px | 20px |
| 副文 | 15px | 22px |
| 标题 | 20px | 30px |
| 小字 | 10px | 16px |

字体：`Inter, -apple-system, sans-serif`  
字重分级：400（正文）/ 500（标签）/ 600（标题）/ 700（强调）  
抗锯齿：`-webkit-font-smoothing: antialiased`

### Equality 当前

字号：11~14px 混用，无统一系统  
字体：系统默认  
行高：未统一

### 💡 改进建议

- 引入 Inter 字体（或至少启用 `font-smoothing: antialiased`）
- 建立 3-4 个字号档：12px(小标签) / 13px(正文) / 15px(副标题) / 18px(大标题)

---

## 四、组件样式对比

### 4.1 聊天气泡

| 方面 | Eigent | Equality |
|------|--------|----------|
| 用户消息 | `rounded-xl border bg-surface-tertiary` 有容器感 | `border-radius:10px` 浅色背景 |
| AI 消息 | **透明背景无边框**，内容直出 | 同用户消息对称 |
| 消息操作 | hover 渐显，微小灰色按钮 | 始终显示，emoji按钮 |

**💡 建议**：AI 消息去掉背景卡片，让内容直接呈现；用户消息保留容器但改用半透明背景。操作按钮默认隐藏，hover 时渐显。

### 4.2 输入框

| 方面 | Eigent | Equality |
|------|--------|----------|
| 容器 | `rounded-2xl`(16px)，聚焦时边框变色 | `border-radius:12px` |
| 边框 | 半透明，focus 态 `ring-2 ring-blue-500/20` | 实色 |
| 发送按钮 | 有内容时渐变为绿色 | 固定蓝色 |
| 动画 | `transition-all duration-200` 边框色 | 无 |

**💡 建议**：增大圆角到 16px，添加 focus 发光 `box-shadow: 0 0 0 2px rgba(10,132,255,0.15)` 效果。

### 4.3 按钮

| 方面 | Eigent | Equality |
|------|--------|----------|
| 主按钮 | 内嵌高光 `inset 0 1px 0 0 rgba(255,255,255,0.33)` + 外阴影 | 纯色背景 |
| Ghost 按钮 | 透明，hover 半透明遮罩 | — |
| 圆角 | 8px (md) | 6px |

**💡 建议**：主按钮添加 `inset` 顶部高光条 + `box-shadow`，产生微浮雕效果。

### 4.4 侧边栏

| 方面 | Eigent | Equality |
|------|--------|----------|
| 展开/折叠 | Framer Motion 动画，ResizablePanel | 固定宽度 |
| 历史项 | 圆角卡片 + 微阴影 + hover 效果 | 简单列表 |
| 分组 | 按日期/置顶 分组标题 | — |

### 4.5 滚动条

| 方面 | Eigent | Equality |
|------|--------|----------|
| 默认 | **隐藏** | 始终显示 (thin) |
| hover | 渐显 6px 圆角 | — |
| 颜色 | `rgba(255,255,255,0.2)` | 默认 |

**💡 建议**：默认 `scrollbar-width: none`，hover 时渐显，或使用自定义 webkit 滚动条。

---

## 五、阴影系统

### Eigent — 多层柔和阴影（核心设计语言）

```css
/* Perfect Shadow — 6 层递进 */
box-shadow:
  0 8px 20px -2px rgba(29,33,41,0.10),
  0 32px 48px -12px rgba(29,33,41,0.12),
  0 96px 120px -12px rgba(65,74,92,0.06),
  0 108px 72px -16px rgba(65,74,92,0.08),
  0 32px 64px -8px rgba(113,153,189,0.12),
  0 8px 10px 0 rgba(113,153,189,0.12);

/* Button Shadow — 内嵌高光 + 外投影 */
box-shadow:
  inset 0 1px 0 0 rgba(255,255,255,0.33),
  0 3px 4px -1px rgba(0,0,0,0.25),
  0 0 0 1px rgba(212,212,212,0.25);
```

### Equality 当前

无系统性阴影，个别组件用 `box-shadow: 0 2px 8px rgba(0,0,0,0.3)`。

**💡 建议**：至少引入两级阴影变量 `--shadow-sm` / `--shadow-md`，用于卡片和弹出层。

---

## 六、动画/过渡

| 效果 | Eigent 实现 | Equality 状态 |
|------|-------------|---------------|
| 页面过渡 | Framer Motion `AnimatePresence` | 无 |
| 背景光晕 | 三色径向渐变 blob + motion 浮动 | 无 |
| 按钮 hover | `transition-all duration-200` | 部分 |
| 输入框聚焦 | `transition-colors duration-200` 边框渐变 | 无 |
| 进度条 | 120° shimmer 渐变滑动动画 | 无 |
| 毛玻璃 | `backdrop-filter: blur(75px)` + 内嵌阴影 | 无 |
| 消息进入 | Framer Motion 淡入 + 上移 | 无 |

**💡 建议**（低优先级）：考虑引入 Framer Motion 做消息进入动画和侧边栏收展动画。短期可先用 CSS `transition` + `@keyframes` 实现简单效果。

---

## 七、Glassmorphism（毛玻璃风格）

Eigent 的标志性视觉：

```css
.glass-container {
  backdrop-filter: blur(75px);
  background: rgba(13, 27, 43, 0.85);
  box-shadow: inset 0 1px 0 0 rgba(255,255,255,0.06);
  border: 1px solid rgba(148,163,184,0.12);
}
```

**💡 建议**：可在对话框/抽屉遮罩层使用 `backdrop-filter: blur(20px)`，效果显著且实现简单。

---

## 八、改进优先级路线图

### 🔴 高优先级（改动小，效果大）

1. **深海蓝色板替换**：背景 `#0f0f1a` → `#0d1424`，卡片 `#1a1a2e` → `#131b2b`/`#1b2435`
2. **文字蓝白化**：正文 `#fff` → `#f4f6ff`，次文字 → `#b0bdd8`
3. **半透明边框**：统一用 `rgba(148,163,184,0.12~0.24)`
4. **font-smoothing**：全局加 `-webkit-font-smoothing: antialiased`
5. **按钮内嵌高光**：主按钮加 `inset 0 1px 0 0 rgba(255,255,255,0.2)`

### 🟡 中优先级（适度改动）

6. **AI 消息去卡片化**：助手消息透明背景，减少视觉噪音
7. **输入框 focus 发光**：`box-shadow: 0 0 0 2px rgba(10,132,255,0.15)`
8. **隐藏滚动条 + hover 渐显**
9. **操作按钮 hover 渐显**：消息复制/重新生成等按钮默认 `opacity:0`
10. **两级阴影变量**：`--shadow-sm` / `--shadow-md`

### 🟢 低优先级（较大改动）

11. 引入 Inter 字体
12. Framer Motion 消息动画
13. 背景 Halo 装饰
14. Shimmer 加载动画
15. 侧边栏可调宽度

---

## 九、总结

Eigent 的视觉品质来自三个核心：

1. **深海蓝色调** — 冷色科技感，不刺眼
2. **多层阴影 + 半透明** — 深度层次感
3. **精致微交互** — 按钮高光、focus 发光、hover 渐显

Equality 可以通过替换色板（高优先级 1-3）在最小改动量下获得最大视觉提升，后续再逐步引入阴影系统和动画。
