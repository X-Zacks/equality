/**
 * tools/mcp/bridge.ts — MCP 工具 → ToolDefinition 桥接
 *
 * Phase D.2: 将 MCP 服务器发现的工具转换为标准 ToolDefinition。
 */

import type { ToolDefinition, ToolInputSchema } from '../types.js'
import type { McpToolDescription } from './types.js'
import { mcpToolName } from './types.js'
import { McpClient } from './client.js'

/**
 * 将 MCP 工具描述转换为标准 ToolDefinition。
 *
 * @param serverName - MCP 服务器名称
 * @param mcpTool - MCP 工具描述
 * @param client - MCP 客户端实例（用于调用工具）
 */
export function mcpToolToDefinition(
  serverName: string,
  mcpTool: McpToolDescription,
  client: McpClient,
): ToolDefinition {
  const name = mcpToolName(serverName, mcpTool.name)

  // 转换 inputSchema
  const inputSchema: ToolInputSchema = {
    type: 'object',
    properties: {},
    required: mcpTool.inputSchema?.required ?? [],
  }

  if (mcpTool.inputSchema?.properties) {
    for (const [key, prop] of Object.entries(mcpTool.inputSchema.properties)) {
      inputSchema.properties[key] = {
        type: prop.type ?? 'string',
        description: prop.description ?? key,
        ...(prop.enum ? { enum: prop.enum } : {}),
        ...(prop.default !== undefined ? { default: prop.default } : {}),
      }
    }
  }

  return {
    name,
    description: mcpTool.description
      ? `[MCP:${serverName}] ${mcpTool.description}`
      : `[MCP:${serverName}] ${mcpTool.name}`,
    inputSchema,
    execute: async (input) => {
      try {
        const result = await client.callTool(mcpTool.name, input)

        // 拼接所有 text 内容
        const textParts = result.content
          .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
          .map(c => c.text)

        return {
          content: textParts.join('\n') || '(empty response)',
          isError: result.isError ?? false,
        }
      } catch (err) {
        return {
          content: `MCP tool error (${serverName}/${mcpTool.name}): ${(err as Error).message}`,
          isError: true,
        }
      }
    },
  }
}
