# demo12：中间件（Middleware）的概念、创建与分类

> GitHub 源码：[demo12-middleware](https://github.com/fengnovo/langchain-learn/tree/main/ai-agent-langgraph-demo/demo12-middleware)
中间件作为核心组件，为 Agent 执行流程提供了强大的可扩展性和控制能力。它本质上
是一种设计模式的实现，在 Agent 的执行管道中充当拦截器，使得开发者能够在关键
执行节点注入自定义业务逻辑，实现对代理行为的细粒度控制和功能扩展。

主要作用：

1. **行为记录**——通过日志记录、分析和调试跟踪 Agent 行为；
2. **格式约束**——转换提示、工具选择和输出格式；
3. **逻辑控制**——增加了重试、后备和提前终止逻辑；
4. **资源限制**——应用速率限制、保护栏和个人身份识别检测。

执行管道：任务 → `beforeAgent` → `beforeModel` → `wrapModelCall` →
（模型 ⇄ 工具列表，`wrapToolCall`）→ `afterModel` → `afterAgent` → 用户。

## 1. 中间件的创建与分类

中间件在 Agent 运行的每一步之前和之后为用户暴露钩子（hooks）。把中间件传给
`createAgent` 的 `middleware` 参数即可添加。**middleware 参数传入一个列表，
可以传入多个中间件；同一位置有多个中间件时，会按照列表中的先后顺序触发。**

分类：

- **Built-in（预制中间件）**：LangChain 为常见场景提供的预构建中间件；
- **Custom（自定义中间件）**：通过代理执行流程中特定节点运行的钩子构建——
  节点型钩子 `beforeAgent` / `beforeModel` / `afterModel` / `afterAgent`，
  环绕型钩子 `wrapModelCall` / `wrapToolCall`。

本示例的 `middleware: [auditTrail, callCounter, modelCallLimitMiddleware(...)]`
同时演示：两个自定义中间件（行为记录 + 调用计数/上限提前终止）与一个预制中间件
（Model call limit）。

## 2. 环境变量

复用项目根目录 `.env` 的默认模型配置：

```dotenv
OPENAI_API_KEY=你的API_KEY
OPENAI_BASE_URL=https://你的OpenAI兼容接口/v1
MODEL=模型名称
```

## 3. 运行

在 `ai-agent-langgraph-demo` 目录执行：

```bash
pnpm demo12
pnpm demo12:2
pnpm demo12:3
pnpm demo12:4
pnpm demo12:5
```

执行类型检查：

```bash
pnpm typecheck:demo12
```

## 4. Python 与 TypeScript API 对照

| 功能 | Python | TypeScript |
| --- | --- | --- |
| 创建 Agent 并挂中间件 | `create_agent(model=..., tools=[...], middleware=[...])` | `createAgent({ model, tools, middleware: [...] })` |
| 创建自定义中间件 | `@wrap_model_call` 等装饰器 / 类 | `createMiddleware({ ... })` |
| Agent 开始前 | `before_agent` | `beforeAgent`（每次查询一次） |
| 模型调用前 | `before_model` | `beforeModel`（每次模型调用一次） |
| 模型响应后 | `after_model` | `afterModel`（每次模型响应后） |
| 代理完成后 | `after_agent` | `afterAgent`（每次调用一次） |
| 环绕模型调用 | `wrap_model_call` | `wrapModelCall` |
| 环绕工具调用 | `wrap_tool_call` | `wrapToolCall` |
| 预制：总结 | `SummarizationMiddleware` | `summarizationMiddleware` |
| 预制：人工确认 | `HumanInTheLoopMiddleware` | `humanInTheLoopMiddleware` |
| 预制：任务清单 | To-do list middleware | `todoListMiddleware` |
| 预制：模型调用限次 | `ModelCallLimitMiddleware` | `modelCallLimitMiddleware` |
| 顺序规则 | 同一位置按列表先后触发 | 相同（列表顺序即触发顺序） |

## 5. 工作原理

1. `audit-trail` 覆盖全部六种钩子，逐条打印进入/退出日志，完整还原课件图中的
   执行管道（含模型两次调用、工具一次调用时 `beforeModel`/`afterModel` 触发两次
   而 `beforeAgent`/`afterAgent` 只触发一次的现象）；
2. `call-counter` 在 `beforeModel` 中统计模型调用次数并在超限时抛错提前终止
   （逻辑控制 + 资源限制），它与 `audit-trail` 在相同位置的钩子按
   `middleware` 列表顺序先后触发；
3. `modelCallLimitMiddleware({ runLimit: 10 })` 是 LangChain 预制的
   Model call limit 中间件，限制单次运行的模型调用次数以防止过高成本。

## 6. demo2：Human-in-the-Loop（人工监督）中间件

HITL 中间件允许用户为代理工具调用添加人工监督。当模型提出可能需要审查的动作
（例如写入文件或执行 SQL）时，中间件会暂停执行并等待人类决策。

三种人类响应中断的方式：

1. **批准（approve）**——批准模型的原始调用请求并执行；
2. **编辑（edit）**——基于模型原始工具调用进行人工修改并执行；
3. **拒绝（reject）**——拒绝原始工具调用，可在对话中添加解释引导模型下一步动作。

`demo2.ts` 复刻课件示例：创建 `write_txt_tool` / `read_txt_tool` /
`delete_txt_tool` 三个文件工具，并通过 `interruptOn` 为每个工具配置策略。
注意：必须配置 `checkpointer`（检查点），以在中断间持久化图状态；
工具决策取决于 `interruptOn` 中配置的策略，未配置的工具不会触发中断
（默认自动批准）。

| 配置/响应 | Python | TypeScript |
| --- | --- | --- |
| HITL 中间件 | `HumanInTheLoopMiddleware(interrupt_on={...}, description_prefix=...)` | `humanInTheLoopMiddleware({ interruptOn: {...}, descriptionPrefix: ... })` |
| 允许全部决策 | `"write_txt_tool": True` | `write_txt_tool: true` |
| 限定决策范围 | `"delete_txt_tool": {"allowed_decisions": ["approve", "reject"]}` | `delete_txt_tool: { allowedDecisions: ['approve', 'reject'] }` |
| 不中断 | `"read_txt_tool": False` | `read_txt_tool: false` |
| 检查点 | `checkpointer=InMemorySaver()` | `checkpointer: new MemorySaver()`（来自 `@langchain/langgraph`） |
| 线程配置 | `config = {"configurable": {"thread_id": "some_id"}}` | `{ configurable: { thread_id: '...' } }` |
| 中断信息 | `result["__interrupt__"]` | `result.__interrupt__` |
| 恢复执行 | `agent.invoke(Command(resume={"decisions": [{"type": "approve"}]}), config=config)` | `agent.invoke(new Command({ resume: { decisions: [{ type: 'approve' }] } }), config)` |
| 编辑决策 | `{"type": "edit", "edited_action": ...}` | `{ type: 'edit', editedAction: ... }` |
| 拒绝并解释 | `{"type": "reject", "message": "..."}` | `{ type: 'reject', message: '...' }` |

运行流程（三个场景共用一个 `thread_id`；`demo2.ts` 为**交互式运行**——触发
中断时进程会暂停在终端，打印 `__interrupt__` 信息并等待你输入决策）：

1. **不触发中断**：请求读取文件，`read_txt_tool: false` 直接自动执行；
2. **中断后批准**：请求写入文件，命中 `write_txt_tool: true` 触发中断，
   结果包含 `__interrupt__` 字段（显示工具名、参数、说明与
   `allowedDecisions`）；终端输入 `approve` 后以
   `Command(resume={ decisions: [{ type: 'approve' }] })` 恢复执行，
   工具真正执行，文件内容被更新；
3. **中断后拒绝**：请求删除文件，命中 `delete_txt_tool`（只允许
   approve/reject）触发中断；输入 `reject` 并附拒绝原因（直接回车使用
   默认提示），模型收到解释后回复不会删除，文件保持原样；
4. **中断后编辑**（独立线程）：请求追加一行「8,小虎,88」，命中
   `write_txt_tool` 触发中断；输入 `edit` 后逐项确认参数——直接回车保留
   原值，输入新值则替换（如把 content 中的成绩 88 改为 100，其他类型按
   JSON 解析），恢复后实际执行的是修改后的参数（文件内容证明 edit 生效）。
   edit 也可通过 `editedAction.name` 把调用改为其他工具。

交互输入约定：决策输入不区分大小写，且必须在 `allowedDecisions` 范围内，
输入无效会重新提示。

注意：当多个工具调用同时暂停时，每个工具都需要独立决策，决策必须按照
中断请求中出现的动作顺序提供。

### HITL 中间件的运行逻辑

HITL 中间件属于 **afterModel 类型钩子（Hook）**：它在模型生成响应之后、
任何工具调用执行之前触发判定（对应 demo.ts 中 `afterModel` 的管道位置——
模型回复先经过 `afterModel`，然后才轮到 `wrapToolCall` 执行工具）。

具体遵循以下五步运行逻辑：

1. **调用模型**——Agent 依据用户消息，调用模型生成模型回复；
2. **验证条件**——当模型回复中存在工具调用时，中间件验证响应中的工具调用
   是否符合 `interruptOn` 中断策略（如 demo2 中 `read_txt_tool: false`
   直接放行）；
3. **触发中断**——若存在需要人工干预的工具调用，中间件将构建包含操作请求
   （`actionRequests`：工具名、参数、说明）和审核配置（`reviewConfigs`：
   `allowedDecisions`）的 HITL 请求，并触发进程中断；
4. **等待决策**——Agent 发出返回给用户的中断消息（即结果中的
   `__interrupt__` 字段），等待人工决策；
5. **接受决策**——根据人工的决策结果，中间件执行已批准（approve）或编辑
   （edit）的调用；被拒绝（reject）的调用会被**合成为 ToolMessage 返回模型**
   （这就是 demo2 场景三中 `message` 解释能进入对话、并引导模型改口的原因；
   而 edit 是静默替换参数执行，模型只看到工具结果，并不知道参数被改过）。

## 7. demo3：Summarization（摘要）中间件

### 概念

Summarization 中间件在接近令牌限制或其他条件时，**自动总结对话记录**：保留近期
消息的同时压缩较早的上下文，为 Agent 在更复杂的长时序环境中执行任务提供便利
（模型：「消息太多了，我记不住呀」→ Summarization：「我来帮你总结一下」，
把完整消息替换为精简的内容后再交回模型）。

摘要功能适用于以下场景：

1. **长文本（Long-context）**——超出上下文窗口的长期对话任务；
2. **多轮次（multi-turn）**——具有丰富历史记录的多轮对话；
3. **高冗余（High-redundancy）**——需要完整保留对话上下文的应用场景。

### 创建

使用 summarization 时，将中间件添加到 Agent 的中间件列表中。设置触发条件后，
当 Agent 的消息列表符合条件，中间件会依据用户配置精简消息列表后继续任务执行：

- **model**——定义总结模型（负责生成摘要，可与主模型不同）；
- **trigger**——Summarization 中间件总结摘要的触发条件；
- **keep**——总结摘要后维持的消息列表状态。

### 触发与流程

Summarization 中间件属于 **before_model 类型钩子（Hook）**：该钩子在每一次对
模型调用之前，依据用户拟定条件检查是否符合触发条件。达到阈值时，中间件会自动
对较旧的消息进行摘要处理——旧消息被替换为一条
"Here is a summary of the conversation so far..." 开头的摘要消息。

`demo3.ts` 复刻课件流程：预设 4 条历史消息（HumanMessage 提问 → AIMessage 发起
搜索工具调用 → ToolMessage 返回搜索结果 → AIMessage 总结回答），再追加 1 条新的
询问，消息数达到 `trigger: { messages: 5 }` 阈值；调用后可以看到较旧消息已被
压缩为摘要消息。

### 规则的多种制定方式

除依据消息条数制定触发规则外，LangChain 还提供多种规则制定方式：

| 规则 | 说明 | trigger | keep |
| --- | --- | --- | --- |
| 消息条数 | 依据消息列表中的消息数量触发或保留 | `{ messages: 5 }` | `{ messages: 3 }` |
| token 计数 | 依据消息列表中的 token 数量触发或保留 | `{ tokens: 4000 }` | `{ tokens: 2000 }` |
| 上下文长度比值 | 依据模型上下文大小的比例触发或保留 | `{ fraction: 0.8 }` | `{ fraction: 0.3 }` |
| 混合策略 | trigger 传条件数组，任一条件符合都会触发摘要 | `[{ tokens: 5000 }, { messages: 3 }]` | — |

### 其他参数配置

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `model` | `string \| BaseChatModel` | 与 Agent 创建相同，可利用字符串配置模型（如 `'gpt-4o-mini'`），也可直接传入模型对象 |
| `trigger` | `ContextSize \| ContextSize[]` | 可接受单一条件对象，或条件对象列表作为多条件触发（任一条件符合都会触发摘要）。注意 JS 版语义：**单个对象内**的多个属性是「同时满足（AND）」，**数组内**的多个条件是「任一满足（OR）」 |
| `keep` | `ContextSize` | 只能接收单一对象，不进行配置时会默认为 `{ messages: 20 }` |
| `summaryPrompt` | `string` | LangChain 已预设供摘要模型使用的系统提示词，有特殊需求时可重写以替换预设提示词。**注意：自行拟定提示词中必须包含 `{messages}` 占位符**（会被替换为待摘要的消息列表） |

另有一些进阶选项：`tokenCounter`（自定义 token 计数函数）、`summaryPrefix`
（摘要消息前缀，默认 "Here is a summary of the conversation to date:"）、
`trimTokensToSummarize`（摘要前裁剪的 token 上限）。

`demo3.ts` 中 agent4 演示混合配置（trigger 数组 + keep 默认 20 条），agent5
演示自定义 `summaryPrompt`。

### Python 与 TypeScript API 对照

| 功能 | Python | TypeScript |
| --- | --- | --- |
| 导入中间件类 | `from langchain.agents.middleware import SummarizationMiddleware` | `import { summarizationMiddleware } from 'langchain'` |
| 传入中间件 | `middleware=[SummarizationMiddleware(...)]` | `middleware: [summarizationMiddleware({...})]` |
| 定义总结模型 | `model=model` | `model`（第一个参数） |
| 配置触发逻辑 | `trigger=("messages", 5)` | `trigger: { messages: 5 }` |
| 配置保留状态 | `keep=("messages", 3)` | `keep: { messages: 3 }` |
| token 规则 | `trigger=("tokens", 4000)` / `keep=("tokens", 2000)` | `trigger: { tokens: 4000 }` / `keep: { tokens: 2000 }` |
| 比值规则 | `trigger=("fraction", 0.8)` / `keep=("fraction", 0.3)` | `trigger: { fraction: 0.8 }` / `keep: { fraction: 0.3 }` |
| 混合触发（任一符合） | `trigger=[("tokens", 5000), ("messages", 3)]` | `trigger: [{ tokens: 5000 }, { messages: 3 }]` |
| keep 默认值 | `("messages", 20)` | `{ messages: 20 }`（不配置时默认） |
| 字符串指定模型 | `model="gpt-4o-mini"` | `model: 'gpt-4o-mini'` |
| 自定义摘要提示词 | `summary_prompt="..."`（须含 `{messages}` 占位符） | `summaryPrompt: '...'`（须含 `{messages}` 占位符） |
| 预设消息列表 | `status = {"messages": [...]}` | `agent.invoke({ messages: history })` |
| 加入新的询问 | `status["messages"].append(HumanMessage(...))` | `history.push(new HumanMessage(...))` |

注意：Python 的 trigger/keep 是 `(kind, value)` 元组，TypeScript 改为对象字面量；
总结模型既可复用主 `model`，也可像课件 agent2/agent3 那样单独指定其他模型。

## 8. demo4：LLM tool_selector（工具筛选）中间件

### 概念

在调用主模型前，利用大型语言模型智能筛选相关工具。该中间件通过**结构化输出**
向 LLM 询问当前查询最相关的工具，结构化输出模式定义了可用工具的名称及描述
（工具池 → Tool selector 选取恰当的工具 → 适合当前任务的少量工具 → 主模型）。

适用于以下场景：

1. **多工具**——拥有大量工具（10+）的代理，其中多数工具对每次查询而言并不相关；
2. **高成本**——通过过滤无关工具来减少 token 使用量；
3. **高精度**——通过减少冗余工具，提升模型聚焦度与准确性。

### 创建

使用 tool_selector 时，将中间件添加到 Agent 的中间件列表中。tool_selector 作为
**before_model 类型的钩子**，会在每次对模型进行调用前，基于当前消息列表，
触发工具筛选：

```python
agent = create_agent(
    model=model,
    tools=[tool_1, tool_2, tool_3, tool_4, ...],  # Agent 工具列表包含完整工具池
    middleware=[
        LLMToolSelectorMiddleware(
            model=model,                # 负责选取工具的模型
            max_tools=2,                # 选取出来的工具数量
            always_include=["tool_4"],  # 始终被选取的工具名称
        ),
    ],
)
```

**注意**：Agent 的工具列表中传入的是**工具对象**，中间件 `always_include` 中
只是以**字符串形式**传入工具名称（且不计入 `max_tools` 数量上限）。

### Python 与 TypeScript API 对照

| 功能 | Python | TypeScript |
| --- | --- | --- |
| 导入中间件类 | `from langchain.agents.middleware import LLMToolSelectorMiddleware` | `import { llmToolSelectorMiddleware } from 'langchain'` |
| 负责选取工具的模型 | `model=model` | `model: selectorModel`（也支持字符串如 `'openai:gpt-4o-mini'`） |
| 选取出来的工具数量 | `max_tools=2` | `maxTools: 2` |
| 始终被选取的工具名称 | `always_include=["tool_4"]` | `alwaysInclude: ['calculate']` |
| 筛选指令 | —（内置默认提示词） | `systemPrompt`（可选，自定义选取提示词） |
| 钩子类型 | before_model | `wrapModelCall` 实现（同样在每次模型调用前基于当前消息列表触发筛选） |

### 运行观察

`demo4.ts` 构建了一个 6 个工具的工具池（搜索/计算/天气/汇率/翻译/笔记），并在
selector 之后注册一个 `wrapModelCall` 日志中间件（后注册者在内层，能看到筛选后
的请求），打印每次模型调用实际可用的工具：

- 场景一（天气 + 温度换算）：6 个工具被筛选为 `get_weather`、
  `currency_exchange`、`calculate`（`calculate` 因 `alwaysInclude` 始终保留）；
- 场景二（日元换人民币）：无关工具被过滤，多轮调用中还会自我修正
  （第二轮只剩 `currency_exchange`、`calculate`）。

注意：筛选模型内部通过 `withStructuredOutput` 进行结构化输出（强制
`tool_choice`），qwen3.8 思考模式下接口不接受该参数，因此 `demo4.ts` 中的
`selectorModel` 用 `modelKwargs: { enable_thinking: false }` 关闭了思考模式
（与 demo10 相同的处理）。

## 9. demo5：File System（文件系统）中间件

### 概念

上下文（Context）的管理是构建高效 Agent 的关键所在。当使用的工具调用内部信息
不稳定（如网络搜索或 RAG）时，这一挑战尤为严峻，因为冗长的工具信息会迅速填满
上下文窗口。这时可以选择将一些关键信息以「文件」方式存储为「记忆」，需要使用时
再进行调用获取信息，以支持 Agent 的连续长期运行。

File System 中间件会为 Agent 提供四种工具，用于短期和长期内存记忆的操作：

| 工具 | 作用 |
| --- | --- |
| `ls` | 列出当前文件系统中的文件列表 |
| `read_file` | 读取某完整文件或其中特定行数 |
| `write_file` | 创建新文件并写入内容 |
| `edit_file` | 编辑某个现有文件 |

（此外还内置 `delete` / `glob` / `grep` / `execute` 等工具，可按需启用。）

### 创建

从 deepagents 包导入中间件并传入 Agent 的 middleware 列表。三个配置参数：

- **backend**（可选）——文件后端，默认为 StateBackend；
- **systemPrompt**（可选）——自行配置系统提示词；
- **customToolDescriptions**（可选）——可重写工具描述。

```python
from langchain.agents import create_agent
from deepagents.middleware.filesystem import FilesystemMiddleware

agent = create_agent(
    model=model,
    middleware=[
        FilesystemMiddleware(
            backend=None,  # 默认 StateBackend
            system_prompt="Write to the filesystem when...",
            custom_tool_descriptions={
                "ls": "Use the ls tool when...",
                "read_file": "Use the read file tool to...",
            },
        ),
    ],
)
```

### 四种后端类型

| 后端 | 特点 | 持久性 |
| --- | --- | --- |
| `StateBackend` | 在单次调用中的短暂文件存储，将 Agent 的文件系统嵌入在状态（State）中 | 仅对单个线程保持持久性，完成任务后就会扔掉草稿 |
| `FilesystemBackend` | 给与 Agent 访问本地文件系统的权限，通过 `rootDir` 指定可访问根目录的绝对（相对）路径 | 真实写入本地磁盘 |
| `StoreBackend` | 访问跨线程持久化的长期存储空间，以构建存储对象（如 `InMemoryStore`）的形式使记忆脱离线程复用，适合需要多次执行的长期记忆或指令 Agent 任务 | 跨线程持久化 |
| `CompositeBackend`（复合后端） | 当希望为 Agent 提供多种存储（记忆）形式时，允许同时配置 StateBackend 和 StoreBackend——按路径前缀把文件操作路由到不同后端，一次装配即可「热插拔」多种存储 | 按路由混合（默认后端与路由后端各自的生命周期） |

两种后端对于 runtime 的使用：`StateBackend` → `runtime.state`（图状态）；
`StoreBackend` → `runtime.store`（外部存储对象）。另注意：**StoreBackend
创建的文件与 Store 对象共享生命周期**。

`FilesystemBackend` 的 `virtualMode` 参数在保证功能完整的前提下，把 Agent 的
读写范围锁死在指定根目录。

### Python 与 TypeScript API 对照

| 功能 | Python | TypeScript |
| --- | --- | --- |
| 导入中间件 | `from deepagents.middleware.filesystem import FilesystemMiddleware` | `import { createFilesystemMiddleware } from 'deepagents'` |
| 传入中间件 | `middleware=[FilesystemMiddleware(...)]` | `middleware: [createFilesystemMiddleware({...})]` |
| 默认后端 | `backend=None`（StateBackend） | 省略 `backend` 或 `new StateBackend()` |
| 本地文件系统后端 | `FilesystemBackend(root_dir=".", virtual_mode=True)` | `new FilesystemBackend({ rootDir: '.', virtualMode: true })` |
| 跨线程存储后端 | `StoreBackend(runtime)` + `store=InMemoryStore()` | `new StoreBackend({ store })` + `store: new InMemoryStore()` |
| 复合后端 | `CompositeBackend(default=StateBackend(runtime), routes={".": StoreBackend(runtime)})` | `new CompositeBackend(new StateBackend(), { '/memories/': new StoreBackend({ store }) })`（位置参数：默认后端 + 路由表） |
| 后端工厂写法 | `backend=lambda runtime: StateBackend(runtime)` | 直接传实例（如 `new StateBackend()`，无需 runtime） |
| 系统提示词 | `system_prompt="..."` | `systemPrompt: '...'` |
| 重写工具描述 | `custom_tool_descriptions={"ls": "..."}` | `customToolDescriptions: { ls: '...' }` |
| 传入存储对象 | `create_agent(..., store=store)` | `createAgent({ ..., store })` |
| 限定可用工具 | — | `tools: ['ls', 'read_file', ...]`（白名单，`read_file` 必须包含） |

### 运行观察

`demo5.ts` 按课件复刻三个场景（同一个 密码.txt 贯穿始终）：

1. **StateBackend（默认后端）**：一次 `invoke` 内先后传入两条
   HumanMessage——写入 密码.txt、再读取它，单次调用内可正常读回；紧接着发起
   **第二次新调用**再读同一文件，Agent 找不到文件——证明该后端仅在单次调用
   （单个线程）内持久，任务结束草稿即被丢弃；
2. **FilesystemBackend（`rootDir` = demo 目录下 `fs-root/`，`virtualMode: true`）**：
   让 Agent 写入 密码.txt，随后 Node 侧直接读磁盘验证——文件真实落盘在
   `fs-root/密码.txt`，内容为「我们是EgoAlpha」（同时演示了 `systemPrompt` 与
   `customToolDescriptions` 两个可选参数）；
3. **StoreBackend（`InMemoryStore`）**：实例化一个 store 对象，两个 Agent 传入
   **同一个 store**——第一个线程写入 密码.txt，第二个线程（全新对话）读取该
   文件并成功报出内容，证明记忆脱离线程复用、跨线程持久化；
4. **CompositeBackend（复合后端）**：`new CompositeBackend(new StateBackend(),
   { '/memories/': new StoreBackend({ store }) })` 一次装配两种存储——同一次
   调用内写入 草稿.txt（默认路由 → StateBackend）与 /memories/密码.txt
   （前缀路由 → StoreBackend）均可正常读写；紧接着的新调用中 草稿.txt 已随
   线程结束消失，而 /memories/密码.txt 依然可读——按路径自动分流，两种
   生命周期互不干扰（路由前缀对 Agent 透明，由复合后端自动剥离/还原）。

### 后端选型建议

- 临时草稿 / 单任务内的中间产物 → `StateBackend`（默认）；
- 需要真实操作本地文件（且限制在某个目录内）→ `FilesystemBackend` + `virtualMode`；
- 长期记忆 / 多次任务间共享知识 → `StoreBackend` + 持久化 Store；
- 同时需要多种存储形式（如临时草稿 + 长期记忆共存）→ `CompositeBackend`
  按路径前缀组合装配。

---

[← Demo 11：LangChain 消息类型](./demo11-message-types) · [返回系列总览](./) · [Demo 13：DeepAgents 的创建与核心能力 →](./demo13-deepagents)
