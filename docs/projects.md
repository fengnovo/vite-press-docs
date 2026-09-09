---
title: 项目作品集
description: 从前端基础设施到 AI Agent，记录可以实际运行的工程作品
layout: page
---

<script setup lang="ts">
import ProjectShowcase from './.vitepress/theme/components/ProjectShowcase.vue'

type ProjectLink = {
  label: string
  url: string
  internal?: boolean
}

type Project = {
  number: string
  title: string
  category: string
  description: string
  image: string
  imageAlt: string
  coverShape: 'wide' | 'standard' | 'tall'
  primaryUrl: string
  primaryLabel: string
  links: ProjectLink[]
  tags: string[]
}

const projects: Project[] = [
  {
    number: '01',
    title: '用 Module Federation 搭一个低代码平台',
    category: 'LOW-CODE PLATFORM',
    description: '把编辑器、物料和运行时拆成可独立发布的模块，让低代码页面从搭建到交付真正跑起来。',
    image: '/images/projects/lowcode-platform.jpg',
    imageAlt: '由组件面板、画布和独立运行时组成的低代码平台构图',
    coverShape: 'standard',
    primaryUrl: 'https://low-code-editor.keen-tech.top/',
    primaryLabel: '打开低代码编辑器',
    links: [
      { label: '技术文章', url: '/posts/module-federation-lowcode-mvp', internal: true },
      { label: 'GitHub', url: 'https://github.com/fengnovo/lowcode-platform' },
      { label: '运行时', url: 'https://low-code-runtime.keen-tech.top/' }
    ],
    tags: ['Module Federation', 'React', '可视化搭建']
  },
  {
    number: '02',
    title: 'Logic Composer：用 DSL 驱动一个智能工作流编排器',
    category: 'WORKFLOW ENGINE',
    description: '用一套可读、可执行的 DSL 描述流程，把节点编排、条件分支和执行反馈放进同一个工作台。',
    image: '/images/projects/logic-composer.jpg',
    imageAlt: '由发光节点和连线组成的智能工作流编排器构图',
    coverShape: 'tall',
    primaryUrl: 'https://logic-composer.keen-tech.top/',
    primaryLabel: '打开 Logic Composer',
    links: [
      { label: '技术文章', url: '/posts/logic-composer-workflow-engine', internal: true },
      { label: 'GitHub', url: 'https://github.com/fengnovo/logic-composer' },
      { label: '在线演示', url: 'https://logic-composer.keen-tech.top/' }
    ],
    tags: ['DSL', '流程编排', '智能工作流']
  },
  {
    number: '03',
    title: '通用动态问卷：用 JSON 配置驱动多步骤表单',
    category: 'DYNAMIC FORM',
    description: '把字段、步骤、联动和校验收进 JSON Schema，一套 SDK 适配不同业务问卷。',
    image: '/images/projects/questionnaire-sdk.jpg',
    imageAlt: '多步骤动态问卷和 JSON 配置面板构图',
    coverShape: 'wide',
    primaryUrl: 'https://questionnaire.keen-tech.top/questionnaire/kyc-questionnaire',
    primaryLabel: '体验动态问卷',
    links: [
      { label: '技术文章', url: '/posts/dynamic-questionnaire-sdk', internal: true },
      { label: 'GitHub', url: 'https://github.com/fengnovo/general-questionnaire-sdk' },
      { label: '在线演示', url: 'https://questionnaire.keen-tech.top/questionnaire/kyc-questionnaire' }
    ],
    tags: ['JSON Schema', 'SDK', '多步骤表单']
  },
  {
    number: '04',
    title: '通用审核系统：用 X6 画出审批流程',
    category: 'AUDIT DESIGNER',
    description: '用图编辑器呈现审批节点、条件和流转关系，让复杂审核流程可配置、可预览、可落地。',
    image: '/images/projects/universal-audit.jpg',
    imageAlt: '包含审批节点、分支和状态标识的流程设计器构图',
    coverShape: 'standard',
    primaryUrl: 'https://universal-audit.keen-tech.top/designer?mode=demo&name=费用报销流程&owner=财务共享中心',
    primaryLabel: '打开审核流程设计器',
    links: [
      { label: '技术文章', url: '/posts/universal-audit-designer', internal: true },
      { label: 'GitHub', url: 'https://github.com/fengnovo/universal-audit' },
      { label: '在线演示', url: 'https://universal-audit.keen-tech.top/designer?mode=demo&name=费用报销流程&owner=财务共享中心' }
    ],
    tags: ['AntV X6', '审批流', '流程设计器']
  },
  {
    number: '05',
    title: '前端监控告警平台：从 SDK 到 SourceMap 和告警闭环',
    category: 'OBSERVABILITY',
    description: '覆盖异常采集、SourceMap 还原、问题聚合和告警通知，把“线上报错了”变成可定位、可跟进的事件。',
    image: '/images/projects/web-error-monitoring.jpg',
    imageAlt: '由异常曲线、堆栈定位和告警信号组成的前端监控平台构图',
    coverShape: 'tall',
    primaryUrl: 'https://monitor.keen-tech.top/',
    primaryLabel: '打开监控平台',
    links: [
      { label: '技术文章', url: '/posts/frontend-monitoring-platform', internal: true },
      { label: 'GitHub', url: 'https://github.com/fengnovo/web-error-monitoring' },
      { label: '在线演示', url: 'https://monitor.keen-tech.top/' }
    ],
    tags: ['Monitoring SDK', 'SourceMap', '告警']
  },
  {
    number: '06',
    title: 'AI Component Platform：可灰度、可观测、可部署的 AI 组件',
    category: 'AI INFRASTRUCTURE',
    description: '把模型能力封装成前端可消费的组件，并补齐版本、灰度、指标和部署环境管理。',
    image: '/images/projects/ai-component-platform.jpg',
    imageAlt: '由 AI 核心、组件模块、灰度发布和观测面板组成的平台构图',
    coverShape: 'wide',
    primaryUrl: 'https://ai-component.keen-tech.top/',
    primaryLabel: '打开 AI Component Platform',
    links: [
      { label: '技术文章', url: '/posts/ai-component-platform', internal: true },
      { label: 'GitLab', url: 'https://gitlab.com/keen-ai-project/ai-component-platform' },
      { label: '测试环境', url: 'https://staging-ai-component.keen-tech.top/' },
      { label: '线上环境', url: 'https://ai-component.keen-tech.top/' }
    ],
    tags: ['AI Components', '灰度发布', '可观测性']
  },
  {
    number: '07',
    title: 'App 前端离线包：让 Hybrid H5 从 CDN 请求变成本地命中',
    category: 'HYBRID DELIVERY',
    description: '管理平台、H5 工程和 Android 容器协同，让资源版本、增量更新与本地加载形成一条完整链路。',
    image: '/images/projects/offline-package.jpg',
    imageAlt: '手机、本地资源包和 CDN 之间形成离线加载链路的构图',
    coverShape: 'tall',
    primaryUrl: 'https://offline-package.keen-tech.top/',
    primaryLabel: '打开离线包管理平台',
    links: [
      { label: '技术文章', url: '/posts/offline-package-hybrid-app', internal: true },
      { label: '管理平台源码', url: 'https://github.com/fengnovo/offline-package-platform' },
      { label: 'H5 模板', url: 'https://github.com/fengnovo/trade_h5_offline_frontend_template' },
      { label: 'Android 工程', url: 'https://github.com/fengnovo/OfflinePackageAndroid' },
      { label: '体验 APK', url: 'http://cdn.keen-tech.top/android-apks/app-debug-offline-v1.apk' }
    ],
    tags: ['Hybrid H5', '离线包', 'Android']
  },
  {
    number: '08',
    title: '多分支自动部署转测：为每个分支生成独立测试环境',
    category: 'DELIVERY PIPELINE',
    description: '从 Git 分支触发流水线，用泛域名隔离环境，并自动关联 H5 与离线包版本，减少多人并行转测时的互相覆盖。',
    image: '/images/projects/multi-branch-deploy.jpg',
    imageAlt: '多条代码分支通过流水线部署到独立测试环境的构图',
    coverShape: 'standard',
    primaryUrl: 'https://offline-package-test.keen-tech.top/',
    primaryLabel: '打开测试环境',
    links: [
      { label: '技术文章', url: '/posts/multi-branch-auto-deploy-test-env', internal: true },
      { label: '平台 GitLab', url: 'https://gitlab.com/offline-package/offline-package-platform' },
      { label: 'H5 GitLab', url: 'https://gitlab.com/offline-package/trade_h5_offline_frontend_template' },
      { label: 'Android GitLab', url: 'https://gitlab.com/offline-package/OfflinePackageAndroid' },
      { label: '正式平台', url: 'https://offline-package.keen-tech.top/' },
      { label: 'Feature 环境', url: 'https://feature-deploy-test.test.keen-tech.top/trade_h5/index.html' },
      { label: 'Test 环境', url: 'https://test.test.keen-tech.top/trade_h5/index.html' },
      { label: 'Main 环境', url: 'https://h5.keen-tech.top/trade_h5/index.html' },
      { label: '体验 APK', url: 'http://cdn.keen-tech.top/android-apks/app-debug-offline-v2.apk' }
    ],
    tags: ['CI/CD', '泛域名', '分支环境']
  },
  {
    number: '09',
    title: 'Simple LLM + MCP + RAG：不用框架搭一个知识库 Agent',
    category: 'AI AGENT',
    description: '从模型调用开始，手工串起工具协议、知识检索和上下文组装，弄清 Agent 每一层到底做了什么。',
    image: '/images/projects/llm-mcp-rag-agent.jpg',
    imageAlt: '模型核心连接工具协议和向量知识库的 Agent 构图',
    coverShape: 'wide',
    primaryUrl: 'https://github.com/fengnovo/simple-llm-mcp-rag-agent',
    primaryLabel: '查看 Agent 源码',
    links: [
      { label: '技术文章', url: '/posts/simple-llm-mcp-rag-agent', internal: true },
      { label: 'GitHub', url: 'https://github.com/fengnovo/simple-llm-mcp-rag-agent' }
    ],
    tags: ['LLM', 'MCP', 'RAG']
  },
  {
    number: '10',
    title: 'KUI 自研 React 组件库：从 Monorepo 到 Headless 与发布流水线',
    category: 'DESIGN SYSTEM',
    description: '围绕 Headless 组件、主题能力、文档站和自动发布，搭建一套可以长期演进的 React 组件工程。',
    image: '/images/projects/kui-component-library.jpg',
    imageAlt: '由 Headless 组件积木、主题色板和 Monorepo 包组成的组件库构图',
    coverShape: 'tall',
    primaryUrl: 'https://github.com/fengnovo/kui',
    primaryLabel: '查看 KUI 源码',
    links: [
      { label: '技术文章', url: '/posts/react-kui-component-library', internal: true },
      { label: 'GitHub', url: 'https://github.com/fengnovo/kui' }
    ],
    tags: ['React', 'Headless UI', 'Monorepo']
  },
  {
    number: '11',
    title: 'Node.js 高可用实战：无状态、读写分离、缓存与熔断降级',
    category: 'HIGH AVAILABILITY',
    description: '用一套可运行的服务串起高可用常见手段，观察缓存命中、数据库降级和故障恢复时系统如何响应。',
    image: '/images/projects/nodejs-high-availability.jpg',
    imageAlt: 'Node.js 服务通过负载均衡连接缓存、数据库与熔断器的高可用构图',
    coverShape: 'standard',
    primaryUrl: 'https://github.com/fengnovo/stability-availability-nodejs',
    primaryLabel: '查看高可用示例源码',
    links: [
      { label: '技术文章', url: '/posts/nodejs-high-availability', internal: true },
      { label: 'GitHub', url: 'https://github.com/fengnovo/stability-availability-nodejs' }
    ],
    tags: ['Node.js', '缓存', '熔断降级']
  }
]
</script>

<ProjectShowcase :projects="projects" />
