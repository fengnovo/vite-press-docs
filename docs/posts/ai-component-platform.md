---
title: AI Component Platform：把 AI 能力做成可灰度、可观测、可部署的组件
description: 复盘一个 React + TypeScript + Vite 的 AI 组件平台，拆解 Registry 协议、AISlot 状态机、A/B 灰度、调用埋点、DashScope 接入边界，以及 GitLab CI/CD 到阿里云 ECS 的部署方案
date: 2026-01-20
---

# AI Component Platform：把 AI 能力做成可灰度、可观测、可部署的组件
git: https://gitlab.com/keen-ai-project/ai-component-platform   
线上地址：https://staging-ai-component.keen-tech.top/  （测试环境） https://ai-component.keen-tech.top/  （线上环境）  

最近整理了一个 AI Component Platform。它表面上是一个 React + TypeScript + Vite 的前端 SPA，但真正想解决的不是“怎么在页面上放一个 AI 按钮”，而是另一个更工程化的问题：当业务里不断出现文案生成、内容打标、智能客服、标题检测这些 AI 能力时，怎么避免每接一个能力就重写一遍调用模型、超时、重试、灰度、降级和埋点。

这个项目把“AI 能力”拆成两层：

- 业务组件只关心 `input -> output`。
- 平台层统一管理调用生命周期。

所以这里的 Component 不是传统意义上的 UI 组件，而是一套可注册、可调度、可观测的 AI 能力协议。

## 它解决什么问题

业务接 AI 时，最容易重复写的不是 prompt，而是这些横切逻辑：

- 模型版本怎么按用户灰度。
- 请求超时后怎么取消。
- 调用失败后要不要重试。
- 重试耗尽后给什么兜底结果。
- 成功率、耗时、采纳率怎么统计。
- 新模型上线后怎么小流量验证。

这些逻辑如果散落在每个业务页面里，后面会很难治理。比如文案生成做了超时，内容打标忘了；智能客服有埋点，标题检测没有；A/B 实验能分桶，但看板又把 control 和 treatment 混在一起。

这个项目的核心目标就是把这些能力收回到统一 Registry 里。新增第 3 个、第 4 个 AI 组件时，业务方只增加自己的输入输出和 runner，不再碰重试、灰度和监控这套基础设施。

## 整体架构

系统链路可以概括成这样：

```text
业务页面
  -> AISlot
  -> AIComponentRegistry
  -> 具体 AI 组件 runner
  -> mockEngine 或真实模型 API
  -> telemetry
  -> TelemetryDashboard
```

如果换成更接近代码目录的视角，它其实分成三层：业务层、协议调度层、基础设施层。

```text
┌──────────────────────────────────────────────────────────┐
│ 业务页面：demo/CMSDemo.tsx                                │
│ - 决定页面表单、按钮、结果区怎么展示                         │
│ - 决定用户什么时候触发 AI、什么时候点击采纳                    │
└──────────────────────────┬───────────────────────────────┘
                           │ render props 接入
                           ▼
┌──────────────────────────────────────────────────────────┐
│ UI 适配层：components/AISlot.tsx                          │
│ - idle/loading/streaming/success/error/degraded 状态机      │
│ - 屏蔽同步/流式调用差异，把状态交还给业务页面                  │
└──────────────────────────┬───────────────────────────────┘
                           │ invoke / invokeStream
                           ▼
┌──────────────────────────────────────────────────────────┐
│ 协议调度层：ai-protocol/registry.ts                       │
│ - 查组件定义                                                │
│ - 灰度分桶                                                  │
│ - 超时取消                                                  │
│ - 失败重试                                                  │
│ - fallback 降级                                             │
│ - telemetry 埋点                                            │
└───────────────┬──────────────────────────────┬───────────┘
                │                              │
                ▼                              ▼
┌────────────────────────────┐       ┌─────────────────────┐
│ 具体 AI 组件：ai-components │       │ 观测层：telemetry     │
│ - copywriter                │       │ - 调用次数            │
│ - tagger                    │       │ - 成功率/延迟         │
│ - customerService           │       │ - 采纳率              │
│ 只关心 input -> output       │       │ - A/B 分桶对比        │
└──────────────┬─────────────┘       └─────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────┐
│ 模型调用层：mockEngine 或 DashScope/BFF                    │
│ - demo 阶段用 mock 延迟和失败率                              │
│ - 生产阶段替换成后端 BFF 调真实模型                           │
└──────────────────────────────────────────────────────────┘
```

几个关键模块的分工很清楚：

