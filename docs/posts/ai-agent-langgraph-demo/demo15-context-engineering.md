# demo15：上下文工程四大策略（Write / Select / Compress / Isolate）在 DeepAgents 中的实现

> GitHub 源码：[demo15-context-engineering](https://github.com/fengnovo/langchain-learn/tree/main/ai-agent-langgraph-demo/demo15-context-engineering)
对于构建强大的 Agent，上下文工程至关重要。Agent 会进行大量多轮次回合的对话，
需要细致的上下文管理策略。常见的 Agent 上下文工程分为**写入、选择、压缩、
隔离**四大策略，LangChain 围绕它们提供了 Summarization、Todo list、
Tool selector、File system、Subagent、Memory 等功能。

本目录用 TypeScript 在 DeepAgents 中逐一落地四大策略：

| 文件 | 策略 | 核心理念 | 落地手段 |
| --- | --- | --- | --- |
| demo.ts | ① 写入（Write） | 突破上下文窗口限制，信息持久化到外部存储，实现「工作记忆」向「长期记忆」转移 | todo list（会话中写入）+ `StoreBackend` + `InMemoryStore`（持久化写入）+ 反思机制（Reflexion） |
| demo2.ts | ② 选择（Select） | 在海量信息中精准定位最相关内容，将最具价值信息加入上下文窗口 | 文件工具/状态对象（草稿选择）+ `memory` 参数（记忆选择）+ `llmToolSelectorMiddleware`（工具选择）+ 关键词 RAG 中间件（知识选择） |
| demo3.ts | ③ 压缩（Compress） | 只保留后续任务所需上下文信息，减轻 token 压力，在信息保留度和 token 效率间找最佳平衡点 | `summarizationMiddleware`（总结）+ 自定义 Trimming 中间件（修剪：时间衰减 + 重要性评分） |
| demo4.ts | ④ 隔离（Isolating） | 将上下文拆分并分配，让职责与上下文内容相符，解决信息交叉污染和目标漂移 | `subagents` + `task` 工具（多智能体隔离）+ 沙箱执行/文件状态/资源隔离（环境隔离） |

## 1. 环境变量

复用项目根目录 `.env` 的默认模型配置：

```dotenv
OPENAI_API_KEY=你的API_KEY
OPENAI_BASE_URL=https://你的OpenAI兼容接口/v1
MODEL=模型名称
```

## 2. 运行

在 `ai-agent-langgraph-demo` 目录执行：

```bash
pnpm demo15     # 策略① 写入
pnpm demo15:2   # 策略② 选择
pnpm demo15:3   # 策略③ 压缩
pnpm demo15:4   # 策略④ 隔离
```

执行类型检查：

```bash
pnpm typecheck:demo15
```

## 3. 策略① 写入（demo.ts）

三个层次：

1. **会话中写入（轻量级暂存 / Scratchpad）**：DeepAgents 内置 To-do-list
   中间件，Agent 把任务拆解与中间思考写入会话内草稿板（`/todo_list.md`），
   Step n → Step n+1 逐步推进。课件要点「设置容量限制、超过阈值时自动总结
   清理」由内置 Summarization 中间件（上下文达 90% 自动压缩）兜底。
2. **持久化写入（长期记忆构建）**：`StoreBackend` + `InMemoryStore` 把文件
   （记忆）持久化到外部存储对象，跨会话积累信息。生产中可替换为向量库/
   知识图谱支撑的 Store 实现。
3. **反思机制（Reflexion）**：任务完成后让 Agent 自我总结经验教训并写入
   `/memories/lessons.md`，新会话可读取——「工作记忆」向「长期记忆」转移
   的完整闭环。

观察要点：会话二读取会话一的 `report.md`；会话三（新线程）能读到
`/memories/lessons.md`，验证跨会话信息积累。

## 4. 策略② 选择（demo2.ts）

四个象限一次装配（`middleware` 列表顺序即触发顺序）：

1. **草稿的选择（Scratchpads select）**：文件工具实现——Agent 通过
   `ls` / `read_file` 按需调用；状态对象实现——自定义中间件截断超长工具
   结果（只留头部摘要，全文可按需再读）。
2. **记忆的选择（memory select）**：`memory: ['/AGENTS.md']` 启动时把
   `AGENTS.md` 注入系统提示（instruction 作为程序记忆，本例注入
   「中文回复 + 表格呈现」偏好）。
3. **工具选择（tool select）**：`llmToolSelectorMiddleware` 基于模型从
   6 个工具中只挑与任务最相关的 ≤2 个，避免工具描述撑爆上下文。
4. **知识的选择（Knowledge select）**：极简关键词检索 RAG 中间件——
   检索命中才注入相关知识点（生产可替换为嵌入搜索/知识图谱/重排序）。

观察要点：控制台打印 `[知识选择]`、`[草稿选择]`、`[工具选择]` 日志；
selector 走结构化输出，须关闭思考模式（见 model.ts 的 `selectorModel`）。

## 5. 策略③ 压缩（demo3.ts）

两种典型实现：

1. **总结（Summarization）**：`summarizationMiddleware`（before_model
   钩子），`trigger: { messages: 6 }` 达标时自动把较旧消息替换为一条
   "Here is a summary of the conversation so far..." 摘要消息，
   `keep: { messages: 3 }` 保留最近消息。要点：冗余识别与去重、对话轨迹
   总结、决策点保留。除消息条数外还支持 `tokens` / `fraction` 触发
   （见 demo12/demo3.ts）。
2. **修剪（Trimming）**：自定义中间件直接删除低价值信息——
   - 时间衰减策略：按消息位置线性衰减，越旧保留优先级越低（最近 2 条
     始终保留）；
   - 重要性评分：决策点（含「关键/决定/结论/总结」）高分保留，冗长工具
     输出（>150 字符）低分删除（生产可用模型逐条评分，即 Provence 类
     上下文修剪模型思路）。
   - 工程细节：修剪必须**成组删除**——`AIMessage(tool_calls)` 与其配对的
     `ToolMessage` 同删同留，否则接口因 tool_call 配对残缺报错。

观察要点：场景一调用后消息列表以摘要消息开头（6 条 → 5 条）；场景二打印
`[修剪] 模型可见消息 7 条 → 5 条`，冗长搜索结果组被删而「关键决定」组保留。

## 6. 策略④ 隔离（demo4.ts）

两个方向：

1. **多智能体（Multi-agent）**：把上下文分散到各 subagent 之间——
   `research-agent`（联网搜索）与 `data-agent`（数据库查询）各自在独立
   上下文里消化完整网页/200 行表单，主代理只经 `task` 工具收回关键结果，
   为总体进程推进打造整洁上下文（Context 1 / Context 2）。
2. **环境隔离（Environments Isolation）**：
   - 沙箱执行：`run_code` 白名单校验后在隔离环境中运行，执行过程留在
     沙箱内，只把最终结果返回主上下文；
   - 状态管理：复杂中间状态写入 `/sandbox/` 目录文件维护（文件系统即
     「沙箱内状态」），不在对话消息里展开；
   - 资源隔离：`analyze_image` 模拟 token 密集型对象（图像/音频）在环境
     中处理，主上下文只收回一行文字结论。

观察要点：场景一 2 次 `task` 调用按 `subagent_type` 正确路由；主上下文仅
5 条消息且不含「省略数千字」「共 200 行」等过程内容。场景二文件系统出现
`/sandbox/state.md`，沙箱计算只回传最终数值。

## 7. Python 与 TypeScript API 对照

| 功能 | Python | TypeScript |
| --- | --- | --- |
| 创建 DeepAgent | `create_deep_agent(model=..., backend=..., store=...)` | `createDeepAgent({ model, backend, store })` |
| 持久化写入 | `StoreBackend(store=InMemoryStore())` | `new StoreBackend({ store: new InMemoryStore() })` |
| 记忆注入（memory select） | `memory=['/AGENTS.md']` | `memory: ['/AGENTS.md']` |
| 工具选择 | `ToolSelectorMiddleware(model=..., max_tools=...)` | `llmToolSelectorMiddleware({ model, maxTools })` |
| 自定义中间件 | `@wrap_model_call` 装饰器 | `createMiddleware({ wrapModelCall })` |
| 总结压缩 | `SummarizationMiddleware(model=..., trigger=..., keep=...)` | `summarizationMiddleware({ model, trigger, keep })` |
| 触发/保留条件 | `{"messages": 6}` / `{"tokens": 4000}` / `{"fraction": 0.8}` | `{ messages: 6 }` / `{ tokens: 4000 }` / `{ fraction: 0.8 }` |
| 消息类型判断 | `isinstance(m, ToolMessage)` | `ToolMessage.isInstance(m)` |
| 子代理隔离 | `subagents=[{name, description, system_prompt, tools}]` | `subagents: [{ name, description, systemPrompt, tools }]`（`SubAgent` 类型） |
| 委派子任务 | 内置 `task` 工具（`subagent_type`） | 相同（内置 `task` 工具 + `subagent_type`） |
| 沙箱/环境隔离 | 自定义工具（过程在工具内消化） | 相同（`tool()` + 白名单校验） |

## 8. 四策略速查

```text
写入 Write    → 信息去哪儿了？      外部存储（Scratchpad / Store / 反思）
选择 Select   → 该放进窗口什么？    草稿 / 记忆 / 工具 / 知识 按需精准注入
压缩 Compress → 怎么省 token？      总结（替换为摘要）/ 修剪（删除低价值）
隔离 Isolate  → 怎么互不污染？      多智能体分工 / 沙箱与状态环境隔离
```

---

[← Demo 14：DeepAgent SubAgent](./demo14-subagents) · [返回系列总览](./) · [Demo 16：LangGraph Memory →](./demo16-memory)
