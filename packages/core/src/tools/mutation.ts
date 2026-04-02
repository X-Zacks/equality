/**
 * tools/mutation.ts — 写操作精确识别（Phase C.1）
 *
 * 替代 runner.ts 中的硬编码 MUTATING_TOOL_NAMES，
 * 提供动态的工具变异分类和操作指纹。
 *
 * 设计目标：
 * 1. 静态工具直接查表（O(1)）
 * 2. 动态工具（bash/process）按命令词/动作做启发式判断
 * 3. 未知工具 → 保守估计为 EXEC
 * 4. 操作指纹用于 loop-detector 等去重场景
 */

import { createHash } from 'node:crypto'

// ─── MutationType ─────────────────────────────────────────────────────────────

/** 工具操作的变异类型 */
export enum MutationType {
  /** 只读操作：不改变任何外部状态 */
  READ = 'read',
  /** 写操作：修改文件系统、进程状态等 */
  WRITE = 'write',
  /** 执行操作：不确定副作用（保守估计） */
  EXEC = 'exec',
}

// ─── Classification & Fingerprint ─────────────────────────────────────────────

/** 分类结果 */
export interface MutationClassification {
  /** 变异类型 */
  type: MutationType
  /** 置信度来源 */
  confidence: 'static' | 'heuristic'
  /** 判断原因（人类可读） */
  reason: string
}

/** 操作指纹（用于去重和循环检测） */
export interface OperationFingerprint {
  /** 工具名称 */
  toolName: string
  /** 具体动作（bash 的 command、process 的 action 等） */
  action: string
  /** 操作目标列表（文件路径、进程 ID 等） */
  targets: string[]
  /** SHA-256 前 8 位 hash（与 loop-detector 一致） */
  hash: string
}

// ─── 工具分类表 ──────────────────────────────────────────────────────────────

/**
 * 静态工具 → MutationType 映射
 *
 * 'dynamic' 表示需要根据参数动态判断
 */
const TOOL_MUTATION_MAP: Record<string, MutationType | 'dynamic'> = {
  // ── 文件系统 ──
  read_file: MutationType.READ,
  write_file: MutationType.WRITE,
  edit_file: MutationType.WRITE,
  glob: MutationType.READ,
  grep: MutationType.READ,
  list_dir: MutationType.READ,
  apply_patch: MutationType.WRITE,

  // ── 运行时 ──
  bash: 'dynamic',
  process: 'dynamic',

  // ── 网络 ──
  web_fetch: MutationType.READ,
  web_search: MutationType.READ,

  // ── 媒体 ──
  read_image: MutationType.READ,
  read_pdf: MutationType.READ,

  // ── 高级 ──
  cron: MutationType.EXEC,
  browser: MutationType.EXEC,

  // ── 长期记忆 ──
  memory_save: MutationType.WRITE,
  memory_search: MutationType.READ,

  // ── LSP 语义代码理解 ──
  lsp_hover: MutationType.READ,
  lsp_definition: MutationType.READ,
  lsp_references: MutationType.READ,
  lsp_diagnostics: MutationType.READ,
}

// ─── Bash 命令词分类 ────────────────────────────────────────────────────────

/** Unix/Linux 写操作命令词 */
const WRITE_COMMANDS_UNIX = new Set([
  // 文件操作
  'rm', 'rmdir', 'mv', 'cp', 'touch', 'mkdir', 'chmod', 'chown', 'chgrp',
  'truncate', 'shred', 'mkfifo', 'mknod', 'install',
  // 文本处理（原地修改）
  'sed', 'tee', 'dd',
  // 包管理器
  'npm', 'pnpm', 'yarn', 'pip', 'pip3', 'cargo', 'go', 'gem', 'composer',
  'apt', 'apt-get', 'yum', 'dnf', 'brew', 'pacman', 'apk',
  // 版本控制
  'git',
  // 系统
  'kill', 'killall', 'pkill', 'systemctl', 'service',
  // 链接
  'ln', 'unlink',
  // 压缩/解压
  'tar', 'zip', 'unzip', 'gzip', 'gunzip', 'bzip2',
])

/** PowerShell 写操作 cmdlet（小写比较） */
const WRITE_COMMANDS_POWERSHELL = new Set([
  // 文件操作
  'remove-item', 'move-item', 'copy-item', 'new-item', 'rename-item',
  'set-content', 'add-content', 'clear-content', 'out-file',
  'set-itemproperty', 'remove-itemproperty',
  // 进程管理
  'stop-process', 'start-process',
  // 服务管理
  'stop-service', 'start-service', 'restart-service',
  // 权限
  'set-acl',
  // 环境变量
  'set-variable', 'remove-variable',
  // 包管理
  'install-module', 'install-package', 'uninstall-module',
  // 别名
  'del', 'rd', 'ren', 'ri', 'mi', 'ci', 'ni', 'sc', 'ac',
])

