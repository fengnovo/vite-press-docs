# demo16：LangGraph 的记忆（Memory）——短期记忆与长期记忆

> GitHub 源码：[demo16-langgraph-memory](https://github.com/fengnovo/langchain-learn/tree/main/ai-agent-langgraph-demo/demo16-langgraph-memory)
记忆是维持历史交互信息的系统。对 Agent 来说记忆至关重要：它让 Agent 从反馈
中学习与改进，并根据用户偏好进行调整。用户交互记录是最常见的记忆形式——

**Agent state**（消息序列）：`human message → AI message → tool message →
AI message → human message → …`

LangChain 构建了持久化层。检查点管理器（checkpointer）会在每个超级步
（super-step）保存图的状态快照（checkpoint），这些检查点被保存到一个线程
（thread）中，可以在图执行后访问：

```text
superstep①        superstep②        superstep③
Start      →      node_1     →      node_2    → …
  ↓ 快照           ↓ 快照            ↓ 快照
线程1:  Checkpoint_1 → Checkpoint_2 → Checkpoint_3 → …
线程2:  Checkpoint_1 → Checkpoint_2 → Checkpoint_3 → …
线程3:  Checkpoint_1 → Checkpoint_2 → Checkpoint_3 → …
（checkpointer 检查点管理器）
```

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
pnpm demo16     # 短期记忆：checkpointer + thread
pnpm demo16:2   # 定制记忆状态 + 状态记忆的工具读取 + 中间件注入
pnpm demo16:3   # 长期记忆：InMemoryStore（命名空间 + 跨线程）
```

执行类型检查：

```bash
pnpm typecheck:demo16
```

## 3. 短期记忆（demo.ts）

短期记忆让 Agent 能够记住单一线程或对话中的历史交互：

- **构建**：`createAgent` 传入 `checkpointer: new MemorySaver()`；
- **使用**：`invoke` 时通过 `{ configurable: { thread_id: '1' } }` 配置线程；
- **同一线程**：第二轮对话自动携带第一轮历史——Agent 记得用户姓名与上次
  计算结果；
- **跨线程**：新 `thread_id` 访问不到之前的消息——记忆按线程隔离；
- **图执行后访问**：用检查点管理器的 `getTuple`（获取检查点元组/最新快照）
  与 `list`（检查点清单）直接读取——每个超级步各存一次快照。

运行可观察到：线程 1 快照含完整 human/AI/tool 消息序列；`list` 列出约 10 个
检查点（两轮对话、每个 super-step 一条）。

## 4. 定制记忆状态 + 工具读取（demo2.ts）

1. **定制 Agent 的记忆状态**：记忆的根本意义是记录信息或数据。用 zod 定义
   `stateSchema`（如 `userName`、`gender`）在 states 中定义额外字段：
   - `invoke` 输入直接写入：`{ messages: [...], userName: '李雷', gender: 'male' }`；
   - 传入 `checkpointer` 后随线程持久化——后续调用**无需重复传入**；
   - `invoke` 返回值中可读取这些字段（对应课件 `print(res["user_name"])`）。

2. **注意的坑**：Agent 交互过程中，**model 默认只能看到 messages**，其他
   状态字段需要通过 Middleware 或者其他方式显式注入。本示例 `wrapModelCall`
   中间件把 `userName` / `gender` 注入系统消息。注意：中间件必须声明自己的
   `stateSchema`，`request.state` 中才会包含这些字段。

3. **状态记忆的工具读取**：通过工具间接赋予模型访问记忆的能力——工具函数
   第二个参数 `runtime`（类型 `ToolRuntime`）访问短期记忆（状态）：
   `runtime.state.userName`。对应课件流程：human「我是谁？」→ AI 调
   `get_user_info` → Tool「李雷 (male)」→ AI「你是李雷……」。

4. 还可以结合 `beforeModel` / `afterModel` 等钩子实现多样化的记忆写入和
   读取，满足各类应用场景。

## 5. 长期记忆（demo3.ts）

LangChain 将长期记忆以 JSON 文档的形式存储在 **store** 对象中，每个记忆组织
在自定义**命名空间（namespace）**和独立**键（key）**下。命名空间通常包含用户
或组织 ID 或其他标签，便于信息组织——类似文件夹路径：
`C:\五年级\2班\王五.xls ↔ ('五年级','2班') + '王五'`。

- **创建与使用**：`InMemoryStore` + `put(namespace, key, value)` /
  `get(namespace, key)`，`get` 返回 Item（含 `namespace` / `key` / `value` /
  `createdAt` / `updatedAt`）；
- **任意查询**：`(namespace, key)` 不受线程限制；`search`（列出命名空间下
  全部记忆项）、`listNamespaces`（列出命名空间，支持前缀过滤）、`delete`
  （删除指定项）；
- **Agent 集成**：`createAgent({ store })`，工具内通过 `runtime.store` 读写
  （区别于短期记忆的 `runtime.state`）——线程 A 写入用户偏好，全新线程 B
  依然能读到，验证「与 Store 对象绑定，可以跨线程」。

## 6. 短期记忆 vs 长期记忆（课件对照表）

| 维度 | 短期记忆 InMemorySaver | 长期记忆 InMemoryStore |
| --- | --- | --- |
| create_agent 传入参数 | `checkpointer` | `store` |
| 查询方式 | 通过 thread_id + checkpoint_id | 通过 (namespace, key) 任意查询 |
| 数据关联 | 与特定 thread 绑定（无法跨线程获取） | 与 Store 对象绑定（可以跨线程） |
| 运行时态 | `runtime.state` / `runtime.context` | `runtime.store` |
| 存储内容 | 完整的 State 快照（包含对话历史） | 写入的键值对数据（不包含对话内容） |
| 生命周期 | InMemorySaver（内存缓存）/ PostgresSaver（生产环境首选）/ SqliteSaver（SQL 轻量存储） | InMemoryStore（内存缓存）/ PostgresStore（生产环境数据留存）/ SqliteStore（SQL 轻量存储） |
| 应用场景 | 对话上下文、长任务执行 | 用户画像、知识库等 |
| 常用方法 | put（存储检查点）/ get（获取检查点）/ get_tuple（获取检查点元组）/ list（检查点清单） | put（存储键值对）/ get（获取指定键值对）/ delete（删除指定项）/ search（嵌入语义搜索）/ list_namespaces（列出命名空间） |

## 7. Python 与 TypeScript API 对照

| 功能 | Python | TypeScript |
| --- | --- | --- |
| 创建 Agent（短期记忆） | `create_agent(model=..., checkpointer=InMemorySaver())` | `createAgent({ model, checkpointer: new MemorySaver() })` |
| 配置线程 | `{"configurable": {"thread_id": "1"}}` | `{ configurable: { thread_id: '1' } }` |
| 定制记忆状态 | `class CustomAgentState(AgentState): user_name: str` + `state_schema=CustomAgentState` | `stateSchema: z.object({ userName: z.string().optional(), ... })` |
| invoke 写入状态字段 | `res = agent.invoke({"messages": [...], "user_name": "李雷", "Gender": "male"}, config)` | `agent.invoke({ messages: [...], userName: '李雷', gender: 'male' }, config)` |
| 读取状态字段 | `print(res["user_name"])` | `(res as MemoryState).userName` |
| 中间件声明状态 | `@dynamic_prompt` 内读 `state["user_name"]` | `createMiddleware({ stateSchema, wrapModelCall })`，读 `request.state` |
| 工具访问短期记忆 | `def get_user_info(runtime: ToolRuntime)` + `runtime.state["user_name"]` | `tool((_input, runtime: ToolRuntime<MemoryState>) => runtime.state.userName)` |
| 工具访问长期记忆 | `runtime.store` | `runtime.store`（本版需断言为 `InMemoryStore`） |
| 创建长期记忆 | `store = InMemoryStore()` | `new InMemoryStore()` |
| 写入 | `store.put(namespace, key, value)` | `await store.put(namespace, key, value)` |
| 读取 | `store.get(namespace, key)` | `await store.get(namespace, key)` |
| 删除 | `store.delete(namespace, key)` | `await store.delete(namespace, key)` |
| 搜索/列命名空间 | `store.search(namespace)` / `store.list_namespaces(prefix=...)` | `await store.search(namespace)` / `await store.listNamespaces({ prefix })` |
| 检查点元组/清单 | `checkpointer.get_tuple(config)` / `checkpointer.list(config)` | `await memorySaver.getTuple(config)` / `memorySaver.list(config)` |
| Agent 集成 store | `create_agent(model=..., store=store)` | `createAgent({ model, store })` |

## 8. TS 版实现说明

- `stateSchema` 用 zod 定义，字段用 `.optional()` 修饰，invoke 不传时也能
  通过校验（配合 checkpointer 实现持久化与恢复）；
- `ToolRuntime<MemoryState>` 的类型参数请用 **type 别名**（而非 interface）：
  `state` 的类型解析依赖 `TState extends Record<string, unknown>` 的隐式索引
  签名，interface 不具备，会导致 `runtime.state` 变成 `unknown`；
- 本版本（@langchain/core 1.2.9）`tool()` 的字段不支持 `stateSchema` 选项，
  用 `runtime: ToolRuntime<MemoryState>` 参数标注替代；
- `runtime.store` 的声明类型是 @langchain/core 的 BaseStore（`mget`/`mset`
  接口），LangGraph 运行时实际注入的是 `put`/`get`/`search` 接口的 store，
  使用前断言为 `InMemoryStore`；
- `createAgent` 返回对象上的 `getState` / `getStateHistory` 是内部方法
  （类型标记为 `never`），读取快照请直接使用 `memorySaver.getTuple` / `list`。

---

[← Demo 15：上下文工程四大策略](./demo15-context-engineering) · [返回系列总览](./) · [Demo 17：DeepAgents Sandbox →](./demo17-sandbox)
