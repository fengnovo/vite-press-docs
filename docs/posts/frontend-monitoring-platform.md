---
title: 前端监控告警平台：从 SDK 到 SourceMap 和告警闭环
description: 拆解一个前端监控告警系统，覆盖浏览器 SDK、插件采集、批量上报、离线缓存、SourceMap 还原、错误聚合和 P0-P3 告警分级
date: 2025-12-16
---

# 前端监控告警平台：从 SDK 到 SourceMap 和告警闭环
git: https://github.com/fengnovo/web-error-monitoring   
线上地址：https://monitor.keen-tech.top/  

最近整理了一个从零实现的前端监控告警系统。它不只是一个浏览器埋点 SDK，而是一条完整链路：浏览器 SDK 采集事件，API 接收入库，服务端做 SourceMap 还原和错误聚合，告警引擎完成 P0-P3 分级与收敛，最后通过飞书 Webhook 通知，并在 React 管理台里展示结果。

这类系统最容易做成“能收数据，但不能治理问题”。真正有价值的监控平台，应该回答三个问题：

- 浏览器里发生了什么？
- 这个错误影响多大，能不能定位到源码？
- 要不要打扰人，应该以什么优先级打扰谁？

## 先用大白话理解

前端监控不是“页面报错了就发一条消息”。更像是给线上页面装一个黑匣子：用户在浏览器里发生了什么，SDK 先记下来；服务端再判断这是不是同一类问题、影响多少人、能不能定位到源码、需不需要通知研发。

<div class="lc-flow">
  <div class="lc-flow__node">
    <strong>1. 浏览器出事</strong>
    <span>JS 报错、Promise 未捕获、资源加载失败、页面变慢、用户点击某个按钮。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>2. SDK 记录事实</strong>
    <span>采集错误、性能和行为，并补上 appId、release、session、面包屑。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>3. 服务端归类</strong>
    <span>入库、算错误指纹、聚合同类错误、SourceMap 还原源码位置。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>4. 告警判断</strong>
    <span>按错误率、影响用户、核心路径、趋势和类型算 P0-P3。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>5. 治理闭环</strong>
    <span>飞书通知、管理台查看、研发定位、修复发布、继续观察错误率。</span>
  </div>
</div>

所以这套系统的重点不是“多收点日志”，而是把一个线上异常从发生到定位、通知、处理、复盘串起来。

## 整体链路

项目是一个 pnpm monorepo，主要分三块：

- `packages/sdk`：浏览器监控 SDK，负责采集、处理、缓存和上报。
- `apps/api`：Hono API 服务，负责接收事件、入库、SourceMap 还原、告警分级和飞书通知。
- `apps/web`：Vite React 管理台，负责展示 Overview、Events、Alerts、SourceMaps 和 Playground。

完整链路大致是：

```text
业务页面
  -> SDK 插件采集
  -> 采样、脱敏、补上下文
  -> 批量队列、sendBeacon、fetch、离线缓存
  -> POST /api/events
  -> SQLite 入库
  -> 错误指纹聚合
  -> SourceMap 栈还原
  -> P0-P3 告警分级
  -> 静默期和动态阈值收敛
  -> 飞书 Webhook 通知
  -> React 管理台展示
```

这里有一个重要边界：SDK 只负责浏览器侧事实采集，不在客户端做复杂告警判断。告警口径放在服务端，才能避免前后端逻辑不一致，也能控制 SDK 包体积。

用模块图看会更清楚：

<div class="lc-architecture">
  <div class="lc-lane">
    <strong>浏览器 SDK</strong>
    <span>packages/sdk</span>
    <small>采集 PV、错误、性能、行为，统一处理后批量上报。</small>
  </div>
  <div class="lc-lane">
    <strong>事件 API</strong>
    <span>apps/api</span>
    <small>接收 /api/events，校验事件，写入 SQLite。</small>
  </div>
  <div class="lc-lane">
    <strong>定位能力</strong>
    <span>SourceMap</span>
    <small>按 appId + release + bundleUrl 匹配 map，还原源码位置。</small>
  </div>
  <div class="lc-lane">
    <strong>聚合能力</strong>
    <span>error_groups</span>
    <small>用 fingerprint 把同类错误合并，计算次数和影响用户。</small>
  </div>
  <div class="lc-lane">
    <strong>告警能力</strong>
    <span>alerts + Feishu</span>
    <small>做 P0-P3 分级、动态阈值、静默期和飞书通知。</small>
  </div>
  <div class="lc-lane">
    <strong>管理台</strong>
    <span>apps/web</span>
    <small>看总览、事件、告警、SourceMap 和 Playground 验证链路。</small>
  </div>
