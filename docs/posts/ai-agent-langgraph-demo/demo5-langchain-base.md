# demo5：LangChain.js 模型参数与调用方式

> GitHub 源码：[demo5-langchain-base](https://github.com/fengnovo/langchain-learn/tree/main/ai-agent-langgraph-demo/demo5-langchain-base)
本示例使用 TypeScript 和 LangChain.js 实现：

- `initChatModel` 初始化模型；
- 静态参数：`temperature`、`maxTokens`、`timeout`、`maxRetries`；
- 动态参数：单次调用覆盖 `temperature`、`maxTokens`；
- 单条调用：`invoke`；
- 批量调用：`batch`；
- 流式调用：`stream`，并把 chunk 聚合成完整消息；
- 异步调用：`Promise.all` 并发执行 `invoke` 和 `stream`。

## 1. 环境变量

在项目根目录 `.env` 中配置：

```dotenv
OPENAI_API_KEY=你的API_KEY
OPENAI_BASE_URL=https://你的OpenAI兼容接口/v1
MODEL=模型名称
```

`OPENAI_BASE_URL` 可选；直连 OpenAI 时可以不填。

## 2. 运行

在 `ai-agent-langgraph-demo` 目录执行：

```bash
pnpm demo5 invoke
pnpm demo5 dynamic
pnpm demo5 batch
pnpm demo5 stream
pnpm demo5 async
pnpm demo5 all
```

执行类型检查：

```bash
pnpm typecheck:demo5
```

## 3. TypeScript 与 Python API 对照

| 功能 | Python | TypeScript |
| --- | --- | --- |
| 单条调用 | `invoke()` | `await invoke()` |
| 批量调用 | `batch()` | `await batch()` |
| 流式调用 | `stream()` / `astream()` | `await stream()` + `for await` |
| 异步调用 | `ainvoke()` | `await invoke()` |
| 最大输出长度 | `max_tokens` | `maxTokens` |

JavaScript/TypeScript 的网络 I/O 本身就是异步的，所以 LangChain.js 没有另外提供
`ainvoke()` 和 `astream()`；并发场景使用 `Promise.all`，流式结果使用异步迭代器处理。

动态配置只开放了 `temperature` 和 `maxTokens`。不要把 `configurableFields`
设置成 `"any"` 后直接接收不可信的用户输入，否则调用方可能覆盖 `apiKey` 或
`baseURL` 等敏感参数。

---

[← Demo 4：LangGraph 消息流与 Express SSE](./demo4-streaming) · [返回系列总览](./) · [Demo 6：LangGraph 接入 Langfuse →](./demo6-langfuse)
