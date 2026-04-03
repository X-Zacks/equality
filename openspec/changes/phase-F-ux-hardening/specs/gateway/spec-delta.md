# Delta: Gateway — Interactive SSE Event

## ADDED Requirements

### Requirement: Interactive SSE Event

The `/chat/stream` endpoint MUST emit `interactive` SSE events when the runner invokes `onInteractive`.

#### Scenario: Agent produces interactive payload
- GIVEN a chat stream session
- WHEN the runner detects an `:::interactive` block and calls `onInteractive`
- THEN the gateway emits SSE: `data: {"type":"interactive","payload":{...}}\n\n`
- AND the event is emitted before the `done` event

#### Scenario: No interactive blocks
- GIVEN a normal agent response without interactive blocks
- WHEN the stream completes
- THEN no `interactive` SSE event is emitted
- AND the behavior is identical to current implementation

### Requirement: Interactive Event Schema

The interactive SSE event MUST conform to:

```json
{
  "type": "interactive",
  "payload": {
    "elements": [
      { "type": "button", "actionId": "string", "label": "string", "style": "primary|secondary|success|danger" },
      { "type": "select", "actionId": "string", "options": [{ "label": "string", "value": "string" }] },
      { "type": "text", "content": "string" }
    ]
  }
}
```
