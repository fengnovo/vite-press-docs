# demo13：DeepAgents 的创建与核心能力

> GitHub 源码：[demo13-deep-agents](https://github.com/fengnovo/langchain-learn/tree/main/ai-agent-langgraph-demo/demo13-deep-agents)
## 1. DeepAgent 的提出与概念

结合**规划、子代理、文件系统和详尽提示词**四个基本概念，让 Agent 实现从"浅"至
"深"的转变：能够规划更复杂的任务，并在更长时间范围内逐步完成各个目标，最终
完成整体任务。

## 2. DeepAgent 的核心能力

| 核心能力 | 说明 |
| --- | --- |
| 规划与任务分解（Planning and task decomposition） | 内置规划工具（todo list），将复杂任务拆解为离散步骤，跟踪进展，并根据新信息的出现调整计划 |
| 上下文管理（Context management） | 文件系统工具（`ls`、`read_file`、`write_file`、`edit_file`）允许 Agent 将复杂的上下文卸载到内存，防止上下文窗口溢出，并支持可变长度工具结果的处理 |
| 子代理生成（Subagent spawning） | 内置的 "task" 工具，使代理能够针对性生成的子代理以实现上下文隔离——主代理的上下文保持干净，同时又能深入处理子任务 |
| 长期记忆（Long-term memory） | 利用不同类型的 Backend 进行信息存储，将具有持久内存的 Agent 扩展到线程之间，代理可以保存和检索之前对话中的信息，辅助任务执行 |

## 3. DeepAgents 的创建与内部细节

使用 deepagents 包中的 `createDeepAgent` 方法创建。该方法实际上是在 deepagents
包中对 `createAgent` 函数额外配备了一些复杂任务常用的相关配置。

内部结构 = **模型 + 用户赋予的额外工具** + 内置中间件 + 内置工具：

- **中间件**：To-do-list、Summarization（`trigger = fraction 0.9`、
  `keep = fraction 0.15`）、PatchToolCalls、file system；
- **工具**：task（子代理调用）+ 文件系统工具等。

与 `createAgent` 相同，`createDeepAgent` 依然返回一个 compiled graph 对象，
调用方法与传统 Agent 的调用方法完全相同（`invoke` / `stream` 等）。

## 4. createDeepAgent 的常用参数配置

| 参数 | 说明 |
| --- | --- |
| `systemPrompt` | 用户拟定的额外系统提示，**会追加在基本系统提示 `BASE_AGENT_PROMPT`**（"In order to complete the objective that the user asks of you, you have access to a number of standard tools."）中 |
| `tools` | 用户赋予的额外的工具列表（与内置工具合并） |
| `backend` | 与配置 file system 时相同（`StateBackend` / `FilesystemBackend` / `StoreBackend` / `CompositeBackend`，见 demo12 demo5） |
| `interruptOn` | 用户中断配置，默认为 `None`（HITL，见 demo12 demo2） |
| `subagents` | 子代理规格列表（demo2.ts 演示） |
| `checkpointer` / `store` | 检查点与长期记忆存储 |

DeepAgent 的常见使用场景：

1. **complex and multi-step**——需要多步规划和分解的复杂多步骤任务；
2. **large amounts of context**——需要通过文件系统工具管理大量上下文；
3. **Delegate work**——需要将子任务委托给专门的 subagent 以实现上下文隔离；
4. **Persist memory**——需要跨对话和线程持续保存记忆。

## 5. 运行

在 `ai-agent-langgraph-demo` 目录执行：

```bash
pnpm demo13
pnpm demo13:2
```

执行类型检查：

```bash
pnpm typecheck:demo13
```

## 6. demo.ts：基本创建（规划 + 上下文管理）

复刻课件示例：详尽的研究员系统提示（`research_instructions`，明确职责、
`internet_search` 工具用法与"先写 todo_list"的工作流程）+ 模拟搜索工具 +
`FilesystemBackend(rootDir=workspace, virtualMode=true)`。

运行观察：

1. Agent 先调用内置 **todo list 工具**写入 `/todo_list.md` 拆解任务并跟踪进展
   （规划与任务分解）；
2. 多轮调用 `internet_search` 检索资料，中间结果与计划都落盘在文件系统中，
   不撑爆上下文窗口（上下文管理）；
3. 最终把研究报告 `write_file` 到 `/report.md`——Node 侧直接读磁盘验证
   `workspace/report.md` 真实落盘（FilesystemBackend + virtualMode 生效）；
4. 全程使用与传统 Agent 完全相同的 `agent.invoke({ messages: [...] })` 调用。

> 注意：`workspace/` 下的文件**跨运行持久**（真实磁盘），demo.ts 每次运行
> 会先重置该目录，避免上次运行的 todo_list.md / report.md 残留影响观察。

## 7. demo2.ts：子代理生成（Delegate work）

通过 `subagents` 参数声明两个子代理，观察内置 **task 工具**的委托流程：

- `researcher`：持有 `internet_search` 工具，负责调研并把要点写入
  `findings.md`（检索能力下沉到子代理，主代理不直接持有搜索工具）；
- `writer`：使用内置文件系统工具读取 `findings.md`，撰写正式报告到
  `report.md`（子代理之间通过**共享文件系统**交接，上下文各自隔离）。

运行后打印 task（子代理调用）次数与最终回复，观察：

1. 主代理按 `description` 自主选择把任务委托给哪个子代理；
2. 子代理的中间过程（多轮搜索、阅读）不进入主代理上下文，主代理只收到
   蒸馏后的结论——上下文隔离；
3. 子代理自动获得默认中间件栈（file system、Summarization 等），与主代理
   共享文件状态——**上下文隔离但"记忆"互通**。

`SubAgent` 常用配置字段：`name`（task 工具中的选择标识）、`description`
（展示给模型的选取说明）、`systemPrompt`（子代理自己的系统提示）、`tools`
（工具白名单，工具对象而非名称）、`model`（可覆盖为更廉价的模型）、
`middleware` / `interruptOn` 等。

## 8. Python 与 TypeScript API 对照

| 功能 | Python | TypeScript |
| --- | --- | --- |
| 导入 | `from deepagents import create_deep_agent` | `import { createDeepAgent } from 'deepagents'` |
| 基本创建 | `create_deep_agent(model=model, tools=[...], system_prompt=..., backend=...)` | `createDeepAgent({ model, tools, systemPrompt, backend })` |
| 文件后端 | `FilesystemBackend(root_dir=".", virtual_mode=True)` | `new FilesystemBackend({ rootDir: '.', virtualMode: true })` |
| 系统提示（追加在 BASE_AGENT_PROMPT 后） | `system_prompt=research_instructions` | `systemPrompt: researchInstructions` |
| 子代理声明 | `subagents=[{"name": ..., "description": ..., "system_prompt": ..., "tools": [...]}]` | `subagents: [{ name, description, systemPrompt, tools }]` |
| 中断配置 | `interrupt_on={...}`（默认 None） | `interruptOn: {...}`（默认 undefined） |
| 调用 | `agent.invoke({"messages": [...]})` | `agent.invoke({ messages: [...] })` |
| 内置中间件 | TodoListMiddleware / SummarizationMiddleware / PatchToolCallsMiddleware / FilesystemMiddleware | 自动装配，无需手动传入 |
| 内置 task 工具 | 自动注册（名称 `task`） | 自动注册（名称 `task`） |

## 9. 注意事项

- **maxTokens 要放宽**：DeepAgent 的 `write_file` / `edit_file` 会把整份文件
  内容放进工具参数，输出长度远超普通问答。根目录 `model.ts` 的
  `maxTokens=1000` 会导致参数生成到一半被截断（工具调用丢失、回复为空），
  因此本目录的 [model.ts](https://github.com/fengnovo/langchain-learn/blob/main/ai-agent-langgraph-demo/demo13-deep-agents/model.ts) 放宽到 4000；
- **模拟搜索**：示例中 `internet_search` 为模拟实现（返回固定文案）。模型会
  检测到检索通道异常并在报告中诚实标注证据边界——这恰好展示了 DeepAgent
  的自我校验行为，可如实向观者说明；
- **长期记忆**：DeepAgent 的第四项核心能力（Persist memory）通过 `backend`
  与 `store` 配置实现，已在 demo12-middleware/demo5.ts 中详细演示。

---

[← Demo 12：Agent Middleware](./demo12-middleware) · [返回系列总览](./) · [Demo 14：DeepAgent SubAgent →](./demo14-subagents)
