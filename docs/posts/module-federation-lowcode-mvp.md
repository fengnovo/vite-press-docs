---
title: 用 Module Federation 搭一个低代码平台
description: 从设计器、Schema 渲染引擎、远程物料和运行时容器拆解一个低代码平台的最小闭环
date: 2025-08-19
---

# 用 Module Federation 搭一个低代码平台
git: https://github.com/fengnovo/lowcode-platform   
线上地址：https://low-code-editor.keen-tech.top/  
https://low-code-runtime.keen-tech.top/  

最近整理了一个拖拽式低代码平台。它的目标不是一次性做出完整商业系统，而是先把低代码平台最核心的闭环跑通：设计器拖拽物料生成页面 Schema，渲染引擎根据 Schema 动态加载远程物料，运行时容器独立渲染已发布页面。

这个项目使用 React 18、TypeScript、Webpack 5 Module Federation、Zustand、Ant Design 和 pnpm workspace 实现。整体看下来，它更像是一个可验证的架构样板：每一层都保持克制，但关键边界已经立起来了。

## 先把主链路看清楚

这个项目最容易让人绕进去的地方，是“设计器”“Schema”“远程物料”“运行时”同时出现。其实可以先按一条主链路理解：

<div class="lc-flow">
  <div class="lc-flow__node">
    <strong>1. 选物料</strong>
    <span>Editor 从物料市场读取 manifest，左侧展示 Button、Container、Input、Table 等物料。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>2. 拖画布</strong>
    <span>拖入物料时，Editor 不保存组件代码，只生成一段 ComponentSchema。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>3. 改属性</strong>
    <span>右侧表单由 propsSchema 自动生成，修改后写回当前组件 props。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>4. 保存页面</strong>
    <span>整个页面被保存成 PageSchema，里面只有组件名、属性和嵌套结构。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>5. 运行时渲染</strong>
    <span>Runtime 读取同一份 Schema，再按 manifest 远程加载真实组件。</span>
  </div>
</div>

所以它不是“拖拽后生成 React 代码”，而是“拖拽后生成一份可被渲染引擎消费的页面协议”。这也是这类低代码系统能扩展的关键。

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

下面这张图可以把几个包的关系看得更直观：