/** Unix/Linux 只读命令词 */
const READ_COMMANDS_UNIX = new Set([
  'ls', 'cat', 'head', 'tail', 'wc', 'grep', 'egrep', 'fgrep',
  'find', 'locate', 'which', 'whereis', 'type', 'file',
  'env', 'echo', 'printf', 'pwd', 'whoami', 'hostname', 'uname',
  'date', 'cal', 'uptime', 'df', 'du', 'free', 'top', 'ps', 'id',
  'diff', 'cmp', 'stat', 'readlink', 'realpath', 'basename', 'dirname',
  'sort', 'uniq', 'cut', 'tr', 'awk', 'less', 'more', 'strings',
  'md5sum', 'sha256sum', 'sha1sum',
  'tree', 'lsof', 'netstat', 'ss', 'ping', 'dig', 'nslookup', 'curl', 'wget',
  'jq', 'yq', 'xargs',
])

/** PowerShell 只读 cmdlet（小写比较） */
const READ_COMMANDS_POWERSHELL = new Set([
  'get-childitem', 'get-content', 'get-item', 'get-itemproperty',
  'test-path', 'resolve-path', 'split-path', 'join-path',
  'get-location', 'get-process', 'get-service',
  'get-command', 'get-help', 'get-module',
  'get-date', 'get-host', 'get-variable',
  'select-object', 'where-object', 'format-table', 'format-list',
  'measure-object', 'sort-object', 'group-object',
  'write-output', 'write-host',
  'test-connection', 'invoke-webrequest', 'invoke-restmethod',
  // 常见别名
  'dir', 'ls', 'cat', 'type', 'echo', 'pwd', 'cd', 'cls',
  'gci', 'gc', 'gi', 'gl',
])

// ─── process 工具动作分类 ─────────────────────────────────────────────────────

/** process 工具的写操作动作 */
const PROCESS_WRITE_ACTIONS = new Set(['kill', 'terminate', 'signal'])
/** process 工具的读操作动作 */
const PROCESS_READ_ACTIONS = new Set(['list', 'poll', 'log', 'status', 'info'])

// ─── 核心函数 ─────────────────────────────────────────────────────────────────

/**
 * 对工具调用进行变异分类
 *
 * @param toolName - 工具名称
 * @param params   - 工具调用参数（bash 需要 command，process 需要 action）
 * @returns 分类结果
 */
export function classifyMutation(
  toolName: string,
  params?: Record<string, unknown>,
): MutationClassification {
  const entry = TOOL_MUTATION_MAP[toolName]

  // 1. 未知工具 → 保守估计为 EXEC
  if (entry === undefined) {
    return {
      type: MutationType.EXEC,
      confidence: 'heuristic',
      reason: `unknown tool "${toolName}", conservative EXEC`,
    }
  }

  // 2. 静态工具 → 直接查表
  if (entry !== 'dynamic') {
    return {
      type: entry,
      confidence: 'static',
      reason: `static mapping for "${toolName}"`,
    }
  }

  // 3. 动态工具 → 按参数判断
  if (toolName === 'bash') {
    return classifyBashCommand(params)
  }

  if (toolName === 'process') {
    return classifyProcessAction(params)
  }

  // 兜底：dynamic 但未实现特定逻辑
  return {
    type: MutationType.EXEC,
    confidence: 'heuristic',
    reason: `dynamic tool "${toolName}" with no specific classifier`,
  }
}

/**
 * 判断工具调用是否为变异（写/执行）操作
 *
 * 便捷函数，等价于 classifyMutation().type !== MutationType.READ
 */
export function isMutatingOperation(
  toolName: string,
  params?: Record<string, unknown>,
): boolean {
  const { type } = classifyMutation(toolName, params)
  return type !== MutationType.READ
}

/**
 * 提取操作指纹
 *
 * @param toolName - 工具名称
 * @param params   - 工具调用参数
 * @returns 操作指纹
 */
export function extractFingerprint(
  toolName: string,
  params?: Record<string, unknown>,
): OperationFingerprint {
  const action = extractAction(toolName, params)
  const targets = extractTargets(toolName, params)

  // 与 loop-detector 一致：排序 + 去重 → SHA-256 前 8 位
  const uniqueTargets = [...new Set(targets)].sort()
  const input = `${toolName}:${action}:${uniqueTargets.join(',')}`
  const hash = createHash('sha256').update(input).digest('hex').slice(0, 8)

  return { toolName, action, targets: uniqueTargets, hash }
}

// ─── 内部辅助 ─────────────────────────────────────────────────────────────────

/**
 * bash 命令分类
 */
