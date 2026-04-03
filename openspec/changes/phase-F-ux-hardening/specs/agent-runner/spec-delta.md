# Delta: Agent Runner — Interactive Payload 支持

## ADDED Requirements

### Requirement: Interactive Block Detection

runner MUST scan completed assistant text for `:::interactive ... :::` fenced blocks.

#### Scenario: Single interactive block in response
- GIVEN an assistant response containing one `:::interactive` block with valid JSON
- WHEN the stream completes
- THEN the block is parsed into `InteractivePayload`
- AND the `onInteractive` callback is invoked with the payload
- AND the block is stripped from the text stored in session

#### Scenario: Multiple interactive blocks
- GIVEN an assistant response containing two `:::interactive` blocks
- WHEN the stream completes
- THEN both blocks are parsed and two `onInteractive` calls are made
- AND both blocks are stripped from session text

#### Scenario: Invalid JSON in interactive block
- GIVEN a `:::interactive` block with malformed JSON
- WHEN parsing is attempted
- THEN the block is left in the text unchanged
- AND no `onInteractive` call is made for that block
- AND a console.warn is emitted

### Requirement: Interactive Reply Routing

runner MUST recognize user messages prefixed with `__interactive_reply__:` as interactive responses.

#### Scenario: User clicks a button
- GIVEN a user message `__interactive_reply__:plan-a:clicked`
- WHEN the message enters runAttempt
- THEN it is treated as a normal user message (no special routing needed; the Agent understands the prefix via system prompt)

---

## MODIFIED Requirements

### Requirement: RunAttemptParams

RunAttemptParams MUST include an optional `onInteractive` callback field.

```typescript
onInteractive?: (payload: InteractivePayload) => void
```

This callback is invoked zero or more times per run, after stream completion but before session persistence.