</div>

一个好的前端监控系统，一半在浏览器 SDK，另一半在服务端治理。只做 SDK，只能知道“发生了”；有聚合、SourceMap 和告警，才知道“严不严重、该不该处理、怎么定位”。

## SDK 微内核设计

SDK 的核心是 `Monitor`。它不是把所有采集逻辑塞进一个大类，而是采用微内核加插件的方式。

内核只负责：

- 插件安装和生命周期。
- 创建统一事件包络。
- 执行采样和 `beforeSend`。
- 维护 session、user、breadcrumbs。
- 调度上报队列。

PV、错误、性能、行为这些采集能力都在 `plugins/*` 里。插件协议很小：

```ts
type MonitorPlugin = {
  name: string
  install: (context: MonitorPluginContext) => void
  destroy?: () => void
}
```

内核给插件注入的能力也很克制：

- `report(type, payload)`：提交采集结果。
- `breadcrumb(event)`：写入行为轨迹。
- `getBreadcrumbs()`：读取当前面包屑快照。
- `getSessionId()`：复用当前会话标识。

插件不能直接操作上报队列、离线缓存和内部状态。这样新增网络监控、业务埋点或自定义插件时，只需要实现插件，不需要改内核。

这套插件结构可以理解成：

<div class="lc-flow">
  <div class="lc-flow__node">
    <strong>插件</strong>
    <span>负责监听浏览器 API，比如 error、PerformanceObserver、click。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>report()</strong>
    <span>插件只把事实交给内核，不直接碰队列和缓存。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>Monitor 内核</strong>
    <span>统一采样、脱敏、补上下文、执行 beforeSend。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>Reporter</strong>
    <span>负责批量队列、sendBeacon、fetch keepalive、离线缓存。</span>
  </div>
</div>

大白话说：插件像传感器，内核像质检员，上报器像快递员。传感器只负责发现事情，质检员负责整理成统一格式，快递员负责尽量送到服务端。

## 采集层

SDK 当前覆盖几类常见前端监控数据。

### PV 和 SPA 路由

传统页面刷新会天然触发页面访问，但 SPA 里的 `pushState` 和 `replaceState` 不会触发刷新。SDK 需要拦截 History API，同时监听 `popstate` 和 `hashchange`。

这类采集看起来简单，但它决定了 PV 统计是否和真实前端路由一致。

### 错误监控

错误采集需要覆盖：

- JS 运行时错误。
- 未捕获的 Promise rejection。
- 图片、CSS、JS 等资源加载错误。
- React ErrorBoundary 捕获的渲染错误。

这里的关键点是资源错误不冒泡，必须在捕获阶段监听 `error`：

```ts
window.addEventListener('error', handler, true)
```

不建议只用 `window.onerror`。它只能有一个处理器，多个 SDK 容易互相覆盖，而且捕获不到资源加载错误。

错误采集可以拆成四条入口：

<div class="lc-protocol-grid">
  <div>
    <strong>JS 错误</strong>
    <span>监听 window error，拿 message、filename、lineno、colno、stack。</span>
  </div>
  <div>
    <strong>Promise 错误</strong>
    <span>监听 unhandledrejection，捕获没有 catch 的异步异常。</span>
  </div>
  <div>
    <strong>资源错误</strong>
    <span>捕获阶段监听 error，图片、CSS、JS 加载失败不会冒泡。</span>
  </div>
  <div>
    <strong>React 错误</strong>
    <span>ErrorBoundary 捕获渲染异常，附带 componentStack。</span>
  </div>
</div>

这里最容易踩坑的是资源错误。图片 404、脚本加载失败这类问题，不会像普通 JS 异常一样冒泡到 `window.onerror`，所以必须 `addEventListener('error', handler, true)`。

### 性能监控

性能数据通过 `PerformanceObserver` 采集，避免轮询和主线程阻塞。指标包括 Navigation Timing 和 Core Web Vitals：

- LCP：最大内容绘制。
- FID：首次输入延迟。
- CLS：累积布局偏移。
- INP：交互到下一帧绘制。

性能事件默认应该采样。千万级 PV 下，全量性能数据很容易打爆服务端。

### 行为和曝光

点击行为用事件委托采集，不给每个元素单独绑监听。曝光用 `IntersectionObserver`，比滚动监听更稳，也更省性能。

业务侧可以通过 `data-track-id` 解耦埋点逻辑。SDK 只读稳定标识，不依赖页面文案和 DOM 结构。

## 处理层：采样、脱敏、归一

事件进入 SDK 内核后，会统一补上下文：

