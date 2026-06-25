import { defineConfig } from 'vitepress'

const base = process.env.VITEPRESS_BASE || '/vite-press-docs/'

export default defineConfig({
  lang: 'zh-CN',
  title: '前端前沿技术爱好者',
  description: '关于工程、产品与持续写作的个人博客',
  base,
  cleanUrls: true,
  appearance: true,
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
      { text: '文章', link: '/posts/' },
      { text: '关于', link: '/about' }
    ],
    sidebar: {
      '/posts/': [
        {
          text: '文章',
          items: [
            { text: '文章说明', link: '/posts/' },
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
    lastUpdated: {
      text: '最后更新'
    },
    outline: {
      label: '本页目录'
    },
    docFooter: {
      prev: '上一篇',
      next: '下一篇'
    }
  },
  lastUpdated: true
})
