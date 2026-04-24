**自研 PPT 生成 Agent 实现框架代码设计**

第一阶段 + 第二阶段示例代码、关键 Skills、API 与工程落地建议

生成日期：2026-04-24

# **一、执行摘要**

本文档给出一个可作为企业内部自研 PPT 生成工具起点的 Agent 实现框架。整体方案采用"结构化 DeckSpec 作为系统核心状态，PPTX 作为可重复渲染的结果物"的设计原则，避免让大模型直接生成不可控的二进制文件。第一阶段聚焦 MVP 能力：自然语言生成 DeckSpec、PptxGenJS 生成可编辑 PPTX、预设模板风格、逐页修改、基础 QA。第二阶段扩展企业级能力：pptx-automizer 套企业模板、上传 PPTX 作为模板、架构图/流程图/Timeline 自动生成、公司素材库接入、VBA 宏脚本可选导出、PDF 预览与页面截图 QA。

代码以 TypeScript/Node.js 为主，便于和现代 Agent 服务、Web 前端、对象存储、企业身份认证、队列任务与沙箱执行环境集成。模型层可以接入 GPT-5.x、企业内部模型或多模型路由；渲染层优先使用 PptxGenJS；模板层建议使用 pptx-automizer；图形层可以组合 Mermaid/SVG、PPT 原生 Shape、图片生成模型与企业素材库。

- 核心状态：DeckSpec JSON，而不是 PPTX 文件本身。

- 第一阶段目标：快速实现可演示、可编辑、可逐页修改的 PPT Agent MVP。

- 第二阶段目标：支持企业模板、品牌规范、图表/插图/宏脚本、导出预览与质量检查。

- 关键 Skills：Deck Planner、Slide Spec Writer、Theme Skill、Template Skill、Slide Editor、Diagram Skill、Image Skill、Validation Skill、VBA Skill。

- 工程建议：所有 Agent 输出必须走 Schema 校验，所有 PPTX 生成必须支持重放、版本化与 QA。

# **二、总体架构与设计原则**

一个可产品化的 PPT 生成 Agent，不能只把模型当成"文案生成器"。更合理的架构是把 PPT 生成过程拆成一组可组合、可替换、可测试的 Skills。模型负责规划、推理和生成结构化中间结果；程序负责渲染、校验、版本管理、文件导出和安全边界控制。

  ------------------------------------------------------------------------------------------------------------------------------------------------------
  **层级**                **职责**                                                                **建议技术**
  ----------------------- ----------------------------------------------------------------------- ------------------------------------------------------
  入口层                  接收用户需求、文件、模板、风格、页数、语言、受众等参数                  Web UI / API Gateway / Auth

  Agent 编排层            调用 Deck Planner、Slide Editor、Theme、Diagram、Validation 等 Skills   OpenAI SDK / LangGraph / 自研 Orchestrator

  结构化状态层            保存 DeckSpec、SlideSpec、ThemeSpec、AssetSpec、EditHistory             PostgreSQL / MongoDB / Object Storage

  渲染层                  把 DeckSpec 转换为可编辑 PPTX                                           PptxGenJS

  模板层                  复用企业 PPT 模板、母版、占位符、品牌规范                               pptx-automizer

  可视资产层              生成架构图、插图、图标、Mermaid/SVG、截图                               Mermaid / SVG / Image API / 素材库

  QA 层                   检查越界、重叠、文本密度、字体、配色、引用和导出预览                    自研 Validator / LibreOffice / Playwright

  导出层                  输出 PPTX、PDF、图片预览、可选 VBA 脚本                                 LibreOffice headless / Office scripts / Macro module
  ------------------------------------------------------------------------------------------------------------------------------------------------------

核心设计原则如下：

1.  DeckSpec 优先：系统所有状态和修改都围绕 JSON Spec 进行，PPTX 是可重新生成的结果。

2.  模型不直接画 PPT：大模型输出意图、结构和内容，渲染器负责坐标、对象、图表和文件。

3.  每页可独立修改：每个 slideId 都是可版本化对象，逐页编辑只改目标 SlideSpec。

4.  模板与内容分离：Theme、Layout、Master Template、Content 分别建模，避免内容和样式耦合。

5.  可编辑优先：除复杂插图外，文本、图表、表格和基础架构图应尽量使用 PowerPoint 原生对象。

6.  QA 前置：生成 PPT 后必须自动检查文本溢出、对象越界、字体缺失和品牌不合规。

7.  安全隔离：宏脚本、外部图片、下载资源和文件转换应在沙箱或受控环境执行。

# **三、第一阶段 MVP：目标、能力和代码结构**

第一阶段不追求完整企业模板平台，而是快速打通"用户需求 → 结构化 DeckSpec → 可编辑 PPTX → 逐页修改 → 重新渲染"的闭环。建议用 2-4 周实现一个可演示原型。

  ------------------------------------------------------------------------------------------------------
  **第一阶段能力**        **说明**                                               **是否必须**
  ----------------------- ------------------------------------------------------ -----------------------
  自然语言生成 DeckSpec   根据主题、受众、页数和风格生成完整结构化演示文稿规格   必须

  PptxGenJS 渲染 PPTX     生成可编辑文本、表格、图表、架构图和 speaker notes     必须

  预设模板风格            内置 3-5 套配色、字体和基础布局规则                    必须

  逐页修改                用户指定第 N 页，用自然语言修改 SlideSpec 并重新渲染   必须

  基础 QA                 检查对象越界、标题过长、文本密度过高、对象数量异常     必须

  架构图基础生成          先用 PPT 原生 shape 生成简单流程图/架构图              建议
  ------------------------------------------------------------------------------------------------------

## **3.1 第一阶段目录结构**

> ppt-agent-mvp/
>
> package.json
>
> tsconfig.json
>
> .env.example
>
> src/
>
> index.ts
>
> config.ts
>
> schemas/
>
> deckSpec.ts
>
> requestSpec.ts
>
> agents/
>
> deckPlanner.ts
>
> slideEditor.ts
>
> skills/
>
> themeSkill.ts
>
> diagramSkill.ts
>
> validationSkill.ts
>
> renderers/
>
> pptxRenderer.ts
>
> api/
>
> deckRoutes.ts
>
> output/
>
> .gitkeep

## **3.2 package.json**

> {
>
> \"name\": \"ppt-agent-mvp\",
>
> \"version\": \"0.1.0\",
>
> \"type\": \"module\",
>
> \"scripts\": {
>
> \"dev\": \"tsx src/index.ts\",
>
> \"build\": \"tsc\",
>
> \"start\": \"node dist/index.js\"
>
> },
>
> \"dependencies\": {
>
> \"dotenv\": \"\^16.4.5\",
>
> \"openai\": \"\^4.0.0\",
>
> \"pptxgenjs\": \"\^3.12.0\",
>
> \"zod\": \"\^3.23.8\"
>
> },
>
> \"devDependencies\": {
>
> \"@types/node\": \"\^20.0.0\",
>
> \"tsx\": \"\^4.19.0\",
>
> \"typescript\": \"\^5.5.0\"
>
> }
>
> }

## **3.3 tsconfig.json**

> {
>
> \"compilerOptions\": {
>
> \"target\": \"ES2022\",
>
> \"module\": \"ES2022\",
>
> \"moduleResolution\": \"Bundler\",
>
> \"strict\": true,
>
> \"esModuleInterop\": true,
>
> \"skipLibCheck\": true,
>
> \"outDir\": \"dist\",
>
> \"rootDir\": \"src\"
>
> },
>
> \"include\": \[\"src/\*\*/\*.ts\"\]
>
> }

