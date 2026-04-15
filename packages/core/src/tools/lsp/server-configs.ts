/**
 * tools/lsp/server-configs.ts — 语言服务器配置
 *
 * Phase B: LSP 语义代码理解
 *
 * 每种语言定义：
 *   - detect(dir): 工作区是否适用
 *   - command(dir): spawn 命令和参数
 *   - installCommand: 安装指引
 *   - guideUrl: 文档链接
 */

import fs from 'node:fs'
import path from 'node:path'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LspServerConfig {
  language: string
  /**
   * 检测工作区是否适用该语言
   * @param filePath 目标文件绝对路径（可选）。提供时会从文件所在目录向上搜索项目配置。
   */
  detect(workspaceDir: string, filePath?: string): boolean
  /** 构建启动命令 */
  command(workspaceDir: string): { cmd: string; args: string[]; env?: Record<string, string> }
  /** 初始化参数（传给 initialize 请求的 initializationOptions） */
  initOptions?: unknown
  /** 安装命令（缺失时展示给 Agent） */
  installCommand: string
  /** 文档链接 */
  guideUrl: string
}

// ─── TypeScript / JavaScript ──────────────────────────────────────────────────

/** 从 startDir 向上搜索配置文件，直到 boundary（含）为止 */
function findConfigUp(startDir: string, boundary: string, configNames: string[]): boolean {
  let dir = startDir
  const root = path.parse(dir).root
  while (true) {
    for (const name of configNames) {
      if (fs.existsSync(path.join(dir, name))) return true
    }
    // 到达工作区根目录边界，停止
    if (path.resolve(dir) === path.resolve(boundary)) break
    const parent = path.dirname(dir)
    if (parent === dir || parent === root) break
    dir = parent
  }
  return false
}

/** TypeScript/JavaScript 文件扩展名 */
const TS_JS_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'])

const typescriptConfig: LspServerConfig = {
  language: 'typescript',

  detect(dir, filePath?) {
    // 1. 先检查工作区根目录（原有逻辑）
    if (fs.existsSync(path.join(dir, 'tsconfig.json'))
      || fs.existsSync(path.join(dir, 'jsconfig.json'))
      || fs.existsSync(path.join(dir, 'package.json'))) {
      return true
    }

    // 2. 如果有目标文件路径，从文件所在目录向上搜索配置文件
    if (filePath) {
      const fileDir = path.dirname(filePath)
      if (findConfigUp(fileDir, dir, ['tsconfig.json', 'jsconfig.json', 'package.json'])) {
        return true
      }

      // 3. fallback：文件扩展名是 TS/JS → 允许无配置启动
      //    typescript-language-server 支持无 tsconfig 的散文件模式
      if (TS_JS_EXTS.has(path.extname(filePath).toLowerCase())) {
        return true
      }
    }

    return false
  },

  command(dir) {
    // 优先使用项目本地安装的 typescript-language-server
    const localBin = path.join(dir, 'node_modules', '.bin', 'typescript-language-server')
    const localBinWin = localBin + '.cmd'

    let cmd: string
    if (process.platform === 'win32' && fs.existsSync(localBinWin)) {
      cmd = localBinWin
    } else if (fs.existsSync(localBin)) {
      cmd = localBin
    } else {
      cmd = 'typescript-language-server'
    }
    return { cmd, args: ['--stdio'] }
  },

  initOptions: {
    preferences: {
      includeInlayParameterNameHints: 'none',
    },
  },

  installCommand: 'npm install -g typescript-language-server typescript',
  guideUrl: 'https://github.com/typescript-language-server/typescript-language-server',
}

// ─── Python ───────────────────────────────────────────────────────────────────

const pythonConfig: LspServerConfig = {
  language: 'python',

  detect(dir, filePath?) {
    // 存在 .py 文件或 pyproject.toml / requirements.txt
    if (fs.existsSync(path.join(dir, 'pyproject.toml'))
      || fs.existsSync(path.join(dir, 'requirements.txt'))
      || fs.existsSync(path.join(dir, 'setup.py'))) {
      return true
    }
    // 从文件目录向上搜索，或扩展名 fallback
    if (filePath) {
      const fileDir = path.dirname(filePath)
      if (findConfigUp(fileDir, dir, ['pyproject.toml', 'requirements.txt', 'setup.py'])) return true
      if (path.extname(filePath).toLowerCase() === '.py') return true
    }
    return false
  },

  command(_dir) {
    // pyright 的 LSP 模式
    return { cmd: 'pyright-langserver', args: ['--stdio'] }
  },

  installCommand: 'pip install pyright',
  guideUrl: 'https://github.com/microsoft/pyright',
}

// ─── Go ───────────────────────────────────────────────────────────────────────

const goConfig: LspServerConfig = {
  language: 'go',

  detect(dir, filePath?) {
    if (fs.existsSync(path.join(dir, 'go.mod'))) return true
    if (filePath) {
      const fileDir = path.dirname(filePath)
      if (findConfigUp(fileDir, dir, ['go.mod'])) return true
      if (path.extname(filePath).toLowerCase() === '.go') return true
    }
    return false
  },

  command(_dir) {
    return { cmd: 'gopls', args: ['serve'] }
  },

  installCommand: 'go install golang.org/x/tools/gopls@latest',
  guideUrl: 'https://github.com/golang/tools/tree/master/gopls',
}

// ─── 全部配置 ─────────────────────────────────────────────────────────────────

export const ALL_CONFIGS: LspServerConfig[] = [
  typescriptConfig,
  pythonConfig,
  goConfig,
]

/**
 * 根据语言 key 查找配置
 */
export function getConfigByLanguage(language: string): LspServerConfig | null {
  return ALL_CONFIGS.find(c => c.language === language) ?? null
}
