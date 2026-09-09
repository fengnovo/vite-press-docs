# demo11：消息 Message（消息的分类）

> GitHub 源码：[demo11-message-types](https://github.com/fengnovo/langchain-learn/tree/main/ai-agent-langgraph-demo/demo11-message-types)
消息是 LangChain 中的核心概念之一：它们不仅是模型的输入和输出，更是基本的上下文
单元，消息列表中的历史消息作为本次调用的上下文信息引导模型回复。本示例是 Python
课件「消息 Message」的 TypeScript 版。

三类消息：

- **SystemMessage**：一组初始指令，用于引导模型的行为——设置基调、定义模型的
  角色并建立响应指南；
- **HumanMessage**：表示用户输入和交互，可以包含文本、图像、音频、文件等
  多模态内容；
- **AIMessage**：表示模型调用的输出，可以包括多模态数据、工具调用和特定于
  供应商的 metadata；
- **ToolMessage**：对于支持工具调用的模型，AI 消息可以包含工具调用，工具消息
  用于将单个工具执行的结果传递回模型。工具可以生成 ToolMessage 对象，用户也
  可以直接创建 ToolMessage。

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
pnpm demo11
pnpm demo11:2
```

执行类型检查：

```bash
pnpm typecheck:demo11
```

## 3. Python 与 TypeScript API 对照

| 功能 | Python | TypeScript |
| --- | --- | --- |
| 导入消息类 | `from langchain.messages import ...` | `from '@langchain/core/messages'` |
| 系统消息 | `SystemMessage("...")` | `new SystemMessage('...')` |
| 用户消息 | `HumanMessage("...")` | `new HumanMessage('...')` |
| AI 消息 | `AIMessage("...")` | `new AIMessage('...')` |
| AI 发起工具调用 | `AIMessage(content=[], tool_calls=[{"name": ..., "args": ..., "id": ...}])` | `new AIMessage({ content: '', tool_calls: [{ name, args, id, type: 'tool_call' }] })` |
| 工具结果消息 | `ToolMessage(content="晴天，21°C", tool_call_id="call_123")` | `new ToolMessage({ content: '晴天，21°C', tool_call_id: 'call_123' })` |
| 消息角色 | `message.type` | `message.type`（`'system' \| 'human' \| 'ai' \| 'tool'`） |
| 读取文本 | `message.content` | `message.text`（推荐） |
| 消息列表类型 | `list[BaseMessage]` 隐式 | `BaseMessage[]` 显式标注 |

## 4. 工作原理

1. 按课件构造 `messages` 列表：系统消息设定「编程助手」角色，用户消息提问
   列表推导式，AI 消息预置了一段回答；
2. 遍历打印每条消息的角色（`.type`）与文本（`.text`），观察消息的分类；
3. 构造带 `tool_calls` 的 `AIMessage`（发起 `get_weather` 工具调用）和对应的
   `ToolMessage`（`tool_call_id` 与调用 `id` 配对，携带执行结果「晴天，21°C」），
   并把「用户提问 -> AI 工具调用 -> 工具结果」序列传回模型，模型据此生成
   最终的自然语言回复；
4. 把第一部分的历史消息连同一条新的用户消息一起传给 `model.invoke`，
   验证「历史消息作为上下文信息引导模型回复」：模型会沿用编程助手的角色
   设定，并基于前文接着讲解字典推导式。

## 5. demo2：State 状态与消息的关键属性

状态（state）是 LangGraph 中所搭建 Agent 系统处理数据时维护和跟踪信息的载体，
可以理解为系统的“记忆”。消息的内容（Content）就是状态的直接来源。
`demo2.ts` 通过一次真实的工具调用往返（calculate + 模拟 internet_search），
检查 AIMessage 与 ToolMessage 携带的关键属性。

运行：

```bash
pnpm demo11:2
```

| 属性/方法 | Python | TypeScript |
| --- | --- | --- |
| AI 发起工具调用 | `ai_message.tool_calls` | `aiMessage.tool_calls` |
| 解析错误的工具调用 | `invalid_tool_calls` | `aiMessage.invalid_tool_calls` |
| token 使用元数据 | `usage_metadata` | `aiMessage.usage_metadata` |
| 结构化内容块 | `content_blocks` | `aiMessage.contentBlocks`（getter） |
| 易读呈现 | `pretty_repr()` | 无内置等价，示例中自实现 `pretty()` |
| 响应的工具调用标识 | `tool_call_id` | `toolMessage.tool_call_id` |
| 工具结果状态 | `status: Literal['success', 'error']` | `toolMessage.status` |
| 非传输内容 | `artifact`（配合 `content_and_artifact`） | `toolMessage.artifact` |
| 工具执行结果 | `additional_kwargs.results` | `toolMessage.content` |
| 参数强制转换 | `coerce_args()` | 由 zod schema 在 `tool.invoke()` 时自动校验/转换 |

类型守卫注意：`isAIMessage()` 已弃用，推荐使用静态方法 `AIMessage.isInstance(message)`。

---

[← Demo 10：结构化输出](./demo10-structured-output) · [返回系列总览](./) · [Demo 12：Agent Middleware →](./demo12-middleware)
