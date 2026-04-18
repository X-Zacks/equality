/**
 * tools/bash-sandbox.ts — Bash 沙箱路径隔离（Phase C.2）
 *
 * 限制 bash 工具的文件访问范围不超出 ToolContext.workspaceDir。
 * workspaceDir 来源：设置页「工作目录」→ WORKSPACE_DIR → index.ts getWorkspaceDir()
 *
 * 验证流程（3 步）：
 * 1. detectInjection() — 拦截 Unicode 不可见字符、NULL 字节等攻击向量
 * 2. extractPathArgs()  — 从命令中提取路径参数（仅已知命令的路径位置）
 * 3. validatePath()     — 对每个路径做 resolve + realpath + normalize 比较
 *
 * 设计约束：
 * - 仅做静态命令词分析（非 OS 级 chroot/namespace）
 * - 未知命令不拦截（C1 已将其分类为 EXEC）
 * - Windows 路径大小写不敏感 + 反斜杠标准化
 */

import * as path from 'node:path'
import * as fs from 'node:fs'
import * as os from 'node:os'

// ─── 公共接口 ─────────────────────────────────────────────────────────────────

/** 沙箱配置 */
export interface SandboxConfig {
  /** 工作区根目录（来自 ToolContext.workspaceDir） */
  workspaceDir: string
  /** 允许访问系统临时目录（默认 true） */
  allowSystemTemp?: boolean
  /** 额外白名单路径（绝对路径） */
  allowedExternalPaths?: string[]
}

/** 沙箱验证结果 */
export interface SandboxResult {
  allowed: boolean
  reason?: string
  /** 提取到的路径列表（用于审计） */
  paths?: string[]
}

// ─── 路径标准化 ──────────────────────────────────────────────────────────────

const IS_WINDOWS = process.platform === 'win32'

/**
 * 跨平台路径标准化（用于比较）
 * - 反斜杠 → 正斜杠
 * - Windows 下 toLowerCase
 * - 去除尾部斜杠（根路径除外）
 */
export function normalizePath(p: string): string {
  let normalized = p.replace(/\\/g, '/')
  if (IS_WINDOWS) normalized = normalized.toLowerCase()
  // 去尾部斜杠（但保留根路径如 c:/ 或 /）
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1)
  }
  // 对 Windows 驱动器根（c:）补斜杠
  if (IS_WINDOWS && /^[a-z]:$/.test(normalized)) {
    normalized = normalized + '/'
  }
  return normalized
}

// ─── Step 1: 注入检测 ────────────────────────────────────────────────────────

/**
 * 检测命令中的注入攻击向量
 *
 * @returns 注入描述（有注入时），null（安全时）
 */
export function detectInjection(command: string): string | null {
  // Unicode 不可见空格
  // eslint-disable-next-line no-control-regex
  const unicodeSpaces = /[\u00A0\u2000-\u200B\u2028\u2029\u3000\uFEFF]/
  if (unicodeSpaces.test(command)) {
    const match = command.match(unicodeSpaces)
    const cp = match?.[0].codePointAt(0)?.toString(16).toUpperCase()
    return `检测到 Unicode 不可见字符注入 (U+${cp})`
  }

  // NULL 字节
  if (command.includes('\x00')) {
    return '检测到 NULL 字节注入 (\\x00)'
  }

  // 裸 \r 不跟 \n（回车注入）
  if (/\r(?!\n)/.test(command)) {
    return '检测到原始回车注入 (\\r without \\n)'
  }

  return null
}

// ─── Step 2: 路径参数提取 ─────────────────────────────────────────────────────

/**
 * 已知命令 → 哪些位置是路径参数
 *
 * 'rest' = 跳过 flags 后所有非 flag token 都是路径
 * 数字 = 第 N 个非 flag token 是路径（0-indexed）
 */
const PATH_COMMANDS: Record<string, 'rest' | number[]> = {
  // Unix 文件操作
  cat: 'rest', head: 'rest', tail: 'rest', less: 'rest', more: 'rest',
  rm: 'rest', rmdir: 'rest', mkdir: 'rest', touch: 'rest',
  ls: 'rest', dir: 'rest', stat: 'rest', file: 'rest',
  chmod: [1], chown: [1], chgrp: [1],
  cp: 'rest', mv: 'rest', ln: 'rest',
  cd: [0],

  // PowerShell cmdlet（小写匹配）
  'get-content': 'rest', 'set-content': [0], 'add-content': [0],
  'remove-item': 'rest', 'move-item': [0, 1], 'copy-item': [0, 1],
  'new-item': [0], 'rename-item': [0, 1],
  'get-childitem': 'rest', 'get-item': 'rest', 'test-path': 'rest',
  'set-location': [0],

  // PowerShell 别名
  del: 'rest', rd: 'rest', ri: 'rest', ni: [0], mi: [0, 1], ci: [0, 1],
  type: 'rest', gc: 'rest', sc: [0], ac: [0],
}

