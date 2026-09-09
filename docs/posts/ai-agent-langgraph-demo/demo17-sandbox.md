# demo17：DeepAgents 的沙箱（Sandbox）两种实现

> GitHub 源码：[demo17-sandbox](https://github.com/fengnovo/langchain-learn/tree/main/ai-agent-langgraph-demo/demo17-sandbox)
## 1. 什么是 Sandbox

Agent 会生成代码、与文件系统交互并运行 shell 命令。由于当前的 Agent 行为常常
**无法预测**，因此有必要对 Agent 的运行环境实施**隔离**，防止其访问隐私数据、
权限文件或不安全网络。沙箱通过在 **Agent 的执行环境**和**主机系统**之间建立
边界，实现了这种隔离。

## 2. 两种模式

| 模式 | 名称 | 结构 | 特点 |
| --- | --- | --- | --- |
| 模式一 | **Agent in Sandbox** | Agent 代码 + 待处理文件/数据一起放进沙箱，Agent 运行在沙箱**内部**，用户通过**网络**与它交互（指令进、结果出） | 沙箱环境两种创建方式：① Docker 自建（完全可控、自建通讯、无需付费）；② 供应商托管（功能预设、无需自建通讯、按量付费） |
| 模式二 | **Sandbox as tools** | Agent 运行在**本地系统**上，需要执行代码时通过 **tool_call → tool_message** 调用远端沙箱中的工具（execute / read_file / write_file） | 云服务厂商（E2B / Codespaces / AWS / Daytona / LangSmith）帮我们运行和管理沙箱环境，用户只需使用，按量计费（有免费额度），应当保证每次**用完即停** |

deepagents 的关键设计：两种模式共用同一个后端抽象
**`SandboxBackendProtocolV2`**（核心是 `execute(command)`）。只要 backend 实现
了该协议，deepagents 就会自动挂载 **`execute` 工具**（在沙箱中执行 shell 命令，
附带 `EXECUTION_SYSTEM_PROMPT`）和文件系统工具——**换沙箱不改 Agent 代码**。

## 3. 模式一：Agent in Sandbox（Docker 自建）

对应课件项目结构（Python → TypeScript）：

| 课件（Python） | 本目录（TS） | 职责 |
| --- | --- | --- |
| `.env` | `../../.env`（项目根，不进镜像） | 密钥运行时通过 `--env-file` 注入 |
| `requirements.txt` | 根 `package.json` + `pnpm-lock.yaml` | 依赖清单（Dockerfile 内 `pnpm install`） |
| `agent.py` | [agent.ts](https://github.com/fengnovo/langchain-learn/blob/main/ai-agent-langgraph-demo/demo17-sandbox/agent.ts) | 沙箱内运行的 DeepAgent HTTP 服务 |
| `Dockerfile` | `../Dockerfile` | 构建沙箱镜像（node:22-slim） |
| `client.py` | [client.ts](https://github.com/fengnovo/langchain-learn/blob/main/ai-agent-langgraph-demo/demo17-sandbox/client.ts) | 宿主机客户端，POST /chat 三连测试 |
| `workspace/`（空） | [workspace/](https://github.com/fengnovo/langchain-learn/tree/main/ai-agent-langgraph-demo/demo17-sandbox/workspace) | **卷挂载**目录，容器内映射为 `/workspace` |

agent.ts 的五个部分（对应课件 Agent.py 注释）：

1. **配置沙盒后端**：`LocalShellBackend.create({ rootDir, env, inheritEnv: false, timeout: 120, maxOutputBytes: 500_000 })`——不继承主机环境变量，只给最小 PATH；单命令 120s 超时；输出内存上限 500KB；
2. **创建 DeepAgent**：`createDeepAgent({ model, backend, checkpointer: new MemorySaver() })`——backend 是沙箱后端，自动获得 `execute` + 文件工具；checkpointer 按 `thread_id` 隔离会话；
3. **HTTP 服务**：Express 替代 FastAPI，`ChatRequest` / `ChatResponse` 接口对应课件 Pydantic 模型；
4. **对话通讯**：`POST /chat`，`agent.invoke({ messages }, { configurable: { thread_id } })`，异常捕获返回错误信息；
5. **启动入口**：`app.listen(8000, '0.0.0.0')` 对应 `uvicorn.run(app, host='0.0.0.0', port=8000)`。

构建镜像与运行容器（在项目根目录 `ai-agent-langgraph-demo` 执行）：

```bash
# 构建镜像
docker build -t deepagent-ts .

# 运行容器（macOS/Linux）
docker run -it --rm -p 8000:8000 \
  -v "$(pwd)/demo17-sandbox/workspace:/workspace" \
  --env-file .env deepagent-ts

# 运行容器（Windows PowerShell）
docker run -it --rm -p 8000:8000 `
  -v "%cd%\demo17-sandbox\workspace:/workspace" `
  --env-file .env deepagent-ts
```

Docker 参数与课件一致：`-it` 交互式、`--rm` 自动清理、`-p 8000:8000` 端口映射、
`-v` **卷挂载**、`--env-file` 从文件加载环境变量（**.env 不打进镜像**，本地加载
→ 变量注入沙箱）、`deepagent-ts` 使用的镜像名称。

**Docker 卷挂载的核心特性**：主机和容器访问的是**同一个物理目录**，任何一方的
修改对另一方**立即可见**——client.ts 测试2 让 Agent 在沙箱里写 `hello.py`，宿主
机立刻能在 `workspace/hello.py` 看到它。

## 4. 模式二：Sandbox as tools（云服务沙箱）

[demo2.ts](https://github.com/fengnovo/langchain-learn/blob/main/ai-agent-langgraph-demo/demo17-sandbox/demo2.ts) 演示。课件 Python 用 Daytona 云沙箱；TypeScript deepagents
内置的云沙箱后端是 **`LangSmithSandbox`**（思路完全一致）：

```ts
// 创建沙箱：云端服务器创建新的隔离沙箱环境
const sandbox = await LangSmithSandbox.create({ apiKey }); // 需 LANGSMITH_API_KEY
// create() 返回值本身就是 backend（课件 DaytonaSandbox(sandbox=sandbox) 的等价物）
const agent = createDeepAgent({ model, backend: sandbox, systemPrompt: '...' });
const result = await agent.invoke({ messages: [...] });
await sandbox.close(); // 用完即停：停止并销毁云端沙箱（按量计费）
```

运行观察（tool_call → tool_message 交互与课件图片对应）：

1. Agent 发起 `[ai tool_call] execute {...}`，沙箱返回 `[tool_message]` 执行结果；
2. 全程 Agent 运行在本地，只有命令/文件操作落在远端沙箱里；
3. `finally` 中 `close()` 保证**用完即停**。

**无 LANGSMITH_API_KEY 时的本地兜底**：demo2.ts 会退回 `LocalShellBackend` 演示
同一流程——两种后端实现同一个 `SandboxBackendProtocolV2` 接口，Agent 代码零改动，
这正是「Sandbox as tools」的解耦意义。兜底运行同时暴露一个重要事实：
`LocalShellBackend`（`virtualMode` 默认 false）**不做真正的隔离**——Agent 能 `ls /`、
能写 `/tmp`，命令直接跑在宿主机上。所以本机调试时它只是"沙箱接口的本地替身"，
**真正的隔离请用模式一的 Docker**（或云沙箱）。

## 5. 运行

在 `ai-agent-langgraph-demo` 目录执行：

```bash
# 模式一（本地调试，免 Docker）：先起服务，另开终端跑客户端
pnpm demo17:serve
pnpm demo17:client

# 模式一（Docker，真正的沙箱隔离）
docker build -t deepagent-ts .
docker run -it --rm -p 8000:8000 -v "$(pwd)/demo17-sandbox/workspace:/workspace" --env-file .env deepagent-ts
pnpm demo17:client

# 模式二（云沙箱；未配置 LANGSMITH_API_KEY 时本地兜底）
pnpm demo17:2

# 类型检查
pnpm typecheck:demo17
```

本目录模型固定为 `qwen3.8-max-0902`（[model.ts](https://github.com/fengnovo/langchain-learn/blob/main/ai-agent-langgraph-demo/demo17-sandbox/model.ts)，`qwen3.8-max-0902`
免费额度已耗尽）；`maxTokens=4000` 防止 `write_file` 长参数被截断（见 demo13）。

## 6. Python 与 TypeScript API 对照

| 功能 | Python（课件） | TypeScript |
| --- | --- | --- |
| 沙盒后端（模式一） | `LocalShellBackend(root_dir="/workspace", env={...}, inherit_env=False, timeout=120, max_output_bytes=500_000)` | `new LocalShellBackend({ rootDir, env, inheritEnv: false, timeout: 120, maxOutputBytes: 500_000 })` |
| 异步初始化 | 隐式 | `await LocalShellBackend.create({...})`（或 `initialize()`） |
| 云沙箱创建 | `daytona = Daytona(DaytonaConfig(api_key=...)); sandbox = daytona.create()` | `await LangSmithSandbox.create({ apiKey })` |
| 沙箱包裹为后端 | `backend = DaytonaSandbox(sandbox=sandbox)` | `create()` 返回值即 backend；或 `new LangSmithSandbox({ sandbox })` |
| 创建 DeepAgent | `create_deep_agent(model=model, backend=backend, system_prompt=...)` | `createDeepAgent({ model, backend, systemPrompt })` |
| execute 工具 | 自动注册（名称 `execute`） | 自动注册（名称 `execute`，附带 `EXECUTION_SYSTEM_PROMPT`） |
| 调用 | `agent.invoke({"messages": [...]}, config={"configurable": {"thread_id": ...}})` | `agent.invoke({ messages: [...] }, { configurable: { thread_id } })` |
| HTTP 服务 | `FastAPI` + `uvicorn.run(app, host="0.0.0.0", port=8000)` | `express` + `app.listen(8000, '0.0.0.0')` |
| HTTP 客户端 | `requests.post(url, json={...})` | `fetch(url, { method: 'POST', body: JSON.stringify({...}) })` |
| 用完即停 | `sandbox.stop()` | `await sandbox.close()`（`stop()` 为暂停、可 `start()` 恢复） |
| 会话隔离 | `checkpointer` + `thread_id` | `checkpointer: new MemorySaver()` + `thread_id` |

## 7. 注意事项

- **沙箱安全性分级**：`LocalShellBackend` 官方文档明确警告它"无任何沙箱化、
  进程隔离或安全限制"，只适合本地开发/CI；生产环境用 Docker（模式一）或
  `BaseSandbox` 子类（云沙箱，模式二）；
- **按量计费**：云沙箱有免费额度，务必 `finally` 中 `close()`；
- **env 最小化**：`inheritEnv: false` + 白名单 `env` 是防泄露的第一道防线；
  容器内还要靠镜像本身的最小环境（node:22-slim）；
- **镜像分层缓存**：Dockerfile 先 COPY 依赖清单 `pnpm install`，再拷贝源码，
  源码改动不触发依赖重装。

---

[← Demo 16：LangGraph Memory](./demo16-memory) · [返回系列总览](./) · [Demo 18：危险命令防护 →](./demo18-dangerous-command)
