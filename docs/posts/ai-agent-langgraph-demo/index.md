---
title: LangGraph Agent 实战：从持久化、Middleware、DeepAgents 到 GraphRAG
description: 整合 demo3 至 demo19，循序学习 LangGraph 持久化、LangChain.js Agent、DeepAgents、上下文工程、安全防护与 LlamaIndex GraphRAG
date: 2026-09-09
---

# LangGraph Agent 实战：从持久化、Middleware、DeepAgents 到 GraphRAG

> 系列源码：[github.com/fengnovo/langchain-learn](https://github.com/fengnovo/langchain-learn)

这组示例从 LangGraph 的状态持久化出发，逐步覆盖 LangChain.js 的模型调用、Agent 中间件、结构化输出与消息体系，再进入 DeepAgents 的规划、子代理、上下文工程、记忆和沙箱，最后用 LlamaIndex.TS 实现一条可观察、可运行的 GraphRAG 流程。

本文是 `ai-agent-langgraph-demo` 中 demo3 到 demo19 的聚合入口。每个子页面主要保留对应 README 的原始说明，只补充站内导航与源码链接，方便按顺序学习，也方便针对某个主题单独查阅。

## 学习路线

| 阶段 | 对应 Demo | 重点 |
| --- | --- | --- |
| LangGraph 状态与输出 | Demo 3～4 | Checkpoint 持久化、会话恢复、消息流与 SSE |
| LangChain.js Agent 基础 | Demo 5～12 | 模型调用、Langfuse、RAG、动态模型、动态 Prompt、结构化输出、消息与 Middleware |
| DeepAgents 工程化 | Demo 13～18 | 规划、SubAgent、上下文工程、Memory、Sandbox 与危险命令防护 |
| GraphRAG | Demo 19 | LlamaIndex.TS 向量召回、属性图、三跳遍历与答案合成 |

如果是第一次接触这套代码，建议按编号阅读；如果已经熟悉 LangGraph，可以从 Demo 12 的 Middleware 开始，再继续进入 DeepAgents 与 GraphRAG。

## 第一阶段：状态持久化与流式输出

### [Demo 3：LangGraph 持久化 Checkpoint](./demo3)

实现自定义 `FileCheckpointSaver`，把 checkpoint 落盘到本地 JSON，并通过 `userId + sessionId` 恢复多会话上下文。这个示例展示 `BaseCheckpointSaver` 的关键钩子，以及记忆如何从 HTTP handler 转移到图的持久化层。

### [Demo 4：LangGraph 消息流与 Express SSE](./demo4-streaming)

解释大模型 token、LangGraph 消息流和 Express HTTP 流这三层机制如何配合。重点是 `streamMode: 'messages'` 与 `text/event-stream` 各自负责什么，以及为什么图节点内部仍可保留 `invoke()`。

## 第二阶段：LangChain.js 与 Agent 基础能力

### [Demo 5：LangChain.js 模型参数与调用方式](./demo5-langchain-base)

集中演示 `initChatModel`、静态与动态参数、`invoke`、`batch`、`stream` 和 `Promise.all`，并对照 Python 与 TypeScript API。

### [Demo 6：LangGraph 接入 Langfuse](./demo6-langfuse)

为带工具调用的 LangGraph Agent 接入 Langfuse，观察 Agent 节点、模型 generation 和 tool 调用形成的完整 trace；同时说明如何把相同方法迁移到 Deep Agents 项目。

### [Demo 7：用 LlamaIndex 给 DeepAgent 增加本地知识库](./demo7-llamaindex)

读取本地文档，通过 OpenAI Embedding 建立 LlamaIndex 内存向量索引，再把检索器封装成 DeepAgent 的 `knowledge_base_search` 工具。

### [Demo 8：动态模型 Agent](./demo8-dynamic-model)

使用 `createMiddleware` 与 `wrapModelCall`，根据消息数量在基础模型和高级模型之间动态切换，演示运行时路由和成本优化。

### [Demo 9：动态系统提示词](./demo9-dynamic-system-prompt)

根据调用时传入的用户角色生成系统提示词，并通过中间件覆盖 `systemPrompt`，实现 LangChain.js 中与 Python `dynamic_prompt` 对应的写法。

### [Demo 10：结构化输出](./demo10-structured-output)

通过 `responseFormat` 与 `toolStrategy` 约束 Agent 输出结构，并从 `structuredResponse` 读取经过 Schema 校验的结果。

### [Demo 11：LangChain 消息类型](./demo11-message-types)

梳理 `SystemMessage`、`HumanMessage`、`AIMessage` 与 `ToolMessage`，同时回顾 LangGraph State 中消息的关键属性。

### [Demo 12：Agent Middleware](./demo12-middleware)

系统说明 Agent 执行管道中的 hooks，并继续展开 Human-in-the-Loop、Summarization、LLM Tool Selector 与 File System 等中间件。

## 第三阶段：DeepAgents 工程化

### [Demo 13：DeepAgents 的创建与核心能力](./demo13-deepagents)

从规划、上下文管理、子代理和长期记忆四个维度理解 DeepAgents，并拆解 `createDeepAgent` 的常用参数、内置中间件与内置工具。

### [Demo 14：DeepAgent SubAgent](./demo14-subagents)

演示 Dictionary-based 与 `CompiledSubAgent` 两种创建方式，说明如何用任务委派实现职责分工与上下文隔离。

### [Demo 15：上下文工程四大策略](./demo15-context-engineering)

把 Write、Select、Compress、Isolate 四种策略映射到 Todo、Store、RAG、Tool Selector、Summarization、Trimming 与 SubAgent 等具体实现。

### [Demo 16：LangGraph Memory](./demo16-memory)

区分短期记忆与长期记忆：前者通过 checkpointer 保存线程状态，后者通过 store 跨线程保存用户信息，并演示自定义状态与工具读取。

### [Demo 17：DeepAgents Sandbox](./demo17-sandbox)

对比 Agent in Sandbox 与 Sandbox as tools 两种隔离方式，并以 Docker、自定义 backend 和云沙箱接口展示执行环境如何与主机建立边界。

### [Demo 18：危险命令防护](./demo18-dangerous-command)

围绕 Agent 的 shell 工具建立三级判定、路径感知、人工确认闸门、熔断与脚本内容审查，避免仅依赖容易绕过的命令黑名单。

## 第四阶段：LlamaIndex.TS GraphRAG

### [Demo 19：用 LlamaIndex.TS 实现 GraphRAG](./demo19-graphrag)

在 LlamaIndex.TS 的向量 RAG 主干上补充内存属性图：从文档片段抽取实体与关系，以向量召回和问题命中的实体作为种子，进行最多三跳的图遍历，再回填原文证据并合成最终答案。

## 阅读与运行建议

所有示例共用仓库根目录的模型环境配置，具体依赖、环境变量和运行命令以各子页面为准。涉及模型、Embedding、Langfuse 或云沙箱的示例，需要先准备对应服务的 Key；Demo 17 和 Demo 18 会执行代码或 shell 命令，建议先读完隔离与防护说明，再在可控环境中运行。

完整仓库与其他学习示例都在 [fengnovo/langchain-learn](https://github.com/fengnovo/langchain-learn)。本系列对应目录为 [`ai-agent-langgraph-demo`](https://github.com/fengnovo/langchain-learn/tree/main/ai-agent-langgraph-demo)。
