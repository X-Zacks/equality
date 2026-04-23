/**
 * tools/builtins/todo.ts — 待办事项管理工具
 *
 * Phase Y1.1: 会话级任务追踪
 * 数据存储在 {workspaceDir}/.equality/todos.json
 */

import fs from 'node:fs'
import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import type { ToolDefinition, ToolResult, ToolContext } from '../types.js'

interface TodoItem {
  id: number
  text: string
  done: boolean
  createdAt: string
}

function todosPath(workspaceDir: string): string {
  return path.join(workspaceDir, '.equality', 'todos.json')
}

function loadTodos(workspaceDir: string): TodoItem[] {
  const p = todosPath(workspaceDir)
  if (!fs.existsSync(p)) return []
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch {
    return []
  }
}

function saveTodos(workspaceDir: string, todos: TodoItem[]): void {
  const dir = path.dirname(todosPath(workspaceDir))
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(todosPath(workspaceDir), JSON.stringify(todos, null, 2))
}

function formatTodos(todos: TodoItem[]): string {
  if (todos.length === 0) return '📋 待办列表为空'
  return todos.map(t =>
    `${t.done ? '✅' : '⬜'} #${t.id} ${t.text}`
  ).join('\n')
}

export const todoTool: ToolDefinition = {
  name: 'todo',
  description:
    'Manage a todo list. Supports add, list, done, and remove actions. ' +
    'Use to track progress on multi-step tasks, suitable for planning and executing complex tasks.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['add', 'list', 'done', 'remove'],
        description: 'Action type: add, list, done, remove',
      },
      text: {
        type: 'string',
        description: 'Todo content (required for add)',
      },
      id: {
        type: 'string',
        description: 'Todo ID (required for done/remove)',
      },
    },
    required: ['action'],
  },

  async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const action = String(input.action)
    const todos = loadTodos(ctx.workspaceDir)

    switch (action) {
      case 'add': {
        const text = String(input.text ?? '').trim()
        if (!text) return { content: 'Error: text is required for add', isError: true }
        const maxId = todos.reduce((m, t) => Math.max(m, t.id), 0)
        const item: TodoItem = { id: maxId + 1, text, done: false, createdAt: new Date().toISOString() }
        todos.push(item)
        saveTodos(ctx.workspaceDir, todos)
        return { content: `✅ 已添加 #${item.id}: ${text}\n\n${formatTodos(todos)}` }
      }
      case 'list': {
        return { content: formatTodos(todos) }
      }
      case 'done': {
        const id = Number(input.id)
        const item = todos.find(t => t.id === id)
        if (!item) return { content: `Error: todo #${id} not found`, isError: true }
        item.done = true
        saveTodos(ctx.workspaceDir, todos)
        return { content: `✅ 已完成 #${id}: ${item.text}\n\n${formatTodos(todos)}` }
      }
      case 'remove': {
        const id = Number(input.id)
        const idx = todos.findIndex(t => t.id === id)
        if (idx === -1) return { content: `Error: todo #${id} not found`, isError: true }
        const removed = todos.splice(idx, 1)[0]
        saveTodos(ctx.workspaceDir, todos)
        return { content: `🗑️ 已删除 #${id}: ${removed.text}\n\n${formatTodos(todos)}` }
      }
      default:
        return { content: `Error: unknown action "${action}". Use add/list/done/remove.`, isError: true }
    }
  },
}
