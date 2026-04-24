# PPT Agent 可行性分析：基于 Equality 现有能力实现

> 分析日期：2026-04-24
> 参考文档：`docs/ppt_agent_framework_detailed.md`

## 一、结论摘要

**Equality 现有能力可以通过 Skills 组合实现文档中描述的第一阶段 MVP 的绝大部分功能，第二阶段的部分功能也可落地。** 核心路径是：编写一组 SKILL.md 指令，让 Agent 通过 `bash` 工具安装依赖、执行 Node.js/TypeScript 脚本来驱动 PptxGenJS 渲染，利用 `write_file` 生成中间 DeckSpec JSON，利用 `web_fetch`/`web_search` 获取素材，利用 `image_generate` 生成插图，利用 `subtask_spawn` 并行处理多页生成。

---

## 二、Equality 关键能力盘点

| 能力 | 工具 | 与 PPT Agent 的关系 |
|------|------|---------------------|
| 文件读写 | `read_file`, `write_file`, `edit_file`, `apply_patch` | 生成/修改 DeckSpec JSON、TS 脚本、输出 PPTX |
| 执行任意命令 | `bash` (PowerShell/bash, 前台+后台) | **核心能力**：运行 `npm install pptxgenjs`、`npx tsx render.ts` 等 |
| 网络请求 | `web_fetch`, `web_search` | 查找素材、下载图片、获取参考资料 |
| 图片生成 | `image_generate` (MiniMax image-01) | 为 PPT 页面生成插图 |
| 图片/PDF 理解 | `read_image`, `read_pdf`, `read_pdf_vision` | 读取用户上传的参考 PDF/图片，理解已有 PPT 截图 |
| 浏览器控制 | `browser` (Playwright) | PDF 预览截图、可视化 QA |
| 并行子任务 | `subtask_spawn` | 并行生成多页 SlideSpec、并行渲染 |
| 定时任务 | `cron` | 批量/定期 PPT 生成任务 |
| 长期记忆 | `memory_save/search` | 存储用户偏好的模板风格、品牌规范、历史 DeckSpec |
| 代码执行 | 通过 `bash` 运行 node/python/ts | 执行渲染脚本、Mermaid CLI、LibreOffice 转换 |

---

## 三、第一阶段 MVP 能力逐项映射

### 3.1 自然语言生成 DeckSpec ✅ 完全可行

| 文档要求 | Equality 实现方式 |
|----------|-------------------|
| 用户输入主题、受众、页数、风格 | Agent 自身的 LLM 能力，直接在对话中完成 |
| 输出结构化 DeckSpec JSON | Agent 生成 JSON → `write_file` 写入 `output/deckspec.json` |
| Zod Schema 校验 | 写一个 `validate-deckspec.ts` 脚本，通过 `bash` 执行 |

**Skill 设计**：`ppt-deck-planner` — 指导 Agent 按照 DeckSpec Schema 生成完整 JSON，包括 16:9 坐标边界约束、咨询风格标题、speaker notes 等规则。

### 3.2 PptxGenJS 渲染 PPTX ✅ 完全可行

| 文档要求 | Equality 实现方式 |
|----------|-------------------|
| 安装 pptxgenjs | `bash`: `npm install pptxgenjs` (一次性) |
| 从 DeckSpec 渲染 PPTX | `write_file` 写渲染脚本 → `bash`: `npx tsx render.ts` |
| 支持文本、bullet、图表、架构图、speaker notes | 渲染脚本中实现，Agent 按 Skill 指令生成脚本 |

**Skill 设计**：`ppt-renderer` — 包含完整的 PptxGenJS 渲染器模板代码，Agent 读取 DeckSpec 后生成定制渲染脚本并执行。

### 3.3 预设模板风格 ✅ 完全可行

| 文档要求 | Equality 实现方式 |
|----------|-------------------|
| 3-5 套配色、字体、布局规则 | 在 Skill 正文中定义 theme registry（JSON 格式） |
| 用户选择风格后应用 | Agent 读取 Skill 中的 theme 定义，merge 到 DeckSpec |

