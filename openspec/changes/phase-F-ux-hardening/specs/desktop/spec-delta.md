# Delta: Desktop — Interactive UI Components

## ADDED Requirements

### Requirement: InteractiveBlock Component

Desktop MUST render `InteractivePayload` as clickable UI elements within the chat flow.

#### Scenario: Button rendering
- GIVEN an interactive payload with 3 buttons (primary, secondary, danger)
- WHEN Desktop receives the `interactive` SSE event
- THEN 3 styled buttons are rendered below the current message
- AND each button shows its `label` text
- AND button colors match the `style` property

#### Scenario: Select rendering
- GIVEN an interactive payload with a select element
- WHEN Desktop renders the element
- THEN a dropdown selector is displayed with all options
- AND the placeholder text is shown when no option is selected

#### Scenario: Text rendering
- GIVEN an interactive payload with a text element
- WHEN Desktop renders it
- THEN the text content is displayed as read-only

#### Scenario: Button click sends reply
- GIVEN a rendered button with actionId "plan-a"
- WHEN the user clicks it
- THEN `sendMessage("__interactive_reply__:plan-a:clicked")` is called
- AND the InteractiveBlock is removed from the UI
- AND the chat enters streaming state

#### Scenario: Select submit sends reply
- GIVEN a rendered select with actionId "region"
- WHEN the user selects "us-east-1" and confirms
- THEN `sendMessage("__interactive_reply__:region:us-east-1")` is called
- AND the InteractiveBlock is removed

### Requirement: Backward Compatibility

Desktop MUST gracefully ignore unknown SSE event types.

#### Scenario: Old Desktop receives interactive event
- GIVEN a Desktop version without InteractiveBlock support
- WHEN it receives `{"type":"interactive",...}`
- THEN the event is silently ignored
- AND the chat continues to display text-only content