/**
 * 从 bash 命令中提取路径参数
 */
export function extractPathArgs(command: string): string[] {
  // 按命令分隔符拆分
  const parts = command.split(/\s*(?:&&|\|\||[;\n|])\s*/)
  const paths: string[] = []

  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue

    const tokens = trimmed.split(/\s+/)

    // 跳过 env var 赋值前缀和 sudo/env 等
    let cmdIndex = 0
    while (cmdIndex < tokens.length) {
      const tok = tokens[cmdIndex]
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tok)) { cmdIndex++; continue }
      if (tok === 'sudo' || tok === 'env' || tok === 'nohup' || tok === 'time') { cmdIndex++; continue }
      break
    }

    if (cmdIndex >= tokens.length) continue

    const cmdWord = tokens[cmdIndex].toLowerCase()
    const spec = PATH_COMMANDS[cmdWord]
    if (!spec) continue // 未知命令 → 不提取路径

    // 收集非 flag 参数
    const args: string[] = []
    for (let i = cmdIndex + 1; i < tokens.length; i++) {
      const tok = tokens[i]
      if (tok.startsWith('-')) continue // 跳过 flags
      if (tok.startsWith('>') || tok === '<') continue // 跳过重定向
      args.push(tok)
    }

    if (spec === 'rest') {
      paths.push(...args)
    } else {
      // 特定位置
      for (const idx of spec) {
        if (idx < args.length) paths.push(args[idx])
      }
    }
  }

  return paths
}

// ─── Step 3: 路径验证 ────────────────────────────────────────────────────────

/**
 * 验证单个路径是否在沙箱范围内
 */
export function validatePath(inputPath: string, config: SandboxConfig): SandboxResult {
  const { workspaceDir, allowSystemTemp = true, allowedExternalPaths = [] } = config

  // resolve 相对路径
  const resolved = path.resolve(workspaceDir, inputPath)

  // 追踪符号链接
  let realResolved: string
  try {
    realResolved = fs.realpathSync(resolved)
  } catch {
    // 路径不存在时用 resolve 结果（创建文件场景）
    realResolved = resolved
  }

  const normalizedReal = normalizePath(realResolved)
  const normalizedWorkspace = normalizePath(workspaceDir)

  // 检查是否在 workspaceDir 内
  if (normalizedReal === normalizedWorkspace || normalizedReal.startsWith(normalizedWorkspace + '/')) {
    return { allowed: true }
  }

  // 检查系统临时目录
  if (allowSystemTemp) {
    const tmpDir = normalizePath(os.tmpdir())
    if (normalizedReal === tmpDir || normalizedReal.startsWith(tmpDir + '/')) {
      return { allowed: true }
    }
  }

  // 检查额外白名单
  for (const ext of allowedExternalPaths) {
    const normalizedExt = normalizePath(ext)
    if (normalizedReal === normalizedExt || normalizedReal.startsWith(normalizedExt + '/')) {
      return { allowed: true }
    }
  }

  return {
    allowed: false,
    reason: `路径 "${inputPath}" (解析为 ${realResolved}) 超出工作区范围 (${workspaceDir})`,
  }
}

// ─── Step 4: 解释器命令安全检查（Phase Y0）──────────────────────────────────

/**
 * 已知脚本解释器 — 可通过 -c/-e 参数执行任意代码
 */
const INTERPRETER_COMMANDS = new Set([
  'python', 'python3', 'py', 'node', 'ruby', 'perl', 'php',
  'curl', 'wget', 'invoke-webrequest', 'invoke-restmethod',
  'iwr', 'irm',
])

/**
 * 内联脚本中的危险路径模式（表示试图访问 workspace 外的敏感区域）
 */
