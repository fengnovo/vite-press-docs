---
title: KUI 自研 React 组件库：从 Monorepo 到 Headless 组件和发布流水线
description: 复盘 @fengnovo/kui 的工程落地路径，拆解 pnpm + Turborepo、Design Token、CSS Variables、cva、Headless Hook、tsup 双格式打包、Storybook、测试体系和 Changesets 发布流水线
date: 2026-06-30
---

# KUI 自研 React 组件库：从 Monorepo 到 Headless 组件和发布流水线

git: https://github.com/fengnovo/kui

最近整理了一个自研 React 组件库 `@fengnovo/kui`。它不是只写几个按钮、下拉框再发个 npm 包，而是把一套生产级组件库应该有的工程链路都跑了一遍：

- Monorepo 包管理和构建编排。
- Design Token 到 CSS Variables 的主题底座。
- `cva` 管组件样式变体。
- Headless Hook 沉淀复杂交互。
- `tsup` 输出 ESM + CJS + 独立组件入口。
- Vitest、axe、Playwright、Storybook 做质量门禁。
- Changesets 和 GitHub Actions 走两段式发布。

这篇文章基于项目里的 `README.md` 和 `docs/impl-guide.md` 重新整理。实现指南更像施工手册，这里会更偏读者视角：先讲清楚为什么要这样拆，再讲每一层怎么落地。

## 先用大白话理解

很多人做组件库，第一反应是“建个 `components` 目录，把 Button、Input、Select 放进去”。这当然能跑，但还不算组件库。

真正麻烦的是后面这些事：

- 颜色、圆角、间距怎么统一，不要每个组件自己写一套。
- 复杂组件的键盘操作、焦点、受控/非受控、无障碍怎么稳定复用。
- 组件怎么按需引入，避免引一个 Button 打进去半个库。
- CSS 怎么发布，不能被 tree-shake 摇掉。
- 类型在 ESM 和 CJS 下都要正确。
- 每次改动怎么测试、发版、回滚。

所以 KUI 的核心不是“写 Button”，而是先把组件库的生产线搭出来。

<div class="lc-flow">
  <div class="lc-flow__node">
    <strong>令牌</strong>
    <span>颜色、字号、圆角先变成可复用的设计变量。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>样式</strong>
    <span>组件 CSS 只消费变量，variant 和 size 由 cva 映射。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>行为</strong>
    <span>Select 这类复杂交互下沉到 Headless Hook。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>渲染</strong>
    <span>React 组件只把状态映射成 DOM、className 和 aria 属性。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>交付</strong>
    <span>测试、文档、产物体检、版本发布都进流水线。</span>
  </div>
</div>

大白话说：组件库不是“组件集合”，更像一条小型工厂流水线。Button 和 Select 是产品，令牌、构建、测试、发布才是让产品稳定批量生产的机器。

## 它解决什么问题

自研组件库最容易翻车的地方，通常不是第一个组件写不出来，而是第十个、第二十个组件开始失控：

| 问题 | 常见后果 | KUI 的处理方式 |
|---|---|---|
| 样式没有统一源头 | 颜色、间距、暗色主题到处手写 | DTCG Token -> Style Dictionary -> CSS Variables |
| 交互逻辑散在组件里 | Select、Popover、Modal 各自处理键盘和焦点，bug 重复出现 | Headless Hook 把状态机、键盘、ARIA 独立出来 |
| 打包只顾本地可用 | 子路径导出、CSS 副作用、CJS 类型解析出问题 | tsup + exports + sideEffects + publint + attw |
| 质量只靠人工点 | 改样式不知道影响了哪些状态 | Vitest + axe + Playwright 视觉回归 |
| 发版不可控 | push 后直接 publish，破坏性变更混进去 | Changesets 两段式 Version PR + api-extractor |

这里有个关键判断：一个组件库的工程价值，主要体现在“边界”上。组件内部写得漂亮当然重要，但更重要的是它和主题、构建器、测试、文档、消费方应用之间的边界是不是稳定。

## 包布局

