---
title: 用 Module Federation 搭一个低代码平台
description: 从设计器、Schema 渲染引擎、远程物料和运行时容器拆解一个低代码平台的最小闭环
date: 2026-06-25
---

# 用 Module Federation 搭一个低代码平台
git: https://github.com/fengnovo/lowcode-platform   
线上地址：https://low-code-editor.keen-tech.top/  
https://low-code-runtime.keen-tech.top/  

最近整理了一个拖拽式低代码平台。它的目标不是一次性做出完整商业系统，而是先把低代码平台最核心的闭环跑通：设计器拖拽物料生成页面 Schema，渲染引擎根据 Schema 动态加载远程物料，运行时容器独立渲染已发布页面。

这个项目使用 React 18、TypeScript、Webpack 5 Module Federation、Zustand、Ant Design 和 pnpm workspace 实现。整体看下来，它更像是一个可验证的架构样板：每一层都保持克制，但关键边界已经立起来了。

## 核心能力

平台目前已经具备几个基础能力：

- 设计器包含左侧物料面板、中间画布和右侧属性配置面板。
- 同一套 `PageRenderer` 被设计器和运行时复用。
- 物料通过 Module Federation 独立暴露 `remoteEntry.js`。
- Host 不写死 remotes，而是根据 manifest 动态插入远程入口。
- 开发环境由 mock-server 统一托管物料 dist，新增物料不需要额外新增端口。
- React、ReactDOM、antd 通过 Webpack share scope 以 singleton 方式共享。
- 容器物料支持 children 嵌套。
- 配置面板根据 `propsSchema` 自动生成表单，并实时更新画布。
- mock-server 提供页面 Schema 的读取、保存和新建页面接口。
- 脚本会校验物料 manifest 是否符合协议。

这套能力组合起来，就形成了低代码平台的最小产品闭环：选物料、拖画布、改属性、保存页面、运行时渲染。

## 架构分层

项目按职责拆成几块：

- `apps/editor`：设计器 Host，负责物料列表、拖拽、选中态、属性配置、页面新建、切换和保存。
- `apps/runtime`：运行时 Host，负责读取页面 Schema 并渲染，不包含编辑逻辑。
- `packages/engine-core`：共享渲染内核，包含 `SchemaRenderer`、远程加载器和错误边界。
- `packages/schema`：定义 `PageSchema`、`MaterialManifest` 类型和 Zod 校验。
- `packages/setter-panel`：根据 `propsSchema` 自动生成右侧配置表单。
- `materials/*`：独立远程物料，可以单独构建、单独部署。
- `mock-server`：在本地环境中模拟物料市场、页面管理后台和物料静态入口。

这个分层的关键点是：设计器和运行时不直接依赖具体物料实现，它们只依赖 Schema、manifest 和渲染引擎。具体组件在哪里、如何部署、用哪个 CDN，都会被收敛到 manifest 的 `remote.entry` 上。

## 数据流

设计器启动时，会先请求物料列表和页面 Schema：

```text
Editor -> GET /api/materials -> MaterialManifest[]
Editor -> GET /api/pages/home -> PageSchema
Editor -> Zustand Store -> manifestMap + schema
Store -> PageRenderer -> 动态加载远程物料并渲染画布
```

拖拽时，设计器会根据 manifest 的 `defaultProps` 创建一个新的 `ComponentSchema`，再写入根节点或容器节点的 `children`。Schema 更新后，渲染引擎重新消费新的 `rootComponents` 和 `manifestMap`，画布随之刷新。

修改属性时，右侧 `setter-panel` 根据 `propsSchema` 生成表单。表单改动会调用 `updateProps` 写回 Store，画布实时变化。点击保存后，页面 Schema 会提交到 mock-server：

```text
Setter -> updateProps(id, nextProps)
Store -> PageRenderer
Save -> POST /api/pages/:id
```

运行时则更纯粹：读取物料 manifest 和页面 Schema，交给同一个 `PageRenderer` 渲染。它不关心拖拽、选中、表单这些编辑态能力。

## 两个核心协议

