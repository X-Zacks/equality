# Delta Spec: Cache Trace (LLM Diagnostics)

> Phase I4 — GAP-23

## ADDED Requirements

### Requirement: Trace Lifecycle Stages
The system SHALL support 7 trace stages for each LLM invocation:
1. `session:loaded` — session history loaded from persistence
2. `session:sanitized` — messages sanitized (secrets/PII removed)
3. `session:limited` — messages trimmed by context window guard
4. `prompt:before` — system prompt assembled
5. `prompt:images` — image tokens estimated
6. `stream:context` — final payload sent to LLM
7. `session:after` — response received and session updated

#### Scenario: Full trace lifecycle
- GIVEN cache trace enabled via `EQUALITY_CACHE_TRACE=1`
- WHEN an LLM invocation completes
- THEN the trace file contains entries for each stage in order
- AND each entry has `ts`, `seq`, `stage` fields

### Requirement: Trace Event Structure
Each trace event SHALL contain:
- `ts`: ISO 8601 timestamp
- `seq`: monotonically increasing sequence number per trace instance
- `stage`: one of the 7 stages
- `sessionKey?`: session identifier
- `provider?`: LLM provider name
- `modelId?`: model identifier
- `messageCount?`: number of messages
- `messageRoles?`: array of role strings
- `messagesDigest?`: SHA-256 digest of message fingerprints
- `systemDigest?`: SHA-256 digest of system prompt

#### Scenario: Trace event contains message summary
- GIVEN a trace recording stage `stream:context`
- WHEN 5 messages are in the payload
- THEN `messageCount` is 5
- AND `messageRoles` has 5 entries
- AND `messagesDigest` is a 64-char hex string

### Requirement: Enable/Disable via Environment Variable
Cache trace SHALL be disabled by default and enabled via:
- `EQUALITY_CACHE_TRACE=1` environment variable
- Or `config.diagnostics.cacheTrace.enabled: true`

#### Scenario: Disabled by default
- GIVEN no `EQUALITY_CACHE_TRACE` env var set
- WHEN `createCacheTrace({})` is called
- THEN it returns null

#### Scenario: Enabled via env
- GIVEN `EQUALITY_CACHE_TRACE=1`
- WHEN `createCacheTrace({})` is called
- THEN it returns a CacheTrace object with `enabled: true`

### Requirement: Trace File Output
Trace events SHALL be written to a JSONL file at:
- Default path: `{stateDir}/logs/cache-trace.jsonl`
- Configurable via `EQUALITY_CACHE_TRACE_FILE` env var

Writing MUST be non-blocking (queued/async).

#### Scenario: Custom trace file path
- GIVEN `EQUALITY_CACHE_TRACE_FILE=/tmp/my-trace.jsonl`
- WHEN trace is created
- THEN `trace.filePath` is `/tmp/my-trace.jsonl`

### Requirement: Sensitive Data Redaction
Trace events MUST redact sensitive data before writing:
- API keys → `sk-***`
- Bearer tokens → `Bearer ***`
- Passwords → `***`

#### Scenario: API key in options is redacted
- GIVEN an LLM call with `apiKey: 'sk-abc123def456'` in options
- WHEN the trace records `stream:context`
- THEN the written event has `apiKey` redacted
