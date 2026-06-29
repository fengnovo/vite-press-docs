---
title: Simple LLM + MCP + RAG：不用框架搭一个增强型 Agent
description: 复盘一个 TypeScript 实现的极简 Augmented LLM，拆解 RAG 检索、MCP 工具接入、OpenAI-compatible Chat Completions、tool call 循环和本地向量库
date: 2026-03-18
---

# Simple LLM + MCP + RAG：不用框架搭一个增强型指定知识库 Agent  
git: https://github.com/fengnovo/simple-llm-mcp-rag-agent  

最近整理了一个 `simple-llm-mcp-rag-agent`。它没有用 LangChain、LlamaIndex、CrewAI 或 AutoGen，而是直接用 TypeScript 把一个最小版 Augmented LLM 串了起来。

它想验证的事情很简单：如果一个大模型既能读取本地知识，又能调用外部工具，还能把结果保存成文件，那么最小的工程结构应该长什么样？

这套代码最后跑出来的任务大概是：

```text
从 knowledge 目录里找到 Kamren 相关资料
  -> 注入给模型当上下文
  -> 让模型总结并创作故事
  -> 通过 filesystem MCP 把结果保存到 output/Kamren.md
```

## 先用大白话理解

普通 LLM 像一个很会聊天的人，但它有几个天然限制：它不知道你本地文件里的资料，也不能自己访问工具，更不能直接在你的磁盘上写文件。

这个项目就是给 LLM 补三件装备：

<div class="lc-flow">
  <div class="lc-flow__node">
    <strong>RAG</strong>
    <span>先从本地知识库里找相关资料，避免模型凭空编。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>LLM</strong>
    <span>拿着用户任务和检索上下文，负责理解、总结和生成。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>MCP</strong>
    <span>把 fetch、filesystem 这类外部能力包装成模型可调用的工具。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>Agent Loop</strong>
    <span>模型要用工具就调用工具，工具结果再塞回对话，直到模型不再调用工具。</span>
  </div>
</div>

大白话说：RAG 负责“翻资料”，LLM 负责“动脑子”，MCP 负责“伸手干活”，Agent 负责“让它们按顺序配合”。

## 项目整体链路

入口在 `src/index.ts`。它做了三件事：

1. 创建输出目录 `output`。
2. 从 `knowledge` 目录读取所有 Markdown 文件，做向量检索，取出 top 3 相关资料。
3. 创建 Agent，把 fetch MCP、filesystem MCP、检索上下文和任务一起交给模型。

整体流程可以画成这样：