KUI 使用 `pnpm + Turborepo` 做 monorepo。npm scope 不能嵌套，所以用 `@fengnovo` 作为 scope，用 `kui` 作为包名前缀。

| 包 | 目录 | 说明 | 是否发布 |
|---|---|---|---|
| `@fengnovo/kui` | `packages/kui` | 组件主包，包含 Headless、渲染层和样式 | 公共 npm |
| `@fengnovo/kui-tokens` | `packages/tokens` | 设计令牌和 Style Dictionary 产物 | 公共 npm |
| `@fengnovo/kui-icons` | `packages/icons` | 图标包，规划中，可独立升版本 | 公共 npm |
| `@fengnovo/kui-tsconfig` | `packages/tsconfig` | 内部共享 TypeScript 配置 | private |
| `@fengnovo/kui-eslint-config` | `packages/eslint-config` | 内部共享 ESLint 配置 | private |
| `docs` | `apps/docs` | Storybook 文档站 | private |
| `e2e` | `e2e` | Playwright E2E 和视觉回归 | private |

整体依赖关系可以画成这样：

<div class="lc-architecture">
  <div class="lc-lane">
    <strong>公共发布包</strong>
    <span>tokens → kui → icons</span>
    <small><code>@fengnovo/kui-tokens</code> 提供 CSS Variables 和 TS 常量，<code>@fengnovo/kui</code> 消费它，图标包后续可独立发布。</small>
  </div>
  <div class="lc-lane">
    <strong>内部工程包</strong>
    <span>tsconfig / eslint-config</span>
    <small>共享 TypeScript 与 ESLint 规则，只在工作区内复用，不发布到 npm。</small>
  </div>
  <div class="lc-lane">
    <strong>文档和质量</strong>
    <span>Storybook → Playwright</span>
    <small><code>apps/docs</code> 消费本地组件包，<code>e2e</code> 再把 Storybook 当作截图和交互测试的渲染源。</small>
  </div>
</div>

<div class="lc-flow">
  <div class="lc-flow__node"><strong>tokens</strong><span>生成主题变量和类型常量。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>kui</strong><span>实现 Button、Select 等组件。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>docs</strong><span>Storybook 展示组件状态。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>e2e</strong><span>基于 Storybook 跑交互和视觉回归。</span></div>
</div>

这个图里最重要的是依赖方向：`tokens` 是底座，`kui` 消费它，文档和 E2E 消费 `kui`。不要让业务文档、测试工具、组件实现互相反向依赖，否则 monorepo 很快会变成一团线。

## 三层架构：令牌、行为、渲染

KUI 的组件分成三层：

<div class="lc-flow">
  <div class="lc-flow__node"><strong>DTCG Token</strong><span>设计令牌是颜色、间距、圆角的唯一事实源。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>CSS Variables</strong><span>Style Dictionary 产出 <code>vars.css</code> 和 <code>theme-dark.css</code>。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>组件 CSS + cva</strong><span>样式只消费变量，变体只映射 className。</span></div>
  <div class="lc-flow__arrow">+</div>
  <div class="lc-flow__node"><strong>Headless Hook</strong><span>沉淀状态、键盘、ARIA 和受控逻辑。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>React 组件</strong><span>把行为和样式拼成 Button、Select。</span></div>
</div>

这套分层的好处是每层只管自己的事：

| 层 | 负责什么 | 不负责什么 |
|---|---|---|
| 令牌层 | 品牌色、语义色、暗色主题、多品牌变量 | 不知道 Button 长什么样 |
| 样式层 | className、尺寸、变体、hover、disabled、focus | 不处理键盘和选中状态 |
| 行为层 | open、activeIndex、selected、键盘导航、受控/非受控、ARIA | 不关心颜色和 DOM 样式 |
| 渲染层 | 把行为和样式拼成真正的 React 组件 | 不重新实现状态机 |

说得更直白一点：颜色归颜色，交互归交互，DOM 归 DOM。复杂系统最怕所有东西揉在一个组件文件里，短期写得快，长期很难测，也很难改。

## Design Token：主题先有地基

