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
      '/posts/ai-agent-langgraph-demo/': [
        {
          text: 'LangGraph Agent 实战',
          items: [
            { text: '系列总览', link: '/posts/ai-agent-langgraph-demo/' },
            { text: 'Demo 3：Checkpoint 持久化', link: '/posts/ai-agent-langgraph-demo/demo3' },
            { text: 'Demo 4：LangGraph 流式输出', link: '/posts/ai-agent-langgraph-demo/demo4-streaming' },
            { text: 'Demo 5：LangChain.js 基础', link: '/posts/ai-agent-langgraph-demo/demo5-langchain-base' },
            { text: 'Demo 6：接入 Langfuse', link: '/posts/ai-agent-langgraph-demo/demo6-langfuse' },
            { text: 'Demo 7：LlamaIndex 知识库', link: '/posts/ai-agent-langgraph-demo/demo7-llamaindex' },
            { text: 'Demo 8：动态模型', link: '/posts/ai-agent-langgraph-demo/demo8-dynamic-model' },
            { text: 'Demo 9：动态系统提示词', link: '/posts/ai-agent-langgraph-demo/demo9-dynamic-system-prompt' },
            { text: 'Demo 10：结构化输出', link: '/posts/ai-agent-langgraph-demo/demo10-structured-output' },
            { text: 'Demo 11：消息类型', link: '/posts/ai-agent-langgraph-demo/demo11-message-types' },
            { text: 'Demo 12：Middleware', link: '/posts/ai-agent-langgraph-demo/demo12-middleware' },
            { text: 'Demo 13：DeepAgents', link: '/posts/ai-agent-langgraph-demo/demo13-deepagents' },
            { text: 'Demo 14：SubAgent', link: '/posts/ai-agent-langgraph-demo/demo14-subagents' },
            { text: 'Demo 15：上下文工程', link: '/posts/ai-agent-langgraph-demo/demo15-context-engineering' },
            { text: 'Demo 16：Memory', link: '/posts/ai-agent-langgraph-demo/demo16-memory' },
            { text: 'Demo 17：Sandbox', link: '/posts/ai-agent-langgraph-demo/demo17-sandbox' },
            { text: 'Demo 18：危险命令防护', link: '/posts/ai-agent-langgraph-demo/demo18-dangerous-command' },
            { text: 'Demo 19：LlamaIndex GraphRAG', link: '/posts/ai-agent-langgraph-demo/demo19-graphrag' }
          ]
        }
      ],
      '/posts/': [
        {
          text: '文章',
          items: [
            { text: 'LangGraph Agent 实战：从持久化、Middleware、DeepAgents 到 GraphRAG', link: '/posts/ai-agent-langgraph-demo/' },
            { text: 'Agent Evaluation Platform：从多次 Trial、分层评分到 OpenTelemetry + Langfuse', link: '/posts/agent-evaluation-platform-otel-langfuse' },
            { text: 'LLM 应用实战项目合集', link: '/posts/llm-projects' },
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
