# LLM 应用实战项目合集

> 项目源码：[fengnovo/llm-projects](https://github.com/fengnovo/llm-projects)

1.  __pycache__ 目录 它完全等价于前端的 node_modules/.cache！用于存储 Python 编译后的中间文件
2. venv 目录类似 前端的 node_modules，用于存储 Python 环境依赖
3. python3 -m venv venv 可以创建上面的 venv 目录，用于隔离 Python 环境 
4. 激活 venv 环境：source venv/bin/activate  类似前端的 nvm use 命令，会自动激活环境
5. 安装依赖：pip install -r requirements.txt 类似前端的 npm install 命令，会根据 requirements.txt 安装依赖
6. 运行项目：python app/main.py
7. 访问 http://localhost:8001/ 即可打开界面


__pycache__ 目录下的__init__.cpython-313.pyc 文件是 Python 编译后的字节码文件，用于存储 Python 类的元数据

| 片段 | 含义 | 前端类比 |
| --- | --- | --- |
| __init__ | 对应的源文件名（__init__.py） | 就是源文件的名字 |
| cpython | 解释器类型（标准 Python 就是用 C 写的 CPython） | 类似于“Chromium V8”引擎 |
| 313 | Python 版本号（3.13） | 相当于“Node v20.x” |
| .pyc | 编译后的字节码文件 | 类似于 .cache 或 .map 文件 |

.env 文件里的值优先级高于 config.py 里写的默认值。
```
class Config:
    env_file = ".env.example"   # 改完后，程序会去读 .env.example
```




## 项目清单汇总

> 每个项目的 README 都已补齐「🧱 系统架构」与「🔄 核心流程图」章节（Mermaid 图，GitHub/Typora/VSCode 预览原生支持），点击「架构 / 流程」可直达。

| # | 项目名称 | 技术栈 | 核心能力 | 架构图 | 流程图 |
|---|----------|--------|---------|---|---|
| 1 | [AI 聊天助手](./llm-ai-chat-assistant.md) | Next.js + TypeScript + Vercel AI SDK | LLM 调用、流式输出 | [直达](./llm-ai-chat-assistant.md#🧱-系统架构) | [直达](./llm-ai-chat-assistant.md#🔄-核心流程-一次流式对话) |
| 2 | [AI 角色聊天引擎](./llm-ai-character-engine.md) | FastAPI + SQLAlchemy + SQLite + AsyncOpenAI | 人设、双层记忆、情绪状态机、Function Calling | [直达](./llm-ai-character-engine.md#🧱-系统架构) | [直达](./llm-ai-character-engine.md#🔄-核心流程-一次非流式对话-function-calling) |
| 3 | [RAG 知识库问答](./llm-rag-knowledge-base.md) | FastAPI + LangChain + ChromaDB + OpenAI Embeddings | 文档切片入库、向量检索、流式 RAG、引用溯源 | [直达](./llm-rag-knowledge-base.md#🧱-系统架构) | [直达](./llm-rag-knowledge-base.md#🔄-核心流程-上传文档-流式问答) |
| 4 | [Agent 任务助手](./llm-agent-task-assistant.md) | FastAPI + LangGraph + ChatOpenAI.bind_tools | ReAct 推理、5 个内置工具、循环编排、死循环保护 | [直达](./llm-agent-task-assistant.md#🧱-系统架构) | [直达](./llm-agent-task-assistant.md#🔄-核心流程-langgraph-react-迭代) |
| 5 | [多模态内容推荐](./llm-multimodal-rag.md) | FastAPI + CLIP(SentenceTransformer) + Qdrant | 批量入图、文本搜图、以图搜图、RRF混合、对话推荐 | [直达](./llm-multimodal-rag.md#🧱-系统架构) | [直达](./llm-multimodal-rag.md#🔄-核心流程-图片入库-三种检索) |
| 6 | [模型网关与部署](./llm-model-gateway-deployment.md) | LiteLLM Proxy + vLLM/Ollama + Redis + FastAPI中间件 | 模型别名抽象、多级限流、灰度切流、降级链、成本统计、私有化部署 | [直达](./llm-model-gateway-deployment.md#🧱-分层架构详细拆解) | [直达](./llm-model-gateway-deployment.md#🔄-核心流程-请求过网关-→-限流-→-灰度-→-降级-→-返回) |

---
