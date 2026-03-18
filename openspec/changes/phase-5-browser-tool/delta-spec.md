# Delta-Spec: Phase 4.5 — 浏览器控制

## 影响范围

极小。只改 1 个文件，新增 1 个文件。

### tools/spec.md

```diff
 builtinTools = [
   readFileTool, writeFileTool, editFileTool,
   globTool, grepTool, listDirTool,
   bashTool, processTool,
   webFetchTool, webSearchTool,
   readImageTool, readPdfTool,
   applyPatchTool,
   cronTool,          // Phase 4
+  browserTool,       // Phase 4.5 (OpenClaw HTTP client)
 ]
```

工具总数：14 → **15**

### 无新依赖

使用 Node.js 内置 `fetch`（v22），零 npm 新包。
