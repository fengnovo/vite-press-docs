# Demo 7：用 LlamaIndex 给 DeepAgent 增加本地知识库

> GitHub 源码：[demo7-LlamaIndex](https://github.com/fengnovo/langchain-learn/tree/main/ai-agent-langgraph-demo/demo7-LlamaIndex)
这个示例会读取 `documents/` 中的本地文件，用 LlamaIndex 建立内存向量索引，再把检索能力注册成 
DeepAgent 的 `knowledge_base_search` 工具。用户提问后，Agent 会自行调用这个工具，并根据检索结果回答。

运行流程：读取文件 → OpenAI Embedding 向量化 → LlamaIndex 检索 → DeepAgent 调用检索工具 → OpenAI 生成答案。

## 1. 环境要求

- Node.js 20 或更高版本
- pnpm 11
- 一个可调用聊天模型和 Embedding 模型的 OpenAI API Key

先进入项目根目录。后面的命令都在这个目录执行：

```bash
cd ai-agent-langgraph-demo
```

确认版本：

```bash
node -v
pnpm -v
```

## 2. 安装依赖

```bash
pnpm install
```

本示例使用以下几个关键依赖：

- `llamaindex`：建立向量索引和查询引擎
- `@llamaindex/readers`：提供 `SimpleDirectoryReader`
- `@llamaindex/openai`：提供 LlamaIndex 所需的 OpenAI LLM 和 Embedding
- `deepagents`：创建可以主动调用知识库工具的 Agent
- `tsx`：直接运行 TypeScript

仓库已经锁定了与 `llamaindex@0.12.1` 匹配的 `@llamaindex/readers@3.1.21` 和 `@llamaindex/openai@0.4.22`。
不要只把 `SimpleDirectoryReader` 从 `llamaindex` 主包导入；当前版本已经不再从主包导出它。

## 3. 配置环境变量

在 `ai-agent-langgraph-demo/.env` 中填写：

```dotenv
OPENAI_API_KEY=sk-你的密钥

# 使用 OpenAI 官方接口时可以不写这一项。
# 使用兼容接口时，地址通常需要包含 /v1。
# OPENAI_BASE_URL=https://api.openai.com/v1

MODEL=gpt-4o
EMBEDDING_MODEL=text-embedding-3-small
```

LlamaIndex 和 DeepAgent 会共用这四个环境变量。`MODEL` 与 `EMBEDDING_MODEL` 都直接填写接口提供的模型 ID，不需要添加 `openai:` 前缀。`OPENAI_API_KEY`、`MODEL` 和 `EMBEDDING_MODEL` 是必填项；使用 OpenAI 官方接口时可以省略 `OPENAI_BASE_URL`。

如果使用第三方 OpenAI 兼容接口，要确认它同时支持：

- Chat Completions 和工具调用
- Embeddings，例如 `text-embedding-3-small`

只支持聊天、不支持 Embeddings 的接口无法建立向量索引。

例如，本项目当前 `.env` 所连接的兼容接口提供了 `qwen3.7-text-embedding-flash`，可以添加：

```dotenv
EMBEDDING_MODEL=qwen3.7-text-embedding-flash
```

具体名称仍应以你所使用接口的实时模型列表为准。OpenAI 官方接口继续使用默认的 `text-embedding-3-small` 即可。

不要提交 `.env`，也不要把真实 API Key 写进示例文档。

## 4. 准备知识库文件

把资料放到：

```text
demo7-LlamaIndex/documents/
```

仓库中已经提供了一个 `annual-leave.md` 示例。你可以替换或继续增加 `.txt`、`.md`、`.csv`、`.html`、`.pdf`、`.docx` 等文件。

例如：

```text
demo7-LlamaIndex/
├── index.ts
├── README.md
└── documents/
    ├── annual-leave.md
    └── employee-handbook.pdf
```

## 5. 运行

推荐使用项目脚本：

```bash
pnpm demo7
```

也可以直接执行：

```bash
pnpm exec tsx demo7-LlamaIndex/index.ts
```

程序默认提问：

```text
能帮我查一下公司今年的年假政策吗？
```

正常情况下，终端会输出一段根据 `annual-leave.md` 生成的回答。首次运行会先上传文档内容生成 Embedding，通常会比普通聊天请求稍慢。

也可以在命令后直接传入问题：

```bash
pnpm demo7 -- "试用期员工可以申请年假吗？"
```

运行 TypeScript 检查：

```bash
pnpm typecheck:demo7
```

## 6. 修改问题或资料

推荐直接通过命令行传入问题：

```bash
pnpm demo7 -- "年假最晚应在什么时候申请？"
```

也可以修改 `index.ts` 中的默认用户消息：

```ts
const question =
  process.argv.slice(2).join(' ').trim() ||
  '试用期员工有几天年假？';
```

修改知识库文件后重新执行 `pnpm demo7`。这个入门示例每次启动都会重新读取文件并在内存中建立索引，进程退出后不会保存索引。

## 7. 常见问题

### `does not provide an export named 'SimpleDirectoryReader'`

当前版本需要独立 reader 包，正确写法是：

```ts
import { SimpleDirectoryReader } from '@llamaindex/readers/directory';
```

然后重新运行 `pnpm install`。

### `Cannot find Embedding` 或 `Cannot find LLM`

LlamaIndex 0.12 不会自动创建默认模型，代码顶部必须显式设置：

```ts
Settings.llm = new OpenAI({ model: 'gpt-4o' });
Settings.embedModel = new OpenAIEmbedding({
  model: 'text-embedding-3-small',
});
```

本示例已经包含这段配置。

### `OPENAI_API_KEY is not set` 或 HTTP 401

确认 `.env` 位于 `ai-agent-langgraph-demo/.env`，变量名是 `OPENAI_API_KEY`，然后从项目根目录运行命令。修改 `.env` 后需要重新启动进程。

### Embedding 请求返回 404 或 `model not found`

第三方接口可能没有 Embedding 路由或不支持默认模型。查看服务商的模型列表，再把 `EMBEDDING_MODEL` 改成它实际支持的模型。
聊天模型和 Embedding 模型是两类不同模型。

### 找不到 `documents`

确认目录名没有拼错，并且至少有一个受支持的文件。示例使用基于 `index.ts` 的绝对路径解析，所以无论从仓库根目录还是项目根目录启动，都能定位到同一个知识库目录。

### 每次运行都重复消耗 Embedding Token

这是当前演示版的预期行为，因为索引只保存在内存中。生产项目应将向量存入持久化向量数据库，或使用 LlamaIndex 的持久化 StorageContext。

## 8. 参考资料

- [LlamaIndex.TS npm 页面](https://www.npmjs.com/package/llamaindex)
- [`@llamaindex/readers` npm 页面](https://www.npmjs.com/package/%40llamaindex/readers)

---

[← Demo 6：LangGraph 接入 Langfuse](./demo6-langfuse) · [返回系列总览](./) · [Demo 8：动态模型 Agent →](./demo8-dynamic-model)