- `ai-protocol/types.ts`：定义 AI 组件协议，是整个平台的契约。
- `ai-protocol/registry.ts`：统一处理分桶、超时、重试、降级和埋点。
- `ai-protocol/grayscale.ts`：按 `userId` 稳定哈希分桶。
- `ai-protocol/telemetry.ts`：记录调用指标，并聚合成功率、平均延迟和采纳率。
- `components/AISlot.tsx`：把调用状态交给 UI，支持同步和流式组件。
- `ai-components/*.ts`：具体 AI 能力，比如文案生成、内容打标、智能客服。

这个分层里最重要的边界是：具体 AI 组件不能自己写超时、重试和灰度判断。它只声明自己是什么能力、怎么运行、有哪些模型版本、失败时怎么兜底。

换句话说，新增一个 AI 能力时，业务方应该只碰图里的最右下角：

```text
新增一个 AI 能力
  -> 新建 ai-components/xxx.ts
  -> 定义 Input / Output
  -> 实现 run 或 runStream
  -> 声明 grayscale / timeout / retry / fallback
  -> 在 demo 页面注册并渲染 AISlot

不应该修改：
  - registry.ts
  - telemetry.ts
  - grayscale.ts
  - AISlot 的主状态机
```

这就是这个项目里“AI as a Component”的真正含义：组件化的不是某个按钮，而是一次 AI 调用的完整协议。

## 协议层：让 AI 能力变得可注册

每个 AI 能力最终都会注册成一个 `AIComponentDefinition`。它包含全局唯一的 `type`、展示信息、runner、灰度配置、超时时间、重试策略和 fallback。

一个组件大致长这样：

```ts
type AIComponentDefinition<TInput, TOutput> = {
  type: string
  displayName: string
  description: string
  runner: AIComponentRunner<TInput, TOutput>
  grayscale: AIGrayscaleConfig
  timeoutMs: number
  retry: { maxAttempts: number; backoffMs: number }
  fallback?: (input: TInput) => TOutput
}
```

runner 支持两种模式：

- `sync`：一次请求一次返回，适合内容打标、标题检测。
- `stream`：边生成边返回，适合文案生成、智能客服。

这让平台层可以先检查模式，再决定调用 `invoke()` 还是 `invokeStream()`。如果同步组件误配了流式 runner，Registry 会在调用前直接抛错，而不是让错误延迟到业务页面里才爆出来。

协议可以拆成四块看：

```text
AIComponentDefinition
├── 身份信息
│   ├── type：全局唯一标识，如 copywriter
│   ├── displayName：展示名
│   └── description：说明
├── 执行器 runner
│   ├── mode: sync  -> 必须实现 run
│   └── mode: stream -> 必须实现 runStream
├── 调度策略
│   ├── grayscale：模型版本和权重
│   ├── timeoutMs：超时时间
│   └── retry：最大尝试次数和退避时间
└── 降级策略
    └── fallback：重试耗尽后的确定性同步产出
```

这个协议把“业务决策”和“平台治理”分开了。组件自己可以决定 fallback 文案是什么、要不要做 A/B、哪个模型占多少权重；但真正执行这些策略的是 Registry。

## Registry：调用生命周期的中枢

Registry 是这个项目最核心的地方。一次同步调用会经过这些步骤：

1. 根据 `type` 找到组件定义。
2. 校验 runner 模式。
3. 根据 `userId` 做稳定灰度分桶，拿到 bucket 和 modelVersion。
4. 创建 `AbortController`，用 `timeoutMs` 控制超时。
5. 调用组件自己的 `runner.run(input, ctx)`。
6. 失败时按 `retry.maxAttempts` 和 `backoffMs` 重试。
7. 每次失败都记录 telemetry。
8. 成功时记录 telemetry 并返回结果。
9. 重试耗尽后，如果有 fallback，就返回降级结果。

这里有一个很实用的细节：失败的每次尝试都要单独记一条埋点，而不是只在最后统一记一次。否则某个组件“前两次失败、第三次成功”在看板上会被伪装成一次成功，重试成本和稳定性问题都会被掩盖。

同步调用的完整时序可以画成这样：