低代码平台最重要的不是拖拽，而是协议。这个项目里有两个协议值得单独看。

### PageSchema

`PageSchema` 描述页面由哪些物料组成，以及每个物料实例的 props 和 children。

```ts
interface ComponentSchema {
  id: string
  componentName: string
  props: Record<string, unknown>
  children?: ComponentSchema[]
}

interface PageSchema {
  version: string
  pageId: string
  pageName: string
  materials: MaterialDependency[]
  rootComponents: ComponentSchema[]
}
```

这里的 `componentName` 是桥梁。页面本身不保存组件代码，只保存组件名、属性和嵌套关系。

### MaterialManifest

`MaterialManifest` 描述一个物料如何展示、如何配置、从哪里动态加载。

```ts
interface MaterialManifest {
  componentName: string
  version: string
  title: string
  category: string
  icon?: string
  isContainer: boolean
  remote: {
    scope: string
    module: string
    entry: string
  }
  propsSchema: PropSetterConfig[]
  defaultProps: Record<string, unknown>
}
```

设计器左侧物料面板读 `title`、`category`、`icon`；渲染引擎读 `remote`；右侧配置面板读 `propsSchema`；拖入画布时读 `defaultProps`。一个 manifest 把编辑态、加载态和配置态串了起来。

## 远程物料加载

每个物料都是独立 Webpack 项目，并通过 Module Federation 暴露两个模块：

```js
exposes: {
  './Component': './src/Component',
  './Manifest': './src/manifest'
}
```

物料源码统一导出默认组件和 manifest：

```ts
export default Component
export { manifest }
```

运行时加载远程物料时，`material-loader` 会用脚本注入方式加载 `remoteEntry.js`，然后通过 Webpack share scope 初始化远程容器，再调用 `container.get('./Component')` 拿到真实组件。

这里有几个实现细节很重要：

- 物料面板只读取 manifest，不会打开设计器时就加载全部远程组件。
- `componentCache` 保证同一物料在页面中出现多次时只远程加载一次。
- `MaterialErrorBoundary` 会兜底单个物料异常，避免整页白屏。
- React、ReactDOM、antd 必须配置 singleton，否则容易出现多份 React 带来的 hooks 报错。

## 新增物料的路径

新增一个物料，本质上是补齐三个东西：组件实现、manifest、Module Federation 暴露配置。

以 `basic.Card` 为例，目录结构大致是：

```text
materials/basic-card/
├── package.json
├── webpack.config.js
└── src/
    ├── Card.tsx
    ├── index.tsx
    ├── manifest.json
    └── manifest.ts
```

组件需要默认导出 React 组件，props 需要能被 JSON 表达。manifest 里要声明 `componentName`、`remote.scope`、`remote.module`、`remote.entry`、`propsSchema` 和 `defaultProps`。Webpack 配置里的 `name` 必须和 manifest 的 `remote.scope` 完全一致。

注册到模拟物料市场后，执行：

```bash
pnpm install
pnpm validate:materials
pnpm typecheck
pnpm build
```

验证时要看完整链路：左侧能看到物料，拖入画布能渲染，右侧能配置 props，保存后运行时页面也能渲染。

## 为什么这个项目值得保留

低代码平台很容易一上来就陷入“大而全”：权限、流程、表单、数据源、版本管理、发布审批、组件市场、可视化编排，全部都想做。但真正决定平台能不能长大的，往往是更底层的几个边界：

- Schema 是否稳定表达页面结构。
- 物料是否能独立开发、构建和发布。
- 设计态和运行态是否共享同一套渲染语义。
- 属性配置是否由协议驱动，而不是写死在设计器里。
- 远程加载失败是否能局部兜底。

这个项目的价值就在于，它先把这些边界跑通了。mock-server 将来可以替换成真实物料市场和页面管理后台；物料 dist 可以上传 CDN；Schema 可以增加版本迁移器；设计器可以继续补排序、复制、撤销重做、灰度发布和端到端测试。

先把系统骨架做薄、做清楚，再往上长功能，会比一开始就堆界面更稳。
