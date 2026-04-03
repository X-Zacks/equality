/**
 * tasks/events.ts — 任务事件广播
 *
 * Phase E1: 订阅 / 广播任务状态变更事件
 */

import type { TaskEvent } from './types.js'

export type TaskEventListener = (event: TaskEvent) => void

export class TaskEventBus {
  private listeners = new Set<TaskEventListener>()

  on(listener: TaskEventListener): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  emit(event: TaskEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (err) {
        console.warn('[TaskEventBus] listener error:', err)
      }
    }
  }

  removeAll(): void {
    this.listeners.clear()
  }

  get listenerCount(): number {
    return this.listeners.size
  }
}
