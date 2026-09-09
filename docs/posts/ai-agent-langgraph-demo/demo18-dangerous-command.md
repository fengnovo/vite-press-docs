# demo18：危险命令防护（Dangerous Command Guard）

> GitHub 源码：[demo18-dangerous-command](https://github.com/fengnovo/langchain-learn/tree/main/ai-agent-langgraph-demo/demo18-dangerous-command)
## 1. 要解决什么问题

s01 Agent Loop 给模型挂载了一个 `bash` 工具：模型可以**生成任意 shell 命令并直接在你的机器上执行**。这在带来便利的同时也意味着——模型一旦理解偏差或"过于听话"，就可能执行破坏性操作。

本 demo 在真实调试中遇到过三次典型事故：

| # | 模型执行的命令 | 后果 | 旧防护为什么没拦住 |
| --- | --- | --- | --- |
| 1 | `cd .. && rm -rf "项目目录"` | 整个项目目录被删 | 黑名单只有 `rm -rf /`，删的是具体目录名 |
| 2 | `rm -rf .env code.ts package.json ...`（枚举所有文件） | 目录被清空 | 目标都是 cwd 的**子路径**，规则视为"合法删除" |
| 3 | `rm README.md`（不带 `-r/-f`，逐个文件删） | 5 个文件被静默删除 | 旧规则只拦"带 `-r/-f` 标志"或"受保护文件名" |

**教训：纯黑名单是猫鼠游戏，永远追不完绕过手法。** 本 demo 的最终方案是 **三级判定 + 人工确认闸门 + 熔断**。

## 2. 核心设计

### 2.1 三级判定（Verdict）

每条命令在执行前先经过 `assessDanger(command)` 评估：

| 级别 | 含义 | 处理方式 |
| --- | --- | --- |
| `blocked` | 威胁系统/项目存续、无法挽回 | **直接拒绝**，不执行、不询问 |
| `confirm` | 破坏性或敏感操作，但可能有正当用途 | **终端红色提示，必须输入 `y` 才执行**；其他任意键（含无输入/非 TTY）一律拒绝 |
| `ok` | 普通只读/安全操作 | 直接执行 |

### 2.2 覆盖的危险命令

**直接拒绝（blocked）**

- 提权/系统：`sudo`、`shutdown`、`reboot`
- 毁盘：`mkfs`、`dd of=/dev/disk…`、`> /dev/disk…`、`diskutil eraseDisk/eraseVolume/…`
- 递归删除关键路径：`rm -rf /`、`rm -rf ~`、`rm -rf *`、`rm -rf .`、`rm -rf ..`、`rm -rf $HOME`
- `chmod -R 777`、`kill -9 -1`（杀全部进程）、fork bomb
- 远程脚本直执：`curl … | bash`、`bash <(curl …)`
- `git clean -fd`、`find … -delete`
- **删除当前工作目录本身或其任意祖先目录**（按解析后的绝对路径判定，`cd 父目录 && rm -rf 子目录` 也拦得住）

**需要确认（confirm）**

| 类别 | 示例 |
| --- | --- |
| 工作区内的**任何**删除 | `rm README.md`（即使不带 `-r/-f`）——事故 3 的修复 |
| 删除变种 | `shred`、`srm`、`unlink`、`truncate -s 0`、`find -exec rm`、`xargs rm`、`rsync --delete` |
| 受保护文件 | `.env*`、`package.json`、`pnpm-lock.yaml`、`tsconfig*.json`、`Dockerfile`、`node_modules` 的删除/移动/覆盖 |
| 进程/服务 | `kill`、`killall`、`pkill`、`launchctl unload/remove`、`crontab -r` |
| 权限递归修改 | `chmod -R`、`chown -R` |
| git 高危 | `reset --hard`、`checkout .`/`restore .`、`push --force/-f`、`branch -D`、`stash clear`、`filter-branch` |
| 凭据外传 | `curl/wget/nc` 配合 POST/`--data`/`.env`/`TOKEN`/`SECRET` 等关键词 |
| 混淆执行 | `eval`、`bash -c`、`python -c`、`node -e` 等解释器入口 |
| 覆盖写入 | `> .env`、`>> package.json`、`tee tsconfig.json`、`defaults delete` |

### 2.3 路径感知解析

`assessDanger` 不是简单字符串匹配，而是：

1. 按 `&&`、`;`、`|` 把命令**逐段切分**；
2. 跟踪每段里的 `cd`，维护"当前基准目录"；
3. 对 `rm/shred/srm/unlink` 的每个目标用 `path.resolve()` 算出**绝对路径**；
4. 用 `path.relative()` 判断目标与工作目录（CWD）的包含关系：
   - 删除 CWD 或其祖先 → `blocked`；
   - 删除 CWD **内部**的任何东西 → `confirm`；
   - CWD 之外的普通文件（如 `/tmp/xxx`）且无危险标志 → `ok`。

### 2.4 人工确认闸门

`run_bash()` 是异步的：判定为 `confirm` 时，通过 readline 在终端打印红色提示并等待输入：

```text
⚠️  破坏性命令，确认执行吗？
    $ rm -rf node_modules
  输入 y 确认，其他任意键拒绝:
```

- 输入 `y` / `yes` → 执行；
- 其他任何输入、直接回车、或非交互环境（无 TTY）→ **拒绝**，并把"用户已拒绝，不得重试"作为工具结果返回给模型。

### 2.5 熔断机制（Circuit Breaker）

事故 3 中模型在被拒后连续尝试了 **20+ 种变体**（换命令名、换标志、逐个文件删……）。为此 `agent_loop` 维护一个计数器：

> 同一轮对话中累计 **3 次**拒绝/拦截后，强制停止本轮执行：
>
> ```text
> 🛑 安全熔断：本轮已有 3 条危险命令被拒绝/拦截，已停止执行。请明确你的真实意图后再试。
> ```

同时 SYSTEM 提示词明确告知模型：破坏性命令被拒后**不得重试变体**，等待用户下一条指令。

### 2.6 脚本文件内容审查（防"写脚本再执行"绕过）

顶层命令判定有一个盲区：模型可以先把破坏性命令**写进脚本文件**再执行——

```bash
cat > cleanup.sh << 'EOF'
rm -rf .env src node_modules
EOF
bash cleanup.sh        # 顶层命令本身毫无危险特征
```

`bash cleanup.sh`、`node build.js`、`python deploy.py` 这类"执行脚本文件"的命令，光看命令字符串完全无害。因此 `run_bash()` 在 `assessDanger` 之外还有第二道审查 `inspectExecutedScripts()`：

1. 用正则识别命令中**被解释器/直接执行的脚本文件**：`bash/sh/zsh/source/. x.sh`、`node/tsx/deno/bun/python/perl/ruby/php x.xxx`、`./x.sh` 或绝对路径执行（同样跟踪 `cd` 解析相对路径）；
2. 读取脚本文件内容（文件不存在则放行让 shell 自己报错；存在但读不了则 fail-closed 升级确认）：
   - **shell 脚本**：跳过注释/空行，**逐行当作命令跑 `assessDanger`**——脚本里藏 `rm -rf /` 直接 `blocked`，藏 `rm -rf node_modules` 升级 `confirm`；
   - **JS/TS/Python 等代码文件**：扫描危险 API——文件删除类（`fs.rmSync`、`fs.rm`、`unlinkSync`、`shutil.rmtree`、`os.remove`、`Deno.remove`…）和 shell 调用类（`child_process`、`spawnSync`、`execSync`、`os.system`、`subprocess.`…），命中即 `confirm`；字符串里内嵌 `rm -rf` 等命令同样升级；
3. 两层判定取**更严格**的级别。

此外 `chmod +x`（给自建脚本加可执行权限，常是执行前的准备步骤）也纳入 `confirm`。

## 3. 代码结构

| 部分 | 位置 | 职责 |
| --- | --- | --- |
| `assessDanger(command)` | [code.ts](https://github.com/fengnovo/langchain-learn/blob/main/ai-agent-langgraph-demo/demo18-dangerous-command/code.ts) | 纯函数，输入命令字符串，返回 `blocked` / `confirm` / `ok`；可独立单测 |
| `inspectExecutedScripts(command)` | 同上 | 找出被执行的脚本文件并读取内容审查（shell 逐行判定、代码文件扫危险 API），返回更严格的级别 |
| `run_bash(command, ask)` | 同上 | 执行入口；合并顶层判定与脚本审查结果，`confirm` 时先调 `ask()` 拿用户确认；返回值带统一前缀供熔断统计 |
| `agent_loop(messages, ask)` | 同上 | 模型循环；统计拒绝次数，达到 `MAX_REJECTIONS = 3` 即熔断 |
| `PROTECTED_NAMES` | 同上 | 受保护文件名正则表（.env、lockfile、tsconfig、Dockerfile 等） |

设计要点：

- **两层判定分离**——`assessDanger` 是纯函数，不碰文件系统、不需要网络，测试用例直接喂命令字符串即可；脚本审查需要读文件，单独放在 `inspectExecutedScripts`，在执行入口 `run_bash` 合并。
- **拦截点在唯一执行入口**——所有 shell 命令都经过 `run_bash`，模型没有第二条执行路径。

## 4. 运行方式

在项目**根目录**（`ai-agent-langgraph-demo/`）执行：

```bash
pnpm demo18
```

依赖根目录 `.env` 中的三个环境变量（Anthropic 兼容端点）：

```bash
TX_ANTHROPIC_API_KEY=sk-xxx          # 兼容端点的密钥
TX_ANTHROPIC_BASE_URL=https://...    # 兼容端点根路径（SDK 会自动拼接 /v1/messages）
TX_ANTHROPIC_MODEL=xxx               # 模型 ID
```

> 注意：兼容端点普遍使用 `Authorization: Bearer <key>` 鉴权，因此客户端用
> `authToken` 初始化（SDK 发送 `Authorization` 头）；用 `apiKey` 只会发
> `X-Api-Key` 头，兼容端点会返回 401。

启动后进入交互会话，输入问题回车发送，输入 `q` 退出。可以试着让它"删除当前目录"，观察 blocked / confirm / 熔断三种行为。

## 5. 已知局限与后续方向

正则规则本质是"列举已知危险形态"，无法覆盖全部绕过，例如：

- shell 技巧：`D=rm; $D -rf src`、`/bin/r''m file`、`base64 -d | sh`（解码后的内容不落地，脚本审查看不到）；
- `node -e` / `python -c` 内联恶意逻辑（会触发确认，但确认后无法静态审查内容）；
- 脚本审查**只看一层**：`bash a.sh` 里的 `bash b.sh` 不会递归检查 b.sh 的内容；代码文件的 API 扫描也是粗粒度的，动态拼接（`process['rm'+'Sync']`）可绕过；
- 通配符展开的间接破坏（`rm -rf ./*/../` 等）；
- 非解释器类执行方式：编译后的二进制、`make`/`just`/`npm run` 调用的下游脚本（`package.json` 里的 hooks 内容不在审查范围）。

更强保障的两个方向：

1. **沙箱/容器隔离**：把 Agent 放进 Docker 或虚拟机里执行，文件系统级隔离——删了也只影响沙箱，主机无损（参见 demo17）。
2. **白名单模式**：从"黑名单拦危险命令"反转为"只允许明确安全的命令模式"，安全性最高，但需要维护允许列表、灵活性低。

本 demo 的定位是**主机直跑场景下的实用防线**：用最小的成本挡住绝大多数误操作，并把最终决定权交还给人。

---

[← Demo 17：DeepAgents Sandbox](./demo17-sandbox) · [返回系列总览](./) · [Demo 19：用 LlamaIndex.TS 实现 GraphRAG →](./demo19-graphrag)