- `appId`
- `release`
- `sdkVersion`
- `sessionId`
- `userId`
- `url`
- `breadcrumbs`

然后做三件事。

第一是采样。错误和 PV 可以默认全量，性能和行为默认采样。采样不是优化项，而是大流量系统的生存条件。

第二是脱敏。URL 和 payload 中的 `token`、`password`、`phone`、`email` 等字段需要清洗。监控系统如果泄露隐私，本身就会变成事故源。

第三是归一。不同插件最终都包成统一的 `MonitorEvent`：

```ts
type MonitorEvent = {
  appId: string
  type: 'pv' | 'js_error' | 'promise_error' | 'resource_error' | 'performance' | 'behavior' | 'exposure'
  timestamp: number
  url: string
  release: string
  sdkVersion: string
  sessionId: string
  userId?: string
  fingerprint?: string
  payload: Record<string, unknown>
  breadcrumbs?: BehaviorEvent[]
}
```

服务端只处理一种协议，系统复杂度会低很多。

事件进入内核后，大概会走这条处理流水线：

<div class="lc-sequence">
  <div><b>插件提交原始事件</b><span>比如 error 插件提交 message、stack、filename。</span></div>
  <div><b>补上下文</b><span>补 appId、release、sdkVersion、sessionId、userId、url 和 breadcrumbs。</span></div>
  <div><b>采样判断</b><span>错误和 PV 多数全量，性能和行为按比例采样，避免大流量打爆服务端。</span></div>
  <div><b>敏感信息清洗</b><span>清理 token、password、phone、email 等敏感字段。</span></div>
  <div><b>统一事件协议</b><span>不同插件最终都变成 MonitorEvent。</span></div>
  <div><b>进入上报队列</b><span>错误触发立即 flush，普通事件等待批量发送。</span></div>
</div>

`breadcrumbs` 可以理解成案发前的脚印。错误发生时，除了 stack，还会带上用户最近点击、路由变化、曝光等行为，方便复盘“用户是怎么走到这个错误的”。

## 上报层：不丢事件，也不阻塞页面

上报层策略很现实：

- 错误事件立即触发 `flush()`。
- 普通事件进入批量队列，默认 20 条或 5 秒 flush。
- 页面隐藏或关闭时优先用 `navigator.sendBeacon()`。
- 普通场景使用 `fetch(..., { keepalive: true })`。
- 网络失败时写入 IndexedDB，下次启动或恢复在线后重试。

`sendBeacon` 适合页面关闭、刷新、切后台时发送少量数据，不阻塞卸载流程。`fetch keepalive` 允许页面卸载后请求继续尝试发送。IndexedDB 则比 localStorage 更适合离线队列，因为它异步、容量更大，不阻塞主线程。

这套设计的目标不是“尽快发出去”，而是“尽量不影响用户，同时尽量不丢关键事件”。

上报选择可以画成这样：

<div class="lc-map">
  <div>
    <strong>错误事件</strong>
    <span>立即 flush，不等 20 条，也不等 5 秒。</span>
  </div>
  <div>
    <strong>普通事件</strong>
    <span>先进入队列，达到数量或时间阈值后批量发送。</span>
  </div>
  <div>
    <strong>页面隐藏 / 关闭</strong>
    <span>优先 sendBeacon，因为它不阻塞页面卸载。</span>
  </div>
  <div>
    <strong>普通在线场景</strong>
    <span>使用 fetch keepalive，让请求在页面卸载后仍可尝试完成。</span>
  </div>
  <div>
    <strong>网络失败</strong>
    <span>写入 IndexedDB，下次启动或恢复在线后重试。</span>
  </div>
</div>

大白话说：错误是急件，普通行为是拼车件，页面关闭时走绿色通道，网络坏了先放仓库，等下次有网再补发。

## API 接收与入库

SDK 请求进入：

```text
POST /api/events
```

API 支持单条或批量事件。事件进入服务端后会经过：

1. 校验基础字段。
2. 为错误事件生成 fingerprint。
3. 尝试 SourceMap 栈还原。
4. 写入 `events` 表。
5. 对错误事件更新聚合组。
6. 计算告警等级。
7. 判断是否需要通知。

当前本地使用 Node 24 内置 `node:sqlite`，主要表包括：

- `events`：原始事件、payload、breadcrumbs、SourceMap 还原结果。
- `error_groups`：同指纹错误聚合。
- `alerts`：告警记录和飞书通知结果。
- `releases`：应用发布版本。
- `sourcemaps`：SourceMap 元数据和 map 内容。

服务端处理一条错误事件时，可以理解成这条流水线：