## **3.4 配置文件：src/config.ts**

> import \"dotenv/config\";
>
> export const config = {
>
> openaiApiKey: process.env.OPENAI_API_KEY \|\| \"\",
>
> model: process.env.OPENAI_MODEL \|\| \"gpt-5.4\",
>
> defaultLanguage: process.env.DEFAULT_LANGUAGE \|\| \"zh\",
>
> outputDir: process.env.OUTPUT_DIR \|\| \"src/output\"
>
> };
>
> export function assertConfig() {
>
> if (!config.openaiApiKey) {
>
> throw new Error(\"OPENAI_API_KEY is required\");
>
> }
>
> }

## **3.5 核心 Schema：DeckSpec 与 SlideSpec**

DeckSpec 是整个系统的核心协议。它应该足够稳定，以便后续支持模型替换、模板替换和渲染器替换。第一阶段可以先简化，但必须保留 slideId、layout、objects、theme、speakerNotes 等字段。

> // src/schemas/deckSpec.ts
>
> import { z } from \"zod\";
>
> export const ThemeSchema = z.object({
>
> name: z.string(),
>
> primaryColor: z.string(),
>
> secondaryColor: z.string(),
>
> accentColor: z.string(),
>
> backgroundColor: z.string(),
>
> titleFont: z.string(),
>
> bodyFont: z.string()
>
> });
>
> export const SlideObjectSchema = z.object({
>
> id: z.string(),
>
> type: z.enum(\[
>
> \"text\",
>
> \"bullet_list\",
>
> \"image\",
>
> \"chart\",
>
> \"table\",
>
> \"diagram\",
>
> \"callout\"
>
> \]),
>
> content: z.any(),
>
> x: z.number(),
>
> y: z.number(),
>
> w: z.number(),
>
> h: z.number(),
>
> style: z.record(z.any()).optional()
>
> });
>
> export const SlideSpecSchema = z.object({
>
> slideId: z.string(),
>
> slideNumber: z.number(),
>
> layout: z.enum(\[
>
> \"title\",
>
> \"section\",
>
> \"two_column\",
>
> \"content_with_visual\",
>
> \"comparison\",
>
> \"timeline\",
>
> \"architecture\",
>
> \"summary\"
>
> \]),
>
> title: z.string(),
>
> subtitle: z.string().optional(),
>
> speakerNotes: z.string().optional(),
>
> objects: z.array(SlideObjectSchema),
>
> citations: z.array(z.string()).optional()
>
> });
>
> export const DeckSpecSchema = z.object({
>
> deckId: z.string(),
>
> deckTitle: z.string(),
>
> audience: z.string(),
>
> purpose: z.string(),
>
> language: z.enum(\[\"zh\", \"en\"\]),
>
> theme: ThemeSchema,
>
> slides: z.array(SlideSpecSchema)
>
> });
>
> export type DeckSpec = z.infer\<typeof DeckSpecSchema\>;
>
> export type SlideSpec = z.infer\<typeof SlideSpecSchema\>;
>
> export type SlideObject = z.infer\<typeof SlideObjectSchema\>;

## **3.6 Deck Planner Skill：生成完整 DeckSpec**

Deck Planner 是第一阶段最重要的 Skill。它负责将用户自然语言需求转换成完整 DeckSpec。生产环境中建议把 prompt 模板和 schema 版本化，避免随着模型版本变化导致输出风格不可控。

> // src/agents/deckPlanner.ts
>
> import OpenAI from \"openai\";
>
> import { zodResponseFormat } from \"openai/helpers/zod\";
>
> import { config } from \"../config.js\";
>
> import { DeckSpec, DeckSpecSchema } from \"../schemas/deckSpec.js\";
>
> const client = new OpenAI({ apiKey: config.openaiApiKey });
>
> export async function generateDeckSpec(input: {
>
> topic: string;
>
> audience: string;
>
> purpose: string;
>
> slideCount: number;
>
> language: \"zh\" \| \"en\";
>
> style: string;
>
> }): Promise\<DeckSpec\> {
>
> const response = await client.beta.chat.completions.parse({
>
> model: config.model,
>
> messages: \[
>
> {
>
> role: \"system\",
>
> content: \`
>
> You are an enterprise presentation architect.
>
> Generate a structured DeckSpec for a 16:9 PowerPoint deck.
>
> Rules:
>
> 1\. Return only valid structured data that matches the schema.
>
> 2\. Keep every slide editable: use text, bullet_list, chart, table and diagram objects.
>
> 3\. Use inch coordinates. Slide size is 13.33 x 7.5.
>
> 4\. Avoid placing objects outside the slide boundary.
>
> 5\. Use consulting-style headlines: each title should express a conclusion.
>
> 6\. Every slide should include speakerNotes.
>
> \`
>
> },
>
> {
>
> role: \"user\",
>
> content: \`
>
> Topic: \${input.topic}
>
> Audience: \${input.audience}
>
> Purpose: \${input.purpose}
>
> Slide count: \${input.slideCount}
>
> Language: \${input.language}
>
> Style: \${input.style}
>
> Generate a complete DeckSpec.
>
> \`
>
> }
>
> \],
>
> response_format: zodResponseFormat(DeckSpecSchema, \"deck_spec\")
>
> });
>
> const deck = response.choices\[0\].message.parsed;
>
> if (!deck) throw new Error(\"Failed to generate DeckSpec\");
>
> return deck;
>
> }

## **3.7 Theme Skill：预设模板风格、配色和字体**

第一阶段不需要复杂模板系统，但应该把主题独立出来。这样后续可以做到同一份 DeckSpec 在不同模板和配色下重新渲染，而不需要重新生成内容。

> // src/skills/themeSkill.ts
>
> import { DeckSpec } from \"../schemas/deckSpec.js\";
>
> export type PresetTheme =
>
> \| \"consulting-light\"
>
> \| \"enterprise-blue\"
>
> \| \"tech-dark\"
>
> \| \"lenovo-business\";
>
> const themeRegistry: Record\<PresetTheme, DeckSpec\[\"theme\"\]\> = {
>
> \"consulting-light\": {
>
> name: \"Consulting Light\",
>
> primaryColor: \"#1F4E79\",
>
> secondaryColor: \"#5B9BD5\",
>
> accentColor: \"#ED7D31\",
>
> backgroundColor: \"#FFFFFF\",
>
> titleFont: \"Aptos Display\",
>
> bodyFont: \"Aptos\"
>
> },
>
> \"enterprise-blue\": {
>
> name: \"Enterprise Blue\",
>
> primaryColor: \"#0B3D91\",
>
> secondaryColor: \"#2E75B6\",
>
> accentColor: \"#00A6A6\",
>
> backgroundColor: \"#F7F9FC\",
>
> titleFont: \"Arial\",
>
> bodyFont: \"Arial\"
>
> },
>
> \"tech-dark\": {
>
> name: \"Tech Dark\",
>
> primaryColor: \"#FFFFFF\",
>
> secondaryColor: \"#4F9CF9\",
>
> accentColor: \"#70AD47\",
>
> backgroundColor: \"#111827\",
>
> titleFont: \"Segoe UI\",
>
> bodyFont: \"Segoe UI\"
>
> },
>
> \"lenovo-business\": {
>
> name: \"Lenovo Business\",
>
> primaryColor: \"#E2231A\",
>
> secondaryColor: \"#333333\",
>
> accentColor: \"#F5A623\",
>
> backgroundColor: \"#FFFFFF\",
>
> titleFont: \"Arial\",
>
> bodyFont: \"Arial\"
>
> }
>
> };
>
> export function applyPresetTheme(deck: DeckSpec, theme: PresetTheme): DeckSpec {
>
> return { \...deck, theme: themeRegistry\[theme\] };
>
> }
>
> export function getAvailableThemes() {
>
> return Object.keys(themeRegistry);
>
> }

## **3.8 PptxGenJS 渲染器：从 DeckSpec 生成可编辑 PPTX**

渲染器应该只做确定性工作，不应该再调用模型。这样可以保证同一份 DeckSpec 多次渲染结果一致。第一阶段渲染器支持标题、文本、bullet、图表、基础架构图和 speaker notes 即可。

> // src/renderers/pptxRenderer.ts
>
> import pptxgen from \"pptxgenjs\";
>
> import { DeckSpec, SlideSpec, SlideObject } from \"../schemas/deckSpec.js\";
>
> function color(hex: string) {
>
> return hex.replace(\"#\", \"\");
>
> }
>
> export async function renderDeckWithPptxGen(deck: DeckSpec, outputPath: string) {
>
> const pptx = new pptxgen();
>
> pptx.layout = \"LAYOUT_WIDE\";
>
> pptx.author = \"PPT Agent\";
>
> pptx.subject = deck.purpose;
>
> pptx.title = deck.deckTitle;
>
> pptx.company = \"Internal AI Platform\";
>
> pptx.theme = {
>
> headFontFace: deck.theme.titleFont,
>
> bodyFontFace: deck.theme.bodyFont,
>
> lang: deck.language === \"zh\" ? \"zh-CN\" : \"en-US\"
>
> };
>
> for (const slideSpec of deck.slides) {
>
> renderSlide(pptx, slideSpec, deck);
>
> }
>
> await pptx.writeFile({ fileName: outputPath });
>
> }
>
> function renderSlide(pptx: pptxgen, slideSpec: SlideSpec, deck: DeckSpec) {
>
> const slide = pptx.addSlide();
>
> slide.background = { color: color(deck.theme.backgroundColor) };
>
> slide.addText(slideSpec.title, {
>
> x: 0.55,
>
> y: 0.25,
>
> w: 12.2,
>
> h: 0.55,
>
> fontFace: deck.theme.titleFont,
>
> fontSize: 24,
>
> bold: true,
>
> color: color(deck.theme.primaryColor),
>
> margin: 0.02,
>
> fit: \"shrink\"
>
> });
>
> if (slideSpec.subtitle) {
>
> slide.addText(slideSpec.subtitle, {
>
> x: 0.6,
>
> y: 0.86,
>
> w: 11.8,
>
> h: 0.35,
>
> fontFace: deck.theme.bodyFont,
>
> fontSize: 12,
>
> color: \"666666\",
>
> fit: \"shrink\"
>
> });
>
> }
>
> for (const obj of slideSpec.objects) {
>
> renderObject(slide, obj, deck);
>
> }
>
> if (slideSpec.speakerNotes) {
>
> slide.addNotes(slideSpec.speakerNotes);
>
> }
>
> }
>
> function renderObject(slide: pptxgen.Slide, obj: SlideObject, deck: DeckSpec) {
>
> switch (obj.type) {
>
> case \"text\":
>
> case \"callout\":
>
> slide.addText(String(obj.content), {
>
> x: obj.x,
>
> y: obj.y,
>
> w: obj.w,
>
> h: obj.h,
>
> fontFace: deck.theme.bodyFont,
>
> fontSize: obj.style?.fontSize \|\| 14,
>
> bold: obj.style?.bold \|\| false,
>
> color: color(obj.style?.color \|\| \"#333333\"),
>
> margin: 0.08,
>
> fit: \"shrink\"
>
> });
>
> return;
>
> case \"bullet_list\":
>
> slide.addText(
>
> (obj.content.items \|\| \[\]).map((item: string) =\> ({
>
> text: item,
>
> options: { bullet: { indent: 12 } }
>
> })),
>
> {
>
> x: obj.x,
>
> y: obj.y,
>
> w: obj.w,
>
> h: obj.h,
>
> fontFace: deck.theme.bodyFont,
>
> fontSize: obj.style?.fontSize \|\| 13,
>
> color: color(obj.style?.color \|\| \"#333333\"),
>
> breakLine: false,
>
> fit: \"shrink\"
>
> }
>
> );
>
> return;
>
> case \"chart\":
>
> slide.addChart(\"bar\", \[
>
> {
>
> name: obj.content.seriesName \|\| \"Series\",
>
> labels: obj.content.labels \|\| \[\],
>
> values: obj.content.values \|\| \[\]
>
> }
>
> \], {
>
> x: obj.x,
>
> y: obj.y,
>
> w: obj.w,
>
> h: obj.h,
>
> showTitle: true,
>
> title: obj.content.title \|\| \"\",
>
> showLegend: false,
>
> valAxisLabelFontFace: deck.theme.bodyFont,
>
> catAxisLabelFontFace: deck.theme.bodyFont
>
> });
>
> return;
>
> case \"image\":
>
> if (obj.content.path) {
>
> slide.addImage({ path: obj.content.path, x: obj.x, y: obj.y, w: obj.w, h: obj.h });
>
> }
>
> return;
>
> case \"diagram\":
>
> renderDiagram(slide, obj, deck);
>
> return;
>
> default:
>
> slide.addText(\`\[Unsupported object: \${obj.type}\]\`, {
>
> x: obj.x, y: obj.y, w: obj.w, h: obj.h, color: \"FF0000\"
>
> });
>
> }
>
> }
>
> function renderDiagram(slide: pptxgen.Slide, obj: SlideObject, deck: DeckSpec) {
>
> const nodes = obj.content.nodes \|\| \[\];
>
> const gap = 0.15;
>
> const nodeW = (obj.w - gap \* (nodes.length - 1)) / Math.max(nodes.length, 1);
>
> nodes.forEach((node: any, idx: number) =\> {
>
> const x = obj.x + idx \* (nodeW + gap);
>
> slide.addShape(\"roundRect\", {
>
> x,
>
> y: obj.y,
>
> w: nodeW,
>
> h: obj.h,
>
> rectRadius: 0.08,
>
> fill: { color: color(deck.theme.secondaryColor) },
>
> line: { color: color(deck.theme.primaryColor), width: 1 }
>
> });
>
> slide.addText(node.label, {
>
> x: x + 0.06,
>
> y: obj.y + 0.1,
>
> w: nodeW - 0.12,
>
> h: obj.h - 0.2,
>
> fontFace: deck.theme.bodyFont,
>
> fontSize: 11,
>
> color: \"FFFFFF\",
>
> align: \"center\",
>
> valign: \"mid\",
>
> fit: \"shrink\"
>
> });
>
> });
>
> }

## **3.9 Slide Editor Skill：逐页修改**

逐页修改的关键是"只修改目标 SlideSpec"。不要把整份 PPT 发给模型重新生成，否则会导致用户修改第 3 页后第 5 页也发生不可预测变化。Slide Editor 只接收当前 DeckSpec、目标页和用户指令，输出更新后的单页 SlideSpec。

> // src/agents/slideEditor.ts
>
> import OpenAI from \"openai\";
>
> import { zodResponseFormat } from \"openai/helpers/zod\";
>
> import { config } from \"../config.js\";
>
> import { DeckSpec, SlideSpecSchema } from \"../schemas/deckSpec.js\";
>
> const client = new OpenAI({ apiKey: config.openaiApiKey });
>
> export async function editSingleSlide(input: {
>
> deck: DeckSpec;
>
> slideNumber: number;
>
> instruction: string;
>
> }): Promise\<DeckSpec\> {
>
> const target = input.deck.slides.find(s =\> s.slideNumber === input.slideNumber);
>
> if (!target) throw new Error(\`Slide \${input.slideNumber} not found\`);
>
> const response = await client.beta.chat.completions.parse({
>
> model: config.model,
>
> messages: \[
>
> {
>
> role: \"system\",
>
> content: \`
>
> You are a slide editing agent.
>
> Update only the requested slide.
>
> Preserve slideId and slideNumber.
>
> Keep objects inside 13.33 x 7.5 slide boundary.
>
> Keep text concise and suitable for executive presentation.
>
> Return the updated SlideSpec only.
>
> \`
>
> },
>
> {
>
> role: \"user\",
>
> content: \`
>
> Theme:
>
> \${JSON.stringify(input.deck.theme, null, 2)}
>
> Current slide:
>
> \${JSON.stringify(target, null, 2)}
>
> Instruction:
>
> \${input.instruction}
>
> \`
>
> }
>
> \],
>
> response_format: zodResponseFormat(SlideSpecSchema, \"updated_slide\")
>
> });
>
> const updated = response.choices\[0\].message.parsed;
>
> if (!updated) throw new Error(\"Failed to update slide\");
>
> return {
>
> \...input.deck,
>
> slides: input.deck.slides.map(s =\> s.slideNumber === input.slideNumber ? updated : s)
>
> };
>
> }

## **3.10 Diagram Skill：第一阶段基础架构图生成**

> // src/skills/diagramSkill.ts
>
> import { SlideObject } from \"../schemas/deckSpec.js\";
>
> export function createHorizontalArchitectureDiagram(input: {
>
> id: string;
>
> x: number;
>
> y: number;
>
> w: number;
>
> h: number;
>
> labels: string\[\];
>
> }): SlideObject {
>
> return {
>
> id: input.id,
>
> type: \"diagram\",
>
> x: input.x,
>
> y: input.y,
>
> w: input.w,
>
> h: input.h,
>
> content: {
>
> diagramType: \"horizontal_architecture\",
>
> nodes: input.labels.map((label, idx) =\> ({ id: \`node\_\${idx + 1}\`, label }))
>
> },
>
> style: { rounded: true, shadow: false }
>
> };
>
> }
>
> export function createLayeredDiagram(input: {
>
> id: string;
>
> x: number;
>
> y: number;
>
> w: number;
>
> h: number;
>
> layers: string\[\];
>
> }): SlideObject {
>
> return {
>
> id: input.id,
>
> type: \"diagram\",
>
> x: input.x,
>
> y: input.y,
>
> w: input.w,
>
> h: input.h,
>
> content: {
>
> diagramType: \"layered\",
>
> nodes: input.layers.map((label, idx) =\> ({ id: \`layer\_\${idx + 1}\`, label }))
>
> },
>
> style: { rounded: true, shadow: true }
>
> };
>
> }

## **3.11 Validation Skill：基础质量检查**

> // src/skills/validationSkill.ts
>
> import { DeckSpec } from \"../schemas/deckSpec.js\";
>
> export type ValidationIssue = {
>
> slideNumber: number;
>
> severity: \"info\" \| \"warning\" \| \"error\";
>
> code: string;
>
> message: string;
>
> };
>
> export function validateDeckSpec(deck: DeckSpec): ValidationIssue\[\] {
>
> const issues: ValidationIssue\[\] = \[\];
>
> for (const slide of deck.slides) {
>
> if (slide.title.length \> 80) {
>
> issues.push({
>
> slideNumber: slide.slideNumber,
>
> severity: \"warning\",
>
> code: \"TITLE_TOO_LONG\",
>
> message: \"Slide title is longer than 80 characters.\"
>
> });
>
> }
>
> if (slide.objects.length \> 8) {
>
> issues.push({
>
> slideNumber: slide.slideNumber,
>
> severity: \"warning\",
>
> code: \"TOO_MANY_OBJECTS\",
>
> message: \"Slide has too many objects and may look crowded.\"
>
> });
>
> }
>
> for (const obj of slide.objects) {
>
> if (obj.x \< 0 \|\| obj.y \< 0 \|\| obj.w \<= 0 \|\| obj.h \<= 0) {
>
> issues.push({
>
> slideNumber: slide.slideNumber,
>
> severity: \"error\",
>
> code: \"INVALID_OBJECT_BOX\",
>
> message: \`Object \${obj.id} has invalid position or size.\`
>
> });
>
> }
>
> if (obj.x + obj.w \> 13.33 \|\| obj.y + obj.h \> 7.5) {
>
> issues.push({
>
> slideNumber: slide.slideNumber,
>
> severity: \"warning\",
>
> code: \"OBJECT_OVERFLOW\",
>
> message: \`Object \${obj.id} may overflow slide boundary.\`
>
> });
>
> }
>
> if (obj.type === \"bullet_list\" && Array.isArray(obj.content?.items)) {
>
> if (obj.content.items.length \> 6) {
>
> issues.push({
>
> slideNumber: slide.slideNumber,
>
> severity: \"warning\",
>
> code: \"TOO_MANY_BULLETS\",
>
> message: \`Object \${obj.id} has too many bullet points.\`
>
> });
>
> }
>
> }
>
> }
>
> }
>
> return issues;
>
> }

## **3.12 第一阶段主流程示例**

> // src/index.ts
>
> import { assertConfig } from \"./config.js\";
>
> import { generateDeckSpec } from \"./agents/deckPlanner.js\";
>
> import { editSingleSlide } from \"./agents/slideEditor.js\";
>
> import { applyPresetTheme } from \"./skills/themeSkill.js\";
>
> import { createHorizontalArchitectureDiagram } from \"./skills/diagramSkill.js\";
>
> import { validateDeckSpec } from \"./skills/validationSkill.js\";
>
> import { renderDeckWithPptxGen } from \"./renderers/pptxRenderer.js\";
>
> async function main() {
>
> assertConfig();
>
> let deck = await generateDeckSpec({
>
> topic: \"Enterprise PPT Generation Agent\",
>
> audience: \"CIO and enterprise architecture team\",
>
> purpose: \"Explain how to build a secure and editable PPT generation platform\",
>
> slideCount: 6,
>
> language: \"en\",
>
> style: \"consulting-light\"
>
> });
>
> deck = applyPresetTheme(deck, \"consulting-light\");
>
> const slide3 = deck.slides.find(s =\> s.slideNumber === 3);
>
> if (slide3) {
>
> slide3.objects.push(createHorizontalArchitectureDiagram({
>
> id: \"agent_architecture\",
>
> x: 0.8,
>
> y: 2.1,
>
> w: 11.8,
>
> h: 1.2,
>
> labels: \[\"User Brief\", \"Deck Planner\", \"Slide Spec\", \"Renderer\", \"QA\"\]
>
> }));
>
> }
>
> deck = await editSingleSlide({
>
> deck,
>
> slideNumber: 2,
>
> instruction: \"Rewrite the slide in a sharper consulting style with less text.\"
>
> });
>
> const issues = validateDeckSpec(deck);
>
> if (issues.length \> 0) console.table(issues);
>
> await renderDeckWithPptxGen(deck, \"src/output/mvp-demo.pptx\");
>
> console.log(\"Generated: src/output/mvp-demo.pptx\");
>
> }
>
> main().catch(console.error);

# **四、第二阶段企业级能力：目标、能力和代码结构**

第二阶段的重点是把原型升级成企业内部可用的平台能力。核心变化是：引入模板库、企业品牌规范、素材库、复杂图形、PDF 预览、截图 QA、可选 VBA/Macro 导出、异步任务和文件版本化。

  --------------------------------------------------------------------------------------------------------------------------
  **第二阶段能力**            **说明**                                         **建议实现**
  --------------------------- ------------------------------------------------ ---------------------------------------------
  pptx-automizer 套企业模板   读取企业模板 PPTX，复用母版、占位符和已有版式    模板占位符命名 + Automizer 修改

  上传 PPTX 作为模板          用户上传公司模板后自动解析可用 slide layout      模板扫描 + layout registry

  复杂图形生成                支持架构图、流程图、Timeline、矩阵图、能力地图   PPT 原生 Shape + Mermaid/SVG

  企业素材库接入              从公司素材库检索图标、插图、产品图、品牌图       AssetProvider 接口

  VBA/Macro 脚本导出          可选生成 .bas 或 .vba 脚本，不默认注入 PPTX      Macro Skill + 安全提示

  PDF 预览和截图 QA           生成 PPTX 后导出 PDF/PNG，自动检测视觉问题       LibreOffice Headless + Screenshot validator

  异步任务                    大文件和批量生成转为异步任务                     Queue / Worker / Object Storage
  --------------------------------------------------------------------------------------------------------------------------

## **4.1 第二阶段目录结构**

> ppt-agent-enterprise/
>
> package.json
>
> src/
>
> app.ts
>
> config.ts
>
> schemas/
>
> deckSpec.ts
>
> templateSpec.ts
>
> assetSpec.ts
>
> jobSpec.ts
>
> agents/
>
> deckPlanner.ts
>
> slideEditor.ts
>
> templateSelector.ts
>
> visualPlanner.ts
>
> skills/
>
> themeSkill.ts
>
> templateSkill.ts
>
> diagramSkill.ts
>
> mermaidSkill.ts
>
> imageSkill.ts
>
> assetLibrarySkill.ts
>
> validationSkill.ts
>
> renderQaSkill.ts
>
> vbaSkill.ts
>
> renderers/
>
> pptxRenderer.ts
>
> templateRenderer.ts
>
> previewRenderer.ts
>
> services/
>
> deckStore.ts
>
> jobQueue.ts
>
> fileStorage.ts
>
> api/
>
> deckRoutes.ts
>
> templateRoutes.ts
>
> assetRoutes.ts
>
> jobRoutes.ts
>
> templates/
>
> corporate-template.pptx
>
> output/

## **4.2 TemplateSpec：企业模板建模**

第二阶段需要把模板作为一等公民。模板不是一个文件路径，而是一组可被 Agent 理解和选择的能力：有哪些版式、每个版式有哪些占位符、适合什么页面类型、要求什么字体和颜色。

> // src/schemas/templateSpec.ts
>
> import { z } from \"zod\";
>
> export const PlaceholderSchema = z.object({
>
> name: z.string(),
>
> type: z.enum(\[\"title\", \"subtitle\", \"body\", \"image\", \"chart\", \"diagram\", \"footer\"\]),
>
> required: z.boolean().default(false)
>
> });
>
> export const LayoutMappingSchema = z.object({
>
> layoutId: z.string(),
>
> sourceSlideNumber: z.number(),
>
> supportedSlideLayouts: z.array(z.string()),
>
> placeholders: z.array(PlaceholderSchema)
>
> });
>
> export const TemplateSpecSchema = z.object({
>
> templateId: z.string(),
>
> name: z.string(),
>
> description: z.string().optional(),
>
> pptxPath: z.string(),
>
> brand: z.string().optional(),
>
> defaultTitleFont: z.string(),
>
> defaultBodyFont: z.string(),
>
> primaryColor: z.string(),
>
> secondaryColor: z.string(),
>
> accentColor: z.string(),
>
> layouts: z.array(LayoutMappingSchema)
>
> });
>
> export type TemplateSpec = z.infer\<typeof TemplateSpecSchema\>;

## **4.3 Template Skill：根据页面类型选择模板 Layout**

> // src/skills/templateSkill.ts
>
> import { SlideSpec } from \"../schemas/deckSpec.js\";
>
> import { TemplateSpec } from \"../schemas/templateSpec.js\";
>
> export function selectTemplateLayout(slide: SlideSpec, template: TemplateSpec) {
>
> const candidates = template.layouts.filter(layout =\>
>
> layout.supportedSlideLayouts.includes(slide.layout)
>
> );
>
> if (candidates.length \> 0) return candidates\[0\];
>
> const fallback = template.layouts.find(layout =\>
>
> layout.supportedSlideLayouts.includes(\"content_with_visual\")
>
> );
>
> if (!fallback) {
>
> throw new Error(\`No template layout found for slide layout: \${slide.layout}\`);
>
> }
>
> return fallback;
>
> }
>
> export function applyTemplateTheme(deck: any, template: TemplateSpec) {
>
> return {
>
> \...deck,
>
> theme: {
>
> name: template.name,
>
> primaryColor: template.primaryColor,
>
> secondaryColor: template.secondaryColor,
>
> accentColor: template.accentColor,
>
> backgroundColor: \"#FFFFFF\",
>
> titleFont: template.defaultTitleFont,
>
> bodyFont: template.defaultBodyFont
>
> }
>
> };
>
> }

## **4.4 基于 pptx-automizer 的模板渲染器**

pptx-automizer 适合处理已有 PPTX 模板、占位符和母版复用。为了让它稳定工作，建议要求模板设计人员在 PowerPoint Selection Pane 中给关键元素命名，例如 title_placeholder、body_placeholder、image_placeholder、chart_placeholder。

> // src/renderers/templateRenderer.ts
>
> import Automizer, { ModifyTextHelper } from \"pptx-automizer\";
>
> import { DeckSpec, SlideSpec } from \"../schemas/deckSpec.js\";
>
> import { TemplateSpec } from \"../schemas/templateSpec.js\";
>
> import { selectTemplateLayout } from \"../skills/templateSkill.js\";
>
> export async function renderWithCorporateTemplate(input: {
>
> deck: DeckSpec;
>
> template: TemplateSpec;
>
> templateDir: string;
>
> outputDir: string;
>
> outputFileName: string;
>
> }) {
>
> const automizer = new Automizer({
>
> templateDir: input.templateDir,
>
> outputDir: input.outputDir,
>
> removeExistingSlides: true
>
> });
>
> const modifyText = new ModifyTextHelper();
>
> const pres = automizer.loadRoot(input.template.pptxPath);
>
> for (const slide of input.deck.slides) {
>
> const mapping = selectTemplateLayout(slide, input.template);
>
> pres.addSlide(input.template.pptxPath, mapping.sourceSlideNumber, async s =\> {
>
> await fillTemplateSlide(s, slide, modifyText);
>
> });
>
> }
>
> await pres.write(input.outputFileName);
>
> }
>
> async function fillTemplateSlide(s: any, slide: SlideSpec, modifyText: ModifyTextHelper) {
>
> safeModifyText(s, \"title_placeholder\", slide.title, modifyText);
>
> safeModifyText(s, \"subtitle_placeholder\", slide.subtitle \|\| \"\", modifyText);
>
> const bullet = slide.objects.find(o =\> o.type === \"bullet_list\");
>
> if (bullet?.content?.items) {
>
> safeModifyText(s, \"body_placeholder\", bullet.content.items.join(\"\\n\"), modifyText);
>
> }
>
> const text = slide.objects.find(o =\> o.type === \"text\");
>
> if (text) {
>
> safeModifyText(s, \"body_placeholder\", String(text.content), modifyText);
>
> }
>
> // 图片、图表、架构图可以在后续版本里通过 placeholder 坐标替换或组合 PptxGenJS 生成。
>
> }
>
> function safeModifyText(s: any, elementName: string, value: string, helper: ModifyTextHelper) {
>
> try {
>
> s.modifyElement(elementName, \[helper.setText(value)\]);
>
> } catch (err) {
>
> // 生产环境应记录 warning，而不是直接中断整个 deck 生成。
>
> console.warn(\`Template element not found: \${elementName}\`);
>
> }
>
> }

## **4.5 Mermaid Skill：复杂架构图/流程图生成**

第二阶段可以增加 Mermaid Skill。它负责把 Agent 生成的结构化流程转换成 Mermaid，再导出 SVG，最后以图片方式插入 PPT。对于企业架构图，建议保留两种模式：简单图用 PPT 原生 Shape，复杂图用 Mermaid/SVG。

> // src/skills/mermaidSkill.ts
>
> import fs from \"fs/promises\";
>
> import { execFile } from \"child_process\";
>
> import { promisify } from \"util\";
>
> const execFileAsync = promisify(execFile);
>
> export function createMermaidFlow(input: {
>
> title?: string;
>
> nodes: { id: string; label: string }\[\];
>
> edges: { from: string; to: string; label?: string }\[\];
>
> }) {
>
> const lines = \[\"flowchart LR\"\];
>
> for (const node of input.nodes) {
>
> lines.push(\` \${node.id}\[\"\${escapeLabel(node.label)}\"\]\`);
>
> }
>
> for (const edge of input.edges) {
>
> const label = edge.label ? \`\|\${escapeLabel(edge.label)}\|\` : \"\";
>
> lines.push(\` \${edge.from} \--\>\${label} \${edge.to}\`);
>
> }
>
> return lines.join(\"\\n\");
>
> }
>
> export async function renderMermaidToSvg(input: {
>
> mermaidCode: string;
>
> outputSvgPath: string;
>
> }) {
>
> const tempMmd = input.outputSvgPath.replace(/\\.svg\$/, \".mmd\");
>
> await fs.writeFile(tempMmd, input.mermaidCode, \"utf-8\");
>
> // Requires \@mermaid-js/mermaid-cli installed in the runtime image.
>
> await execFileAsync(\"npx\", \[\"mmdc\", \"-i\", tempMmd, \"-o\", input.outputSvgPath\]);
>
> return input.outputSvgPath;
>
> }
>
> function escapeLabel(label: string) {
>
> return label.replace(/\"/g, \"\'\");
>
> }

## **4.6 Image Skill：插图生成与素材库接口**

插图生成不应只有"调用图片模型"一种方式。企业场景中更稳的设计是 AssetProvider 抽象：先查企业素材库，找不到再调用生成模型，最后把生成结果写入素材缓存，并带上版权和来源信息。

> // src/skills/imageSkill.ts
>
> export type GeneratedImage = {
>
> path: string;
>
> source: \"corporate_asset\" \| \"generated\" \| \"uploaded\";
>
> licenseNote?: string;
>
> prompt?: string;
>
> };
>
> export interface ImageProvider {
>
> generate(input: {
>
> prompt: string;
>
> style: \"business\" \| \"flat\" \| \"isometric\" \| \"realistic\";
>
> outputPath: string;
>
> }): Promise\<GeneratedImage\>;
>
> }
>
> export class PlaceholderImageProvider implements ImageProvider {
>
> async generate(input: {
>
> prompt: string;
>
> style: \"business\" \| \"flat\" \| \"isometric\" \| \"realistic\";
>
> outputPath: string;
>
> }): Promise\<GeneratedImage\> {
>
> // 生产环境可替换成 OpenAI Images API、内部图片生成服务或设计素材库。
>
> const svg = \`
>
> \<svg width=\"1200\" height=\"700\" xmlns=\"http://www.w3.org/2000/svg\"\>
>
> \<rect width=\"1200\" height=\"700\" fill=\"#F3F6FA\"/\>
>
> \<text x=\"80\" y=\"120\" font-size=\"44\" font-family=\"Arial\" fill=\"#1F4E79\"\>Illustration\</text\>
>
> \<text x=\"80\" y=\"190\" font-size=\"28\" font-family=\"Arial\" fill=\"#555\"\>\${escapeXml(input.prompt)}\</text\>
>
> \</svg\>\`;
>
> const fs = await import(\"fs/promises\");
>
> await fs.writeFile(input.outputPath, svg, \"utf-8\");
>
> return {
>
> path: input.outputPath,
>
> source: \"generated\",
>
> prompt: input.prompt,
>
> licenseNote: \"Placeholder implementation. Replace with approved image provider.\"
>
> };
>
> }
>
> }
>
> function escapeXml(v: string) {
>
> return v.replace(/\[\<\>&\'\"\]/g, c =\> ({
>
> \"\<\": \"&lt;\",
>
> \"\>\": \"&gt;\",
>
> \"&\": \"&amp;\",
>
> \"\'\": \"&apos;\",
>
> \'\"\': \"&quot;\"
>
> }\[c\] \|\| c));
>
> }

## **4.7 Asset Library Skill：企业素材库抽象**

> // src/skills/assetLibrarySkill.ts
>
> export type AssetSearchResult = {
>
> assetId: string;
>
> title: string;
>
> type: \"image\" \| \"icon\" \| \"logo\" \| \"template\";
>
> pathOrUrl: string;
>
> tags: string\[\];
>
> license: string;
>
> };
>
> export interface AssetLibrary {
>
> search(query: string, filters?: Record\<string, string\>): Promise\<AssetSearchResult\[\]\>;
>
> get(assetId: string): Promise\<AssetSearchResult \| null\>;
>
> }
>
> export class LocalAssetLibrary implements AssetLibrary {
>
> constructor(private assets: AssetSearchResult\[\]) {}
>
> async search(query: string): Promise\<AssetSearchResult\[\]\> {
>
> const q = query.toLowerCase();
>
> return this.assets.filter(a =\>
>
> a.title.toLowerCase().includes(q) \|\|
>
> a.tags.some(t =\> t.toLowerCase().includes(q))
>
> );
>
> }
>
> async get(assetId: string): Promise\<AssetSearchResult \| null\> {
>
> return this.assets.find(a =\> a.assetId === assetId) \|\| null;
>
> }
>
> }

## **4.8 VBA Skill：可选宏脚本生成**

建议不要默认把宏注入 PPTX。更安全的做法是生成独立 .bas 文件或 Macro Script，让用户在受控环境中手工导入，或者通过企业批准的 Office 自动化服务转成 PPTM。

> // src/skills/vbaSkill.ts
>
> export type VbaEffect =
>
> \| \"fade_in_titles\"
>
> \| \"apply_footer\"
>
> \| \"export_pdf\"
>
> \| \"create_agenda_links\";
>
> export function generatePowerPointVba(effect: VbaEffect, options?: Record\<string, string\>) {
>
> switch (effect) {
>
> case \"fade_in_titles\":
>
> return \`
>
> Sub ApplyFadeInToTitles()
>
> Dim sld As Slide
>
> Dim shp As Shape
>
> For Each sld In ActivePresentation.Slides
>
> For Each shp In sld.Shapes
>
> If shp.HasTextFrame Then
>
> If shp.TextFrame.HasText Then
>
> If shp.Top \< 100 Then
>
> sld.TimeLine.MainSequence.AddEffect \_
>
> Shape:=shp, \_
>
> effectId:=msoAnimEffectFade, \_
>
> Trigger:=msoAnimTriggerAfterPrevious
>
> End If
>
> End If
>
> End If
>
> Next shp
>
> Next sld
>
> End Sub\`;
>
> case \"apply_footer\":
>
> return \`
>
> Sub ApplyFooter()
>
> Dim sld As Slide
>
> For Each sld In ActivePresentation.Slides
>
> sld.HeadersFooters.Footer.Visible = msoTrue
>
> sld.HeadersFooters.Footer.Text = \"\${options?.footer \|\| \"Confidential\"}\"
>
> Next sld
>
> End Sub\`;
>
> case \"export_pdf\":
>
> return \`
>
> Sub ExportPresentationToPDF()
>
> Dim outputPath As String
>
> outputPath = ActivePresentation.Path & \"\\\\exported.pdf\"
>
> ActivePresentation.ExportAsFixedFormat \_
>
> Path:=outputPath, \_
>
> FixedFormatType:=ppFixedFormatTypePDF
>
> End Sub\`;
>
> case \"create_agenda_links\":
>
> return \`
>
> Sub CreateAgendaLinks()
>
> MsgBox \"Agenda link generation should be implemented according to the deck structure.\"
>
> End Sub\`;
>
> }
>
> }

## **4.9 Render QA Skill：PPTX 到 PDF/PNG 预览检查**

企业级 PPT Agent 需要自动化视觉 QA。生成 PPTX 后，服务端可以用 LibreOffice headless 导出 PDF，再把 PDF 渲染成页面图片，用规则或视觉模型检查页面是否有明显异常。以下代码展示了一个命令行封装。

> // src/skills/renderQaSkill.ts
>
> import { execFile } from \"child_process\";
>
> import { promisify } from \"util\";
>
> import path from \"path\";
>
> const execFileAsync = promisify(execFile);
>
> export async function convertPptxToPdf(input: {
>
> pptxPath: string;
>
> outputDir: string;
>
> }) {
>
> await execFileAsync(\"libreoffice\", \[
>
> \"\--headless\",
>
> \"\--convert-to\",
>
> \"pdf\",
>
> \"\--outdir\",
>
> input.outputDir,
>
> input.pptxPath
>
> \]);
>
> const base = path.basename(input.pptxPath).replace(/\\.pptx\$/i, \".pdf\");
>
> return path.join(input.outputDir, base);
>
> }
>
> export type RenderQaIssue = {
>
> page: number;
>
> severity: \"warning\" \| \"error\";
>
> message: string;
>
> };
>
> export async function runBasicRenderQa(input: {
>
> pptxPath: string;
>
> outputDir: string;
>
> }): Promise\<RenderQaIssue\[\]\> {
>
> const pdfPath = await convertPptxToPdf(input);
>
> // 这里可以继续调用 pdftoppm / pdfium 把 PDF 渲染为 PNG。
>
> // 生产环境可以把 PNG 交给视觉模型或规则引擎进行检查。
>
> console.log(\`PDF preview generated: \${pdfPath}\`);
>
> return \[\];
>
> }

## **4.10 第二阶段服务化 API 示例**

> // src/api/deckRoutes.ts
>
> import express from \"express\";
>
> import { generateDeckSpec } from \"../agents/deckPlanner.js\";
>
> import { editSingleSlide } from \"../agents/slideEditor.js\";
>
> import { applyPresetTheme } from \"../skills/themeSkill.js\";
>
> import { validateDeckSpec } from \"../skills/validationSkill.js\";
>
> import { renderDeckWithPptxGen } from \"../renderers/pptxRenderer.js\";
>
> export const deckRoutes = express.Router();
>
> const inMemoryDeckStore = new Map\<string, any\>();
>
> deckRoutes.post(\"/generate\", async (req, res, next) =\> {
>
> try {
>
> let deck = await generateDeckSpec(req.body);
>
> if (req.body.theme) deck = applyPresetTheme(deck, req.body.theme);
>
> inMemoryDeckStore.set(deck.deckId, deck);
>
> res.json({ deckId: deck.deckId, deck });
>
> } catch (err) { next(err); }
>
> });
>
> deckRoutes.post(\"/:deckId/slides/:slideNumber/edit\", async (req, res, next) =\> {
>
> try {
>
> const deck = inMemoryDeckStore.get(req.params.deckId);
>
> if (!deck) return res.status(404).json({ error: \"Deck not found\" });
>
> const updated = await editSingleSlide({
>
> deck,
>
> slideNumber: Number(req.params.slideNumber),
>
> instruction: req.body.instruction
>
> });
>
> inMemoryDeckStore.set(req.params.deckId, updated);
>
> res.json({ deck: updated });
>
> } catch (err) { next(err); }
>
> });
>
> deckRoutes.post(\"/:deckId/validate\", async (req, res) =\> {
>
> const deck = inMemoryDeckStore.get(req.params.deckId);
>
> if (!deck) return res.status(404).json({ error: \"Deck not found\" });
>
> res.json({ issues: validateDeckSpec(deck) });
>
> });
>
> deckRoutes.post(\"/:deckId/render\", async (req, res, next) =\> {
>
> try {
>
> const deck = inMemoryDeckStore.get(req.params.deckId);
>
> if (!deck) return res.status(404).json({ error: \"Deck not found\" });
>
> const outputPath = \`src/output/\${req.params.deckId}.pptx\`;
>
> await renderDeckWithPptxGen(deck, outputPath);
>
> res.json({ outputPath });
>
> } catch (err) { next(err); }
>
> });

# **五、关键 Skills 设计说明**

下面按照产品化优先级列出关键 Skills 的职责、输入、输出和实现建议。

  ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Skill**           **输入**                                                **输出**                  **实现建议**
  ------------------- ------------------------------------------------------- ------------------------- ------------------------------------------------------------------
  Deck Planner        topic、audience、purpose、slideCount、language、style   DeckSpec                  必须使用结构化输出；Prompt 中明确 16:9、坐标边界、可编辑对象优先

  Slide Spec Writer   Deck outline、每页目标、模板风格                        SlideSpec\[\]             可以和 Deck Planner 合并，也可以拆成每页并发生成

  Theme Skill         themeId、自定义颜色/字体                                更新后的 DeckSpec.theme   模板风格要用 registry 管理，便于权限和品牌控制

  Template Skill      TemplateSpec、SlideSpec                                 LayoutMapping             通过 supportedSlideLayouts 选择模板页和占位符

  Slide Editor        DeckSpec、slideNumber、instruction                      更新后的 DeckSpec         只改目标页，保留 slideId 和 slideNumber

  Diagram Skill       diagramType、nodes、edges、style                        SlideObject 或 SVG        简单图用 PPT Shape，复杂图用 Mermaid/SVG

  Image Skill         prompt、style、asset preference                         GeneratedImage            先查素材库，后生成；记录来源和版权

  Validation Skill    DeckSpec 或渲染后的页面图                               issues\[\]                从规则检查升级到视觉 QA 和品牌合规检查

  VBA Skill           effect、参数、权限策略                                  VBA macro text            默认只生成 .bas，不自动注入 PPTX/PPTM
  ------------------------------------------------------------------------------------------------------------------------------------------------------------------------

## **5.1 Deck Planner 与 Slide Spec Writer 拆分建议**

当页面数量较少时，可以让 Deck Planner 一次性输出完整 DeckSpec。当页面数量超过 20 页，建议拆分为两步：第一步生成 DeckOutline，第二步并发生成每页 SlideSpec。这样可以降低单次上下文长度、提升稳定性，并支持失败重试。

> // 建议的两阶段生成流程伪代码
>
> const outline = await generateDeckOutline({ topic, audience, slideCount });
>
> const slides = await Promise.all(outline.slides.map(s =\> generateSlideSpec({
>
> outlineItem: s,
>
> theme,
>
> layoutRules,
>
> language
>
> })));
>
> const deck = assembleDeckSpec({ outline, slides, theme });

## **5.2 Template Skill 的占位符命名规范**

为了让模板自动化稳定，建议要求 PPT 模板制作者遵守占位符命名规范。这样程序可以通过 elementName 定位具体对象，而不是依赖不稳定的坐标或对象顺序。

  -----------------------------------------------------------------------------
  **占位符名称**          **用途**                 **建议规则**
  ----------------------- ------------------------ ----------------------------
  title_placeholder       页面主标题               每个模板页必须有且仅有一个

  subtitle_placeholder    副标题或页面说明         可选

  body_placeholder        正文、bullet、总结文本   内容页必须有

  image_placeholder       主图或插图区域           图片页或左右结构页建议有

  chart_placeholder       图表区域                 数据页建议有

  diagram_placeholder     架构图/流程图区域        技术页建议有

  footer_placeholder      页脚、保密标识、日期     按品牌规范配置
  -----------------------------------------------------------------------------

## **5.3 Validation Skill 的规则清单**

  ---------------------------------------------------------------------------------------------
  **规则**                **触发条件**                       **处理建议**
  ----------------------- ---------------------------------- ----------------------------------
  OBJECT_OVERFLOW         对象超出 13.33 x 7.5 页面边界      自动缩放或要求模型重写 SlideSpec

  TITLE_TOO_LONG          标题超过 80 字符或中文超过 40 字   让 Slide Editor 重写标题

  TOO_MANY_BULLETS        bullet 超过 6 条                   压缩为 3-5 条或改成图示

  TEXT_DENSITY_HIGH       单页文字过多                       拆页或改为图文结构

  FONT_NOT_ALLOWED        字体不在企业白名单                 替换为模板默认字体

  COLOR_NOT_ALLOWED       颜色不在品牌色板                   映射到最近的品牌色

  CITATION_MISSING        事实性内容无来源                   要求 Research Skill 补充引用
  ---------------------------------------------------------------------------------------------

# **六、阶段路线图与实施建议**

  ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **阶段**                 **周期建议**      **交付物**                                                              **验收标准**
  ------------------------ ----------------- ----------------------------------------------------------------------- -----------------------------------------------------
  Phase 1 MVP              2-4 周            DeckSpec 生成、PptxGenJS 渲染、逐页修改、3 套主题、基础 QA              能生成 5-10 页可编辑 PPTX；用户可修改单页并重新导出

  Phase 2 Enterprise       4-8 周            企业模板库、pptx-automizer 套版、素材库、复杂图形、PDF 预览、VBA 导出   能基于企业模板生成，支持上传模板和批量预览检查

  Phase 3 Productization   8-12 周           权限、审计、版本、任务队列、协同编辑、引用追踪                          达到内部平台试点要求，支持真实业务文档生成
  ------------------------------------------------------------------------------------------------------------------------------------------------------------------------

实施上建议从"单机 CLI + 本地输出 PPTX"开始，不要一开始就做复杂 Web 平台。第一阶段代码跑通后，再把 DeckSpec 存储、模板库、素材库和异步任务逐步服务化。

# **七、建议的技术选型**

  -----------------------------------------------------------------------------------------------------------
  **模块**                **推荐选型**                      **原因**
  ----------------------- --------------------------------- -------------------------------------------------
  模型层                  GPT-5.x / 企业可用大模型          适合复杂结构化内容生成、逐页修改和多 Skill 编排

  结构化输出              Zod / JSON Schema                 保证模型输出可验证、可重试、可版本化

  PPTX 生成               PptxGenJS                         适合生成可编辑 PPTX 原生对象

  模板修改                pptx-automizer                    适合复用企业模板、母版和占位符

  图形生成                PPT Shape + Mermaid/SVG           简单图可编辑，复杂图美观稳定

  预览导出                LibreOffice headless              服务端批量导出 PDF/PNG 预览

  存储                    PostgreSQL + Object Storage       保存 DeckSpec、版本、素材和导出文件

  任务队列                BullMQ / Temporal / Cloud Queue   支持大文件生成、批量导出和异步 QA
  -----------------------------------------------------------------------------------------------------------

# **八、安全、合规与企业落地注意事项**

- 不要默认启用宏：VBA/Macro 应作为可选导出能力，并经过企业安全审批。

- 所有上传模板和图片需要病毒扫描、文件类型检查和大小限制。

- 外部图片生成要记录 prompt、模型、时间、版权说明和使用场景。

- 企业机密文档进入模型前需要权限判断和脱敏策略。

- DeckSpec、Prompt、生成结果和用户修改历史都应记录审计日志。

- 模板库应有品牌审核机制，避免员工使用过期 Logo、错误字体或不合规配色。

- 渲染和文件转换应运行在沙箱环境，避免恶意 PPTX 或宏脚本带来的风险。

# **九、链接与参考资源**

- [[PptxGenJS GitHub]{.underline}](https://github.com/gitbrent/PptxGenJS) - https://github.com/gitbrent/PptxGenJS

- [[PptxGenJS 文档]{.underline}](https://gitbrent.github.io/PptxGenJS/) - https://gitbrent.github.io/PptxGenJS/

- [[pptx-automizer GitHub]{.underline}](https://github.com/singerla/pptx-automizer) - https://github.com/singerla/pptx-automizer

- [[pptx-automizer npm]{.underline}](https://www.npmjs.com/package/pptx-automizer) - https://www.npmjs.com/package/pptx-automizer

- [[Mermaid]{.underline}](https://mermaid.js.org/) - https://mermaid.js.org/

- [[Mermaid CLI]{.underline}](https://github.com/mermaid-js/mermaid-cli) - https://github.com/mermaid-js/mermaid-cli

- [[OpenAI Structured Outputs]{.underline}](https://platform.openai.com/docs/guides/structured-outputs) - https://platform.openai.com/docs/guides/structured-outputs

- [[OpenAI Responses API]{.underline}](https://platform.openai.com/docs/api-reference/responses) - https://platform.openai.com/docs/api-reference/responses

- [[OpenAI Agents SDK]{.underline}](https://openai.github.io/openai-agents-js/) - https://openai.github.io/openai-agents-js/

# **十、总结**

自研 PPT 生成 Agent 的关键不是"让模型一次性生成一个 PPT 文件"，而是构建一个可迭代的结构化生成系统。第一阶段应尽快打通 DeckSpec、PptxGenJS、逐页修改和基础 QA；第二阶段再叠加企业模板、素材库、复杂图形、PDF 预览和宏脚本导出。只要 DeckSpec 设计稳定，后续模型、模板和渲染器都可以替换，平台就具备长期演进能力。
