import './WelcomeGuide.css'

interface WelcomeGuideProps {
  onSendPrompt: (text: string) => void
}

const SCENARIOS = [
  {
    icon: '🧑‍💻',
    title: '分析项目',
    desc: '理解项目结构和技术栈',
    prompt: '帮我分析当前目录的项目结构，列出主要模块、技术栈和入口文件',
  },
  {
    icon: '📝',
    title: '撰写文档',
    desc: '生成 README 或技术文档',
    prompt: '帮我为当前项目写一份清晰的 README 文档，包含安装说明和使用方法',
  },
  {
    icon: '🔍',
    title: '搜索信息',
    desc: '在网上搜索最新资讯',
    prompt: '搜索最新的 TypeScript 5.x 有哪些新特性，给我一个简洁的总结',
  },
  {
    icon: '🛠️',
    title: '自动化工作流',
    desc: '创建可复用的任务流程',
    prompt: '帮我创建一个自动化的 Git 提交和推送工作流 Skill',
  },
]

export default function WelcomeGuide({ onSendPrompt }: WelcomeGuideProps) {
  return (
    <div className="welcome-guide">
      <div className="welcome-brand">
        <span className="welcome-logo">⚖️</span>
        <h2 className="welcome-title">你好，我是 Equality</h2>
        <p className="welcome-subtitle">你的桌面 AI 助理，随时准备帮你完成各种任务</p>
      </div>

      <div className="welcome-cards">
        {SCENARIOS.map((s) => (
          <button
            key={s.title}
            className="welcome-card"
            onClick={() => onSendPrompt(s.prompt)}
          >
            <span className="welcome-card-icon">{s.icon}</span>
            <div className="welcome-card-text">
              <span className="welcome-card-title">{s.title}</span>
              <span className="welcome-card-desc">{s.desc}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="welcome-tips">
        <span>💡</span>
        <span><kbd>@</kbd> 选技能</span>
        <span className="welcome-tips-sep">·</span>
        <span><kbd>#</kbd> 选工具</span>
        <span className="welcome-tips-sep">·</span>
        <span>📎 加文件</span>
        <span className="welcome-tips-sep">·</span>
        <span><kbd>Enter</kbd> 发送</span>
      </div>
    </div>
  )
}