**Skill 设计**：`ppt-theme-library` — 内含 consulting-light / enterprise-blue / tech-dark / lenovo-business 等预设主题的完整 JSON 定义。

### 3.4 逐页修改 ✅ 完全可行

| 文档要求 | Equality 实现方式 |
|----------|-------------------|
| 用户指定第 N 页，自然语言修改 | Agent 读取 DeckSpec → 定位目标 slide → LLM 重写该 slide → `edit_file` 更新 JSON |
| 只改目标页，不影响其他页 | Skill 中明确约束：仅修改指定 slideNumber 的 SlideSpec |
| 修改后重新渲染 | 再次执行渲染脚本 |

**Skill 设计**：`ppt-slide-editor` — 指导 Agent 只修改目标 SlideSpec、保留 slideId/slideNumber、重新渲染。

### 3.5 基础 QA ✅ 完全可行

| 文档要求 | Equality 实现方式 |
|----------|-------------------|
| 对象越界检查 | Agent 自身遍历 DeckSpec JSON 检查坐标 |
| 标题过长 / bullet 过多 / 对象过多 | 同上，或写验证脚本通过 `bash` 执行 |
| 输出 issues 列表 | Agent 直接输出或写入文件 |

**Skill 设计**：`ppt-validator` — 定义检查规则列表（OBJECT_OVERFLOW / TITLE_TOO_LONG / TOO_MANY_BULLETS 等），Agent 逐条检查并报告。

### 3.6 基础架构图 ✅ 可行

| 文档要求 | Equality 实现方式 |
|----------|-------------------|
| PPT 原生 Shape 生成简单流程图 | 在渲染脚本中使用 `pptx.addShape()` / `pptx.addText()` |
| 水平架构图 / 分层图 | Skill 中提供 diagram 渲染代码模板 |

---

## 四、第二阶段企业级能力映射

### 4.1 pptx-automizer 套企业模板 ⚠️ 有条件可行

| 文档要求 | Equality 实现方式 | 限制 |
|----------|-------------------|------|
| 安装 pptx-automizer | `bash`: `npm install pptx-automizer` | ✅ |
| 读取企业模板 PPTX | 渲染脚本中使用 Automizer API | ✅ |
| 占位符命名规范 | Skill 中定义规范，需要模板制作者配合 | ⚠️ 需人工配合 |

### 4.2 上传 PPTX 作为模板 ⚠️ 有条件可行

| 文档要求 | Equality 实现方式 | 限制 |
|----------|-------------------|------|
| 用户上传 PPTX | 用户直接放到工作目录 | ⚠️ 无 Web 上传 UI |
| 自动解析 slide layout | 写解析脚本扫描 PPTX XML 结构 | ⚠️ 需要复杂脚本 |

### 4.3 复杂图形生成 ✅ 可行

| 文档要求 | Equality 实现方式 |
|----------|-------------------|
| Mermaid 流程图/架构图 | `bash`: `npx mmdc -i flow.mmd -o flow.svg` |
| SVG 转图片插入 PPT | 渲染脚本中 `addImage({ path: 'flow.svg' })` |
| PPT 原生 Shape 简单图 | 渲染脚本中 `addShape()` |

### 4.4 插图生成 ✅ 可行

| 文档要求 | Equality 实现方式 |
|----------|-------------------|
| 为 PPT 生成配图 | `image_generate` 工具（MiniMax image-01） |
| 图片插入 PPT | 生成图片保存到本地 → 渲染脚本中引用 |

### 4.5 PDF 预览与截图 QA ⚠️ 有条件可行

| 文档要求 | Equality 实现方式 | 限制 |
|----------|-------------------|------|
| PPTX → PDF | `bash`: `libreoffice --headless --convert-to pdf` | ⚠️ 需安装 LibreOffice |
| PDF → PNG 截图 | `browser` 工具打开 PDF 截图，或 `bash` 调用 pdftoppm | ⚠️ 环境依赖 |
| 视觉 QA | `read_image` 分析截图，检查视觉问题 | ✅ |

### 4.6 VBA/Macro 脚本 ✅ 可行