```text
业务页面
  │
  │ 用户点击「生成」
  ▼
AISlot
  │ status = loading
  │
  ▼
Registry.invoke(type, input, userId)
  │
  ├─ 1. components.get(type)
  │     找不到 -> throw
  │
  ├─ 2. 校验 runner.mode === 'sync'
  │     不匹配 -> throw
  │
  ├─ 3. pickBucket(userId, grayscale)
  │     得到 bucket + modelVersion
  │
  ├─ 4. attempt #1
  │     ├─ 创建 AbortController
  │     ├─ timeoutMs 后 abort
  │     └─ runner.run(input, ctx)
  │
  ├─ 5A. 成功
  │     ├─ telemetry.record(success=true)
  │     └─ 返回 output + bucket + modelVersion
  │
  └─ 5B. 失败
        ├─ telemetry.record(success=false)
        ├─ 如果还有次数：backoff 后重试
        └─ 如果耗尽：
             ├─ 有 fallback -> degraded output
             └─ 无 fallback -> 抛出 lastError
```

一个“前两次失败，第三次成功”的调用，在 telemetry 里应该长这样：

```text
attempt 1 -> fail    latency=800ms   bucket=treatment
attempt 2 -> fail    latency=900ms   bucket=treatment
attempt 3 -> success latency=700ms   bucket=treatment
```

这样监控看板能看出真实情况：用户最终拿到了结果，但模型服务或网络在中间已经抖了两次。如果只记录最终成功，这种问题会被隐藏。

流式调用则刻意不做自动重试。因为流式输出已经把部分内容交给用户了，平台层很难判断中途重试应该覆盖、拼接还是重新生成。这个语义交给业务 UI 更清楚，比如展示一个“重新生成”按钮。

流式调用的路径更短：

```text
AISlot
  │ status = streaming
  ▼
Registry.invokeStream(type, input, userId, onChunk)
  │
  ├─ 校验 runner.mode === 'stream'
  ├─ pickBucket 得到 modelVersion
  ├─ runner.runStream(input, ctx, onChunk)
  │      │
  │      ├─ chunk #1 -> AISlot 合并 delta
  │      ├─ chunk #2 -> AISlot 合并 delta
  │      └─ chunk #N -> done
  │
  └─ telemetry.record(success=true/false)
```

流式不自动重试，是为了避免“用户已经看到半段回答，平台又悄悄重来一次”的语义混乱。重新生成应该是 UI 明确给用户的动作。

## 灰度不是开关，而是指标闭环

灰度分桶按 `userId` 做稳定哈希。同一个用户会稳定落在同一个桶里，避免今天看到 `qwen-turbo`，刷新后变成 `qwen-plus`，体验和指标都乱掉。

组件可以声明类似这样的策略：

```text
control   -> qwen-turbo  80%
treatment -> qwen-plus   20%
```

但真正有价值的不是“分到了两个桶”，而是能比较两个桶的效果。项目里 telemetry 不只统计调用次数和成功率，还关注采纳率。对 AI 产品来说，采纳率比调用次数更接近真实价值：用户点了生成但不用，说明模型输出没有帮上忙。

后续修复里还补了 `summaryByBucket()`，按 `componentType + bucket` 聚合 A/B 数据，避免 control 和 treatment 混在一起。这个点很小，但它决定了 A/B 实验到底是在做实验，还是只是在做流量切分。

指标闭环可以这样看：

```text
用户 userId
  │
  ▼
pickBucket(userId)
  ├─ control   -> qwen-turbo
  └─ treatment -> qwen-plus
        │
        ▼
AI 调用
  │
  ├─ 成功/失败
  ├─ latencyMs
  ├─ tokensIn / tokensOut
  ├─ bucket
  ├─ modelVersion
  └─ adopted 用户是否采纳
        │
        ▼
telemetry.summaryByBucket()
  ├─ copywriter + control
  │    callCount / successRate / avgLatency / adoptionRate
  └─ copywriter + treatment
       callCount / successRate / avgLatency / adoptionRate
```

如果只看调用次数，新模型很容易被误判。更合理的判断顺序应该是：

```text
先看成功率：新模型是否稳定
再看平均延迟：用户是否等得起
再看采纳率：结果是否真的有用
最后看成本：tokens 和模型价格是否可接受
```

所以灰度不是一个开关，而是“分桶 -> 调用 -> 采纳 -> 对比 -> 放量”的闭环。

## AISlot：UI 只接状态，不接基础设施

`AISlot` 是业务页面和 Registry 之间的 UI 适配层。它内部维护调用状态：

```text
idle -> loading | streaming -> success | error | degraded
```

业务方通过 render props 拿状态并自由渲染。这样页面可以决定按钮、结果区、降级文案和采纳按钮怎么展示，但不需要知道 Registry 里怎么重试、怎么分桶。

AISlot 的职责边界可以画成：

