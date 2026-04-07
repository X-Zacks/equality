/**
 * config/schema.ts — 配置 Schema 定义
 *
 * Phase L1 (GAP-33): 类型化配置验证。
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type ConfigFieldType = 'string' | 'number' | 'boolean' | 'string[]' | 'json'

export interface ConfigFieldSchema {
  type: ConfigFieldType
  required?: boolean
  default?: unknown
  description?: string
  validate?: (value: unknown) => boolean | string
  deprecated?: string
  since?: string
}

export type ConfigSchema = Record<string, ConfigFieldSchema>

// ─── Built-in Schema ────────────────────────────────────────────────────────

export const EQUALITY_CONFIG_SCHEMA: ConfigSchema = {
  CUSTOM_API_KEY: { type: 'string', description: 'Custom OpenAI-compatible API key', since: '0.1.0' },
  CUSTOM_BASE_URL: { type: 'string', description: 'Custom API base URL', since: '0.1.0' },
  CUSTOM_MODEL: { type: 'string', default: 'gpt-4o', description: 'Custom model name', since: '0.1.0' },
  DEEPSEEK_API_KEY: { type: 'string', description: 'DeepSeek API key', since: '0.2.0' },
  QWEN_API_KEY: { type: 'string', description: 'Qwen API key', since: '0.2.0' },
  VOLC_API_KEY: { type: 'string', description: 'Volcengine API key', since: '0.2.0' },
  BRAVE_API_KEY: { type: 'string', description: 'Brave Search API key', since: '0.1.0' },
  PROXY_URL: { type: 'string', description: 'HTTPS proxy URL', since: '0.1.0' },
  BASH_TIMEOUT: { type: 'number', default: 300000, description: 'Bash command timeout (ms)', since: '0.1.0' },
  BASH_IDLE_TIMEOUT: { type: 'number', default: 120000, description: 'Bash idle timeout (ms)', since: '0.1.0' },
  MAX_TOOL_RESULT_CHARS: { type: 'number', default: 30000, description: 'Max tool result chars', since: '0.1.0' },
  CONTEXT_WINDOW_OVERRIDE: { type: 'number', description: 'Override context window tokens', since: '0.3.0' },
  MCP_SERVERS: { type: 'json', default: '{}', description: 'MCP server configuration JSON', since: '0.2.0' },
  EQUALITY_LOG_LEVEL: { type: 'string', default: 'info', description: 'Log level', since: '0.4.0',
    validate: (v) => ['debug', 'info', 'warn', 'error'].includes(v as string) || 'must be debug|info|warn|error' },
  EQUALITY_LOG_FILE: { type: 'string', description: 'Log file path (JSONL)', since: '0.4.0' },
}