| 文档要求 | Equality 实现方式 |
|----------|-------------------|
| 生成 .bas 文件 | Agent 生成 VBA 代码 → `write_file` 写入 |
| 不默认注入 PPTX | Skill 中约束：只生成独立文件，不自动注入 |

### 4.7 企业素材库 ❌ 需外部集成

| 文档要求 | 限制 |
|----------|------|
| 从公司素材库检索图标/产品图 | Equality 无内置素材库 API，需要对接企业服务 |
| 可以通过 `web_fetch` 调用企业 API | ⚠️ 需要知道 API 地址和认证方式 |

---

## 五、推荐 Skill 组合方案

### 核心 Skills（第一阶段 MVP）

```
skills/
  ppt-agent/
    SKILL.md              # 主编排 Skill：接收需求，调度其他 Skills
  ppt-deck-planner/
    SKILL.md              # DeckSpec 生成：定义 Schema、Prompt 模板、生成规则
  ppt-renderer/
    SKILL.md              # PPTX 渲染：PptxGenJS 渲染器模板代码
    render-template.ts    # 可直接引用的渲染器模板
  ppt-theme-library/
    SKILL.md              # 主题库：预设配色/字体/布局规则
  ppt-slide-editor/
    SKILL.md              # 逐页修改：单页 SlideSpec 更新规则
  ppt-validator/
    SKILL.md              # QA 检查：越界/过长/密度/数量检查规则
```

### 扩展 Skills（第二阶段）

```
  ppt-template-automizer/
    SKILL.md              # 企业模板：pptx-automizer 使用指南和代码模板
  ppt-diagram/
    SKILL.md              # 复杂图形：Mermaid CLI + PPT Shape 双模式
  ppt-image/
    SKILL.md              # 插图生成：image_generate 调用规范 + 素材查找
  ppt-vba/
    SKILL.md              # VBA 脚本：各类 Macro 模板和安全约束
  ppt-render-qa/
    SKILL.md              # 渲染 QA：LibreOffice 导出 + 视觉检查流程
```

---

## 六、典型工作流示例

### 用户说："帮我做一份 6 页的 AI Agent 架构介绍 PPT，咨询风格，中文"

```
Agent 执行流程：

1. @ppt-agent (主编排 Skill 被激活)
   ├─ 读取 @ppt-deck-planner 获取 DeckSpec Schema 和 Prompt 模板
   ├─ LLM 生成完整 DeckSpec JSON
   ├─ write_file → output/deckspec.json
   │
2. 校验 DeckSpec
   ├─ 读取 @ppt-validator 获取检查规则
   ├─ 遍历 JSON 检查越界/过长等
   ├─ 如有问题 → 自动修复并更新 JSON
   │
3. 应用主题
   ├─ 读取 @ppt-theme-library 获取 consulting-light 配色
   ├─ merge 到 DeckSpec
   │
4. 渲染 PPTX
   ├─ 读取 @ppt-renderer 获取渲染器模板
   ├─ write_file → output/render.ts (基于模板 + DeckSpec 生成)
   ├─ bash: npm install pptxgenjs (如未安装)
   ├─ bash: npx tsx output/render.ts
   ├─ 输出 → output/presentation.pptx
   │
5. (可选) 生成插图
   ├─ image_generate → 为关键页面生成配图
   ├─ 更新 DeckSpec 的 image 对象路径
   ├─ 重新渲染
   │
6. 返回用户：✅ PPT 已生成在 output/presentation.pptx
```

### 用户说："把第 3 页改成对比表格形式"

```
1. read_file → output/deckspec.json
2. @ppt-slide-editor 激活
3. LLM 只重写 slideNumber=3 的 SlideSpec（改 layout 为 comparison，改 objects 为 table）
4. edit_file → 更新 deckspec.json 中的第 3 页
5. bash: npx tsx output/render.ts → 重新渲染
6. 返回用户：✅ 第 3 页已修改并重新生成
```

---

## 七、能力差距与风险

