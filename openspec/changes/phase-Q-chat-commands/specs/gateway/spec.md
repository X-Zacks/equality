# Delta Spec: Chat Commands

> Domain: gateway | Phase: Q

## ADDED Requirements

### Requirement: Chat Command Registry

The system SHALL maintain a `ChatCommandRegistry` that manages all available `/` commands.

#### Scenario: Register a command
- GIVEN an empty ChatCommandRegistry
- WHEN a command definition with name="status" is registered
- THEN `registry.get("status")` returns the definition
- AND `registry.list()` includes "status"

#### Scenario: Duplicate command
- GIVEN a ChatCommandRegistry with "status" registered
- WHEN another command with name="status" is registered
- THEN the old definition is replaced

#### Scenario: Unregister a command
- GIVEN a ChatCommandRegistry with "status" registered
- WHEN "status" is unregistered
- THEN `registry.get("status")` returns undefined

### Requirement: Chat Command Parser

The system SHALL parse user input beginning with `/` as a command invocation.

#### Scenario: Simple command
- GIVEN input "/status"
- WHEN parsed
- THEN command name = "status", args = []

#### Scenario: Command with arguments
- GIVEN input "/model deepseek-v3"
- WHEN parsed
- THEN command name = "model", args = ["deepseek-v3"]

#### Scenario: Non-command input
- GIVEN input "Tell me a joke"
- WHEN checked with `isChatCommand()`
- THEN returns false

#### Scenario: Empty slash
- GIVEN input "/"
- WHEN parsed
- THEN returns null (invalid command)

### Requirement: Command Execution via HTTP

The system SHALL expose a `/chat/command` POST endpoint that executes chat commands.

#### Scenario: Valid command
- GIVEN a POST to `/chat/command` with body `{ sessionKey: "s1", input: "/status" }`
- WHEN the command is registered
- THEN response is `{ ok: true, command: "status", result: { ... } }`

#### Scenario: Unknown command
- GIVEN a POST to `/chat/command` with body `{ sessionKey: "s1", input: "/unknown" }`
- WHEN no such command exists
- THEN response is `{ ok: false, error: "Unknown command: /unknown" }`

### Requirement: /status Command

The system SHALL respond to `/status` with the current session state.

#### Scenario: Active session
- GIVEN session "s1" with 10 messages
- WHEN `/status` is executed
- THEN result includes `messageCount`, `model`, `provider`, `memoryCount`, `uptime`

### Requirement: /new Command

The system SHALL create a new session when `/new` is invoked.

#### Scenario: New session
- GIVEN current session "s1"
- WHEN `/new` is executed
- THEN a new sessionKey is generated
- AND result includes `newSessionKey`

### Requirement: /reset Command

The system SHALL clear all messages in the current session when `/reset` is invoked.

#### Scenario: Reset session
- GIVEN session "s1" with 10 messages
- WHEN `/reset` is executed
- THEN session "s1" has 0 messages
- AND result includes `cleared: 10`

### Requirement: /compact Command

The system SHALL trigger context compaction when `/compact` is invoked.

#### Scenario: Compaction triggered
- GIVEN session "s1" with messages exceeding compact threshold
- WHEN `/compact` is executed
- THEN compaction runs
- AND result includes `beforeMessages`, `afterMessages`

### Requirement: /usage Command

The system SHALL return token usage statistics when `/usage` is invoked.

#### Scenario: Usage stats
- GIVEN session "s1" with recorded token usage
- WHEN `/usage` is executed
- THEN result includes `totalInputTokens`, `totalOutputTokens`, `estimatedCost`

### Requirement: /model Command

The system SHALL switch the active model when `/model <name>` is invoked.

#### Scenario: Switch model
- GIVEN session "s1" using "gpt-4o"
- WHEN `/model deepseek-v3` is executed
- THEN session's model preference changes to "deepseek-v3"
- AND result includes `previousModel`, `newModel`

#### Scenario: Unknown model
- GIVEN input "/model nonexistent-model"
- WHEN executed
- THEN result indicates available models

### Requirement: /help Command

The system SHALL list all available commands when `/help` is invoked.

#### Scenario: Help output
- WHEN `/help` is executed
- THEN result includes all registered command names and descriptions