```text
业务页面负责：
  - 表单输入
  - 按钮布局
  - 成功结果怎么展示
  - error/degraded 文案怎么写
  - 用户点击「采纳」时机

AISlot 负责：
  - 调用 Registry
  - 维护状态机
  - 流式 chunk 合并
  - 暴露 retry / run / markAdopted 等能力

Registry 负责：
  - 灰度
  - 超时
  - 重试
  - 降级
  - 埋点
```

这三层分开后，业务页面就不会塞满“请求控制逻辑”。页面看起来是在调用 AI，实际上是在消费一台已经封装好的状态机。

项目后面接入“AI 智能客服”时，AISlot 暴露过一个真实问题：早期流式累加逻辑默认输出字段叫 `text`，但客服组件输出字段叫 `reply`。这说明 UI 辅助层对输出结构做了不该有的假设。

修复方式是把 `streamingText` 改成更通用的 `streamingOutput`，对 delta 里的任意字符串字段做拼接。注意这个修复只改 AISlot，没有动 Registry。也就是说，协议调度层经受住了新场景，出问题的是 UI 层的一个简化实现。

## 从 mock 到真实模型

项目默认不依赖真实 AI API，`mockEngine.ts` 负责模拟延迟和失败率。这让协议、状态机和看板都可以在本地稳定验证。

接入真实 DashScope 时，真正要替换的是组件 runner 里的模型调用。关键点有三个：

- 流式请求需要 `X-DashScope-SSE: enable`。
- 参数里要设置 `incremental_output: true`，否则 SSE 返回的是累积全文，不是增量。
- Registry 传下来的 `ctx.signal` 必须传给 `fetch`，否则超时只是 UI 放弃，真实请求还在跑、还可能继续计费。

另一个必须强调的边界是安全：浏览器端直接请求 DashScope 会把 API Key 打进前端包里，只适合 demo。生产环境应该把真实模型调用放到 BFF 或后端服务里，前端只调用自己的后端接口。

生产环境更合理的链路是：

```text
浏览器 AISlot
  │
  ▼
业务 BFF / API
  │
  ├─ 读取服务端环境变量中的 API Key
  ├─ 统一鉴权、限流、审计
  ├─ 调用 DashScope / OpenAI-compatible 模型
  └─ 返回同步结果或 SSE 流
        │
        ▼
AISlot 更新 UI 状态
```

API Key 不应该出现在浏览器 bundle 里。前端组件协议可以保持不变，只是把 runner 的内部实现从 `mockEngine` 换成“调用自己的 BFF”。

## 部署：把组件平台放到可回滚的线上

部署方案也做了完整闭环。项目作为 Vite 前端 SPA，构建产物是静态 `dist/`，线上由 Nginx 直接 serve。

CI/CD 的分工是：

- `lint_and_typecheck`、`unit_test`、`build` 跑在 GitLab 共享 Runner 上。
- `deploy_*`、`rollback_*`、`canary_*` 跑在阿里云 ECS 上的 shell runner。

这个拆分是很现实的取舍。ECS 只有有限内存，不适合频繁装依赖、跑构建、吃 Node 内存；部署脚本只是轻量 bash 和文件操作，很适合放在 ECS 本机执行。构建产物通过 GitLab Artifacts 从共享 Runner 传给 ECS Runner。

CI/CD 的完整流向是：

```text
push main
  │
  ▼
GitLab Shared Runner
  ├─ npm ci
  ├─ npm test
  ├─ npm run build
  └─ 产出 dist/ artifact
        │
        │ GitLab artifacts
        ▼
Aliyun ECS Runner
  ├─ deploy_staging
  │    ├─ 创建 releases/<commit_sha>/
  │    ├─ 拷贝 dist/
  │    ├─ current -> releases/<commit_sha>
  │    └─ 记录 releases.log
  │
  ├─ deploy_production（手动）
  │    └─ 同样的软链接切换
  │
  ├─ deploy_production_canary（手动）
  │    └─ 部署到 production-canary
  │
  └─ rollback_*（手动）
       └─ current 指回上一个 release
```

这里最关键的是把“构建”和“部署”分开。共享 Runner 负责吃内存的 Node 构建，ECS 只负责文件切换和 Nginx reload。对小内存服务器来说，这个拆分比把所有 job 都扔到 ECS 上稳很多。

线上目录按环境和版本组织：

```text
/var/www/ai-component-platform/
  staging/
    current -> releases/<commit_sha>/
    releases/
    releases.log
  production/
    current -> releases/<commit_sha>/
    releases/
    releases.log
  production-canary/
    current -> releases/<commit_sha>/
    releases/
    releases.log
```

每次部署都创建一个以 commit SHA 命名的 release 目录，再通过软链接原子切换 `current`。回滚时只需要把 `current` 指回上一个版本。这个设计非常适合静态前端项目，简单、可靠，也容易审计。

