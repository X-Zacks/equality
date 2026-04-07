# Delta Spec: Agent Scoping

> Phase I2 — GAP-24

## ADDED Requirements

### Requirement: Agent Configuration Definition
The system SHALL support a configuration file (`equality.config.json`) with an `agents` section:
```json
{
  "agents": {
    "defaults": { "model": "gpt-4o", "workspace": "~/workspace" },
    "list": [
      {
        "id": "coder",
        "name": "Coding Agent",
        "workspace": "~/projects",
        "model": "claude-sonnet-4-20250514",
        "tools": { "profile": "coding" },
        "default": true
      },
      {
        "id": "translator",
        "name": "Translation Agent",
        "model": "gpt-4o",
        "tools": { "profile": "minimal" }
      }
    ]
  }
}
```

#### Scenario: Config with multiple agents
- GIVEN a config with 2 agents: `coder` (default) and `translator`
- WHEN `listAgentIds(config)` is called
- THEN it returns `['coder', 'translator']`

#### Scenario: No agents configured
- GIVEN a config without `agents.list`
- WHEN `listAgentIds(config)` is called
- THEN it returns `['default']`

### Requirement: Agent ID Resolution from Session Key
The system SHALL extract agent ID from session key format: `agent:{agentId}:{sessionSuffix}`.
Plain session keys (no agent prefix) resolve to the default agent.

#### Scenario: Agent session key
- GIVEN session key `agent:translator:abc123`
- WHEN `resolveAgentIdFromSessionKey(key)` is called
- THEN it returns `translator`

#### Scenario: Plain session key
- GIVEN session key `desktop-main`
- WHEN `resolveAgentIdFromSessionKey(key)` is called
- THEN it returns `default`

### Requirement: Per-Agent Config Resolution
The system SHALL resolve per-agent configuration including:
- `workspace`: agent working directory (fallback to defaults.workspace)
- `model`: preferred model (fallback to defaults.model)
- `tools.profile`: tool profile ID (fallback to `coding`)
- `identity`: custom identity text for system prompt

#### Scenario: Agent-specific model
- GIVEN config with agent `translator` having `model: 'gpt-4o'`
- WHEN `resolveAgentConfig(config, 'translator')` is called
- THEN `result.model` is `'gpt-4o'`

#### Scenario: Fallback to defaults
- GIVEN config with agent `coder` without model but `defaults.model: 'gpt-4o'`
- WHEN `resolveAgentEffectiveModel(config, 'coder')` is called
- THEN it returns `'gpt-4o'`

### Requirement: Default Agent Selection
When multiple agents exist, one MAY be marked `default: true`.
If none or multiple are marked, the first agent in the list is the default.

#### Scenario: Explicit default
- GIVEN agents `[a (default:false), b (default:true)]`
- WHEN `resolveDefaultAgentId(config)` is called
- THEN it returns `b`

#### Scenario: No explicit default
- GIVEN agents `[a, b]` without `default` flags
- WHEN `resolveDefaultAgentId(config)` is called
- THEN it returns `a` (first in list)

## MODIFIED Requirements

### Requirement: System Prompt (from Phase F2)
The `buildSystemPrompt()` function SHALL accept an optional `agentConfig` parameter.
When provided, agent-specific identity text is injected into the system prompt.

(Previously: buildSystemPrompt only accepted workspaceDir/skills/activeSkill/modelName)