<div class="lc-sequence">
  <div><b>接收事件</b><span>POST /api/events 支持单条和批量事件。</span></div>
  <div><b>校验字段</b><span>检查 appId、type、timestamp、url、release 等基础信息。</span></div>
  <div><b>生成指纹</b><span>把同一类错误聚合到同一个 error_group。</span></div>
  <div><b>SourceMap 还原</b><span>根据 appId + release + bundleUrl 找 map，还原源码位置。</span></div>
  <div><b>写入数据库</b><span>原始事件进 events，聚合信息进 error_groups。</span></div>
  <div><b>计算告警等级</b><span>按错误率、用户数、核心路径、趋势、错误类型算 P0-P3。</span></div>
  <div><b>收敛并通知</b><span>过动态阈值和静默期后，才创建告警并发飞书。</span></div>
</div>

这一步的价值在于：服务端把“很多条零散的错误事件”变成“一个可处理的问题”。研发不应该被每个用户的一次报错打扰，而应该看到聚合后的问题面貌。

## 错误指纹与 SourceMap

错误指纹用于把同一类错误聚合到同一个错误组。大致由错误类型、归一化 message、文件名、行列号组成。

归一化很重要。用户 ID、订单号、hash、URL 这类动态内容如果直接参与指纹，会让同一个错误裂变成大量不同告警，最后形成告警风暴。

指纹聚合的意思是：

<div class="lc-flow">
  <div class="lc-flow__node">
    <strong>10 万个用户报错</strong>
    <span>每个用户都会产生一条事件。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>归一化 message</strong>
    <span>去掉订单号、用户 ID、hash、随机参数。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>计算 fingerprint</strong>
    <span>type + message + filename + line + column。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>合成一个错误组</strong>
    <span>统计次数、影响用户、首次出现、最近出现和趋势。</span>
  </div>
</div>

没有 fingerprint，同一个线上 bug 可能变成 10 万条告警；有了 fingerprint，它会变成一个错误组，研发才能处理。

SourceMap 匹配键是：

```text
appId + release + bundleUrl
```

还原流程是：

1. 错误事件携带 `filename`、`lineno`、`colno` 或 `stack`。
2. API 从 stack 解析压缩后文件、行、列。
3. 根据 `appId` 和 `release` 找到对应 SourceMap。
4. 用 `@jridgewell/trace-mapping` 还原源码位置。
5. 事件详情同时保留原始 stack 和还原后的源码帧。

SourceMap 不应该上传 CDN，否则等于把源码公开。它应该和 release 绑定，放在服务端或内网存储里。

SourceMap 还原这件事，可以理解成“把压缩后的案发地址翻译回源码地址”：

<div class="lc-flow">
  <div class="lc-flow__node">
    <strong>压缩后 stack</strong>
    <span>app.min.js:1:23891，人看不懂。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>匹配 SourceMap</strong>
    <span>用 appId + release + bundleUrl 找到对应 .map。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>trace mapping</strong>
    <span>把压缩后行列号映射到源码文件、行、列。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>源码定位</strong>
    <span>checkout/payment.ts:256，研发可以直接看代码。</span>
  </div>
</div>

关键点是 `release`。同一个 bundle 文件名可能对应不同发布版本，只有错误事件和 SourceMap 都绑定同一个 release，源码定位才不会串版本。

## 告警分级与收敛

没有分级的告警系统很快会失效。所有错误都通知，最后研发会开始忽略所有通知。

这个项目用 P0-P3 分级：

- P0：致命，立即通知，飞书 `@所有人`。
- P1：严重，实时通知负责人。
- P2：中等，群通知。
- P3：低危，可汇总处理。

告警分数由多个因子组成：

- 错误率。
- 影响用户数。
- 是否核心路径，例如支付、下单、登录。
- 趋势是否明显上升。
- 错误类型权重，例如白屏、API 错误、JS 错误、资源错误。

收敛策略也很关键：

- 同指纹聚合，避免每个用户一条告警。
- 动态阈值，优先参考过去 7 天同小时段基线。
- 历史不足时，至少同窗口 3 次同类错误才触发非 P0 告警。
- 按等级设置静默期：P0 5 分钟，P1 30 分钟，P2 2 小时，P3 24 小时。

告警系统的目标不是通知所有错误，而是让正确的人处理正确的问题。

告警分级可以拆成“先打分，再收敛，再通知”：