组件库如果想支持暗色、多品牌、统一换肤，就不能让组件 CSS 到处写 `#3b82f6` 这类具体色值。

KUI 的做法是三步：

<div class="lc-flow">
  <div class="lc-flow__node"><strong>基础令牌</strong><span><code>color.blue.500</code>、<code>neutral.900</code> 这类原材料。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>语义令牌</strong><span><code>brand.primary</code>、<code>bg.default</code> 这类组件能理解的语言。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>Style Dictionary</strong><span>把 JSON 编译成 CSS 和 TS 产物。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>变量作用域</strong><span><code>:root</code> 提供默认主题，<code>[data-theme='dark']</code> 覆盖暗色。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>组件消费</strong><span>组件 CSS 只写 <code>var(--brand-primary)</code>。</span></div>
</div>

基础令牌像原材料，比如蓝色 500、灰色 900。语义令牌像业务语言，比如主品牌色、默认背景色、正文颜色。组件只吃语义令牌，不直接吃原材料。

这样做有两个好处：

1. 暗色主题只改语义层，组件代码不用动。
2. 多品牌只切变量作用域，不需要重新打包组件。

组件 CSS 里类似这样：

```css
.kui-btn--solid {
  background: var(--brand-primary);
  color: var(--text-on-brand);
}

.kui-btn--outline {
  border-color: var(--brand-primary);
  color: var(--brand-primary);
}
```

这也是为什么项目里会配 `stylelint`：组件 CSS 不允许随手写裸色值。规范只靠口头约定很容易失效，必须让工具帮忙守住。

## 样式变体：cva 只做映射

Button 这类组件通常会有 `variant`、`size`、`loading`、`disabled` 等状态。KUI 用 `class-variance-authority` 处理变体映射：

```ts
export const buttonVariants = cva('kui-btn', {
  variants: {
    variant: {
      solid: 'kui-btn--solid',
      outline: 'kui-btn--outline',
      ghost: 'kui-btn--ghost',
    },
    size: {
      sm: 'kui-btn--sm',
      md: 'kui-btn--md',
      lg: 'kui-btn--lg',
    },
  },
  defaultVariants: { variant: 'solid', size: 'md' },
})
```

它的定位很克制：只把 props 映射成 className，不接管主题，也不把样式塞进 JS。这样组件仍然是 CSS Variables 驱动，SSR 和 RSC 场景也更稳。

## 构建产物：别只看 dist 里有没有文件

组件库打包最容易“本地能用，上 npm 后出事”。KUI 的构建目标不是简单生成 `dist`，而是同时满足：

- ESM 主格式，给现代打包器做静态分析和 tree-shaking。
- CJS 兼容，照顾仍然用 `require` 的场景。
- 独立组件入口，例如 `@fengnovo/kui/button`。
- CSS 独立产出，不内联到 JS。
- CSS 标记 side effects，避免被构建器误删。
- ESM 和 CJS 下类型解析都正确。

<div class="lc-flow">
  <div class="lc-flow__node"><strong>入口</strong><span><code>src/index.ts</code>、<code>src/button/index.ts</code>、<code>src/select/index.ts</code>。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>tsup</strong><span>统一打包 JS、类型和 CSS。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>dist 产物</strong><span>ESM、CJS、<code>.d.ts</code>、<code>.d.cts</code>、独立 CSS。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>体检</strong><span><code>publint</code> 检包导出，<code>attw --pack</code> 检类型解析。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>发布</strong><span>Changesets 接管版本号和 changelog。</span></div>
</div>

这里有一个真实落地时的细节：实现指南最初写的是扁平 `types`，但项目最终改成了 condition-specific types。

简化后大概是：

```json
{
  "exports": {
    "./button": {
      "import": {
        "types": "./dist/button/index.d.ts",
        "default": "./dist/button/index.js"
      },
      "require": {
        "types": "./dist/button/index.d.cts",
        "default": "./dist/button/index.cjs"
      }
    }
  }
}
```

