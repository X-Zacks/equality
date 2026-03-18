/**
 * skills/prc-install.ts — PRC 镜像安装命令映射
 *
 * 所有安装命令走国内镜像源。
 */

import type { SkillInstallSpec } from './types.js'

const PRC_MIRRORS: Record<string, string> = {
  pip: 'https://pypi.tuna.tsinghua.edu.cn/simple',
  npm: 'https://registry.npmmirror.com',
  go: 'https://goproxy.cn',
  conda: 'https://mirrors.tuna.tsinghua.edu.cn/anaconda',
}

/**
 * 为安装指令生成 PRC 镜像友好的命令
 */
export function buildInstallCommand(spec: SkillInstallSpec): string {
  switch (spec.kind) {
    case 'pip':
      return `pip install -i ${spec.mirror ?? PRC_MIRRORS.pip} ${spec.spec}`
    case 'npm':
      return `npm install --registry ${spec.mirror ?? PRC_MIRRORS.npm} ${spec.spec}`
    case 'go':
      return `$env:GOPROXY='${spec.mirror ?? PRC_MIRRORS.go}'; go install ${spec.spec}`
    case 'conda':
      return `conda install -c ${spec.mirror ?? PRC_MIRRORS.conda} ${spec.spec}`
    case 'apt':
      return `apt install -y ${spec.spec}`
    case 'download':
      return `curl.exe -fsSLO ${spec.spec}`
    default:
      return `# unknown install kind: ${spec.kind}`
  }
}
