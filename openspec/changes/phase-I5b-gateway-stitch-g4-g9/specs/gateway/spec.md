# Delta Spec: Gateway Integration G4-G9

## ADDED Requirements

### Requirement: Config Validation on Startup (G4)
The system SHALL call `validateConfig()` after `initSecrets()` during startup.
- GIVEN settings loaded from `%APPDATA%/Equality/settings.json`
- WHEN startup begins
- THEN `validateConfig()` SHALL be called with current settings and `EQUALITY_CONFIG_SCHEMA`
- AND validation errors SHALL be logged via `console.warn` but SHALL NOT throw or block startup
- AND deprecated keys SHALL produce a warning

### Requirement: Web Search via Registry (G5)
The `web_search` tool SHALL use `WebSearchRegistry` to discover and invoke search providers.
- The system SHALL register a `BraveSearchProvider` and a `DuckDuckGoProvider` at startup
- Provider selection SHALL follow registry priority order (Brave first, DDG fallback)
- External behavior (tool name, input schema, output format) SHALL NOT change
- If no registry provider is available, the tool SHALL return an error message

### Requirement: Bash Concurrent Limiting via CommandQueue (G6)
The `bash` tool (foreground mode) SHALL enqueue commands via `CommandQueue` to limit concurrent shell processes.
- Default max concurrent SHALL be 5
- If the queue is full and timeout expires, the tool SHALL return an error
- Background mode SHALL bypass the queue (managed by processManager separately)
- Queue timeout SHALL default to 60 seconds

### Requirement: Link Understanding via beforeLLMCall Hook (G7)
The system SHALL register a `beforeLLMCall` hook that extracts URLs from the latest user message and appends their summaries to the context.
- GIVEN a user message containing URLs
- WHEN the beforeLLMCall hook fires
- THEN `detectLinks()` SHALL extract up to 3 URLs
- AND `fetchAndSummarize()` SHALL fetch each URL (with SSRF guard)
- AND results SHALL be logged but NOT block the LLM call if fetching fails
- The hook SHALL be registered in `index.ts` at startup

### Requirement: Plugin Disk Loader (G8)
The system SHALL provide `loadFromDirectory(dir)` in `plugins/loader.ts` that:
- Reads `manifest.json` from the given directory
- Validates the manifest
- Dynamically imports the entry file
- Returns the manifest and plugin export for `PluginHost.loadFromManifest()`

### Requirement: Structured Logger in Gateway Entry (G9)
The `index.ts` gateway entry SHALL use `createLogger('gateway')` for startup messages instead of raw `console.log`.
- Logger instance SHALL be created after `initSecrets()` (so EQUALITY_LOG_LEVEL is available)
- Only the top-level startup log lines SHALL be migrated (tool registration, MCP, skills, workspace, etc.)
- Deep module-internal console.log SHALL remain unchanged in this phase