为什么要这么麻烦？因为 CJS 消费者如果拿到 ESM 风味的 `.d.ts`，`attw` 会报类型解析问题。既然指南里把 `publint` 和 `attw` 全绿列为 Done 标准，那真实工程就应该以校验门槛为准，而不是死守示例写法。

大白话说：`package.json` 的 `exports` 就像包裹清单。ESM 用户来拿 ESM 的货和类型，CJS 用户来拿 CJS 的货和类型，不能大家都从同一个窗口乱拿。

## Button：先打通一条完整流水线

KUI 先做 Button，不是因为 Button 最难，而是因为它最适合验证整条工程链路。

<div class="lc-flow">
  <div class="lc-flow__node"><strong>组件代码</strong><span><code>forwardRef</code>、原生 props、loading 边界。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>样式</strong><span>CSS Variables + cva 变体。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>测试</strong><span>Vitest、Testing Library、axe。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>文档</strong><span>Storybook autodocs 和交互态。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>产物</strong><span>独立入口、CSS、Changeset。</span></div>
</div>

Button 里有几个小但关键的边界：

- `loading` 时要自动禁用，避免重复提交。
- `aria-busy` 只在 loading 时出现。
- `disabled || loading` 要在组件内部合并，不能被 `{...rest}` 覆盖。
- spinner 用 `currentColor`，这样不同 variant 下不用单独配色。
- `ref`、原生 button props、`className` 合并都要正常工作。

这些点看起来琐碎，但组件库的稳定性就是靠这些琐碎边界堆出来的。Button 跑通后，后续组件不是重新摸索，而是沿着同一条轨道继续铺。

## Select：组件库真正的分水岭

Button 更多考验样式和基础 API，Select 才开始考验组件库有没有“行为内核”。

一个可用的 Select 至少要处理：

- 打开和关闭。
- 当前选中值。
- 键盘上下移动。
- Home / End 跳到首尾。
- Enter / Space 提交。
- Escape 关闭。
- 禁用项跳过。
- 受控和非受控。
- `role="combobox"`、`listbox`、`option`、`aria-activedescendant`。

如果这些逻辑全写在 JSX 里，测试会很痛苦。KUI 的做法是把行为抽成 `useSelect`，渲染层只拿 prop getters：

<div class="lc-flow">
  <div class="lc-flow__node"><strong>输入参数</strong><span><code>options</code>、<code>value</code>、<code>defaultValue</code>、<code>onChange</code>。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>内部状态</strong><span><code>open</code>、<code>selected</code>、<code>activeIndex</code>。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>键盘处理</strong><span>Arrow、Home、End、Enter、Space、Escape。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>prop getters</strong><span>生成 trigger、list、option 需要的属性。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>渲染层</strong><span><code>button + ul + li</code> 负责 DOM 和 className。</span></div>
</div>

状态流转可以更直观看：

<div class="lc-sequence">
  <div><b>Closed</b><span>初始关闭态，点击、ArrowDown、ArrowUp 或 Space 都可以打开。</span></div>
  <div><b>Open</b><span>打开后用 Arrow / Home / End 移动 activeIndex，并自动跳过 disabled 选项。</span></div>
  <div><b>Commit</b><span>Enter 或 Space 提交当前选项，受控模式只触发 onChange，非受控模式同步内部 selected。</span></div>
  <div><b>Close</b><span>Escape、外部点击或提交完成后关闭列表，焦点仍留在 trigger 上。</span></div>
</div>

这套设计里最重要的不是 `useSelect` 的代码本身，而是边界划分：

| 部分 | 放在哪里 | 原因 |
|---|---|---|
| open、selected、activeIndex | `useSelect` | 可单独测，不依赖 DOM 样式 |
| 键盘移动和 disabled 跳过 | `useSelect` | 属于行为规则，所有渲染形态都要一致 |
| `aria-*` 属性 | prop getters | 行为层统一生成，渲染层直接拼装 |
| className 和 DOM 结构 | `select.tsx` | 让 UI 可以变化，不污染行为内核 |
| 外部点击关闭 | 渲染层 effect | 依赖真实 DOM，放到内核会变脏 |

