/**
 * tools/mcp/index.ts — MCP Client Manager
 *
 * Phase D.2: 管理所有 MCP 服务器连接，注册/注销工具。
 */

import type { McpServerConfig, McpServerState } from './types.js'
import { McpClient } from './client.js'
import { mcpToolToDefinition } from './bridge.js'
import type { ToolRegistry } from '../registry.js'

export { McpClient } from './client.js'
export { mcpToolToDefinition } from './bridge.js'
export { parseMcpServersConfig, mcpToolName } from './types.js'
export type { McpServerConfig, McpServerState, McpServerStatus, McpToolDescription, McpToolCallResult } from './types.js'

export class McpClientManager {
  private clients = new Map<string, McpClient>()
  private states = new Map<string, McpServerState>()
  private registeredTools = new Map<string, string[]>() // serverName → toolName[]
  private registry: ToolRegistry

  constructor(registry: ToolRegistry) {
    this.registry = registry
  }

  /**
   * 并行连接所有配置的 MCP 服务器，注册工具。
   * 单个服务器失败不阻塞其他服务器。
   */
  async start(configs: McpServerConfig[]): Promise<void> {
    const tasks = configs.map(cfg => this.connectServer(cfg))
    await Promise.allSettled(tasks)
  }

  /**
   * 断开所有连接，注销所有 MCP 工具。
   */
  async stop(): Promise<void> {
    const tasks: Promise<void>[] = []

    for (const [name, client] of this.clients) {
      // 注销该服务器注册的工具
      const tools = this.registeredTools.get(name) ?? []
      for (const toolName of tools) {
        try { this.registry.unregister(toolName) } catch { /* ignore */ }
      }
      this.registeredTools.delete(name)

      tasks.push(
        client.disconnect().catch(err => {
          console.warn(`[mcp-manager] 断开 ${name} 失败:`, (err as Error).message)
        }),
      )
    }

    await Promise.allSettled(tasks)
    this.clients.clear()
    this.states.clear()
  }

  /**
   * 获取所有服务器状态（供 API 查询）
   */
  getStatus(): McpServerState[] {
    return [...this.states.values()]
  }

  // ── 内部方法 ────────────────────────────────────────────────────────────────

  private async connectServer(config: McpServerConfig): Promise<void> {
    const state: McpServerState = {
      config,
      status: 'connecting',
      toolCount: 0,
      reconnectCount: 0,
    }
    this.states.set(config.name, state)

    const client = new McpClient(config)
    this.clients.set(config.name, client)

    // 设置断开回调 → 自动重连
    client.onDisconnect(() => {
      state.status = 'disconnected'
      this.handleReconnect(config.name)
    })

    try {
      await client.connect()
      const tools = await client.listTools()

      // 注册工具
      const toolNames: string[] = []
      for (const mcpTool of tools) {
        const def = mcpToolToDefinition(config.name, mcpTool, client)
        try {
          this.registry.register(def)
          toolNames.push(def.name)
        } catch (err) {
          console.warn(`[mcp-manager] 注册工具 ${def.name} 失败:`, (err as Error).message)
        }
      }

      this.registeredTools.set(config.name, toolNames)
      state.status = 'ready'
      state.toolCount = toolNames.length
      console.log(`[mcp-manager] ${config.name}: ${toolNames.length} 个工具已注册`)
    } catch (err) {
      state.status = 'error'
      state.lastError = (err as Error).message
      console.error(`[mcp-manager] ${config.name} 连接失败:`, state.lastError)
    }
  }

  private async handleReconnect(name: string): Promise<void> {
    const client = this.clients.get(name)
    const state = this.states.get(name)
    if (!client || !state) return

    // 先注销旧工具
    const oldTools = this.registeredTools.get(name) ?? []
    for (const toolName of oldTools) {
      try { this.registry.unregister(toolName) } catch { /* ignore */ }
    }
    this.registeredTools.delete(name)

    const ok = await client.reconnect()
    state.reconnectCount = client.reconnectCount

    if (ok) {
      // 重新发现并注册工具
      try {
        const tools = await client.listTools()
        const toolNames: string[] = []
        for (const mcpTool of tools) {
          const def = mcpToolToDefinition(name, mcpTool, client)
          try {
            this.registry.register(def)
            toolNames.push(def.name)
          } catch (err) {
            console.warn(`[mcp-manager] 重连后注册工具 ${def.name} 失败:`, (err as Error).message)
          }
        }
        this.registeredTools.set(name, toolNames)
        state.status = 'ready'
        state.toolCount = toolNames.length
      } catch (err) {
        state.status = 'error'
        state.lastError = (err as Error).message
      }
    } else {
      state.status = 'error'
      state.lastError = `重连 ${client.reconnectCount} 次后放弃`
    }
  }
}
