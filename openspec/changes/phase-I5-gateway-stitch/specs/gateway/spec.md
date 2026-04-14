# Delta Spec: Gateway Integration Enhancements

## ADDED Requirements

### Requirement: Config Validation on Startup
The system SHALL call `validateConfig()` after `initSecrets()` during startup.
Validation errors SHALL be logged as warnings but SHALL NOT block startup.

### Requirement: codebase_search Tool Registration
The system SHALL register `codebase_search` as a built-in tool.
The tool SHALL use delayed index building on first invocation.

### Requirement: Hook Framework Runtime Integration
The system SHALL invoke `globalHookRegistry` at the following points during agent execution:
- `beforeToolCall` — before each tool execution (after params.beforeToolCall)
- `afterToolCall` — after each tool execution (after params.afterToolCall)
- `beforeLLMCall` — before each LLM streaming call
- `afterLLMCall` — after each LLM streaming response completes

Hook invocation failures SHALL NOT block the main execution flow.

### Requirement: Session Lifecycle Events
The system SHALL emit lifecycle events via `emitSessionEvent()`:
- `session:created` — when a new session is created (not restored from disk)
- `session:restored` — when a session is loaded from disk
- `session:reaped` — when a session is removed due to idle timeout

Event handler failures SHALL NOT affect session operations.
