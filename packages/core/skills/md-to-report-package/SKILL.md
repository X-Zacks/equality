---
name: md-to-report-package
description: '将分析型 Markdown 结构化为 VM 服务可接收的 Report Package。Use when: 用户已有 full_report.md 并要生成 slide report package 上传展示服务时、需要把 MD 提炼成 story/analysis/theme/manifest 时。NOT for: 直接渲染 raw MD；开发 VM 渲染器；打包任意 HTML/JS 工程。'
tools:
  - read_file
  - write_file
  - edit_file
  - bash
  - grep
  - list_dir
  - read_image
  - glob
equality:
  auto-generated: true
  source-model: gpt-5.4
  created: 2026-04-16
---

# md-to-report-package

## 何时使用

当用户已经有一份由 Equality 或其他流程生成的分析型 Markdown（例如 `full_report.md`），并希望把它转换成 **VM 展示服务可接收的标准 Report Package** 时，使用这个 Skill。

目标不是直接把 Markdown 变成最终网页，而是先把内容拆成受控的结构化包：

- `manifest.json`
- `analysis.json`
- `story.json`
- `theme.json`
- 可选：原始 `full_report.md`

随后再把这个 package 上传给 VM 服务，由服务负责校验、渲染和浏览器预览。

## 不适用场景

- 用户只是想阅读或润色 Markdown，不需要生成 package
- 用户要开发或修改 VM 服务的 renderer / preview shell
- 用户要上传任意 HTML/JS/CSS 工程到服务端
- 用户要求服务端直接理解 raw Markdown 并自动编排

## 输入 / 输出

| 项目 | 说明 |
|---|---|
| 输入 | 一份分析型 Markdown，常见包含标题、表格、结论、建议、风险分级、附录 |
| 必要上下文 | VM 服务接收格式、支持的 slide 模板、theme 约束 |
| 输出 | 一个标准 Report Package 目录，最小包含 `manifest.json`、`analysis.json`、`story.json`、`theme.json` |
| 可选输出 | 原始 `full_report.md` 副本、`assets/` 资源目录、最终 ZIP |

## 关键原则

1. **Markdown 只是内容草稿，不是服务契约**
   - raw MD 不直接上传给 VM 服务作为唯一输入。
2. **先结构化，再渲染**
   - 先提炼事实层和叙事层，再交给服务展示。
3. **服务端不理解自然语言，只消费受控 package**
   - package 要尽量消除歧义。
4. **改稿改 story / theme，不改最终 HTML**
   - 用户后续要求改汇报风格时，应回到 package 源定义重生成。
5. **不要把 PDF 导出当当前 Skill 的目标**
   - 当前重点是生成可预览 package，而不是打印版输出。

## package 最小结构

```text
report-package/
  manifest.json
  analysis.json
  story.json
  theme.json
  full_report.md      # 可选，作为附件保留
  assets/             # 可选
```

## 可执行脚本

当前 Skill 已附带一个可执行脚本：

```text
scripts/md_to_report_package.py
```

推荐调用方式：

```powershell
python C:/software/equality/packages/core/skills/md-to-report-package/scripts/md_to_report_package.py --input <markdown-path> --output-dir <package-dir> [--zip-output <zip-path>] [--copy-markdown]
```

参数说明：

| 参数 | 必填 | 说明 |
|---|---|---|
| `--input` | 是 | 输入 Markdown 文件路径 |
| `--output-dir` | 是 | 输出 package 目录 |
| `--zip-output` | 否 | 额外输出 ZIP 文件 |
| `--copy-markdown` | 否 | 将原始 Markdown 复制进 package 目录 |
| `--source-kind` | 否 | `manifest.source.kind`，默认 `excel` |
| `--source-label` | 否 | `manifest.source.label`，默认取 Markdown 中的数据来源 |
| `--footer-text` | 否 | `theme.layout.footerText` |

脚本当前针对 **Equality 风格的季度费用差异分析 Markdown 模板** 做了自动提炼。若 Markdown 章节结构变化较大，脚本会直接报错，而不是静默生成不可信内容。

## 执行步骤

### Step 1：确认输入是不是“分析型 Markdown”

先读取 Markdown，判断它是否已经具备这些元素：

- 报告标题 / 时间 /数据来源
- 总体结论
- 多个分维度章节
- 指标表或对比表
- 关键发现 / 风险 / 建议
- 附录或明细表

如果它只是普通笔记或零散文字，不要强行套这个 Skill。

