---
title: Logic Composer：用 DSL 驱动一个智能工作流编排器
description: 从 Vue + X6 画布、NestJS 执行引擎、DSL 协议、SSE 状态回传和 MCP 工具调用拆解一个本地智能工作流系统
date: 2025-09-22
---

# Logic Composer：用 DSL 驱动一个智能工作流编排器
git: https://github.com/fengnovo/logic-composer  
线上地址：https://logic-composer.keen-tech.top/ 

`logic-composer` 是一个本地运行的智能工作流编排项目。它的使用方式很直观：在画布上拖节点、连线、配置属性，然后保存、校验、发布、运行。用户看到的是一个可视化工作台，但真正值得拆解的是它背后的边界设计：画布不是最终执行依据，稳定的工作流 DSL 才是。

项目使用 Vue 3、TypeScript、Vite 和 AntV X6 构建前端画布，用 NestJS 承担后端执行，Postgres 保存工作流和运行记录，Redis + BullMQ 支撑异步队列。大模型节点默认对接 DeepSeek，也兼容 OpenAI-compatible 配置；没有 API Key 时会走本地模拟结果，所以不接外部模型也能跑通示例流程。

## 先用大白话理解

这个项目可以先不要想“智能体”“编排器”这些词。它本质上做了四件事：

<div class="lc-flow">
  <div class="lc-flow__node">
    <strong>1. 画流程</strong>
    <span>用户在画布上放节点、连线。线的意思就是“上一步做完，下一步做什么”。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>2. 存说明书</strong>
    <span>系统把画布保存成一份 JSON，也就是 WorkflowDSL。它描述节点、连线、配置和位置。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>3. 后端照着跑</strong>
    <span>后端不看画布 UI，只看这份 DSL，从 Start 节点开始沿着边一个个执行。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>4. 前端看状态</strong>
    <span>后端每执行一步都发事件，前端收到后让节点变蓝、变绿或变红。</span>
  </div>
</div>

所以它不是“画布自己在运行”，而是“画布生成流程说明书，后端执行这份说明书”。理解了这一点，后面的 DSL、队列、SSE、版本发布就都顺了。

## 用户看到的系统

从产品视角看，它是一个“搭积木式”的逻辑编排器。默认示例大概是：

```text
Start -> LLM -> Condition -> HTTP -> End
                    └-------> End
```

用户可以从左侧节点库拖入节点，在中间画布连线，点击节点后在右侧配置面板修改名称和配置，最后在底部运行面板完成保存、校验、发布和运行。

几个基础节点的含义很明确：

- `Start`：流程入口，接收用户输入。
- `LLM`：调用大模型，做理解、分类或生成。
- `Condition`：根据表达式选择分支。
- `HTTP`：请求外部接口，比如创建工单。
- `End`：流程结束，整理最终输出。

运行时，节点会根据状态变色：运行中、成功、失败，底部会同步显示运行日志。这让“后端正在一步步执行图”的过程变成了用户可感知的反馈。

把默认示例翻译成普通话，就是：

<div class="lc-flow">
  <div class="lc-flow__node">
    <strong>用户输入问题</strong>
    <span>比如：我的订单怎么退款？</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>LLM 理解问题</strong>
    <span>判断这是普通咨询，还是需要创建工单。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>Condition 分支</strong>
    <span>如果需要工单，走 HTTP；如果不需要，直接结束。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>HTTP / End</strong>
    <span>创建工单或直接返回答案，最后进入 End 节点。</span>
  </div>
</div>

这里每个节点都可以理解成一个小函数。连线不是装饰，它决定“函数执行完以后，下一步调用哪个函数”。

## 架构分层

项目分成三层：

- `apps/web`：Vue 3 前端工作台，负责节点库、X6 画布、配置面板、运行面板和 SSE 状态展示。
- `apps/api`：NestJS 后端服务，负责草稿保存、版本发布、运行创建、节点执行和事件推送。
- `packages/shared`：共享协议包，负责 DSL 类型、节点定义、示例流程和校验逻辑。

本地基础设施由 Docker Compose 启动 Postgres 和 Redis。Postgres 保存工作流草稿、发布版本、运行记录和节点运行记录；Redis 支撑 BullMQ 队列，让运行任务从 API 请求中解耦出来。

这个分层里最重要的一句话是：X6 只是交互和视图，不是业务协议。

更直观地看，系统分成这几块：

