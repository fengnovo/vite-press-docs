# demo3：LangGraph 持久化 checkpoint（自定义 FileCheckpointSaver）

> GitHub 源码：[demo3](https://github.com/fengnovo/langchain-learn/tree/main/ai-agent-langgraph-demo/demo3)
相比 [`demo2/`](https://github.com/fengnovo/langchain-learn/tree/main/ai-agent-langgraph-demo/demo2) 在图外手工读写历史，本目录把记忆交给 LangGraph **checkpointer**：图在每次运行时把状态打点成 checkpoint，下次用相同会话继续时自动从最近一个 checkpoint 恢复。

checkpointer 由业务自定义并挂到 `graph.compile({ checkpointer })` 上，实现落盘到本地 JSON。

## 内容

| 文件 | 作用 |
|---|---|
| `demo1.ts` | checkpointer **原理演示**：定义一个只打印流程的 `TestSaver extends BaseCheckpointSaver`（重写 `put` / `getTuple` / `putWrites`），观察图在运行 checkpoint 时调用了哪些钩子 |
| `demo.ts` | Express 入口：GET `/llm?q=问题&userId=用户&sessionId=会话`，只把 `userId`/`sessionId` 放进 `config.configurable`，不再手工拼历史（见 `demo2` 中被注释的写法对比） |
| `utils/getGraph.ts` | 构建带 `custom_calc` 工具的图，`compile({ checkpointer: new FileCheckpointSaver() })` 挂载 checkpointer |
| `utils/FileCheckpointSaver.ts` | `extends BaseCheckpointSaver` 的实现：`put`/`getTuple`/`putWrites`，把 checkpoint 序列化到 `chat/{userId}.json`（内部按 `sessionId` 分键），并拼出 `thread_id = userId:sessionId` |
| `utils/tool.ts` | `custom_calc` 工具定义 |
| `chat/001.json` | checkpoint 落盘样例 |

图中模型读取根目录 `.env` 的 `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `MODEL`。

## 运行

先确保根目录 `.env` 已配置，然后在项目根目录执行：

```bash
# 原理演示：观察 checkpointer 钩子被调用的时机
pnpm exec tsx demo3/demo1.ts

# HTTP 服务：监听 http://localhost:3003
pnpm exec tsx demo3/demo.ts
```

服务调用方式与 demo2 相同：

```
curl "http://localhost:3003/llm?q=我叫小明&userId=001&sessionId=a"
curl "http://localhost:3003/llm?q=我叫什么名字&userId=001&sessionId=a"
```

**关键区别**：历史不再由 handler 手动管理——`demo.ts` 里拼历史/存历史的代码被删掉，记忆由 `FileCheckpointSaver` 在每次 `invoke` 时自动读写。即使**重启进程**，只要 `userId:sessionId` 不变，`chat/{userId}.json` 中保存的 checkpoint 仍会恢复上文。

## 说明

- 本目录的 `FileCheckpointSaver` 是为教学写的最小实现（`putWrites` 为空、以固定 JSON 结构存 checkpoint），便于理解 `BaseCheckpointSaver` 三个抽象方法的职责；生产建议直接使用官方 `FileCheckpointSaver` / 内存 / Redis 等实现。
- checkpointer 是理解 LangGraph"有状态 Agent / 持久化会话 / 记忆"的钥匙，也是后续「流式输出」（[`demo4`](./demo4-streaming)）与断点续跑的基础。

---

[返回系列总览](./) · [Demo 4：LangGraph 消息流与 Express SSE →](./demo4-streaming)