<div class="lc-flow">
  <div class="lc-flow__node">
    <strong>读取知识库</strong>
    <span>遍历 knowledge/*.md，把每个用户资料读成字符串。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>生成向量</strong>
    <span>EmbeddingRetriever 调用 embedding 接口，把文档转成数字向量。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>相似度检索</strong>
    <span>VectorStore 用余弦相似度找出和任务最相关的 topK 文档。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>初始化 Agent</strong>
    <span>连接 MCP Server，收集工具定义，创建 ChatOpenAI。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>执行任务</strong>
    <span>模型生成内容，需要写文件时通过 MCP 调用 filesystem 工具。</span>
  </div>
</div>

这里最关键的不是“保存 Kamren 的故事”，而是这套链路把上下文、模型和工具打通了。任务换成“阅读网页并总结”“查询本地资料再写报告”“根据文档生成文件”，主结构都不用大改。

## 几个核心模块

代码可以拆成五块：

<div class="lc-protocol-grid">
  <div>
    <strong>src/index.ts</strong>
    <span>应用入口，负责准备任务、读取知识库、创建 MCP Client 和启动 Agent。</span>
  </div>
  <div>
    <strong>Agent.ts</strong>
    <span>调度中心，负责初始化工具、调用模型、处理 tool_call 循环。</span>
  </div>
  <div>
    <strong>ChatOpenAI.ts</strong>
    <span>OpenAI-compatible Chat 封装，负责消息历史、流式响应和工具定义转换。</span>
  </div>
  <div>
    <strong>MCPClient.ts</strong>
    <span>MCP 客户端封装，负责通过 stdio 连接 MCP Server、列工具、调工具。</span>
  </div>
  <div>
    <strong>EmbeddingRetriever.ts</strong>
    <span>调用 embedding 接口，把文档和 query 转成向量。</span>
  </div>
  <div>
    <strong>VectorStore.ts</strong>
    <span>内存向量库，保存向量和原文，用余弦相似度做 topK 检索。</span>
  </div>
</div>

如果把它看成一台机器，`index.ts` 是开关，`EmbeddingRetriever + VectorStore` 是资料检索器，`ChatOpenAI` 是模型适配器，`MCPClient` 是工具插座，`Agent` 是总控。

## RAG：先把相关资料找出来

这个项目里的 RAG 很轻量，没有切 chunk、没有持久化向量库、没有 rerank，也没有复杂 loader。它就是：

```text
读取 knowledge 目录每个文件
  -> 每个文件整体 embedding
  -> 存到内存 VectorStore
  -> 把任务也 embedding
  -> 用余弦相似度找 top 3
  -> 拼成 context 注入给模型
```

流程对应到代码是：

<div class="lc-sequence">
  <div>
    <b>遍历 knowledge</b>
    <span>index.ts 用 fs.readdirSync() 找到所有本地 Markdown 文档。</span>
  </div>
  <div>
    <b>嵌入文档</b>
    <span>EmbeddingRetriever.embedDocument(content) 调 embedding API。</span>
  </div>
  <div>
    <b>写入内存库</b>
    <span>VectorStore.addEmbedding(embedding, document) 保存向量和原文。</span>
  </div>
  <div>
    <b>嵌入任务</b>
    <span>EmbeddingRetriever.retrieve(TASK, 3) 先把用户任务转成 query embedding。</span>
  </div>
  <div>
    <b>计算相似度</b>
    <span>VectorStore.search() 对 query 和每篇文档计算 cosine similarity。</span>
  </div>
  <div>
    <b>返回上下文</b>
    <span>取分数最高的 topK 文档，join 成 context 注入 ChatOpenAI。</span>
  </div>
</div>

大白话说，向量检索不是“关键词搜索”，而是把问题和资料都变成一串数字，看它们在语义空间里方向像不像。方向越接近，说明越相关。

`VectorStore` 里的余弦相似度就是这个意思：

```ts
private cosineSimilarity(vecA: number[], vecB: number[]): number {
  const dotProduct = vecA.reduce((sum, a, idx) => sum + a * vecB[idx], 0)
  const normA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0))
  const normB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0))
  return dotProduct / (normA * normB)
}
```

这里适合做教学和原型验证。真正产品化时，通常还要补文档切片、向量持久化、增量索引、metadata 过滤和重排。

## MCP：把外部能力变成模型工具

项目里配置了两个 MCP Server：

```ts
const fetchMCP = new MCPClient("mcp-server-fetch", "uvx", ["mcp-server-fetch"])

const fileMCP = new MCPClient(
  "mcp-server-file",
  "npx",
  ["-y", "@modelcontextprotocol/server-filesystem", outPath]
)
```

这两个工具的职责不一样：

<div class="lc-map">
  <div>
    <strong>fetch MCP</strong>
    <span>让模型具备读取网页的能力，适合“阅读网页并总结”的任务。</span>
  </div>
  <div>
    <strong>filesystem MCP</strong>
    <span>让模型只能在指定 output 目录里读写文件，适合保存 Markdown 结果。</span>
  </div>
</div>

`MCPClient` 的工作也很清楚：

<div class="lc-sequence">
  <div>
    <b>创建 stdio transport</b>
    <span>用 command + args 启动 MCP Server，比如 npx 或 uvx。</span>
  </div>
  <div>
    <b>连接 Server</b>
    <span>Client.connect(transport) 建立 MCP 通信。</span>
  </div>
  <div>
    <b>列出工具</b>
    <span>mcp.listTools() 拿到 name、description、inputSchema。</span>
  </div>
  <div>
    <b>交给模型</b>
    <span>ChatOpenAI 把 MCP Tool 转成 Chat Completions 的 function tools。</span>
  </div>
  <div>
    <b>执行调用</b>
    <span>模型发起 tool_call 后，Agent 用 mcp.callTool(name, arguments) 真正执行。</span>
  </div>
</div>

这就是 MCP 的价值：模型不用知道“文件系统工具怎么启动、协议怎么通信”，它只看到一个结构化工具。真正执行工具的是你的程序。

## ChatOpenAI：把 MCP 工具转成模型能理解的 tools

`ChatOpenAI` 做了三件核心事情。

第一，维护 `messages`。构造时如果有 `systemPrompt` 就放 system 消息，如果有 RAG context 就放 user 消息。真正任务进来时，再把 prompt 追加到 messages。

第二，发起流式 Chat Completions：

```ts
const stream = await this.llm.chat.completions.create({
  model: this.model,
  messages: this.messages,
  stream: true,
  tools: this.getToolsDefinition(),
})
```

第三，拼接流式 tool call。因为流式返回时，工具名和参数可能被拆成很多 delta，所以代码里用 `toolCallChunk.index` 找到当前工具调用，把 `id`、`function.name`、`function.arguments` 一段段拼起来。

这块很容易被忽略，但它是流式 tool calling 的关键：

<div class="lc-flow">
  <div class="lc-flow__node">
    <strong>模型流式输出</strong>
    <span>一部分 chunk 是普通文本，一部分 chunk 是 tool_calls。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>按 index 聚合</strong>
    <span>同一个 tool_call 的 name 和 arguments 可能分多次回来。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>追加 assistant 消息</strong>
    <span>把 content 和 tool_calls 放回 messages，保持对话历史完整。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>等待 Agent 执行</strong>
    <span>ChatOpenAI 不直接执行工具，只负责返回 toolCalls。</span>
  </div>
</div>

工具定义转换也很直接：MCP 的 `inputSchema` 会变成 OpenAI tools 的 `parameters`。

```ts
private getToolsDefinition() {
  return this.tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }))
}
```

## Agent Loop：模型说要用工具，就真的去用

`Agent.invoke()` 是这个项目最像 Agent 的地方。它不是只问一次模型就结束，而是会进入一个循环：

<div class="lc-sequence">
  <div>
    <b>第一次调用模型</b>
    <span>llm.chat(prompt) 把任务、RAG context 和工具定义一起发给模型。</span>
  </div>
  <div>
    <b>检查 toolCalls</b>
    <span>如果模型返回了工具调用，就说明模型认为需要外部能力。</span>
  </div>
  <div>
    <b>寻找对应 MCP</b>
    <span>Agent 在所有 MCPClient 的 tools 里按 tool name 找归属。</span>
  </div>
  <div>
    <b>执行工具</b>
    <span>mcp.callTool(name, JSON.parse(arguments)) 调用真正的 MCP Server。</span>
  </div>
  <div>
    <b>写回工具结果</b>
    <span>llm.appendToolResult(toolCall.id, result) 把结果追加成 tool 消息。</span>
  </div>
  <div>
    <b>继续对话</b>
    <span>再次 llm.chat()，让模型基于工具结果继续推理。</span>
  </div>
  <div>
    <b>没有工具调用就结束</b>
    <span>模型返回最终文本，Agent 关闭 MCP 连接并结束。</span>
  </div>
</div>

用更直白的话说：

```text
你问模型一个任务
  -> 模型说：我要调用写文件工具
  -> Agent 帮它调用
  -> 工具返回：文件已写入
  -> Agent 把结果告诉模型
  -> 模型继续判断还要不要调用工具
  -> 不需要了，就输出最终回答
```

这个循环就是“增强型 LLM”和普通聊天的分水岭。普通聊天只会回答；Agent 会在回答过程中行动。

## 一次任务完整跑起来是什么样

以当前 `TASK` 为例：

```ts
const name = "Kamren"
const TASK = `
告诉我${name}的信息,先从我给你的context中找到相关信息,总结后创作一个关于她的故事
把故事和她的基本信息保存到${outPath}/${name}.md,输出一个漂亮md文件
`
```

完整运行链路可以这样看：

<div class="lc-flow">
  <div class="lc-flow__node">
    <strong>任务里有 Kamren</strong>
    <span>query embedding 会更接近包含 Kamren 信息的知识文档。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>RAG 找资料</strong>
    <span>从 knowledge 里选出 top 3 文档拼成 context。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>模型生成内容</strong>
    <span>模型先基于 context 总结人物信息，再创作故事。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>模型调用文件工具</strong>
    <span>通过 filesystem MCP 写入 output/Kamren.md。</span>
  </div>
  <div class="lc-flow__arrow">→</div>
  <div class="lc-flow__node">
    <strong>返回最终结果</strong>
    <span>Agent 收到没有 tool_call 的响应后结束。</span>
  </div>
</div>

这里的一个好处是，模型拿到的不是全部知识库，而是和任务最相关的几篇资料。这样上下文更短，也更聚焦。

## 这个实现刻意保持简单

这个项目的价值不是功能多，而是边界清楚：

<div class="lc-map">
  <div>
    <strong>RAG 不管生成</strong>
    <span>它只负责把相关资料找出来，最后怎么写由 LLM 决定。</span>
  </div>
  <div>
    <strong>LLM 不直接执行工具</strong>
    <span>它只返回 tool_call，真正执行由 Agent 和 MCPClient 完成。</span>
  </div>
  <div>
    <strong>MCP 不理解业务任务</strong>
    <span>它只暴露工具能力，比如 fetch 或 filesystem。</span>
  </div>
  <div>
    <strong>Agent 不写具体工具逻辑</strong>
    <span>它只调度模型、工具和消息历史，让循环跑起来。</span>
  </div>
</div>

这种拆法适合学习 Agent 底层机制。你能看到每一步消息怎么进出、工具怎么注册、结果怎么回填，而不是被框架封装吞掉。

## 现在还缺什么

如果要从 demo 走向更稳的工程形态，后面可以继续补：

- 文档切片，而不是一个文件整体 embedding。
- 向量库持久化，比如 SQLite、Postgres pgvector 或专门的向量数据库。
- embedding 缓存，避免每次启动都重新嵌入 knowledge。
- tool call 参数校验，避免 `JSON.parse(arguments)` 失败直接中断。
- 工具调用超时、重试和权限边界。
- 更清晰的 system prompt，约束模型如何使用 context 和工具。
- 日志结构化，记录每次检索命中的文档、分数、工具调用和最终输出。

不过作为一个极简实现，它已经把 Augmented LLM 最核心的骨架搭出来了：

```text
RAG 提供上下文
LLM 负责推理生成
MCP 提供工具能力
Agent Loop 把工具结果重新喂回模型
```

把这四件事看明白，再去用 LangChain 或其他 Agent 框架，就不会只是在调 API，而是知道框架背后到底帮你做了哪些事。

最后更新：2026-03-18