大白话说：`useSelect` 像变速箱，`Select.tsx` 像车壳。车壳可以换，但变速箱里的换挡规则不能每台车重新写一遍。

## 测试体系：不是只测能不能点

组件库的测试要覆盖五类风险：

<div class="lc-flow">
  <div class="lc-flow__node"><strong>Headless 单测</strong><span>验证状态机、键盘移动、禁用项跳过。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>组件集成</strong><span>用 Testing Library 从用户视角触发事件。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>axe</strong><span>自动检查严重无障碍问题。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>Storybook</strong><span>沉淀组件状态和人工验收入口。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>Playwright</strong><span>跑浏览器交互和视觉截图，进入 CI。</span></div>
</div>

每一层解决的问题不一样：

| 测试 | 主要盯什么 | 例子 |
|---|---|---|
| Headless 单测 | 纯行为逻辑 | ArrowDown 是否跳过 disabled 选项 |
| Testing Library | 用户视角交互 | loading Button 是否禁用 |
| axe | 无障碍违规 | Button、Select 是否有严重 a11y 问题 |
| Storybook | 文档和人工验收 | 所有 variant、size、受控示例 |
| Playwright | 浏览器真实行为和视觉变化 | Select 打开态截图是否异常 |

项目里还有一个很真实的 CI 细节：视觉基线带操作系统差异。本地 macOS 会生成 `-darwin.png`，GitHub Linux runner 需要 `-linux.png`。所以仓库里加了 `visual-update.yml`，专门在 Linux runner 上手动生成视觉基线并提交。

这类细节很小，但生产项目经常就是卡在这里。视觉回归不是“加个截图断言”就结束了，还要考虑基线在哪台机器生成、什么时候更新、谁来 review。

## Storybook：不只是展示页面

KUI 里 Storybook 有三层作用：

1. 给使用方看组件状态和 Props。
2. 给开发者做交互验收。
3. 给 Playwright 当稳定渲染源。

<div class="lc-protocol-grid">
  <div><strong>Stories</strong><span><code>packages/kui/src/**/*.stories.tsx</code> 描述组件的主要状态。</span></div>
  <div><strong>Autodocs</strong><span>从 TypeScript Props 自动生成文档表。</span></div>
  <div><strong>addon-a11y</strong><span>在文档站里直接看交互态的无障碍问题。</span></div>
  <div><strong>Playwright</strong><span>打开指定 story，执行 E2E 和截图断言。</span></div>
</div>

把 Storybook 当视觉回归源有个好处：每个组件状态都是可复现的独立页面。测试不用绕过业务页面的登录、路由、接口数据，直接打开对应 story 就能截图。

## 发布流水线：先 Version PR，再 publish

KUI 的发版不是 push 到 `main` 就直接发 npm，而是 Changesets 的两段式流程：

<div class="lc-sequence">
  <div><b>功能 PR</b><span>开发者提交代码和 changeset，说明这次应该 patch、minor 还是 major。</span></div>
  <div><b>CI 门禁</b><span>PR 先跑 lint、typecheck、build、test、E2E、视觉回归和 api check。</span></div>
  <div><b>合并 main</b><span>通过 review 后进入主分支，release workflow 被触发。</span></div>
  <div><b>Version Packages PR</b><span><code>changesets/action</code> 自动升版本号并生成 changelog，等待人工 review。</span></div>
  <div><b>正式 publish</b><span>Version PR 合并后再次触发 release，执行 <code>changeset publish</code> 并带 provenance。</span></div>
</div>

这套流程的意义是：真正发版前，会先有一个可 review 的 Version PR。里面包含版本号提升和 changelog 更新。你可以在 publish 前确认这次到底发了哪些包、升了什么版本、说明是否准确。

同时项目里还有两个门禁：

- `api-extractor` 生成公共 API 报告，公共 API 变化要能被 review。
- `canary.yml` 支持手动发布 `canary` tag，先给真实项目试用，再走正式版。