<div class="lc-sequence">
  <div><b>计算影响面</b><span>看错误次数、错误率、影响用户数。</span></div>
  <div><b>判断业务重要性</b><span>支付、下单、登录等核心路径额外加分。</span></div>
  <div><b>判断趋势</b><span>当前窗口明显高于历史基线，说明问题正在扩大。</span></div>
  <div><b>按类型加权</b><span>白屏、API 错误、JS 错误、资源错误权重不同。</span></div>
  <div><b>得到 P0-P3</b><span>P0 立即通知，P3 可以汇总处理。</span></div>
  <div><b>执行收敛</b><span>同指纹聚合、动态阈值、静默期，避免告警风暴。</span></div>
  <div><b>通知或跳过</b><span>满足条件才发飞书，否则只落库展示。</span></div>
</div>

<div class="lc-protocol-grid">
  <div>
    <strong>P0</strong>
    <span>致命问题，比如核心链路不可用、白屏突增，立即通知并 @所有人。</span>
  </div>
  <div>
    <strong>P1</strong>
    <span>严重问题，影响核心功能或大量用户，实时通知负责人。</span>
  </div>
  <div>
    <strong>P2</strong>
    <span>中等问题，群通知，通常工作时间处理。</span>
  </div>
  <div>
    <strong>P3</strong>
    <span>低危问题，更多用于汇总和排期，不实时打扰。</span>
  </div>
</div>

大白话说：告警不是喊得越多越好。真正的目标是“该吵的时候必须吵，不该吵的时候别制造噪音”。

## 飞书通知和管理台

通知层只接收已经分级和收敛后的 `AlertRecord`。发送流程是：生成飞书交互卡片，按需签名，POST 到 Webhook，再把通知结果写回告警 payload。

如果本地没有配置 `FEISHU_WEBHOOK_URL`，链路不会中断，而是把通知结果标记为 `skipped`。这对本地开发很友好。

React 管理台包含五个页面：

- Overview：总事件数、错误数、错误率、Top 错误、近期告警。
- Events：事件列表和事件详情。
- Alerts：查看、确认、静默、关闭告警。
- SourceMaps：登记 release，上传 `.map` 文件。
- Playground：初始化 SDK，触发行为、JS 错误、资源错误。

Playground 的价值很大，它能验证完整闭环：

```text
Initialize SDK -> Capture error -> SDK flush -> API 入库 -> 错误聚合 -> 告警生成 -> Dashboard 展示
```

管理台不是单纯展示列表，它对应的是不同角色的排查动作：

<div class="lc-protocol-grid">
  <div>
    <strong>Overview</strong>
    <span>先看今天整体有没有变坏：错误数、错误率、Top 错误、近期告警。</span>
  </div>
  <div>
    <strong>Events</strong>
    <span>下钻某条事件，看 payload、breadcrumbs、原始 stack 和还原 stack。</span>
  </div>
  <div>
    <strong>Alerts</strong>
    <span>处理告警生命周期：确认、静默、关闭。</span>
  </div>
  <div>
    <strong>SourceMaps</strong>
    <span>登记 release，上传 .map，确保线上错误能还原源码。</span>
  </div>
  <div>
    <strong>Playground</strong>
    <span>本地模拟 SDK 初始化、错误触发、上报和告警生成。</span>
  </div>
</div>

完整闭环可以这样理解：

<div class="lc-flow">
  <div class="lc-flow__node"><strong>异常发生</strong><span>用户页面报错或性能异常。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>自动定位</strong><span>事件入库、聚合、SourceMap 还原。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>有效告警</strong><span>分级、收敛后通过飞书通知。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>研发修复</strong><span>根据源码位置、面包屑和影响面定位问题。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>验证下降</strong><span>发布修复后继续看错误率是否回落。</span></div>
</div>

## 我喜欢的设计点

第一，SDK 采集、处理、上报三层分离。每一层职责清楚，后续优化不会互相污染。

第二，微内核插件系统足够克制。内核稳定，插件可插拔，业务线可以扩展自己的采集逻辑。

第三，采样和脱敏是一等公民。监控 SDK 不是越全量越好，它必须尊重性能、成本和隐私边界。

第四，SourceMap 和 release 绑定。线上错误定位离不开源码还原，而源码还原离不开发布版本。

第五，告警有分级和收敛。没有治理的告警只是噪音，有收敛策略的告警才可能被认真处理。

## 后续可以继续长什么

这套系统已经有了完整链路，后续可以继续补：

- 更细的 API 请求监控和慢接口分析。
- 白屏检测和页面可用性评分。
- 用户行为回放或关键面包屑可视化。
- 告警自动创建工单。
- 修复发布后的错误率自动验证。
- 错误知识库和历史相似问题推荐。
- 多应用、多环境、多团队权限隔离。

前端监控的终点不是“收集更多事件”，而是建立一条从异常发生、自动定位、有效告警到修复验证的治理闭环。

最后更新：2025-12-16
