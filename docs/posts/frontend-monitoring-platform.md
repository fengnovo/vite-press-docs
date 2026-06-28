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

## 上报层：不丢事件，也不阻塞页面

上报层策略很现实：

- 错误事件立即触发 `flush()`。
- 普通事件进入批量队列，默认 20 条或 5 秒 flush。
- 页面隐藏或关闭时优先用 `navigator.sendBeacon()`。
- 普通场景使用 `fetch(..., { keepalive: true })`。
- 网络失败时写入 IndexedDB，下次启动或恢复在线后重试。

`sendBeacon` 适合页面关闭、刷新、切后台时发送少量数据，不阻塞卸载流程。`fetch keepalive` 允许页面卸载后请求继续尝试发送。IndexedDB 则比 localStorage 更适合离线队列，因为它异步、容量更大，不阻塞主线程。

这套设计的目标不是“尽快发出去”，而是“尽量不影响用户，同时尽量不丢关键事件”。

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

## 错误指纹与 SourceMap

错误指纹用于把同一类错误聚合到同一个错误组。大致由错误类型、归一化 message、文件名、行列号组成。

归一化很重要。用户 ID、订单号、hash、URL 这类动态内容如果直接参与指纹，会让同一个错误裂变成大量不同告警，最后形成告警风暴。

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