<div class="lc-architecture">
  <div class="lc-lane">
    <strong>前端工作台</strong>
    <span>apps/web</span>
    <small>节点库、X6 画布、右侧配置、运行面板、节点状态展示</small>
  </div>
  <div class="lc-lane">
    <strong>共享协议</strong>
    <span>packages/shared</span>
    <small>WorkflowDSL、节点定义、示例流程、校验函数</small>
  </div>
  <div class="lc-lane">
    <strong>后端服务</strong>
    <span>apps/api</span>
    <small>保存草稿、发布版本、创建运行、执行节点、推送事件</small>
  </div>
  <div class="lc-lane">
    <strong>数据库</strong>
    <span>Postgres</span>
    <small>保存工作流、版本、运行记录和节点运行记录</small>
  </div>
  <div class="lc-lane">
    <strong>队列</strong>
    <span>Redis + BullMQ</span>
    <small>把运行任务丢到后台执行，避免 API 请求一直卡着</small>
  </div>
  <div class="lc-lane">
    <strong>模型和工具</strong>
    <span>DeepSeek / MCP</span>
    <small>LLM 节点可以调用模型，也可以通过 MCP 调外部工具</small>
  </div>
</div>

一句话总结架构：前端负责“把流程画出来”，共享包负责“定义流程长什么样”，后端负责“按流程跑起来”。

## DSL 是稳定边界

工作流 DSL 是前端、后端和运行器共同遵守的协议。它大致长这样：

```ts
type WorkflowDSL = {
  id: string
  name: string
  version: number
  status: 'draft' | 'published'
  inputs: WorkflowInput[]
  variables: WorkflowVariable[]
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  layout: WorkflowLayout
}
```

X6 内部有自己的 cell、node、edge 数据，但这些都不应该泄漏成系统协议。用户在画布上的拖拽、移动、连线、选择和缩放，最终都会被同步回 `WorkflowDSL`。

保存草稿时，前端把当前 DSL 写给后端。校验时，后端检查节点、边、开始节点、结束节点和布局是否完整。发布时，后端把草稿保存为不可变版本。运行时，后端基于这个发布版本创建运行记录，再投递到 BullMQ 队列中执行。

这个设计避免了一个常见问题：前端画布库一换，业务数据就跟着崩。只要 DSL 稳定，画布层可以替换，执行层也可以独立演进。

可以把 DSL 理解成一张“流程说明书”：

<div class="lc-protocol-grid">
  <div>
    <strong>inputs</strong>
    <span>运行开始时用户传进来的参数，比如 question。</span>
  </div>
  <div>
    <strong>variables</strong>
    <span>流程运行期间可以读写的变量，比如 ticketCount。</span>
  </div>
  <div>
    <strong>nodes</strong>
    <span>有哪些步骤，每一步是什么类型、叫什么、配置是什么。</span>
  </div>
  <div>
    <strong>edges</strong>
    <span>节点之间怎么连接，也就是执行顺序和条件分支。</span>
  </div>
  <div>
    <strong>layout</strong>
    <span>每个节点在画布上的位置，只影响显示，不决定业务语义。</span>
  </div>
  <div>
    <strong>status/version</strong>
    <span>这是草稿还是发布版本，以及当前版本号。</span>
  </div>
</div>

画布上的节点拖来拖去，最终都会落到这几个字段里。后端真正需要的是 `nodes + edges + config`，不是 X6 的内部对象。

### 从画布到 DSL

用户每做一个动作，系统都会把它同步成 JSON：

<div class="lc-map">
  <div>
    <strong>拖一个 LLM 节点</strong>
    <span>nodes 里新增一项：{ id: "llm_1", type: "llm", config: {...} }</span>
  </div>
  <div>
    <strong>从 Start 连到 LLM</strong>
    <span>edges 里新增一项：{ source: "start_1", target: "llm_1" }</span>
  </div>
  <div>
    <strong>移动节点位置</strong>
    <span>layout 里更新这个节点的 x/y 坐标。</span>
  </div>
  <div>
    <strong>右侧改 Prompt</strong>
    <span>对应节点的 config.prompt 被更新。</span>
  </div>
</div>

这样做的好处是：画布只是编辑器，DSL 才是系统的“存档格式”和“执行格式”。

## 执行引擎：增强版链表遍历

工作流执行的核心并不神秘。后端拿到 DSL 后，会先构建两张 Map：

