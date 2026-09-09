# Demo 19：用 LlamaIndex.TS 实现 GraphRAG

> GitHub 源码：[demo19-LlamaIndex-GraphRAG](https://github.com/fengnovo/langchain-learn/tree/main/ai-agent-langgraph-demo/demo19-LlamaIndex-GraphRAG)
这个示例参考 `demo7-LlamaIndex` 的本地知识库写法，为当前项目增加一个可观察、可运行的 GraphRAG 流程：

```text
本地文档
  ├─ LlamaIndex SentenceSplitter 切块
  ├─ LLM 抽取实体与关系 → 内存属性图
  └─ LlamaIndex VectorStoreIndex → 语义召回
                              ↓
                    种子实体 + 三跳图遍历
                              ↓
                    关系链 + 对应原文片段
                              ↓
                 LlamaIndex ResponseSynthesizer
                              ↓
                           最终答案
```

它不是简单地把“知识图谱”几个字加进提示词：程序会真正构建实体和关系，按问题与向量召回结果选择种子实体，最多遍历三跳，再把图关系对应的原文证据交给 LlamaIndex 合成答案。

## 为什么实现了一层内存属性图

本仓库锁定的是 `llamaindex@0.12.1`。这个 TypeScript 包提供文档切块、向量索引、Retriever 和 ResponseSynthesizer，但没有导出 Python 版的 `PropertyGraphIndex`、`SimpleLLMPathExtractor` 等 GraphRAG API。因此本 demo 保留 LlamaIndex.TS 的 RAG 主干，只补上实体/关系存储与图遍历层。

内存图很适合教学和小数据验证；生产环境可以保持查询流程不变，将 `InMemoryPropertyGraph` 换成 Neo4j、NebulaGraph 或其他图数据库实现。

## 核心原理与代码执行流程

### 这个 demo 具体演示了什么

普通向量 RAG 擅长找出“和问题语义相似的片段”，但不一定能稳定连接分散在多个文档中的事实。这个 demo 在向量检索之外增加了一张真正的实体关系图，使查询可以从命中的实体继续沿关系向外扩展。

整个程序分成两个阶段：

```text
构建阶段：文档 -> 切块 -> LLM 抽取实体/关系 -> 内存图
                   \-> Embedding -> 向量索引

查询阶段：问题 -> 向量召回 + 实体匹配 -> 三跳图遍历
             -> 合并图关系与对应原文 -> LLM 合成答案
```

Chat 模型在这里承担两项工作：从文档中抽取图谱，以及根据召回证据生成最终答案。Embedding 模型只负责把文本转换成向量，用于语义相似度检索。

### 1. 初始化模型与配置

[`index.ts`](https://github.com/fengnovo/langchain-learn/blob/main/ai-agent-langgraph-demo/demo19-LlamaIndex-GraphRAG/index.ts) 先从项目根目录的 `.env` 读取模型、接口地址、超时和重试配置，然后写入 LlamaIndex 的全局 `Settings`：

```ts
Settings.llm = new OpenAI({ ... });
Settings.embedModel = new OpenAIEmbedding({ ... });
```

- `Settings.llm` 会被图谱抽取和最终答案合成使用。
- `Settings.embedModel` 会被 `VectorStoreIndex` 使用。
- `temperature: 0` 用于降低图谱抽取结果的随机性。
- 超时、SDK 重试次数和片段级重试次数都可以通过环境变量调整。

### 2. 读取文档并切块

`buildGraphRAGEngine()` 使用 `SimpleDirectoryReader` 读取 `documents/`，再通过 `SentenceSplitter` 把文档切成多个 `TextNode`：

```ts
const splitter = new SentenceSplitter({
  chunkSize: 320,
  chunkOverlap: 50,
});
```

`chunkOverlap` 会让相邻片段保留部分重复上下文，减少一句关系描述刚好被切断的概率。每个节点还保留文件名、页码等 metadata，后面可以追溯答案来源。

### 3. 从片段抽取实体和关系

`extractGraphFromChunk()` 会把每个文档片段交给 Chat 模型，要求只返回如下结构：

```json
{
  "entities": [
    { "name": "Atlas 服务", "type": "服务", "description": "..." }
  ],
  "relationships": [
    {
      "source": "Atlas 服务",
      "target": "韩梅",
      "relation": "技术负责人",
      "description": "..."
    }
  ]
}
```

模型输出不能直接信任，因此代码还会：

- 去掉可能出现的 Markdown JSON 代码块和前后说明。
- 用 `JSON.parse()` 解析内容。
- 用 Zod 的 `extractionSchema` 校验字段。
- 限制每个片段最多写入 20 个实体和 20 条关系。
- 对临时连接错误或无效 JSON 做退避重试。

### 4. 内存属性图如何存储数据

[`graph.ts`](https://github.com/fengnovo/langchain-learn/blob/main/ai-agent-langgraph-demo/demo19-LlamaIndex-GraphRAG/graph.ts) 中的 `InMemoryPropertyGraph` 主要维护三张 Map：

```text
entities       实体 key -> 实体信息与来源片段
relationships  关系 ID -> 起点、终点、关系和来源片段
chunkEntities  片段 ID -> 该片段出现过的实体
```

`normalizeEntityName()` 会统一兼容字符、大小写，并去掉空白和标点。因此 `Atlas 服务` 和 `Atlas服务` 可以得到相同的内部 key。展示时仍然保留第一次写入的原始名称。

每个实体和关系都会保存 `chunkIds`。这不仅能合并多个片段重复抽取出的事实，还能在图遍历后找到关系对应的原文证据。

### 5. 查询如何连接向量与图

`GraphRAGQueryEngine.query()` 是混合检索的核心，按以下顺序执行：

1. `vectorRetriever.retrieve(question)` 先召回语义最相似的两个片段。
2. `findEntityKeys(question)` 找出问题中直接出现的已知实体。
3. `entityKeysForChunks()` 把向量命中片段中的实体也加入图遍历种子。
4. `traverse(seedKeys, 3)` 从种子实体开始进行最多三跳的广度优先搜索。
5. `getSourceChunkIds()` 找回遍历关系涉及的原文片段。
6. 合并向量来源与图来源，去重后最多保留八个片段。
7. 把格式化后的图关系和原文一起交给 `ResponseSynthesizer` 生成答案。

向量检索在这里负责“找到入口”，图遍历负责“沿事实关系扩展”。即使问题没有准确写出某个实体名称，向量召回的片段也可以把其中的实体接到图上。

### 6. 三跳图遍历

`InMemoryPropertyGraph.traverse()` 使用广度优先搜索。搜索时会把关系视为可从两侧进入，例如已有关系：

```text
Atlas 服务 --[技术负责人]--> 韩梅
```

程序既可以从 `Atlas 服务` 找到 `韩梅`，也可以从 `韩梅` 找回 `Atlas 服务`，但最终输出仍保留关系原始方向。`visited` 防止实体在环中被重复访问，`frontier` 表示当前这一跳需要继续扩展的实体。

默认问题最终需要连接三条分散的事实：

```text
Aurora 项目 --[依赖]--> Atlas 服务
Atlas 服务 --[技术负责人]--> 韩梅
韩梅 --[属于]--> 数据平台部
```

### 7. 回填原文并生成答案

程序不会只把三元组交给模型，还会把关系对应的原文片段一并放进 `contextNodes`：

- 图关系节点的分数设为 `1`，突出结构化关系链。
- 向量命中的片段沿用相似度分数。
- 仅由图扩展得到的片段使用较低的默认分数。
- 最终提示词要求模型只依据这些证据回答，证据不足就明确说不知道。

终端中的向量来源、种子实体和多跳关系属于 `QueryTrace`，用于观察检索过程，不会作为另一套隐藏推理逻辑。

### 8. 教学实现的边界

这个 demo 展示了 GraphRAG 的核心数据流，但还不是生产级实现：

- 图谱和向量索引都只保存在内存，进程退出后会丢失。
- 每次启动都会重新调用模型抽取图谱并生成 Embedding。
- 实体消歧主要依赖名称归一化，没有别名表或实体对齐模型。
- 图谱质量受模型抽取稳定性影响。
- 三跳和召回数量是固定参数，没有根据问题动态规划。
- 数据量增大后，应改用图数据库和持久化向量数据库，并按文档 hash 增量更新。

## 1. 环境要求

- Node.js 20 或更高版本
- pnpm 11
- 同时支持 Chat Completions 和 Embeddings 的 OpenAI 或 OpenAI 兼容接口

进入项目根目录：

```bash
cd ai-agent-langgraph-demo
pnpm install
```

## 2. 配置环境变量

与 `demo7-LlamaIndex` 共用项目根目录的 `.env`：

```dotenv
OPENAI_API_KEY=sk-你的密钥
MODEL=gpt-4o-mini
EMBEDDING_MODEL=text-embedding-3-small

# 第三方兼容接口才需要配置，通常包含 /v1
# OPENAI_BASE_URL=https://example.com/v1

# 可选：慢速模型或兼容接口可调大单次请求超时（毫秒）
# OPENAI_TIMEOUT_MS=180000
# OPENAI_MAX_RETRIES=2
# GRAPH_EXTRACTION_MAX_ATTEMPTS=2
# GRAPH_EXTRACTION_RETRY_DELAY_MS=1000
```

不要把真实 API Key 提交到 Git。

## 3. 运行

执行默认的三跳问题：

```bash
pnpm demo19
```

默认问题是：

```text
Aurora 项目依赖哪个服务？这个服务由谁负责，负责人属于哪个部门？
```

这个答案需要连接分散在三个文件中的关系：

```text
Aurora 项目 --[依赖]--> Atlas 服务
Atlas 服务 --[负责人]--> 韩梅
韩梅 --[属于]--> 数据平台部
```

自定义问题：

```bash
pnpm demo19 -- "Atlas 通过哪个服务接收告警？两个服务分别由谁负责？"
```

默认会把向量召回、种子实体和实际遍历到的关系输出到终端，便于观察 GraphRAG 是否真的工作。只看答案时可以使用：

```bash
pnpm demo19 -- --no-trace "Aurora 项目的负责人是谁？"
```

## 4. 验证

类型检查：

```bash
pnpm typecheck:demo19
```

图存储与三跳遍历的本地测试不调用模型，也不会产生 API 费用：

```bash
pnpm test:demo19
```

## 5. 替换成自己的资料

把 `.txt`、`.md`、`.csv`、`.html`、`.pdf` 或 `.docx` 文件放进：

```text
demo19-LlamaIndex-GraphRAG/documents/
```

然后重新运行。当前 demo 每次启动都会重新抽取图谱和生成 Embedding，图与向量索引都只保存在内存中。

为了得到稳定关系，资料中最好明确写出主语、关系和宾语，例如“Atlas 服务的技术负责人是韩梅”，不要只依赖跨页代词。

## 6. 代码结构

```text
demo19-LlamaIndex-GraphRAG/
├── index.ts              # 文档加载、图谱抽取、混合检索与答案合成
├── graph.ts              # 内存属性图、实体匹配与多跳遍历
├── graph.test.ts         # 不调用 API 的图遍历测试
├── tsconfig.json
└── documents/            # 示例知识库
```

## 7. GraphRAG 与普通向量 RAG 的区别

普通向量 RAG 主要取“和问题最像的片段”。GraphRAG 会先命中实体，再沿关系扩展到语义并不相似、但结构上有关联的资料。因此它更适合组织关系、系统依赖、供应链、人物事件等多跳问题。

本 demo 采用混合检索：向量召回负责找到入口，属性图负责扩展关系链，最后回填原文降低仅凭关系三元组回答造成的信息损失。

## 8. 常见问题

### 图谱抽取 JSON 失败

程序会自动重试一次。若仍失败，说明当前聊天模型不擅长按 JSON 输出；请换用指令遵循更好的模型。这里没有强依赖 OpenAI `response_format`，是为了兼容更多第三方接口。

### `APIConnectionTimeoutError: Request timed out`

本 demo 默认把 LlamaIndex 的单次请求超时从 60 秒提高到 180 秒，并会在某个片段发生临时连接错误时进行片段级退避重试。慢速推理模型或繁忙的兼容接口仍然可能需要更长时间，可在 `.env` 中继续调大 `OPENAI_TIMEOUT_MS`，例如 `300000`。

`OPENAI_MAX_RETRIES` 控制底层 SDK 对临时错误的重试次数；`GRAPH_EXTRACTION_MAX_ATTEMPTS` 控制片段抽取（包括无效 JSON）的尝试次数。认证失败、请求参数错误等非临时错误不会反复重试。

### Embedding 返回 404 或 model not found

聊天模型和 Embedding 模型是两类模型。确认接口支持 Embeddings，并把 `EMBEDDING_MODEL` 改为服务商真实提供的模型 ID。

### 为什么每次运行都比较慢

每次启动都要逐片段抽取实体/关系，再生成 Embedding。这是为了让教学流程完整可见。生产环境应持久化图数据库和向量数据库，并按文档 hash 做增量更新。

### 为什么图关系有时命名不一致

实体和关系由 LLM 抽取。真实项目应加入固定 schema、实体消歧、别名表和人工评估；本示例只做了大小写、空白和标点归一化。

---

[← Demo 18：危险命令防护](./demo18-dangerous-command) · [返回系列总览](./)
