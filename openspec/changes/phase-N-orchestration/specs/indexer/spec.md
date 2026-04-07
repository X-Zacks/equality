# Delta Spec: Indexer — 代码索引与 codebase_search

> 新增领域。提供项目级代码索引和语义搜索能力。

---

## ADDED Requirements

### Requirement: 文件扫描器 [借鉴 claw-code PortContext + PortManifest]

系统 SHALL 提供 `FileScanner` 类，自动扫描项目文件结构。

借鉴 claw-code 的 `build_port_context()` 和 `PortManifest` 模式：启动时自动扫描项目结构，生成项目清单。

FileScannerConfig MUST 包含：
- `rootDir: string` — 项目根目录
- `include: string[]` — glob 包含模式，默认 `['**/*.{ts,tsx,js,jsx,py,md,json,css,html}']`
- `exclude: string[]` — glob 排除模式，默认 `['node_modules/**', '.git/**', 'dist/**', 'build/**', '*.lock']`
- `maxFileSize: number` — 最大文件大小（默认 102400 = 100KB）
- `maxTotalFiles: number` — 最大文件总数（默认 10000）
- `watchMode: boolean` — 增量监听模式

FileScanner MUST 提供：
- `scanAll()` → ScanResult — 全量扫描
- `scanIncremental(changedPaths)` → ScanResult — 增量扫描
- `getManifest()` → ProjectManifest — 项目概览

#### Scenario: 全量扫描
- GIVEN 一个包含 50 个 .ts 文件和 1000 个 node_modules 文件的项目
- WHEN `scanAll()` 被调用
- THEN indexedFiles ≈ 50（node_modules 被排除）
- AND skippedFiles 包含 node_modules 中的文件

#### Scenario: 大文件跳过
- GIVEN 一个 200KB 的文件
- WHEN `scanAll()` 被调用
- THEN 该文件被跳过
- AND skippedReasons 包含 'file_too_large'

#### Scenario: 增量扫描
- GIVEN 全量扫描已完成
- WHEN 修改了 2 个文件
- AND `scanIncremental(['a.ts', 'b.ts'])` 被调用
- THEN 只重新索引这 2 个文件
- AND indexedFiles = 2

#### Scenario: ProjectManifest 生成 [claw-code PortManifest]
- GIVEN 扫描完成
- WHEN `getManifest()` 被调用
- THEN 返回 ProjectManifest 包含：
  - rootDir
  - totalFiles（已索引文件数）
  - filesByExtension（如 `.ts: 30, .tsx: 15`）
  - topLevelModules（顶层目录 + 文件数 + 描述）
  - lastScanAt

---

### Requirement: 代码分块器

系统 SHALL 提供 `ChunkIndexer` 类，将源代码文件分块并计算嵌入向量。

复用 Phase K 的 `memory/chunking.ts`（sentence boundary alignment）和 `memory/embeddings.ts`（EmbeddingProvider）。

ChunkIndexer MUST：
- 按 `chunkSize`（默认 1500 字符）分块
- 块之间有 `chunkOverlap`（默认 200 字符）重叠
- 从每个块中提取符号名（函数名、类名、变量名）
- 调用 EmbeddingProvider 计算嵌入向量（延迟计算）

CodeChunk MUST 包含：
- `id: string` — 确定性 hash（filePath + startLine + endLine）
- `filePath: string`
- `startLine / endLine: number`
- `content: string`
- `language: string`
- `type: 'function' | 'class' | 'import' | 'comment' | 'block'`
- `symbols: string[]`
- `embedding?: number[]`

#### Scenario: TypeScript 文件分块
- GIVEN 一个 3000 字符的 .ts 文件，chunkSize=1500，overlap=200
- WHEN `indexFile()` 被调用
- THEN 返回 2-3 个 CodeChunk
- AND 相邻块有 200 字符重叠
- AND 每个块的 language = 'typescript'

#### Scenario: 符号提取
- GIVEN 包含 `function foo()`, `class Bar`, `const baz =` 的文件
- WHEN `indexFile()` 被调用
- THEN 至少一个 chunk 的 symbols 包含 'foo', 'Bar', 'baz'

#### Scenario: 批量索引
- GIVEN 10 个文件
- WHEN `indexBatch()` 被调用
- THEN 返回总分块数
- AND 所有文件都被处理

---

### Requirement: 搜索引擎

系统 SHALL 提供 `CodeSearchEngine` 类，实现混合代码搜索。

复用 Phase K 的 `memory/hybrid-search.ts`（RRF 融合算法）。

搜索模式：
- **语义搜索** — 使用嵌入向量余弦相似度
- **关键词搜索** — 使用文本匹配（token overlap）
- **符号搜索** — 精确匹配 symbols 数组

CodeSearchResult MUST 包含：
- `filePath: string`
- `startLine / endLine: number`
- `content: string`
- `score: number`（0-1，RRF 融合分数）
- `matchType: 'semantic' | 'keyword' | 'symbol'`
- `symbols: string[]`

#### Scenario: 语义搜索
- GIVEN 项目中有 `auth/login.ts` 和 `utils/format.ts`
- WHEN 搜索 "用户认证逻辑"
- THEN `auth/login.ts` 的结果排在前面

#### Scenario: 符号搜索
- GIVEN 项目中有函数 `calculateTotal`
- WHEN 搜索 "calculateTotal"
- THEN 包含该函数的 chunk 排在第一位
- AND matchType = 'symbol'

#### Scenario: 文件过滤
- GIVEN 搜索选项包含 `fileFilter: ['src/**/*.ts']`
- WHEN 搜索执行
- THEN 结果只包含 `src/` 目录下的 `.ts` 文件

#### Scenario: 最大结果数限制
- GIVEN maxResults=5
- WHEN 搜索返回 20 个匹配
- THEN 只返回前 5 个（按 score 排序）

#### Scenario: 空索引搜索
- GIVEN 项目尚未索引
- WHEN `search()` 被调用
- THEN 返回空数组（不抛出异常）

---

### Requirement: 索引统计

系统 SHALL 提供索引统计接口。

```typescript
interface IndexStats {
  totalFiles: number
  totalChunks: number
  totalSymbols: number
  indexSizeBytes: number
  lastBuildAt: number
  lastBuildDurationMs: number
}
```

#### Scenario: 统计查询
- GIVEN 索引已构建
- WHEN `getStats()` 被调用
- THEN 返回完整统计信息
- AND totalFiles > 0
- AND lastBuildAt > 0
