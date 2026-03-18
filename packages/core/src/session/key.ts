// SessionKey format: agent:<agentId>:<channel>:<accountId>:<peerKind>:<peerId>

export type Channel = 'feishu' | 'dingtalk' | 'wecom' | 'api' | 'desktop'
export type PeerKind = 'direct' | 'group' | 'thread'

export interface ParsedSessionKey {
  agentId: string
  channel: Channel
  accountId: string
  peerKind: PeerKind
  peerId: string
}

/** 桌面客户端固定 SessionKey */
export const DESKTOP_SESSION_KEY = 'agent:main:desktop:default:direct:local'

export function buildSessionKey(p: ParsedSessionKey): string {
  return `agent:${p.agentId}:${p.channel}:${p.accountId}:${p.peerKind}:${p.peerId}`
}

export function parseSessionKey(key: string): ParsedSessionKey {
  const parts = key.split(':')
  if (parts.length !== 6 || parts[0] !== 'agent') {
    throw new Error(`Invalid SessionKey: ${key}`)
  }
  return {
    agentId: parts[1],
    channel: parts[2] as Channel,
    accountId: parts[3],
    peerKind: parts[4] as PeerKind,
    peerId: parts[5],
  }
}