<div class="lc-architecture">
  <div class="lc-lane">
    <strong>编辑态</strong>
    <span>apps/editor</span>
    <small>物料面板、画布、选中态、右侧属性面板、页面保存</small>
  </div>
  <div class="lc-lane">
    <strong>协议层</strong>
    <span>packages/schema</span>
    <small>PageSchema、ComponentSchema、MaterialManifest、Zod 校验</small>
  </div>
  <div class="lc-lane">
    <strong>渲染层</strong>
    <span>packages/engine-core</span>
    <small>PageRenderer、SchemaRenderer、material-loader、错误边界</small>
  </div>
  <div class="lc-lane">
    <strong>远程物料</strong>
    <span>materials/*</span>
    <small>独立构建，暴露 remoteEntry.js、Component 和 Manifest</small>
  </div>
  <div class="lc-lane">
    <strong>运行态</strong>
    <span>apps/runtime</span>
    <small>读取页面 Schema，复用同一套渲染引擎输出页面</small>
  </div>
  <div class="lc-lane">
    <strong>模拟后端</strong>
    <span>mock-server</span>
    <small>物料市场、页面 Schema 存储、物料 dist 静态入口</small>
  </div>
</div>

这里有两个重要结论：

- `apps/editor` 和 `apps/runtime` 都是 Host，但职责不同。Editor 有编辑能力，Runtime 只有渲染能力。
- `packages/engine-core` 是共享核心。只要它能正确消费 `PageSchema + MaterialManifest`，设计态和运行态就能保持同一套渲染语义。

## 数据流图解

### 设计器启动

设计器启动时，会先请求物料列表和页面 Schema：

```text
Editor -> GET /api/materials -> MaterialManifest[]
Editor -> GET /api/pages/home -> PageSchema
Editor -> Zustand Store -> manifestMap + schema
Store -> PageRenderer -> 动态加载远程物料并渲染画布
```

用图看就是：

<div class="lc-sequence">
  <div><b>Editor</b><span>GET /api/materials</span></div>
  <div><b>mock-server</b><span>返回 MaterialManifest[]</span></div>
  <div><b>Editor</b><span>GET /api/pages/:id</span></div>
  <div><b>mock-server</b><span>返回 PageSchema</span></div>
  <div><b>Zustand Store</b><span>保存 manifestMap 和 schema</span></div>
  <div><b>PageRenderer</b><span>根据 Schema 渲染 rootComponents</span></div>
  <div><b>material-loader</b><span>按需加载 remoteEntry.js</span></div>
  <div><b>Canvas</b><span>显示真实组件</span></div>
</div>

这一步里，左侧物料面板主要消费 manifest 的展示信息，比如 `title`、`category`、`icon`。画布渲染主要消费 manifest 的远程加载信息，比如 `remote.scope`、`remote.module`、`remote.entry`。

### 拖拽物料

拖拽时，设计器会根据 manifest 的 `defaultProps` 创建一个新的 `ComponentSchema`，再写入根节点或容器节点的 `children`。Schema 更新后，渲染引擎重新消费新的 `rootComponents` 和 `manifestMap`，画布随之刷新。

<div class="lc-map">
  <div>
    <strong>用户动作</strong>
    <span>从左侧拖入 Button</span>
  </div>
  <div>
    <strong>读取协议</strong>
    <span>找到 basic.Button 的 manifest.defaultProps</span>
  </div>
  <div>
    <strong>生成 Schema</strong>
    <span>{ id, componentName: "basic.Button", props }</span>
  </div>
  <div>
    <strong>写入位置</strong>
    <span>没有父级就进 rootComponents，有容器就进 parent.children</span>
  </div>
  <div>
    <strong>重新渲染</strong>
    <span>PageRenderer 重新把 Schema 变成 React 组件树</span>
  </div>
</div>

这里要注意容器物料。比如 `basic.Container` 的 `isContainer` 为 `true`，所以它的 `children` 可以继续挂其他组件。普通按钮、输入框、表格不接收 children，就只能作为叶子节点。

### 修改属性并保存

修改属性时，右侧 `setter-panel` 根据 `propsSchema` 生成表单。表单改动会调用 `updateProps` 写回 Store，画布实时变化。点击保存后，页面 Schema 会提交到 mock-server：

```text
Setter -> updateProps(id, nextProps)
Store -> PageRenderer
Save -> POST /api/pages/:id
```

可以把它理解成三个层次：

<div class="lc-split-diagram">
  <div>
    <strong>propsSchema</strong>
    <p>声明这个物料有哪些可配置字段，比如按钮文案、按钮类型、是否禁用。</p>
  </div>
  <div>
    <strong>setter-panel</strong>
    <p>把 propsSchema 转成右侧表单。它不关心具体物料长什么样，只关心配置项怎么编辑。</p>
  </div>
  <div>
    <strong>ComponentSchema.props</strong>
    <p>用户改完表单后，最终写回 Schema 里的 props，画布和运行时都读这一份值。</p>
  </div>
</div>

这就是为什么属性面板不应该写死在设计器里。只要新物料把 `propsSchema` 描述清楚，设计器就能自动生成配置表单。

### 运行时渲染

运行时则更纯粹：读取物料 manifest 和页面 Schema，交给同一个 `PageRenderer` 渲染。它不关心拖拽、选中、表单这些编辑态能力。

<div class="lc-flow lc-flow--runtime">
  <div class="lc-flow__node">
    <strong>Runtime</strong>
    <span>读取 pageId</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>mock-server</strong>
    <span>返回 PageSchema 和物料列表</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>PageRenderer</strong>
    <span>遍历 rootComponents</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>material-loader</strong>
    <span>加载 remoteEntry.js</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>真实组件</strong>
    <span>按 Schema.props 渲染页面</span>
  </div>
</div>

因此，Editor 保存出来的不是“设计器专用数据”，而是 Runtime 可以直接消费的页面协议。这一点决定了编辑态和运行态不会越走越分裂。

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

一个简化后的页面可以长这样：

```json
{
  "pageId": "home",
  "rootComponents": [
    {
      "id": "container_1",
      "componentName": "basic.Container",
      "props": { "padding": 24 },
      "children": [
        {
          "id": "button_1",
          "componentName": "basic.Button",
          "props": { "text": "提交", "type": "primary" }
        }
      ]
    }
  ]
}
```

这段 JSON 的意思不是“生成一个容器和按钮的源码”，而是告诉渲染引擎：

- 先找到 `basic.Container` 对应的远程组件。
- 把 `{ padding: 24 }` 作为 props 传进去。
- 再渲染它的 children。
- children 里再找到 `basic.Button`，并传入按钮自己的 props。

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

<div class="lc-protocol-grid">
  <div>
    <strong>左侧物料面板</strong>
    <span>title / category / icon</span>
  </div>
  <div>
    <strong>拖入画布</strong>
    <span>componentName / defaultProps / isContainer</span>
  </div>
  <div>
    <strong>右侧属性面板</strong>
    <span>propsSchema</span>
  </div>
  <div>
    <strong>远程加载器</strong>
    <span>remote.scope / remote.module / remote.entry</span>
  </div>
</div>

如果只能记住一个点，那就是：`PageSchema` 描述“页面用了什么”，`MaterialManifest` 描述“这个东西怎么展示、怎么配置、怎么加载”。

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

更具体的加载过程是：

<div class="lc-sequence">
  <div><b>SchemaRenderer</b><span>遇到 componentName: basic.Button</span></div>
  <div><b>manifestMap</b><span>查到 basic.Button 的 remote 配置</span></div>
  <div><b>document</b><span>插入 script 标签加载 remoteEntry.js</span></div>
  <div><b>webpack</b><span>初始化 share scope，复用 React、ReactDOM、antd</span></div>
  <div><b>remote container</b><span>container.get("./Component")</span></div>
  <div><b>PageRenderer</b><span>拿到组件后传入 Schema.props 渲染</span></div>
</div>

这里有几个实现细节很重要：

- 物料面板只读取 manifest，不会打开设计器时就加载全部远程组件。
- `componentCache` 保证同一物料在页面中出现多次时只远程加载一次。
- `MaterialErrorBoundary` 会兜底单个物料异常，避免整页白屏。
- React、ReactDOM、antd 必须配置 singleton，否则容易出现多份 React 带来的 hooks 报错。

为什么要做缓存？因为一个页面里可能有很多个按钮。如果每个按钮实例都重新加载一次 `remoteEntry.js`，性能和稳定性都会很差。正确做法是按 `componentName` 缓存组件定义，多个 Schema 节点复用同一个远程组件，只传不同的 props。

为什么要做错误边界？因为远程物料是独立发布的，某个物料加载失败或运行时报错，不应该让整个页面白屏。低代码平台里，局部兜底比全局崩溃重要得多。

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

新增物料时最容易出错的是这几组对应关系：

<div class="lc-protocol-grid">
  <div>
    <strong>Webpack name</strong>
    <span>必须等于 manifest.remote.scope</span>
  </div>
  <div>
    <strong>exposes["./Component"]</strong>
    <span>必须等于 manifest.remote.module</span>
  </div>
  <div>
    <strong>组件 props</strong>
    <span>必须能被 JSON 序列化</span>
  </div>
  <div>
    <strong>propsSchema</strong>
    <span>必须覆盖设计器里需要编辑的字段</span>
  </div>
</div>

注册到模拟物料市场后，执行：

```bash
pnpm install
pnpm validate:materials
pnpm typecheck
pnpm build
```

验证时要看完整链路：左侧能看到物料，拖入画布能渲染，右侧能配置 props，保存后运行时页面也能渲染。

也就是说，新增物料不是只看组件本地预览能不能打开，而是要跑完整条链：

<div class="lc-flow">
  <div class="lc-flow__node"><strong>构建物料</strong><span>生成 dist/remoteEntry.js</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>注册 manifest</strong><span>让物料市场能返回它</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>拖入 Editor</strong><span>生成 ComponentSchema</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>保存 PageSchema</strong><span>写入 mock-server</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>Runtime 验证</strong><span>独立页面能正确渲染</span></div>
</div>

## 为什么这个项目值得保留

低代码平台很容易一上来就陷入“大而全”：权限、流程、表单、数据源、版本管理、发布审批、组件市场、可视化编排，全部都想做。但真正决定平台能不能长大的，往往是更底层的几个边界：

- Schema 是否稳定表达页面结构。
- 物料是否能独立开发、构建和发布。
- 设计态和运行态是否共享同一套渲染语义。
- 属性配置是否由协议驱动，而不是写死在设计器里。
- 远程加载失败是否能局部兜底。

这个项目的价值就在于，它先把这些边界跑通了。mock-server 将来可以替换成真实物料市场和页面管理后台；物料 dist 可以上传 CDN；Schema 可以增加版本迁移器；设计器可以继续补排序、复制、撤销重做、灰度发布和端到端测试。

先把系统骨架做薄、做清楚，再往上长功能，会比一开始就堆界面更稳。

最后更新：2025-08-19