| 差距/风险 | 严重程度 | 缓解方案 |
|-----------|----------|----------|
| **DeckSpec 生成质量依赖模型能力** | 中 | Skill 中提供详细 few-shot 示例；Zod 校验脚本自动重试 |
| **PptxGenJS 执行环境** | 低 | 通过 `bash` + `npx tsx` 直接运行，无需额外配置 |
| **无 Web UI 上传模板** | 中 | 第一阶段用户直接把文件放工作目录即可 |
| **图表渲染精度** | 中 | PptxGenJS 的 chart API 有限，复杂图表可能需要截图方式 |
| **企业素材库对接** | 高 | 需要知道具体 API，可通过 `web_fetch` 对接 |
| **LibreOffice 依赖** | 中 | PDF 预览 QA 需要安装 LibreOffice，可作为可选功能 |
| **Token 消耗** | 中 | 20+ 页 PPT 的完整 DeckSpec 会很大，建议拆分生成（subtask_spawn 并行） |
| **渲染脚本生成可靠性** | 中 | Skill 中应提供经过验证的渲染器模板，Agent 只需填数据不需要从零写代码 |

---

## 八、与文档方案的核心差异

| 维度 | 文档方案 | Equality 方案 |
|------|----------|---------------|
| **架构** | 独立 Node.js 服务 + API 路由 | Agent + Skills + bash 执行 |
| **DeckSpec 生成** | 专用 Skill 函数 + zodResponseFormat | Agent LLM 直接生成 + 脚本校验 |
| **渲染** | 进程内调用 PptxGenJS | 写脚本 → bash 执行 npx tsx |
| **模板管理** | 数据库 + TemplateSpec | 文件系统 + Skill 定义 |
| **逐页修改** | 专用 slideEditor 函数 | Agent 读 JSON → LLM 修改 → edit_file |
| **部署** | Express API 服务 | 桌面 Agent（交互式） |
| **并发** | 无 | subtask_spawn 并行多页生成 |
| **记忆** | 无 | memory_save/search 存储用户偏好 |

**Equality 方案的优势**：
- 无需开发新代码，纯 Skill 配置即可启动
- 天然支持对话式交互、逐步修改
- 有记忆系统可保存品牌偏好
- 有子任务系统可并行处理
- 有浏览器工具可做视觉 QA

**Equality 方案的劣势**：
- 每次渲染需要写脚本 + bash 执行（比直接 API 慢）
- 无 Web 服务化能力（桌面应用场景）
- 大型 DeckSpec 可能超出单次对话 token 限制

---

## 九、实施建议

### 第一步（1-2 天）：环境准备 + 核心 Skill
1. 在工作目录下 `npm init` + `npm install pptxgenjs zod tsx`
2. 编写 `ppt-deck-planner` Skill（含 DeckSpec Schema 定义 + 生成 Prompt）
3. 编写 `ppt-renderer` Skill（含渲染器 TS 模板）
4. 手动测试：让 Agent 生成一份 3 页 PPT

### 第二步（2-3 天）：完善 MVP Skills
5. 编写 `ppt-theme-library`、`ppt-slide-editor`、`ppt-validator` Skills
6. 编写 `ppt-agent` 主编排 Skill（串联整个流程）
7. 测试逐页修改 + QA 检查

### 第三步（1 周）：扩展能力
8. 添加 `image_generate` 配图流程
9. 添加 Mermaid 架构图 Skill
10. 测试 pptx-automizer 企业模板流程

---

## 十、总结

| 阶段 | 可行性 | 所需投入 |
|------|--------|----------|
| 第一阶段 MVP | ✅ **高度可行** | 编写 5-6 个 SKILL.md，约 2-3 天 |
| 第二阶段企业级 | ⚠️ **部分可行** | 模板、素材库需额外对接，约 1-2 周 |
| 第三阶段产品化 | ❌ **不适合** | 服务化、权限、审计需要独立工程 |

**核心结论**：Equality 的 `bash` + `write_file` + `subtask_spawn` + `image_generate` + `memory` 组合，配合一组精心编写的 SKILL.md，可以在 **不修改任何 Equality 代码** 的前提下实现文档第一阶段的全部功能和第二阶段的大部分功能。关键在于 Skill 的质量——需要提供经过验证的渲染器模板代码和严格的 DeckSpec Schema 定义。
