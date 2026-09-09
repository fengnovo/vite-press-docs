# demo10：结构化输出（Structured output）

> GitHub 源码：[demo10-structured-output](https://github.com/fengnovo/langchain-learn/tree/main/ai-agent-langgraph-demo/demo10-structured-output)
在某些情况下，我们可能希望 Agent 以特定格式来返回输出。本示例是 Python 课件
「结构化输出 Structured output」的 TypeScript 版：

- `responseFormat`：LangChain.js 通过 `createAgent` 的 `responseFormat` 参数配置
  结构化输出（对应 Python 的 `response_format`）；
- `toolStrategy`：使用人工工具调用来生成结构化输出，适用于任何支持工具调用的模型
  （对应 Python 的 `ToolStrategy`）；
- `structuredResponse`：结构化结果放在返回状态的 `structuredResponse` 字段
  （对应 Python 的 `result["structured_response"]`）。

## 1. 环境变量

复用项目根目录 `.env` 的默认模型配置：

```dotenv
OPENAI_API_KEY=你的API_KEY
OPENAI_BASE_URL=https://你的OpenAI兼容接口/v1
MODEL=模型名称
```

注意：`toolStrategy` 依赖工具调用能力，模型必须支持 function calling。
若模型支持原生 JSON Schema 输出（如 OpenAI gpt-4o 系列），可改用
`providerStrategy(ContactInfo)`，由服务商原生结构化输出能力保证格式。

## 2. 运行

在 `ai-agent-langgraph-demo` 目录执行：

```bash
pnpm demo10
```

执行类型检查：

```bash
pnpm typecheck:demo10
```

## 3. Python 与 TypeScript API 对照

| 功能 | Python | TypeScript |
| --- | --- | --- |
| 定义输出格式 | `class ContactInfo(BaseModel)`（Pydantic） | `z.object({ name: z.string(), ... })`（zod） |
| 配置结构化输出 | `response_format=ToolStrategy(ContactInfo)` | `responseFormat: toolStrategy(ContactInfo)` |
| 原生 JSON Schema 策略 | `ProviderStrategy(ContactInfo)` | `providerStrategy(ContactInfo)` |
| 读取结构化结果 | `result["structured_response"]` | `result.structuredResponse` |

## 4. 工作原理

1. `ContactInfo` 用 zod 定义 `name`、`email`、`phone` 三个字段；
2. `toolStrategy(ContactInfo)` 把该 schema 注册成一个隐藏的结构化输出工具，
   Agent 完成推理后由模型发起一次对该工具的调用，参数即结构化数据；
3. Agent 把工具参数解析、校验后写入 `result.structuredResponse`；
4. Demo 从一段自然语言联系人介绍中提取姓名、邮箱、电话，
   并以 JSON 形式打印，验证输出符合 `ContactInfo` 结构。

---

[← Demo 9：动态系统提示词](./demo9-dynamic-system-prompt) · [返回系列总览](./) · [Demo 11：LangChain 消息类型 →](./demo11-message-types)