一次发布在服务器上的变化是：

```text
发布前：
production/
  current -> releases/a1b2c3d/
  releases/
    a1b2c3d/

部署新版本 f6e7d8c：
production/
  releases/
    a1b2c3d/
    f6e7d8c/        # 新 dist 放这里
  current -> releases/f6e7d8c/

回滚：
production/
  current -> releases/a1b2c3d/
```

因为 Nginx 永远读 `current`，发布和回滚都只是切软链接，不需要在原目录里覆盖文件。这样可以避免部署到一半时用户读到半新半旧的资源。

## Nginx 灰度发布

生产环境还额外准备了 `production-canary` 目录。Nginx 用 `split_clients` 按客户端 IP 做哈希分流：

```text
用户请求
  -> split_clients
  -> canary 访问 production-canary/current
  -> stable 访问 production/current
```

这和应用内的 AI 模型灰度是两层灰度：

- 应用内灰度：按 `userId` 分模型版本，验证 AI 输出质量和采纳率。
- 部署灰度：按客户端 IP 分前端版本，验证整包发布是否稳定。

两层灰度解决的问题不同。前者是能力质量，后者是发布风险。

Nginx 灰度的请求路径是：

```text
用户访问 https://ai-component.keen-tech.top
  │
  ▼
Nginx split_clients 按客户端 IP 哈希
  │
  ├─ 命中 canary
  │    └─ root /var/www/ai-component-platform/production-canary/current
  │
  └─ 命中 stable
       └─ root /var/www/ai-component-platform/production/current
```

这和 AI 模型灰度放在一起看，会更清楚：

```text
部署灰度：控制“用户拿到哪一版前端代码”
  - 维度：客户端 IP
  - 执行位置：Nginx
  - 目标：降低发布风险

模型灰度：控制“同一版代码里调用哪个模型”
  - 维度：userId
  - 执行位置：AIComponentRegistry
  - 目标：验证模型质量、延迟和采纳率
```

所以一个用户可能：

```text
Nginx 层落在 stable 前端
  +
Registry 层落在 treatment 模型
```

这不是冲突，而是两条互相独立的风险控制线。

部署指南里还记录了几个很真实的坑：

- `split_clients` 不接受 `0%`，0% 和 100% 要在脚本里特殊处理。
- shell runner 的 `PATH` 里可能没有 `/usr/sbin`，脚本里要用完整路径调用 Nginx。
- `pgrep | head -1` 在 `set -o pipefail` 下可能因为 SIGPIPE 失败，改用 `pgrep -o nginx` 更稳。
- 用中间比例测试灰度时，同一个 IP 永远落同一桶，这是稳定哈希的预期行为，不是分流失效。

这些坑看起来琐碎，但它们恰恰是 CI/CD 从“文档能跑”到“线上可靠”的分界线。

## 我喜欢的几个点

第一，协议边界清楚。业务组件只做输入到输出，Registry 统一处理调用生命周期。

第二，灰度和观测不是附属功能，而是协议的一部分。模型版本、bucket、延迟、成功率、采纳率都天然进入调用记录。

第三，文档本身经过盲测。README 里记录过一次独立 agent 只读规格重新实现，并发现“失败埋点记录时机”这个真实矛盾。这比单纯写一份漂亮文档更有说服力。

第四，部署方案没有过度设计。静态资源、软链接切换、GitLab Artifacts、Nginx 分流，组合起来刚好覆盖 staging、production、canary 和 rollback。

第五，项目承认边界。mock 能验证协议和 UI，真实模型质量、网络延迟、限流格式仍然需要真实 Key 和真实环境验证。这个诚实边界很重要。

## 后续可以怎么扩展

如果要继续推进这个平台，我会优先补这几块：

- 把真实模型调用挪到后端 BFF，避免 API Key 暴露在浏览器。
- 把 telemetry 上报到服务端，形成长期可查询的指标库。
- 给 A/B 实验增加置信度和最小样本量判断，避免过早下结论。
- 给组件注册增加权限和租户维度，支持不同业务线启用不同 AI 能力。
- 把 fallback 和人工接管打通，尤其是客服类场景。
- 给部署流水线补健康检查和自动回滚策略。

这套项目的价值不在于某一个 prompt 写得多好，而在于它把 AI 能力接入抽象成了工程系统：可注册、可灰度、可观测、可降级、可部署、可回滚。

当 AI 功能从“试一下”进入“长期跑在线上”，这些基础设施会比单次模型调用更重要。

最后更新：2026-01-20
