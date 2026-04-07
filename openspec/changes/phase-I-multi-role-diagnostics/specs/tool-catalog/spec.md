# Delta Spec: Tool Catalog & Profiles

> Phase I1 — GAP-21

## ADDED Requirements

### Requirement: Tool Catalog Metadata
The system SHALL maintain a static catalog of core tool definitions, each containing:
- `id`: unique tool identifier
- `label`: display name
- `description`: human-readable description
- `sectionId`: logical grouping (fs/runtime/web/memory/sessions/ui/messaging/automation)
- `profiles`: array of profile IDs where this tool is available

#### Scenario: Tool catalog lists all registered built-in tools
- GIVEN a freshly imported tool catalog module
- WHEN `listCoreToolSections()` is called
- THEN it returns an array of sections, each with id/label/tools
- AND every built-in tool is present in exactly one section

#### Scenario: Tool lookup by id
- GIVEN a tool catalog
- WHEN `isKnownCoreToolId('read')` is called
- THEN it returns true
- WHEN `isKnownCoreToolId('unknown_xyz')` is called
- THEN it returns false

### Requirement: Tool Profiles
The system SHALL support 4 built-in profiles:
- `minimal`: session_status only
- `coding`: fs + runtime + web + memory + sessions tools
- `messaging`: sessions + messaging tools
- `full`: no restrictions (all tools allowed)

Each profile resolves to a `ToolProfilePolicy` with optional `allow`/`deny` arrays.

#### Scenario: Profile resolution
- GIVEN profile `coding`
- WHEN `resolveCoreToolProfilePolicy('coding')` is called
- THEN an allow list is returned containing `read`, `write`, `edit`, `exec`, `web_search`, etc.
- AND `message` is NOT in the allow list

#### Scenario: Full profile returns undefined (no restriction)
- GIVEN profile `full`
- WHEN `resolveCoreToolProfilePolicy('full')` is called
- THEN it returns undefined (meaning no filtering)

#### Scenario: Unknown profile returns undefined
- GIVEN profile `nonexistent`
- WHEN `resolveCoreToolProfilePolicy('nonexistent')` is called
- THEN it returns undefined

### Requirement: Tool Groups
The system SHALL support group-based tool references for policies:
- `group:fs` → all tools in the fs section
- `group:runtime` → all tools in the runtime section
- etc.

#### Scenario: Group expansion
- GIVEN the core tool catalog
- WHEN `CORE_TOOL_GROUPS['group:fs']` is accessed
- THEN it contains `['read', 'write', 'edit', 'apply_patch']`

### Requirement: ToolRegistry Profile Filtering
The `ToolRegistry.getToolSchemas()` method SHALL accept an optional `profile` parameter.
When a profile is specified, only tools matching the profile's allow list are returned.

#### Scenario: Schema export with coding profile
- GIVEN a ToolRegistry with 10 tools including `read`, `write`, `message`
- WHEN `getToolSchemas({ profile: 'coding' })` is called
- THEN `read` and `write` schemas are included
- AND `message` schema is excluded (not in coding profile)

## MODIFIED Requirements

### Requirement: ToolDefinition Type (from Phase 2)
The `ToolDefinition` interface SHALL be extended with optional metadata:
- `sectionId?: string` — logical group
- `profiles?: ToolProfileId[]` — which profiles include this tool

(Previously: ToolDefinition had only name/description/inputSchema/execute)