function classifyBashCommand(params?: Record<string, unknown>): MutationClassification {
  const command = typeof params?.command === 'string' ? params.command : ''
  if (!command.trim()) {
    return {
      type: MutationType.READ,
      confidence: 'heuristic',
      reason: 'empty bash command treated as READ',
    }
  }

  const commandWords = extractCommandWords(command)

  if (commandWords.length === 0) {
    return {
      type: MutationType.EXEC,
      confidence: 'heuristic',
      reason: 'could not extract command words from bash command',
    }
  }

  // 取所有子命令中最危险的分类
  let hasWrite = false
  let hasExec = false

  for (const word of commandWords) {
    const lower = word.toLowerCase()

    // 检查 PowerShell cmdlet（含 Verb-Noun 模式）
    if (WRITE_COMMANDS_POWERSHELL.has(lower)) {
      hasWrite = true
      continue
    }
    if (READ_COMMANDS_POWERSHELL.has(lower)) {
      continue // READ，不影响结果
    }

    // 检查 Unix 命令
    if (WRITE_COMMANDS_UNIX.has(lower)) {
      hasWrite = true
      continue
    }
    if (READ_COMMANDS_UNIX.has(lower)) {
      continue // READ，不影响结果
    }

    // 未识别的命令词 → EXEC（保守）
    hasExec = true
  }

  if (hasWrite) {
    return {
      type: MutationType.WRITE,
      confidence: 'heuristic',
      reason: `bash command contains write command word(s): ${commandWords.join(', ')}`,
    }
  }

  if (hasExec) {
    return {
      type: MutationType.EXEC,
      confidence: 'heuristic',
      reason: `bash command contains unrecognized command word(s): ${commandWords.join(', ')}`,
    }
  }

  return {
    type: MutationType.READ,
    confidence: 'heuristic',
    reason: `bash command contains only read command word(s): ${commandWords.join(', ')}`,
  }
}

/**
 * 从 bash 命令中提取命令词列表
 *
 * 按 &&, ||, ;, |, \n 分割子命令，
 * 对每个子命令取第一个非 flag 的 token。
 */
export function extractCommandWords(command: string): string[] {
  // 按命令分隔符拆分
  const parts = command.split(/\s*(?:&&|\|\||[;\n|])\s*/)
  const words: string[] = []

  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue

    // 跳过环境变量赋值前缀（如 ENV_VAR=value command）
    const tokens = trimmed.split(/\s+/)
    let cmdWord: string | undefined

    for (const token of tokens) {
      // 跳过 env var 赋值（VAR=value）
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) continue
      // 跳过 sudo/env 等前缀
      if (token === 'sudo' || token === 'env' || token === 'nohup' || token === 'time') continue
      // 跳过 flags
      if (token.startsWith('-')) continue
      // 第一个有效 token 即为命令词
      cmdWord = token
      break
    }

    if (cmdWord) {
      words.push(cmdWord)
    }
  }

  return words
}

/**
 * process 工具动作分类
 */
function classifyProcessAction(params?: Record<string, unknown>): MutationClassification {
  const action = typeof params?.action === 'string' ? params.action.toLowerCase() : ''

  if (PROCESS_WRITE_ACTIONS.has(action)) {
    return {
      type: MutationType.WRITE,
      confidence: 'static',
      reason: `process action "${action}" is a write operation`,
    }
  }

  if (PROCESS_READ_ACTIONS.has(action)) {
    return {
      type: MutationType.READ,
      confidence: 'static',
      reason: `process action "${action}" is a read operation`,
    }
  }

  return {
    type: MutationType.EXEC,
    confidence: 'heuristic',
    reason: `process action "${action}" is unrecognized, conservative EXEC`,
  }
}

/**
 * 提取操作的动作描述
 */
function extractAction(toolName: string, params?: Record<string, unknown>): string {
  if (toolName === 'bash') {
    const command = typeof params?.command === 'string' ? params.command : ''
    // 取第一个命令词作为 action
    const words = extractCommandWords(command)
    return words[0] ?? 'unknown'
  }

  if (toolName === 'process') {
    return typeof params?.action === 'string' ? params.action : 'unknown'
  }

  // 静态工具用工具名本身作为 action
  return toolName
}

/**
 * 提取操作目标列表（文件路径、进程 ID 等）
 */
function extractTargets(toolName: string, params?: Record<string, unknown>): string[] {
  if (!params) return []

  const targets: string[] = []

  // 文件路径类参数
  for (const key of ['file_path', 'path', 'filePath', 'target', 'destination', 'source']) {
    if (typeof params[key] === 'string') {
      targets.push(params[key] as string)
    }
  }

  // bash 命令本身作为目标
  if (toolName === 'bash' && typeof params.command === 'string') {
    targets.push(params.command)
  }

  // process ID
  if (typeof params.pid === 'number' || typeof params.pid === 'string') {
    targets.push(String(params.pid))
  }
  if (typeof params.processId === 'number' || typeof params.processId === 'string') {
    targets.push(String(params.processId))
  }

  // URL
  if (typeof params.url === 'string') {
    targets.push(params.url)
  }

  // query（搜索类）
  if (typeof params.query === 'string') {
    targets.push(params.query)
  }

  // pattern（glob/grep）
  if (typeof params.pattern === 'string') {
    targets.push(params.pattern)
  }

  return targets
}