```ts
const nodesById = new Map()
const outgoing = new Map()
```

`nodesById` 用于根据节点 ID 找节点，`outgoing` 用于根据 `sourceNodeId` 找出边。然后执行器从 `start` 节点出发，一步步执行：

```ts
let current = startNode

for (let step = 0; step < 100; step++) {
  const output = await executeNode(current)
  context.nodes[current.id] = { outputs: output }
  context.lastOutput = output

  if (current.type === 'end') return output

  const nextEdge = pickNextEdge(current, output, outgoing.get(current.id))
  current = nodesById.get(nextEdge.target)
}
```

普通节点默认走第一条出边。条件节点比较特殊，它会把选中的分支写到输出里：

```ts
{ selectedHandle: 'yes', matched: true }
```

然后 `pickNextEdge` 找 `sourceHandle === selectedHandle` 的边；如果没有匹配，就兜底走 `else`。

所以它本质上是一个增强版链表遍历：每个节点是一次函数调用，边决定下一个节点，条件节点决定选哪条边。

用图拆开看，执行器大概做这几步：

<div class="lc-sequence">
  <div><b>加载版本</b><span>从 workflow_versions 读取发布时冻结的 DSL。</span></div>
  <div><b>建立索引</b><span>把 nodes 变成 nodesById，把 edges 变成 outgoing 邻接表。</span></div>
  <div><b>找到 Start</b><span>从 type === "start" 的节点开始执行。</span></div>
  <div><b>执行当前节点</b><span>按节点类型调用对应 runner，比如 LLM、HTTP、Condition。</span></div>
  <div><b>保存输出</b><span>把当前节点输出写入 context.nodes[nodeId].outputs。</span></div>
  <div><b>选择下一条边</b><span>普通节点走第一条出边，Condition 按 selectedHandle 选边。</span></div>
  <div><b>遇到 End 停止</b><span>End 节点输出最终结果，整个 run 完成。</span></div>
</div>

这里说“增强版链表遍历”是因为普通链表只有一条路，而工作流可以有分支。分支并不复杂，本质就是 Condition 节点算出一个出口名，再去找匹配这个出口名的边。

<div class="lc-flow">
  <div class="lc-flow__node">
    <strong>Condition 输出</strong>
    <span>{ selectedHandle: "yes", matched: true }</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>找边</strong>
    <span>在 outgoing[condition_1] 里找 sourceHandle === "yes"</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>跳到目标节点</strong>
    <span>如果 yes 指向 HTTP，就执行 HTTP；否则走 else 兜底。</span>
  </div>
</div>

## 节点如何传递数据

节点之间的数据传递靠执行上下文和模板表达式完成。执行上下文包含输入、变量、每个节点的输出和上一步输出：

```ts
const context = {
  inputs: { question: '我的订单怎么退款？' },
  variables: { ticketCount: 0 },
  nodes: {
    start_1: { outputs: { question: '...' } },
    llm_1: { outputs: { text: '...', needTicket: true } }
  },
  lastOutput: { ... }
}
```

节点配置里可以写模板：

```text
&#123;&#123;inputs.question&#125;&#125;
&#123;&#123;nodes.llm_1.outputs.text&#125;&#125;
&#123;&#123;variables.ticketCount&#125;&#125;
&#123;&#123;env.API_KEY&#125;&#125;
&#123;&#123;secrets.QWEATHER_API_KEY&#125;&#125;
```

模板解析有三种模式：

- 精确匹配：`"&#123;&#123;inputs.question&#125;&#125;"` 返回原始值，保留类型。
- 部分匹配：`"问题是：&#123;&#123;inputs.question&#125;&#125;"` 返回字符串。
- 递归解析：对象和数组里的值会继续被解析。

这个机制让节点配置保持 JSON 化，同时又能引用前序节点结果。对于工作流系统来说，这比在节点之间传复杂对象引用更容易保存、发布和回放。

大白话讲，`context` 就是运行过程中的记事本：

<div class="lc-split-diagram">
  <div>
    <strong>inputs</strong>
    <p>用户一开始交给流程的东西。比如“我的订单怎么退款？”</p>
  </div>
  <div>
    <strong>nodes</strong>
    <p>每个节点执行完以后，把结果记在自己的名字下面。</p>
  </div>
  <div>
    <strong>lastOutput</strong>
    <p>上一个节点刚刚输出了什么，方便下一个节点直接用。</p>
  </div>
</div>

