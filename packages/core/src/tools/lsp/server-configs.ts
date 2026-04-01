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
  /** 检测工作区是否适用该语言 */
  detect(workspaceDir: string): boolean
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

const typescriptConfig: LspServerConfig = {
  language: 'typescript',

  detect(dir) {
    return fs.existsSync(path.join(dir, 'tsconfig.json'))
      || fs.existsSync(path.join(dir, 'jsconfig.json'))
      || fs.existsSync(path.join(dir, 'package.json'))
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

  detect(dir) {
    // 存在 .py 文件或 pyproject.toml / requirements.txt
    return fs.existsSync(path.join(dir, 'pyproject.toml'))
      || fs.existsSync(path.join(dir, 'requirements.txt'))
      || fs.existsSync(path.join(dir, 'setup.py'))
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

  detect(dir) {
    return fs.existsSync(path.join(dir, 'go.mod'))
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
