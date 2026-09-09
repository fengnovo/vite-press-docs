# Demo 6：LangGraph 接入 Langfuse

> GitHub 源码：[demo6-deepagents-langfuse](https://github.com/fengnovo/langchain-learn/tree/main/ai-agent-langgraph-demo/demo6-deepagents-langfuse)
这个示例会运行一个带 `calculator` 工具的 LangGraph agent，并把完整调用链发送到 Langfuse：

```text
LangGraph trace
├── agent 节点
│   └── LLM generation（决定调用工具）
├── tools 节点
│   └── calculator tool
└── agent 节点
    └── LLM generation（生成最终回答）
```

## 1. 配置环境变量

在项目根目录 `.env` 中补充：

```dotenv
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...

# Langfuse Cloud EU；使用其他区域或自部署时改成对应地址
LANGFUSE_BASE_URL=https://cloud.langfuse.com

# 可选：方便在 Langfuse 中筛选
LANGFUSE_TRACING_ENVIRONMENT=development
LANGFUSE_DEMO_USER_ID=demo-user-001
LANGFUSE_DEMO_SESSION_ID=demo-session-001
```

模型仍复用项目根目录 `model.ts` 和 `.env` 中的 `TX_*` 配置。

## 2. 运行

```bash
pnpm demo6
```

也可以传入自己的问题：

```bash
pnpm demo6 "请用 calculator 计算 144 除以 12"
```

运行结束会输出回答、trace ID 和 Langfuse 地址。在 Langfuse 的 **Tracing / Traces** 页面按 trace 名 `demo6-langgraph-agent`、user ID、session ID 或 tag `demo6` 查找。

## 3. 关键接入点

- `instrumentation.ts` 必须最先加载，负责注册 `LangfuseSpanProcessor`。
- `CallbackHandler` 通过 LangGraph 的 `callbacks` 记录 graph、模型和工具调用。
- TypeScript 版动态身份字段是 `langfuseUserId` 和 `langfuseSessionId`。
- CLI 退出前调用 `shutdownLangfuse()`，确保尚未发送的 trace 完整落库。

排查 trace 未出现时，可临时在 `.env` 设置 `LANGFUSE_DEBUG=true` 查看 SDK 调试日志。

## 4. 接入 Deep Agents 项目

把下面两个文件复制到目标项目：

- `deepagents-langfuse.ts`：通用适配器，不依赖 Deep Agents 的具体类型。
- `deepagents-instrumentation.ts`：通用初始化模板；复制后可改名为 `instrumentation.ts`。

安装依赖：

```bash
pnpm add deepagents @langfuse/langchain @langfuse/otel \
  @opentelemetry/sdk-node @langchain/core dotenv
```

目标项目的入口文件中，确保 `instrumentation` 是第一个 import：

```ts
import { langfuseTracing } from './deepagents-instrumentation.js';

import { createDeepAgent } from 'deepagents';

const agent = createDeepAgent({
  model,
  tools,
  systemPrompt: '你是一个可以规划和调用工具的助手。',
});

const { output, traceId } = await langfuseTracing.invoke(
  agent,
  {
    messages: [{ role: 'user', content: '分析这个问题并给出计划' }],
  },
  {
    traceName: 'my-deep-agent',
    userId: 'user-001',
    sessionId: 'session-001',
    tags: ['deepagents', 'production'],
    metadata: { tenant: 'demo' },
    config: {
      recursionLimit: 50,
      // 这里也可以放项目原有 callbacks/configurable，适配器会进行合并。
    },
  },
);

console.log(output);
console.log(traceId);
```

第三个参数并不全是 Langfuse 原生配置，适配器把它分成三类处理：

| 字段 | 属于 | 作用 |
| --- | --- | --- |
| `traceName` | Langfuse | 根 trace 的显示名称，映射为 LangChain `runName` |
| `userId` | Langfuse | 按用户聚合和筛选 trace |
| `sessionId` | Langfuse + LangGraph | Langfuse 会话 ID；未指定 `threadId` 时也作为 `thread_id` |
| `threadId` | LangGraph | checkpointer 使用的线程 ID，可与 Langfuse session 分开 |
| `tags` | Langfuse/LangChain | 标签，并向子调用传播 |
| `version` | Langfuse | Agent 或 Prompt 的版本标识 |
| `metadata` | Langfuse/LangChain | 自定义 JSON 元数据，并向子调用传播 |
| `config` | LangGraph/LangChain | 原始 `RunnableConfig`，例如 `recursionLimit`、原有 callbacks |
| `flushAfterInvoke` | 适配器 | 调用结束后立即发送 trace；适合 CLI/Serverless |

因此下面这段不是 Langfuse 配置：

```ts
config: {
  recursionLimit: 10,
}
```

它表示 LangGraph 最多允许执行 10 个递归/循环步骤，防止 Agent 无限调用工具。
`flushAfterInvoke: true` 也不会成为 trace 字段，它只是让适配器在返回结果前调用
`forceFlush()`，确保短生命周期进程退出前数据已经发出。

进程类型对应的收尾方式：

```ts
// CLI：执行完关闭
await langfuseTracing.shutdown();

// Serverless：每次 invoke 设置 flushAfterInvoke: true

// Express/Fastify 等长驻服务：正常请求不 flush；收到停机信号时调用一次
process.once('SIGTERM', async () => {
  await langfuseTracing.shutdown();
  process.exit(0);
});
```

适配器的 `invoke()` 只依赖对象具有 LangChain 风格的 `invoke(input, config)`，
所以同样可以包裹 `createDeepAgent()`、CompiledStateGraph 或普通 Runnable。

如果目标项目已经注册了自己的 OpenTelemetry `NodeSDK`，不要再次调用
`initLangfuseTracing()`；应直接把 `LangfuseSpanProcessor` 加入已有 NodeSDK，
避免重复注册全局 provider。

---

[← Demo 5：LangChain.js 模型参数与调用方式](./demo5-langchain-base) · [返回系列总览](./) · [Demo 7：用 LlamaIndex 给 DeepAgent 增加本地知识库 →](./demo7-llamaindex)