const DANGEROUS_PATH_PATTERNS = [
  // Unix 敏感目录
  /(?:^|['"(\s])\/etc\//i,
  /(?:^|['"(\s])\/root\//i,
  /(?:^|['"(\s])\/home\/[^/]+\/\./i,  // /home/user/.ssh 等
  /(?:^|['"(\s])\/var\/(?:log|run|spool)\//i,
  /(?:^|['"(\s])\/proc\//i,
  /(?:^|['"(\s])\/sys\//i,
  // Windows 敏感目录
  /C:\\Windows/i,
  /C:\\Users\\[^\\]+\\AppData/i,
  /C:\\ProgramData/i,
  // 通用敏感路径
  /['"(\s]~\/\.\w/,  // ~/.ssh, ~/.aws, ~/.gnupg 等
  /\.ssh[\/\\]/i,
  /\.aws[\/\\]/i,
  /\.gnupg[\/\\]/i,
  /\.kube[\/\\]/i,
  // file:// 协议（用于 curl 读取本地文件）
  /file:\/\/\//i,
  // 环境变量泄露（读取 API Key）
  /\$env:.*(?:KEY|TOKEN|SECRET|PASSWORD)/i,
  /\$(?:MINIMAX|DEEPSEEK|OPENAI|COPILOT|CUSTOM|VOLCENGINE|DASHSCOPE|QWEN)_/i,
  /echo\s+\$\w*(?:KEY|TOKEN|SECRET|PASSWORD)/i,
]

/**
 * 检测解释器命令中的危险路径访问
 */
export function checkInterpreterSafety(command: string, config: SandboxConfig): SandboxResult {
  const parts = command.split(/\s*(?:&&|\|\||[;\n|])\s*/)

  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue

    const tokens = trimmed.split(/\s+/)

    // 跳过 sudo/env 等前缀
    let cmdIndex = 0
    while (cmdIndex < tokens.length) {
      const tok = tokens[cmdIndex]
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tok)) { cmdIndex++; continue }
      if (tok === 'sudo' || tok === 'env' || tok === 'nohup') { cmdIndex++; continue }
      break
    }
    if (cmdIndex >= tokens.length) continue

    const cmdWord = tokens[cmdIndex].toLowerCase().replace(/\.exe$/, '')

    // 检查是否是解释器命令
    if (!INTERPRETER_COMMANDS.has(cmdWord)) continue

    // 收集该子命令的剩余部分作为"脚本内容"
    const scriptContent = tokens.slice(cmdIndex + 1).join(' ')

    // 在脚本内容中扫描危险路径
    for (const pattern of DANGEROUS_PATH_PATTERNS) {
      if (pattern.test(scriptContent) || pattern.test(trimmed)) {
        return {
          allowed: false,
          reason: `解释器命令 "${cmdWord}" 中检测到敏感路径访问: ${pattern.source}`,
        }
      }
    }

    // 检查解释器命令中的绝对路径是否在 workspace 外
    const absPathMatches = scriptContent.match(/(?:['"])?([A-Za-z]:\\[^\s'"]+|\/[^\s'"]+)/g)
    if (absPathMatches) {
      for (const rawPath of absPathMatches) {
        const cleanPath = rawPath.replace(/^['"]|['"]$/g, '')
        const result = validatePath(cleanPath, config)
        if (!result.allowed) {
          return {
            allowed: false,
            reason: `解释器命令 "${cmdWord}" 试图访问 workspace 外路径: ${cleanPath}`,
          }
        }
      }
    }
  }

  return { allowed: true }
}

// ─── Step 5: 环境变量安全清洗（Phase Y0）────────────────────────────────────

/**
 * 从环境变量中剔除敏感 API Key，防止脚本通过 $env:XXX_KEY 泄露
 */
export function sanitizeEnvForBash(env: Record<string, string>): Record<string, string> {
  const SENSITIVE_PATTERN = /_(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)$/i
  const KEEP_LIST = new Set([
    'PATH', 'HOME', 'USERPROFILE', 'TEMP', 'TMP', 'TMPDIR',
    'HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy',
    'NO_PROXY', 'no_proxy',
    'LANG', 'LC_ALL', 'TERM', 'SHELL',
    'COMPUTERNAME', 'USERNAME', 'LOGNAME', 'USER',
    'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'APPDATA', 'LOCALAPPDATA',
    'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMDATA',
    'NODE_PATH', 'NODE_ENV', 'PYTHONPATH', 'PYTHONDONTWRITEBYTECODE',
    'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL',
  ])

  const sanitized: Record<string, string> = {}
  for (const [key, val] of Object.entries(env)) {
    if (KEEP_LIST.has(key)) {
      sanitized[key] = val
    } else if (SENSITIVE_PATTERN.test(key)) {
      // 剔除敏感变量
      continue
    } else {
      sanitized[key] = val
    }
  }
  return sanitized
}

// ─── 主函数 ──────────────────────────────────────────────────────────────────

/**
 * 验证 bash 命令是否在沙箱范围内
 *
 * @param command - 要执行的 shell 命令
 * @param config  - 沙箱配置（workspaceDir 来自 ToolContext）
 * @returns 验证结果
 */
export function validateBashCommand(command: string, config: SandboxConfig): SandboxResult {
  // Step 1: 注入检测
  const injection = detectInjection(command)
  if (injection) {
    return { allowed: false, reason: injection }
  }

  // Step 2: 解释器命令安全检查（Phase Y0）
  const interpreterCheck = checkInterpreterSafety(command, config)
  if (!interpreterCheck.allowed) {
    return interpreterCheck
  }

  // Step 3: 提取路径参数
  const paths = extractPathArgs(command)
  if (paths.length === 0) {
    // 无路径参数（如 echo hello, whoami 等）→ 允许
    return { allowed: true, paths: [] }
  }

  // Step 4: 验证每个路径
  for (const p of paths) {
    const result = validatePath(p, config)
    if (!result.allowed) {
      return { allowed: false, reason: result.reason, paths }
    }
  }

  return { allowed: true, paths }
}
