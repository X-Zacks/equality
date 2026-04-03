/**
 * tools/mcp/types.ts — MCP (Model Context Protocol) 类型定义
 *
 * Phase D.2: 外部工具服务器连接
 */

// ─── MCP 服务器配置 ──────────────────────────────────────────────────────────

export interface McpServerConfig {
  /** 服务器标识名（用于工具名前缀: mcp_{name}_{tool}） */
  name: string
  /** 传输方式（当前仅支持 stdio） */
  transport: 'stdio'
  /** 启动命令（如 npx、node、python） */
  command: string
  /** 命令参数 */
  args?: string[]
  /** 额外环境变量 */
  env?: Record<string, string>
  /** 工具调用超时（毫秒，默认 30000） */
  timeout?: number
}

// ─── MCP 服务器状态 ──────────────────────────────────────────────────────────

export type McpServerStatus = 'connecting' | 'ready' | 'error' | 'disconnected'

export interface McpServerState {
  config: McpServerConfig
  status: McpServerStatus
  /** 已发现的工具数量 */
  toolCount: number
  /** 最后一次错误 */
  lastError?: string
  /** 重连计数 */
  reconnectCount: number
}

// ─── MCP JSON-RPC 消息 ──────────────────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: Record<string, unknown>
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: Record<string, unknown>
}

// ─── MCP 工具描述（服务器返回的格式）──────────────────────────────────────────

export interface McpToolDescription {
  name: string
  description?: string
  inputSchema?: {
    type: 'object'
    properties?: Record<string, {
      type: string
      description?: string
      enum?: string[]
      default?: unknown
    }>
    required?: string[]
  }
}

// ─── MCP 工具调用结果 ────────────────────────────────────────────────────────

export interface McpToolCallResult {
  content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>
  isError?: boolean
}

// ─── MCP initialize 协商 ────────────────────────────────────────────────────

export interface McpInitializeResult {
  protocolVersion: string
  capabilities: {
    tools?: Record<string, unknown>
    [key: string]: unknown
  }
  serverInfo?: {
    name: string
    version: string
  }
}

// ─── 配置解析辅助 ────────────────────────────────────────────────────────────

/**
 * 解析 MCP_SERVERS JSON 字符串为配置列表。
 * 无效配置抛出 Error 说明原因。
 */
export function parseMcpServersConfig(json: string): McpServerConfig[] {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new Error('MCP_SERVERS 配置不是合法 JSON')
  }

  if (!Array.isArray(raw)) {
    throw new Error('MCP_SERVERS 配置必须是数组')
  }

  return raw.map((item, i) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`MCP_SERVERS[${i}]: 配置项必须是对象`)
    }
    const cfg = item as Record<string, unknown>

    if (typeof cfg.name !== 'string' || !cfg.name.trim()) {
      throw new Error(`MCP_SERVERS[${i}]: 缺少 name 字段`)
    }
    if (typeof cfg.command !== 'string' || !cfg.command.trim()) {
      throw new Error(`MCP_SERVERS[${i}]: 缺少 command 字段`)
    }

    const transport = cfg.transport ?? 'stdio'
    if (transport !== 'stdio') {
      throw new Error(`MCP_SERVERS[${i}]: 不支持的传输类型 "${transport}"（当前仅支持 stdio）`)
    }

    return {
      name: cfg.name as string,
      transport: 'stdio' as const,
      command: cfg.command as string,
      args: Array.isArray(cfg.args) ? cfg.args.map(String) : undefined,
      env: cfg.env && typeof cfg.env === 'object' ? cfg.env as Record<string, string> : undefined,
      timeout: typeof cfg.timeout === 'number' ? cfg.timeout : undefined,
    }
  })
}

/**
 * 生成 MCP 工具的注册名。
 * 格式：mcp_{serverName}_{toolName}
 * 特殊字符替换为下划线（避免 LLM 混淆）。
 */
export function mcpToolName(serverName: string, toolName: string): string {
  const safeName = serverName.replace(/[^a-zA-Z0-9_-]/g, '_')
  const safeTool = toolName.replace(/[^a-zA-Z0-9_-]/g, '_')
  return `mcp_${safeName}_${safeTool}`
}
