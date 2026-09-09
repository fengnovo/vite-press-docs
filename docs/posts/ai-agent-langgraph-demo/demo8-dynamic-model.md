# demo8：动态模型 Agent 创建（中间件 wrapModelCall）

> GitHub 源码：[demo8-dynamic-model-agent](https://github.com/fengnovo/langchain-learn/tree/main/ai-agent-langgraph-demo/demo8-dynamic-model-agent)
动态模型在运行时根据当前状态和上下文进行选择，这使得复杂的路由逻辑和成本优化成为可能。

- `createMiddleware` + `wrapModelCall`：包装每次模型调用，实现动态模型选择；
- `createAgent`：创建带工具与中间件的 Agent，`model` 传默认模型；
- 短消息列表调用走基础模型，长消息列表调用自动切换到高级模型。

## 1. 环境变量

在项目根目录 `.env` 中配置两组模型（对应课件里的 gpt-4o-mini / gpt-4o）：

```dotenv
# 基础模型 basicModel（快、便宜）
OPENAI_API_KEY=你的API_KEY
OPENAI_BASE_URL=https://你的OpenAI兼容接口/v1
MODEL=模型名称

# 高级模型 advancedModel（更强、更贵）
TX_OPENAI_API_KEY=你的API_KEY
TX_OPENAI_BASE_URL=https://你的OpenAI兼容接口/v1
TX_MODEL=模型名称
```

`OPENAI_BASE_URL` 可选；直连 OpenAI 时可以不填。

## 2. 运行

在 `ai-agent-langgraph-demo` 目录执行：

```bash
pnpm demo8
```

执行类型检查：

```bash
pnpm typecheck:demo8
```

## 3. Python 与 TypeScript API 对照

| 功能 | Python | TypeScript |
| --- | --- | --- |
| 创建 Agent | `create_agent(model, tools, middleware)` | `createAgent({ model, tools, middleware })` |
| 定义中间件 | `@wrap_model_call` 装饰器 | `createMiddleware({ wrapModelCall })` |
| 读取消息列表 | `request.state["messages"]` | `request.messages` |
| 覆盖模型 | `request.model = model; return handler(request)` | `return handler({ ...request, model })` |
| 初始化备选模型 | `init_chat_model("openai:gpt-4o-mini")` | `initChatModel(env 模型名, { modelProvider: 'openai', ... })` |

## 4. 工作原理

1. `model.ts` 用 `initChatModel` 定义 `basicModel` 和 `advancedModel` 两个备选模型；
2. `dynamicModelSelection` 中间件在每次模型请求前检查 `request.messages.length`：
   消息数 > 5 视为长对话，切换到 `advancedModel`，否则使用 `basicModel`；
3. `createAgent({ model: basicModel, ... })` 的 `model` 只是默认模型，
   真正使用哪个模型由中间件在运行时决定；
4. Demo 先用 1 条消息调用（命中基础模型），再逐轮追加消息继续对话，
   消息数超过 5 条后自动切换到高级模型，并打印响应里的 `model_name` 验证。

---

[← Demo 7：用 LlamaIndex 给 DeepAgent 增加本地知识库](./demo7-llamaindex) · [返回系列总览](./) · [Demo 9：动态系统提示词 →](./demo9-dynamic-system-prompt)