### Step 2：提炼四层内容

把 Markdown 内容拆成四层：

#### 2.1 `manifest.json`
保存包级元信息：
- 标题
- 描述
- 语言
- 生成器名称
- createdAt
- source 标签
- tags

#### 2.2 `analysis.json`
保存事实层对象：
- metrics
- insights
- charts
- tables
- dataset summary

要求：
- 每个对象有稳定 `id`
- `story.json` 中引用的对象必须能在这里找到

#### 2.3 `story.json`
把 Markdown 转成 slide 编排：
- slide 顺序
- slide 类型
- 每页标题
- 每页引用的 metric/chart/insight/table

要求：
- 一页只讲一个重点
- 标题尽量“结论化”，不要只是章节名
- 优先使用平台已支持的固定模板

#### 2.4 `theme.json`
定义受控主题：
- light / dark
- brand 色
- 字体
- 16:9
- 页码 / 页脚
- presentation 壳层参数（如果目标服务已支持）

### Step 3：先做内容映射，再做页面编排

建议按这个顺序做：

1. 从 Markdown 提取指标、洞察、图表/表格候选
2. 生成 `analysis.json`
3. 再决定哪些内容值得成为 slide
4. 生成 `story.json`
5. 最后补 `manifest.json` 和 `theme.json`

不要一上来直接“凭感觉拼 slides”，否则后续很难维护。

### Step 4：把 Markdown 章节映射为 slide 候选

常见映射方法：

| Markdown 内容 | 建议 slide 类型 |
|---|---|
| 报告标题、期间、作者 | `cover` |
| 一句话总结、关键结论 | `summary-list` |
| 核心指标表 | `metric-cards` |
| 单个重点趋势/对比 | `single-chart` |
| 关键发现 + 证据 | `insight-with-chart` |
| 两类问题并列说明 | `compare-two-columns` |
| 行动清单 | `recommendation` |
| 明细表 / Top N / 优先级汇总 | `appendix-table` |

如果一个 Markdown 章节过长，不要硬塞进一页，应拆成 2~3 张 slides。

### Step 5：写 `story.json` 时遵守这些规则

1. 封面和摘要通常单独成页
2. 指标总览页放 4~6 个核心指标，不要过载
3. 每张分析页只放一个主结论
4. `chartRef` / `metricRefs` / `insightRef` / `tableRef` 必须引用到 `analysis.json`
5. 附录页只放真正需要保留的表，不要把所有 Markdown 表格都抄进去

### Step 6：生成 package 文件

在工作目录中创建输出目录，例如：

```text
<output-dir>/
  manifest.json
  analysis.json
  story.json
  theme.json
  full_report.md
```

如果用户后续要上传到 VM 服务，可以再额外打包成 ZIP。

### Step 7：做最小自检

生成后至少检查这些点：

- [ ] `manifest.json`、`analysis.json`、`story.json`、`theme.json` 四个文件都存在
- [ ] `story.json` 中每个 slide 都有 `id`、`type`、`title`
- [ ] 所有引用对象都能在 `analysis.json` 里找到
- [ ] theme 没有自由 CSS 或脚本注入字段
- [ ] 没有把 `.html`、`.js`、`.css` 作为上传必需物塞进 package
- [ ] 如果包含 Markdown，只把它当附件，不把它当渲染契约

### Step 8：交付时说清边界

输出给用户时要明确：

- 这是 **给 VM 服务消费的 package**，不是最终网页工程
- PPT 风格壳层、左侧 slide 栏、全屏放映模式属于 renderer 能力
- package 可以控制内容和主题，但不能单独决定完整的 PPT 交互外壳

## 推荐产物命名

- `report-package-<topic>/`
- `report-package-<topic>-stage/`（用于干净上传）
- `report-package-<topic>.zip`

## 实战建议

如果工作区里已经存在以下内容，应优先复用：

- `docs/vm-service-minimal-package.md`
- `vm-report-service/examples/report-package-full-report/`
- `vm-report-service/schemas/report-package/`

优先对齐已有 schema 和模板，不要重新发明另一套 package 结构。

## 完成标志

满足以下条件即可视为完成：

1. Markdown 的主要结论已经被拆成结构化 `analysis` + `story`
2. 产出的 package 能被 VM 服务接收
3. 预览时可以按 slide 浏览，而不是退回 raw Markdown 渲染
4. 后续若用户要求改稿，可以回到 `story.json` / `theme.json` 继续重生成
