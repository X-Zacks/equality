# Delta Spec: Security Audit

> Phase I3 — GAP-22

## ADDED Requirements

### Requirement: Structured Security Report
The system SHALL provide a `runSecurityAudit(options)` function that returns:
```typescript
{
  ts: number;                  // Unix timestamp
  summary: { critical: number; warn: number; info: number };
  findings: SecurityAuditFinding[];
}
```

Each finding contains:
- `checkId`: machine-readable identifier (e.g., `sandbox.disabled`)
- `severity`: `'info' | 'warn' | 'critical'`
- `title`: short summary
- `detail`: explanation of the finding
- `remediation?`: suggested fix

#### Scenario: Clean configuration
- GIVEN a configuration with sandbox enabled and proper secrets
- WHEN `runSecurityAudit({ config })` is called
- THEN `summary.critical` is 0
- AND all findings have severity `info`

#### Scenario: Missing sandbox warning
- GIVEN a configuration without bash sandbox enabled
- WHEN `runSecurityAudit({ config })` is called
- THEN findings contain a `warn` with checkId `sandbox.disabled`

### Requirement: Security Check Categories
The audit SHALL check:
1. **Sandbox status**: bash sandbox enabled/disabled
2. **Secret storage**: secrets stored securely or in plain env vars
3. **Tool policy**: dangerous tools (bash/exec) without deny rules
4. **External content**: external content security wrapping status
5. **Proxy configuration**: proxy enabled without HTTPS
6. **Workspace permissions**: workspace dir writable

#### Scenario: Dangerous tool without policy
- GIVEN tools `exec` and `bash` registered without deny rules
- WHEN audit runs
- THEN a finding with checkId `tools.dangerous_unrestricted` at severity `warn` is produced

#### Scenario: Secrets in plain environment
- GIVEN API keys stored only in environment variables (no encrypted store)
- WHEN audit runs
- THEN a finding with checkId `secrets.plain_env` at severity `info` is produced

### Requirement: Audit API Endpoint
The system SHALL expose a `GET /api/security-audit` endpoint returning the audit report as JSON.

#### Scenario: API call
- GIVEN the Equality core server running
- WHEN `GET /api/security-audit` is called
- THEN it returns 200 with a SecurityAuditReport body
