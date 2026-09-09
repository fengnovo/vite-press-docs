import { defineConfig } from 'vitepress'

const base = process.env.VITEPRESS_BASE || '/vite-press-docs/'

export default defineConfig({
  lang: 'zh-CN',
  title: '前端前沿技术爱好者',
  description: '关于工程、产品与持续写作的个人博客',
  base,
  cleanUrls: true,
  ignoreDeadLinks: [/^https?:\/\/localhost/],
  appearance: true,
  markdown: {
    config(md) {
      const renderFence = md.renderer.rules.fence!

      md.renderer.rules.fence = (tokens, index, options, env, self) => {
        const token = tokens[index]
        const language = token.info.trim().split(/\s+/, 1)[0]

        if (language === 'mermaid') {
          return `<MermaidDiagram graph="${encodeURIComponent(token.content)}" />`
        }

        return renderFence(tokens, index, options, env, self)
      }
    }
  },
  head: [
    ['link', { rel: 'icon', type: 'image/png', href: `${base}images/9670320.png` }],
    ['link', { rel: 'apple-touch-icon', href: `${base}images/9670320.png` }],
    ['meta', { name: 'theme-color', content: '#243b3b' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: '前端前沿技术爱好者' }],
    ['meta', { property: 'og:description', content: '关于工程、产品与持续写作的个人博客' }]
  ],
  themeConfig: {
    logo: '/images/9670320.png',
    nav: [
      { text: '首页', link: '/' },
      { text: '项目', link: '/projects' }
    ],
    sidebar: {
      '/posts/': [
        {
          text: 'LLM 应用实战项目',
          items: [
            { text: 'LLM 应用实战项目合集', link: '/posts/llm-projects-overview' },
            { text: '项目 1：AI 聊天助手', link: '/posts/llm-ai-chat-assistant' },
            { text: '项目 2：AI 角色聊天引擎', link: '/posts/llm-ai-character-engine' },
            { text: '项目 3：RAG 知识库问答系统', link: '/posts/llm-rag-knowledge-base' },
            { text: '项目 4：Agent 任务助手', link: '/posts/llm-agent-task-assistant' },
            { text: '项目 5：多模态内容推荐系统', link: '/posts/llm-multimodal-rag' },
            { text: '项目 6：私有化模型部署 + 模型网关', link: '/posts/llm-model-gateway-deployment' }
          ]
        },
        {
          text: '文章',
          items: [
            { text: 'RPC 服务和高性能 BFF 层', link: '/posts/rpc-bff' },
            { text: 'Node.js 高可用实战：无状态、读写分离、缓存与熔断降级', link: '/posts/nodejs-high-availability' },
            { text: 'KUI 自研 React 组件库：从 Monorepo 到 Headless 组件和发布流水线', link: '/posts/react-kui-component-library' },
            { text: 'Simple LLM + MCP + RAG：不用框架搭一个增强型指定知识库 Agent', link: '/posts/simple-llm-mcp-rag-agent' },
            { text: '多分支自动部署转测：用泛域名给每个分支生成独立测试环境', link: '/posts/multi-branch-auto-deploy-test-env' },
            { text: 'App 前端离线包：让 Hybrid H5 从 CDN 请求变成本地命中', link: '/posts/offline-package-hybrid-app' },
            { text: 'AI Component Platform：把 AI 能力做成可灰度、可观测、可部署的组件', link: '/posts/ai-component-platform' },
            { text: '前端监控告警平台：从 SDK 到 SourceMap 和告警闭环', link: '/posts/frontend-monitoring-platform' },
            { text: '通用审核系统：用 X6 画出审批流程', link: '/posts/universal-audit-designer' },
            { text: '通用动态问卷：用 JSON 配置驱动多步骤表单', link: '/posts/dynamic-questionnaire-sdk' },
            { text: 'Logic Composer：用 DSL 驱动一个智能工作流编排器', link: '/posts/logic-composer-workflow-engine' },
            { text: '用 Module Federation 搭一个低代码平台', link: '/posts/module-federation-lowcode-mvp' }
          ]
        }
      ]
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/fengnovo' }
    ],
    footer: {
      message: `<a class="beian-link" href="http://www.beian.gov.cn/portal/registerSystemInfo?recordcode=41102402000277" target="_blank" rel="noreferrer"><img src="${base}images/logo01.6189a29f.png" alt="" />粤ICP备2025494808号</a>`
    },
    search: {
      provider: 'local'
    },
    outline: {
      label: '本页目录'
    },
    docFooter: {
      prev: '上一篇',
      next: '下一篇'
    }
  }
})
