# Demo 4：LangGraph 消息流与 Express SSE

> GitHub 源码：[demo4-langgraph-fileCheckpointSaver](https://github.com/fengnovo/langchain-learn/tree/main/ai-agent-langgraph-demo/demo4-langgraph-fileCheckpointSaver)

改成流式输出  
stream    

配置 Express 响应头。这里有三层“流”：  
```
大模型生成 token
      ↓
LangGraph 捕获 token
      ↓
Express 逐块发送给客户端
```
invoke() 单独使用时不是流式返回：
```
const response = await modelWithTools.invoke(messages);
// 等完整结果生成后才得到 response
```
但在 LangGraph 中，如果外层这样调用：
```
const stream = await app.stream(input, {
  configurable: {
    thread_id: `${userId}:${sessionId}`,
  },
  streamMode: 'messages',
});
```
LangGraph 会向内部模型注入流式回调。因此即使节点中写的是：
```
const response = await modelWithTools.invoke(messages);
```
LangGraph 仍然可以在 invoke() 完成之前捕获模型生成的 token，并通过外层 stream 输出。response 则是供图继续运行使用的完整消息。
所以必须同时具备：
```
// 1. LangGraph 开启消息流
streamMode: 'messages'
// 2. Express 声明 SSE，防止客户端或代理缓冲
res.set({
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
});
res.flushHeaders();
// 3. 每收到一个 chunk 就立即发送
for await (const [message] of stream) {
  if (typeof message.content === 'string' && message.content) {
    res.write(`data: ${JSON.stringify(message.content)}\n\n`);
  }
}
```
因此：
- text/event-stream 只负责 HTTP 层，不会让模型自动变成流式。
- streamMode: 'messages' 才让 LangGraph输出模型 token。
- modelWithTools.invoke() 可以保留，不必再手动调用 .stream()。
- 当前的 ChatOpenAI 通常不需要额外设置 streaming: true；LangGraph 的消息流回调会触发其流式执行。

---

[← Demo 3：LangGraph 持久化 Checkpoint](./demo3) · [返回系列总览](./) · [Demo 5：LangChain.js 模型参数与调用方式 →](./demo5-langchain-base)