大白话说：正式发版要像过闸，不要像从楼上往下扔包。每道闸都知道自己拦什么：CI 拦坏代码，API 报告拦破坏性变更，Version PR 拦不透明发版，canary 拦上线风险。

## 当前落地进度

这套组件库目前已经把从 Step 1 到 Step 9 的主链路跑通：

| Step | 内容 | 状态 |
|---|---|---|
| Step 1 | Monorepo 骨架，pnpm + Turborepo + 共享 tsconfig/eslint | 已落地 |
| Step 2 | tsup 双格式打包，独立入口，publint / attw 校验 | 已落地 |
| Step 3 | DTCG Token + Style Dictionary 4 | 已落地 |
| Step 4 | CSS Variables + cva 样式体系 | 已落地 |
| Step 5 | Button 垂直切片，打通代码、样式、测试、文档、产物 | 已落地 |
| Step 6 | Select Headless 内核，键盘、ARIA、受控/非受控 | 已落地 |
| Step 7 | Vitest、Testing Library、axe、Playwright、视觉回归 | 已落地 |
| Step 8 | Storybook 8 文档站 | 已落地 |
| Step 9 | Changesets + GitHub Actions 发布流水线 | 配置就绪 |

一个容易误解的点是：当前组件数量还不多，但这不是问题。对自研组件库来说，早期最重要的不是一口气铺 50 个组件，而是先证明“每个新组件都能沿着同一套标准交付”。

## 组件开发 DOD

后续每新增一个组件，至少要满足这些 Done 标准：

- 有独立入口，例如 `src/<name>/index.ts`。
- 样式只消费语义令牌变量，不写裸色值。
- 复杂交互下沉到 Headless Hook。
- 覆盖受控/非受控、键盘、禁用态等关键测试。
- 至少有一条 axe 无障碍断言。
- Storybook 覆盖主要变体和交互状态。
- 有视觉基线，关键状态能被 Playwright 截图。
- 公共 API 类型清楚，autodocs 能生成 Props 表。
- 有 changeset 说明这次变更。

这个清单看起来多，但它会把“组件能用”和“组件可长期维护”分开。业务项目里能跑的代码，不一定适合进入组件库；组件库里的代码，要默认被很多项目、很多版本、很多构建器消费。

## 几个踩坑点

第一，CSS 产物一定要标记副作用。

```json
{
  "sideEffects": ["**/*.css"]
}
```

否则消费方构建时可能认为 CSS 没有被 JS 使用，然后把样式摇掉。组件能渲染但没样式，这种问题排查起来很烦。

第二，子路径导出要真的测。

`@fengnovo/kui` 和 `@fengnovo/kui/button` 都能导入，不代表它们都能正确 tree-shake，也不代表 CJS 类型没问题。`publint` 和 `attw --pack` 必须进发布前校验。

第三，受控组件不要覆盖外部值。

判断受控要用 `value !== undefined`，受控模式下内部 state 不能偷偷改 selected。否则业务一接表单库，很快就会出现状态不同步。

第四，视觉回归要把环境差异设计进去。

字体、系统、浏览器渲染都会影响像素。不要等 CI 第一次失败才想“为什么我本地明明过了”。基线生成和更新流程要提前设计。

第五，Storybook 必须引用 workspace 本地包。

文档站是当前组件的验收入口，应该消费 `workspace:*`，不是消费上一个已发布版本。否则你在 PR 里改了组件，Storybook 看的却还是旧代码，视觉回归就失去意义了。

## 最后总结

KUI 这套实现最值得复用的不是某个 Button 或 Select 的具体代码，而是这条工程路径：

```text
先锁技术栈
  -> 建 monorepo
  -> 打通构建产物
  -> 建令牌和样式规范
  -> 用 Button 验证最小闭环
  -> 用 Select 验证复杂交互内核
  -> 补齐测试、文档、视觉回归
  -> 接入 Changesets 和 CI 发版
```

自研组件库真正难的是“每个组件都能被一致地生产、验证和发布”。只要这条线稳定了，后面铺 Input、Modal、Tabs、Table、Form 就不再是重新开荒，而是沿着既有轨道持续扩展。