模板表达式就是“去记事本里拿值”。例如 HTTP 节点要把 LLM 的判断结果放进请求体，就可以写 `&#123;&#123;nodes.llm_1.outputs.text&#125;&#125;`。运行时不是原样发送这串文本，而是先把它替换成 LLM 节点真实输出。

一条数据从输入到输出，可以这样理解：

<div class="lc-flow">
  <div class="lc-flow__node"><strong>Start</strong><span>把 inputs.question 输出成 question。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>LLM</strong><span>prompt 引用 question，输出 text / needTicket。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>Condition</strong><span>读取 needTicket，决定走 yes 还是 else。</span></div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node"><strong>HTTP / End</strong><span>继续引用前面节点的输出，生成最终结果。</span></div>
</div>

## 节点类型与运行器

后端的节点执行分发器大致是一个 `switch`：

- `start`：解析输出模板，把用户输入转成流程初始输出。
- `llm`：解析 prompt/messages，调用 DeepSeek 或 OpenAI-compatible API。
- `condition`：按顺序计算分支表达式，返回 `selectedHandle`。
- `http`：解析 URL、headers、body，按配置发请求或返回模拟结果。
- `code`：用 `new Function('input', 'context', source)` 执行用户代码。
- `set-variable`：解析配置后写入 `context.variables`。
- `end`：解析输出模板，返回最终结果。

其中 LLM 节点比较有意思。它会按优先级读取 API Key：节点配置、`DEEPSEEK_API_KEY`、`OPENAI_API_KEY`。如果没有 Key，就走 mock 模式；如果配置了 MCP 工具，比如天气工具，则会把 MCP 工具转换成 OpenAI function calling 格式注入模型请求。模型返回 `tool_calls` 后，后端调用 MCP Server，再把工具结果作为 tool message 回传给模型，完成二次生成。

这让 LLM 节点不只是“发一段 prompt”，而是具备了调用外部工具的能力。

节点 runner 可以按“输入、处理、输出”理解：

<div class="lc-protocol-grid">
  <div>
    <strong>Start</strong>
    <span>把用户输入整理成流程里的第一份输出。</span>
  </div>
  <div>
    <strong>LLM</strong>
    <span>把 prompt 发给模型，必要时调用 MCP 工具，再返回文本或 JSON。</span>
  </div>
  <div>
    <strong>Condition</strong>
    <span>计算表达式，告诉执行器下一条边走哪个出口。</span>
  </div>
  <div>
    <strong>HTTP</strong>
    <span>把配置里的 URL、headers、body 解析完后发请求，或返回 mock 响应。</span>
  </div>
  <div>
    <strong>Code</strong>
    <span>执行一段 JS，把上一步输出和 context 交给用户代码处理。</span>
  </div>
  <div>
    <strong>Set Variable</strong>
    <span>修改 context.variables，给后续节点继续使用。</span>
  </div>
  <div>
    <strong>End</strong>
    <span>整理最终输出，流程在这里结束。</span>
  </div>
</div>

其中最像“智能体能力”的是 LLM + MCP：LLM 节点先问模型，如果模型说需要调用工具，后端再调 MCP Server，把工具结果交回模型，让模型生成最终回复。

<div class="lc-sequence">
  <div><b>LLM 节点</b><span>读取 prompt 和 mcpTools 配置。</span></div>
  <div><b>MCP 服务</b><span>把天气等工具转换成 OpenAI function calling 格式。</span></div>
  <div><b>模型请求</b><span>把 prompt + tools 一起发给 DeepSeek 或 OpenAI-compatible API。</span></div>
  <div><b>tool_calls</b><span>模型返回需要调用哪个工具和参数。</span></div>
  <div><b>执行工具</b><span>后端调用 MCP Server，拿到工具结果。</span></div>
  <div><b>二次生成</b><span>把工具结果回传给模型，得到最终回答。</span></div>
</div>

## 实时反馈：SSE 事件流

用户能在画布上看到节点变色，是因为后端每一步都会通过 SSE 推送事件：

```text
run.started
node.started
node.completed
node.failed
run.completed
```

前端用 `EventSource` 订阅运行事件，收到后更新画布节点状态。这样一来，执行引擎虽然在后端队列里跑，但用户仍然能看到一个连续的运行过程。

这种设计很适合工作流系统：SSE 比 WebSocket 更轻，天然适合服务端单向推送运行日志、节点状态和最终结果。

