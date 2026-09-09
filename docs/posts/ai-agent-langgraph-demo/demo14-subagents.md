# demo14：DeepAgent SubAgent（子代理）特性

> GitHub 源码：[demo14-deepagents-subagents](https://github.com/fengnovo/langchain-learn/tree/main/ai-agent-langgraph-demo/demo14-deepagents-subagents)
## 1. SubAgent 的概念与逻辑

为子代理来**委派工作**——在子代理参数中指定子代理的责任与工具。子代理可以
实现**上下文隔离**，保持主代理上下文的干净；同时，子代理也可以更专注于某
一方面任务执行，以提升子任务执行效率与成功率。

典型分工（对应课件示意图）：Deep Agent（模型 + 其他工具）通过内置 **task 工具**
调用专职子代理，只交换「问题 ↔ 关键结论」，中间过程全部留在子代理上下文中：

| 子代理 | 发出 | 收回 | 留在子代理上下文 |
| --- | --- | --- | --- |
| 网络搜索 Subagent | 查找信息 | 关键信息 | 完整网页 |
| 数据库查询 Subagent | 查询数据 | 单一数据 | 完整表单 |
| 数值计算 Subagent | 算式 | 计算结果 | 计算过程 |

## 2. 两种创建方法

子代理应为**字典（对象）列表或 CompiledSubAgent 对象**，共有两种创建方法：

1. **Dictionary-based 基本创建**（demo.ts）；
2. **CompiledSubAgent 自定义创建**（demo2.ts）。

### Dictionary-based 的参数配置

| 类别 | 字段 | 类型 |
| --- | --- | --- |
| Required | `name` | `string`（task 工具中的选择标识） |
| Required | `description` | `string`（展示给模型的选取说明） |
| Required | `systemPrompt` | `string \| SystemMessage` |
| Required | `tools` | 工具对象列表（不是名称） |
| Optional | `model` | `string \| BaseChatModel`（子代理可用独立模型） |
| Optional | `middleware` | `AgentMiddleware[]`（追加在默认中间件之后） |
| Optional | `interruptOn` | `Record<string, boolean \| InterruptOnConfig>`（需要 checkpointer） |
| Optional | `mode` | `'handoff'`（默认，完全隔离）/ `'fork'`（继承父代理对话历史） |
| Optional | `responseFormat` | 子代理结构化输出（Zod 等），结果作为 ToolMessage 返回主代理 |
| Optional | `permissions` | 覆盖（而非合并）父代理的文件系统权限规则 |

创建三步：**1.创建模型与工具对象 → 2.字典形式配置 SubAgent → 3.传入
`subagents` 参数**。

```python
internet_subagent = {
    "name": "internet-agent",
    "description": "Utilise online tools to search for information on the internet",
    "system_prompt": "You are a great Internet searcher",
    "tools": [internet_search],
    "model": model,
}
agent = create_deep_agent(model=model, subagents=[internet_subagent])
```

### CompiledSubAgent 自定义创建

通过 `createAgent` 函数**外部创建独立子代理**后，构建 `CompiledSubAgent` 传入
主代理，以此实现更灵活、针对性配置的子代理功能（可用上 createAgent 的全部
能力：中间件、checkpointer、responseFormat……）：

```python
custom_graph = create_agent(model=model, tools=[internet_search],
                            prompt="You are a great Internet searcher.")
custom_subagent = CompiledSubAgent(
    name="internet_search",
    description="A specialised agent for gathering information via web searches",
    runnable=custom_graph,
)
agent = create_deep_agent(model=model, tools=[internet_search],
                          subagents=[custom_subagent])
```

## 3. 运行

在 `ai-agent-langgraph-demo` 目录执行：

```bash
pnpm demo14
pnpm demo14:2
```

执行类型检查：

```bash
pnpm typecheck:demo14
```

## 4. demo.ts：Dictionary-based 基本创建（三类子任务委派）

按课件示意图配置三个专职子代理（`internet-agent` / `db-agent` / `calc-agent`，
各持有模拟的 `internet_search` / `query_database` / `calculator` 工具），主代理
**不持有任何领域工具**，只能靠 task 委派。一次提问包含三类子任务，运行观察：

1. 打印出的 task tool_call 形如
   `{"description": "...", "subagent_type": "internet-agent"}` —— 主代理按
   name/description 自主选择子代理，共 3 次委派各归其位；
2. 「完整网页 / 完整表单 / 计算过程」都只出现在子代理的上下文里，主代理只
   收回关键信息（v1.5.10、积分 8640、结果 3000）——上下文隔离；
3. Optional 字段演示：`calc-agent` 单独指定了 `model`（可换更廉价/更强的模型）。

## 5. demo2.ts：CompiledSubAgent 自定义创建与调用观察

按课件三步：`createAgent` 外部创建独立子代理 → `CompiledSubAgent` 包装
（name / description / runnable）→ 传入 `createDeepAgent`。运行观察：

1. 主代理发出的 task tool_call 中 `subagent_type` 即 `CompiledSubAgent.name`；
2. 运行中主代理连续两轮委派同一子代理从不同角度交叉验证搜索结果（子代理
   内部跑了十几次查询），**这些中间查询全部不进入主代理上下文**——主代理
   只收到两段蒸馏后的结论，直观体现「上下文膨胀」问题的解决；
3. `mode` 选项：默认 `handoff` 完全隔离；`fork` 继承父代理对话历史（system
   prompt 以 runnable 内置的为准）。

## 6. Subagent 的应用场景

子代理解决了**上下文膨胀**问题——子代理将子任务中的局部冗余信息与主任务
工作隔离开：主代理只接收关键信息，而非产生该结果的数十个工具调用。

**有利应用场景**：

1. 多步骤任务会让主代理的上下文变得杂乱；
2. 需要定制说明或工具的专业领域；
3. 需要不同模型能力的任务，以提高整体能力（子代理可配独立 `model`）；
4. 希望主 Agent 更专注于高层协调与规划。

**不适用场景**：

1. 简单的单步任务；
2. 任务执行过程中最终结论或者后续步骤仍须依赖中间信息；
3. 成本敏感，需要计算运营费用与性能提升成本时。

**general-purpose SubAgent**：任何 DeepAgent 创建时会自动配备的 SubAgent
（通用研究/多步任务代理），即使不声明 `subagents` 也可以通过 task 工具调用。

## 7. Python 与 TypeScript API 对照

| 功能 | Python | TypeScript |
| --- | --- | --- |
| 字典创建子代理 | `{"name": ..., "description": ..., "system_prompt": ..., "tools": [...], "model": ...}` | `{ name, description, systemPrompt, tools, model }`（`SubAgent` 类型） |
| 传入主代理 | `create_deep_agent(subagents=[...])` | `createDeepAgent({ subagents: [...] })` |
| 自定义创建 | `custom_graph = create_agent(...)` | `createAgent({ model, tools, systemPrompt })` |
| 包装编译子代理 | `CompiledSubAgent(name=..., description=..., runnable=custom_graph)` | `const s: CompiledSubAgent = { name, description, runnable: customGraph }` |
| 中断配置 | `interrupt_on: Dict[str, bool]` | `interruptOn: Record<string, boolean \| InterruptOnConfig>` |
| 上下文模式 | —（新版 `mode`） | `mode: 'handoff' \| 'fork'` |
| task 工具参数 | `{'name': 'task', 'args': {'description': ..., 'subagent_type': ...}}` | `{ name: 'task', args: { description, subagent_type } }` |
| 调用方式 | `agent.invoke({"messages": [...]})` | `agent.invoke({ messages: [...] })`（完全相同） |

## 8. 注意事项

- **maxTokens 要放宽**：DeepAgent 的 `write_file` / `edit_file` 会把整份文件
  内容放进工具参数，输出长度远超普通问答。根目录 `model.ts` 的
  `maxTokens=1000` 会导致参数生成到一半被截断（工具调用丢失、回复为空），
  因此本目录的 [model.ts](https://github.com/fengnovo/langchain-learn/blob/main/ai-agent-langgraph-demo/demo14-deepagents-subagents/model.ts) 放宽到 4000（同 demo13）；
- **模拟工具**：`internet_search` / `query_database` 为模拟实现。demo2.ts 中
  主代理甚至检测到「不同查询返回同一答案」并降级为标注证据边界——恰好展示
  子代理交叉验证与诚实汇报的行为；
- **与 demo13 的关系**：demo13-deep-agents/demo2.ts 是 SubAgent 的快速上手；
  本目录是 SubAgent 特性的完整版（两种创建方法、参数详解、应用场景）。

---

[← Demo 13：DeepAgents 的创建与核心能力](./demo13-deepagents) · [返回系列总览](./) · [Demo 15：上下文工程四大策略 →](./demo15-context-engineering)