这个反馈链路可以这样看：

<div class="lc-flow">
  <div class="lc-flow__node">
    <strong>后端执行节点</strong>
    <span>例如开始执行 llm_1。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>发送 SSE 事件</strong>
    <span>node.started / node.completed / node.failed。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>前端 EventSource 接收</strong>
    <span>App.vue 订阅当前 run 的事件流。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>画布更新状态</strong>
    <span>节点变蓝、变绿或变红，底部追加运行日志。</span>
  </div>
</div>

这里的关键不是“实时通信很高级”，而是它把后台队列执行变成了前台可理解的过程。用户不用猜系统卡在哪里，因为每个节点的状态都会被推回来。

## 数据库模型

后端用四张核心表承载生命周期：

- `workflows`：工作流身份和当前草稿，草稿以 JSONB 保存。
- `workflow_versions`：不可变发布版本。
- `runs`：一次执行记录，关联某个发布版本。
- `node_runs`：一次运行中每个节点的执行记录。

这里“草稿”和“发布版本”的区分很关键。草稿可以反复编辑，发布版本用于运行和追溯。否则运行过程中用户改了画布，执行语义就会变得不可解释。

生命周期可以用一张图串起来：

<div class="lc-flow">
  <div class="lc-flow__node">
    <strong>workflows</strong>
    <span>当前工作流和草稿 DSL，可以反复修改。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>workflow_versions</strong>
    <span>发布时冻结一份版本，运行只认这个快照。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>runs</strong>
    <span>每点击一次运行，就创建一条执行记录。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>node_runs</strong>
    <span>记录这次运行里每个节点的开始、结束、输出和错误。</span>
  </div>
</div>

大白话说：草稿负责编辑，版本负责追溯，运行记录负责复盘，节点记录负责排错。

## 节点扩展方式

新增节点类型的路径也比较清晰：

1. 在共享包里加入节点类型。
2. 在 `nodeDefinitions` 中声明标题、分类、端口、默认配置和默认尺寸。
3. 在后端 `RuntimeService` 中加入运行器分支。
4. 如果 JSON 配置不够友好，再扩展前端 `Inspector.vue` 的表单。
5. 在共享校验逻辑中补充必填字段和非法组合检查。

这个流程体现了“协议优先”的思路：先定义节点是什么，再决定它如何编辑、如何执行、如何校验。

## 部署取舍

部署文档里有一个很实际的取舍：在 2GB 内存的 ECS 上，不把每个 Node 项目都容器化。数据库和 Redis 放 Docker，Node API 用 PM2 跑在宿主机，Nginx 负责静态文件和反向代理。

这样的架构大概是：

```text
Browser
  -> Nginx
    -> static frontend files
    -> 127.0.0.1:4100 API
      -> PM2 managed NestJS process
      -> Docker Postgres / Redis
```

原因很朴素：小机器内存有限，数据库容器化能获得隔离和备份便利，Node 进程交给 PM2 更省资源。日常重新部署则用脚本完成：拉代码、构建 shared、构建 API、构建前端、替换静态目录、重启 PM2。

## 我喜欢的几个设计点

第一，画布和协议分离。X6 只负责体验，DSL 才负责业务语义，这让系统不会被前端画布库锁死。

第二，发布版本不可变。工作流系统一旦涉及运行记录，就必须能回答“当时运行的到底是哪一版流程”。

第三，执行引擎足够朴素。先把节点和边变成邻接表，再从 `start` 节点走到 `end`，理解成本很低，也方便加日志和兜底。

第四，SSE 把异步执行变成实时反馈。后端跑队列，前端看状态，体验上仍然像是在“现场执行”。

第五，LLM 节点支持 mock、真实模型和 MCP 工具调用。它既方便本地演示，又给后续接入真实智能体能力留了入口。

## 后续可以继续长什么

这个项目已经跑通了智能工作流的主干，后续可以继续补：

- 更安全的 Code 节点沙箱。
- 更完整的循环、工具、知识库节点。
- 工作流版本 diff 和回滚。
- 节点级重试、超时和补偿策略。
- 更细粒度的运行观测和成本统计。
- 更友好的表达式编辑器，降低模板语法门槛。

但这些都应该建立在当前的边界上：画布编辑 DSL，发布冻结版本，执行器消费 DSL，事件流反馈状态。

把这个边界守住，工作流系统才有继续复杂化的空间。

最后更新：2025-09-22
