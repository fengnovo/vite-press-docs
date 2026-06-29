---
title: App 前端离线包：让 Hybrid H5 从 CDN 请求变成本地命中
description: 拆解一套 App 前端离线包方案，覆盖前端构建打包、版本管理平台、Android 下载校验与 WebView 拦截、灰度发布、回滚、安全校验和监控闭环
date: 2026-02-18
---

# App 前端离线包：让 Hybrid H5 从 CDN 请求变成本地命中  

git: 
（离线包版本管理平台）https://github.com/fengnovo/offline-package-platform 
（离线包前端工程侧实现）https://github.com/fengnovo/trade_h5_offline_frontend_template
（离线包加载Android工程侧实现）https://github.com/fengnovo/OfflinePackageAndroid  
线上地址：https://offline-package.keen-tech.top  
安卓体验包二维码：http://cdn.keen-tech.top/android-apks/app-debug-offline-v1.apk  
<img src="../public/images/apk-pic.png" width="120px" height="120px" />  


最近整理了一套 Hybrid App 前端离线包方案。它解决的问题很具体：App 里的 H5 页面如果每次都通过 WebView 去 CDN 拉 HTML、JS、CSS 和图片，那么首屏速度、弱网可用性和 CDN 故障兜底都会被网络质量绑住。

离线包的思路是把前端构建产物提前下发到客户端本地。用户打开页面时，WebView 请求的还是那批 CDN URL，但客户端资源拦截器会优先从本地磁盘读取；本地命中失败时再退回网络。这样业务页面不用知道自己是“在线运行”还是“离线命中”，但用户能获得更快、更稳的加载体验。

这套 demo 由三个项目和一份技术方案串起来：

- `trade_h5_offline_frontend`：Vite + React 业务前端，负责 build、生成 manifest、打 zip、上传注册。
- `offline-package-platform`：离线包版本管理平台，负责版本登记、灰度比例、全量发布、拉黑和客户端 `/check` 查询。
- `OfflinePackageAndroid`：Android Demo，负责下载、校验、解压、原子切换、WebView 拦截、回滚和上报。
- `App前端离线包加载技术方案.md`：定义包格式、服务端 API、客户端 SDK、安全、灰度、回滚和监控策略。

## 为什么需要离线包

Hybrid App 里常见的 H5 加载链路是：

```text
App 打开业务页
  -> WebView 加载 https://cdn.xxx.com/trade_h5/index.html
  -> HTML 再拉 JS / CSS / 图片
  -> CDN 或网络不稳定时，首屏变慢甚至白屏
```

这条链路有几个天然问题：

- 弱网下 HTML 和静态资源都要走网络，FCP/LCP 波动很大。
- CDN 或 DNS 抖动会直接变成 WebView 白屏。
- 电梯、地铁、飞行模式这类场景完全不可用。
- 业务上线后缺少端上回滚能力，只能等用户重新联网拉新资源。

离线包并不是要替代 CDN，而是在 CDN 前面加一层本地缓存和发布治理：

```text
原链路：
WebView -> CDN -> JS/CSS/图片

离线包链路：
WebView -> 客户端拦截器 -> 本地 active 目录
                         -> 未命中/损坏 -> CDN 兜底
```

这套方案最重要的判断是：离线包是“加速路径”，不是“唯一路径”。任何本地失败都要退回在线 CDN，用户体验优先。

## 总体架构

离线包系统不是一个单点功能，而是一条发布和运行链路。

```text
┌──────────────────────────┐
│ trade_h5_offline_frontend │
│ npm run release:offline   │
└─────────────┬────────────┘
              │ build / manifest / zip
              ▼
┌──────────────────────────┐
│ CDN / OSS / 七牛 Kodo      │
│ 存 zip 和 manifest         │
└─────────────┬────────────┘
              │ packageUrl + manifestJson
              ▼
┌──────────────────────────┐
│ offline-package-platform  │
│ draft / gray / full       │
│ blacklist / reports       │
└─────────────┬────────────┘
              │ /check 返回版本和下载地址
              ▼
┌──────────────────────────┐
│ OfflinePackageAndroid     │
│ 下载 -> 校验 -> 解压       │
│ temp -> active 原子切换    │
└─────────────┬────────────┘
              │ WebView 请求资源
              ▼
┌──────────────────────────┐
│ OfflineWebViewClient      │
│ 命中本地则返回文件         │
│ 未命中则 return null 走 CDN│
└──────────────────────────┘
```

每一层职责都很克制：

| 层 | 关注点 | 不应该做的事 |
|---|---|---|
| 前端工程 | 生成标准构建产物、manifest、zip | 在业务代码里判断在线/离线环境 |
| 版本平台 | 决定哪个设备能拿到哪个版本 | 参与客户端本地文件切换 |
| 客户端 SDK | 下载、校验、激活、拦截、回滚 | 自己决定灰度规则 |
| 监控系统 | 命中率、白屏率、异常率、回滚事件 | 阻塞 WebView 主加载链路 |

## 离线包格式

一个离线包本质上就是前端构建产物加一份 manifest：

```text
trade_h5-20260218001.zip
├── manifest.json
├── index.html
└── static/
    ├── js/app.a1b2c3.js
    ├── css/app.d4e5f6.css
    └── img/...
```

manifest 是客户端和平台之间的契约。它告诉客户端：这个包属于哪个业务、版本号是多少、适配哪些 App 容器版本、包体 md5 是什么、每个文件应该长什么样。

```json
{
  "bizId": "trade_h5",
  "version": "20260218001",
  "versionType": "full",
  "minAppVersion": "8.0.0",
  "packageMd5": "8f14e45fceea167a5a36dedd4bea2543",
  "packageSize": 1048576,
  "files": [
    {
      "path": "index.html",
      "md5": "d41d8cd98f00b204e9800998ecf8427e",
      "size": 2048
    },
    {
      "path": "static/js/app.a1b2c3.js",
      "md5": "098f6bcd4621d373cade4e832627b4f6",
      "size": 153600
    }
  ]
}
```

这里有几个关键点。

第一，`bizId` 让一个 App 可以同时管理多条业务线，比如交易 H5、个人中心、营销活动页。

第二，版本号建议用 `yyyyMMddNNN`，例如 `20260218001`。客户端只需要做字符串或数值大小比较，不要用语义化版本号。语义化版本比较规则太复杂，很容易在端上写出边界 bug。

第三，校验要分两层：

```text
下载 zip 后
  -> 校验 packageMd5
  -> 解压到 temp
  -> 逐文件校验 files[].md5
  -> 全部通过才允许激活
```

整包 md5 防下载损坏，文件级 md5 防解压过程损坏或单文件被篡改。生产环境还应该给 manifest 增加签名字段，客户端用内置公钥验签，避免 manifest 自己被替换。

## 前端工程怎么发离线包

`trade_h5_offline_frontend` 证明了一个很重要的设计：业务代码不需要区分“在线”和“离线”。

生产构建时，Vite 的 `base` 指向 CDN：

```ts
base: command === 'build' ? 'http://cdn.keen-tech.top/trade_h5/' : '/'
```

也就是说，HTML 里引用的 JS/CSS 仍然是绝对 CDN 地址。普通浏览器访问时，这些资源就从 CDN 加载；App WebView 访问时，Android 的资源拦截器拦截同样的 URL 前缀，命中本地就返回本地文件。

```text
同一份 dist/
  ├─ 上传 CDN：普通在线 H5 使用
  └─ 打成 zip：App 离线包使用

业务 React 代码：
  不关心当前资源来自 CDN 还是本地磁盘
```

发布命令是：

```bash
npm run release:offline
```

它做了几件事：

```text
release:offline
  -> npm run build
  -> 扫描 dist/ 生成 manifest.json
  -> 打包 offline-dist/trade_h5-<version>.zip
  -> 上传 zip / manifest 到 CDN
  -> POST /api/admin/offline-package/register 注册到平台
  -> 平台记录为 draft
```

这里的版本号在 demo 里用本地 `.version-state.json` 模拟领取。生产环境必须改成向版本管理平台领号，因为 CI 并发发布时，本地生成版本号会撞号。版本号应该是平台的全局资源。

## 版本管理平台的角色

`offline-package-platform` 是前端和客户端之间唯一的“状态来源”。前端发布脚本把包注册到这里，客户端 `/check` 也从这里判断该不该更新。

它的核心状态机是：

```text
draft
  │ 设灰度比例
  ▼
gray
  │ 全量发布
  ▼
full

gray / full
  │ 发现问题
  ▼
blacklist
```

状态含义：

| 状态 | 是否下发 | 用途 |
|---|---|---|
| `draft` | 否 | 新版本刚注册，等待人工确认 |
| `gray` | 部分设备 | 小流量验证 |
| `full` | 全量设备 | 正式发布 |
| `blacklist` | 否 | 拉黑止血，客户端不再拿到这个版本 |

客户端公开接口主要是两个：

```text
GET /api/offline-package/v1/check
POST /api/offline-package/v1/report
```

`/check` 会综合判断：

```text
请求参数：
bizId + localVersion + deviceId + appVersion + osType

服务端判断：
1. 找该 bizId 最新可发布版本
2. 排除 blacklist
3. 判断 minAppVersion / maxAppVersion 是否兼容
4. 如果是 gray，判断 deviceId 是否命中灰度桶
5. 和 localVersion 比较
6. 返回 hasUpdate / packageUrl / manifestUrl / md5
```

灰度分桶用 `md5(deviceId)` 的前 8 位转整数后对 100 取余：

```text
bucket = int(md5(deviceId).slice(0, 8), 16) % 100
命中条件：bucket < grayPercent
```

这保证同一台设备每次都落在同一个桶。灰度不是每次请求随机，而是设备稳定分流。

## Android 端的下载和激活流程

Android Demo 的价值在于，它不是只展示一个假页面，而是跑通了下载、校验、解压、原子切换、WebView 拦截和回滚的完整链路。

```text
App 启动
  │
  ├─ 本地没有 active 包
  │    └─ WebView 走在线 CDN 兜底
  │
  └─ 本地已有 active 包
       └─ 注册 WebView 拦截器

后台异步：
  checkUpdate
    -> 下载 zip
    -> 校验 packageMd5
    -> 解压到 temp
    -> 逐文件校验 md5
    -> active 备份为 backup
    -> temp rename 为 active
    -> 上报 activate_success
```

本地目录结构大致是：

```text
/data/data/<package>/files/offline_packages/
└── trade_h5/
    ├── current_version.json
    ├── active/
    │   ├── manifest.json
    │   ├── index.html
    │   └── static/...
    ├── backup/
    └── temp/
```

这里的核心是原子切换：

```text
新版本解压到 temp
  -> temp 内所有文件校验通过
  -> 删除旧 backup
  -> active rename 为 backup
  -> temp rename 为 active
```

只有校验通过的完整目录才能成为 `active`。如果激活失败，就把 `backup` 切回来。这样不会出现“JS 是新版本、CSS 是旧版本、manifest 又是另一版”的半成品状态。

注意 `rename` 的原子性依赖同一文件系统。`temp`、`active`、`backup` 必须放在同一个业务目录下面，不能跨分区。

## WebView 拦截如何命中本地

Android 的实现路径比较直接：重写 `WebViewClient.shouldInterceptRequest`。

```text
WebView 请求：
https://cdn.keen-tech.top/trade_h5/static/js/app.a1b2c3.js

拦截器：
  -> 提取相对路径 static/js/app.a1b2c3.js
  -> 查 manifest.files 是否存在
  -> 找 active/static/js/app.a1b2c3.js
  -> 文件存在且 md5 正确
       返回 WebResourceResponse(FileInputStream)
     否则
       return null，交给系统网络栈走 CDN
```

这段逻辑可以画成：

```text
              ┌────────────────────┐
              │ WebView 请求 CDN URL │
              └──────────┬─────────┘
                         ▼
              ┌────────────────────┐
              │ 转成相对路径         │
              └──────────┬─────────┘
                         ▼
        ┌────────────────────────────────┐
        │ manifest 中有这个 path 吗？      │
        └──────────┬───────────────┬─────┘
                  是               否
                  ▼                ▼
       ┌────────────────────┐   return null
       │ 本地文件存在且 md5 对？ │   走在线 CDN
       └────────┬───────────┘
              是│      否
                ▼       ▼
       返回本地文件   return null
                   走在线 CDN
```

“校验失败就降级”是这段代码的灵魂。离线包系统不应该因为本地缓存坏了就让用户白屏。

## Android 和 iOS 的差异

Android 的优势是未命中可以简单 `return null`，系统会继续走网络。iOS 的 `WKURLSchemeHandler` 则更复杂：一旦你接管了某个自定义 scheme，未命中时不能简单“还给系统”，而要业务层自己用 `URLSession` 发请求，再把响应喂回 `urlSchemeTask`。

两端差异可以这样理解：

```text
Android:
CDN URL -> shouldInterceptRequest
  命中：返回本地文件
  未命中：return null -> 系统网络兜底

iOS 自定义 scheme:
offline://trade_h5/static/js/app.js -> WKURLSchemeHandler
  命中：返回本地文件
  未命中：SDK 自己 URLSession 请求在线资源
       再 didReceive / didFinish 给 WKWebView
```

所以 iOS 方案需要更早评估 fallback 成本。简单场景可以考虑整页 `loadFileURL`，复杂场景再做自定义 scheme。

## 两种 Demo 模式

Android Demo 里有一个“真实平台”开关：

```text
Mock 模式：
assets/mock_cdn/manifest.json
assets/mock_cdn/offline_v1.zip
  -> 不需要网络
  -> 验证客户端完整链路

真实平台模式：
offline-package-platform /check
CDN 下载 zip
/report 上报事件
  -> 验证前端、平台、Android 三方联调
```

推荐联调顺序是：

```text
1. 启动 offline-package-platform
   PUBLIC_BASE_URL=http://10.0.2.2:4000 npm start

2. trade_h5_offline_frontend 执行
   npm run release:offline

3. 打开平台后台
   把 trade_h5 新版本从 draft 设置为 gray 或 full

4. Android Demo 打开“真实平台”
   点击 检查更新并下载

5. 点击 重新加载页面
   WebView 从灰色在线兜底页变成真实 React 页面
```

模拟器访问开发机要用 `10.0.2.2`，不能用 `localhost`。这也是 Demo 文档里反复强调的一个点。

## 安全设计

离线包的风险比普通 CDN 资源更高，因为它会被下载到客户端本地并长期留存。安全设计不能只靠 HTTPS。

```text
下载链路安全：
HTTPS
  -> packageMd5
  -> files[].md5
  -> manifest signature
  -> App 冷启动健康检查
```

主要风险和应对：

| 风险 | 应对 |
---|---|
| CDN 被劫持或 zip 被篡改 | HTTPS + `packageMd5` |
| manifest 被替换 | 服务端私钥签名，客户端内置公钥验签 |
| 构建机被攻破，包内有恶意 JS | CI 产物扫描 + 人工审批 |
| 本地文件被篡改 | 激活前和冷启动逐文件 md5 校验 |
| 恶意回放旧版本 | 版本号单调递增，低版本不允许激活，强制回滚指令也要签名 |

当前 demo 还没实现 manifest 签名，这是生产化前必须补的一环。

## 灰度和回滚

离线包发布不能一上来全量。它应该像客户端 SDK 或服务端接口一样有灰度、有止血、有端上自愈。

```text
发布阶段：
draft -> 白名单 -> 1% -> 5% -> 20% -> 50% -> full
           │
           └─ 任意阶段发现问题 -> blacklist
```

回滚分两级。

第一级是服务端拉黑。平台把版本标为 `blacklist` 后，`/check` 不再下发这个版本。还没更新的设备不会继续拿到坏包。

第二级是客户端自动回滚。已经激活坏包的设备不能等服务端指令，因为它可能此刻网络就不好。客户端应该在新版本首次加载后的观察期内统计白屏和 JS Error，超过阈值直接回退 `backup`。

```text
新版本激活
  -> 启动 5 分钟观察窗口
  -> 收集 white_screen / js_error
  -> 超过阈值？
       是：rollbackToBackup + report auto_rollback
       否：标记版本稳定
```

这两个回滚解决的问题不同：

- 服务端拉黑：防止继续扩大影响面。
- 客户端自愈：救已经拿到坏包、甚至当前网络不可用的设备。

两者缺一不可。

## 监控指标

离线包上线后，不能只看“发布成功”。真正应该盯的是命中、质量和收益。

```text
发布后第一小时监控：
下载成功率
  -> 校验失败率
  -> 激活成功率
  -> 资源命中率
  -> 白屏率 / JS 异常率
  -> 离线 FCP vs 在线 FCP
```

一张监控表大概应该这样设计：

| 指标 | 计算方式 | 意义 |
---|---|---|
| 下载成功率 | `download_success / hasUpdate` | CDN、网络和包体大小是否健康 |
| 校验失败率 | `verify_fail / download_success` | 包是否损坏或被篡改 |
| 激活成功率 | `activate_success / verify_success` | 原子切换是否可靠 |
| 命中率 | `hit / (hit + miss)` | 离线包是否真的在工作 |
| 白屏率 | `white_screen / page_view` | 新包是否引入严重问题 |
| JS 异常率 | `js_error / page_view` | 新版本质量是否劣化 |
| 首屏耗时收益 | `online FCP - offline FCP` | 方案是否真的带来性能收益 |

资源级 hit/miss 不建议每次都实时上报。更合理的是本地采样或聚合后批量 flush，避免监控本身影响 WebView 加载。

## 增量更新为什么放到二期

技术方案里明确建议首期只做全量包。原因很现实：离线包系统第一阶段最难的是链路可靠，而不是节省那一点流量。

增量包会引入这些复杂度：

- diff 算法选择。
- `baseVersion` 管理。
- 本地基准包损坏时如何 fallback。
- 多版本 diff 链维护。
- apply diff 后还要重新逐文件校验。

只有包体积较大、全量更新成本明显时，增量才值得做。小于 500KB 的包，diff 的收益往往抵不过复杂度。

二期可以这样演进：

```text
客户端 localVersion = 20260218001
平台 latest = 20260218003
  -> 有 001 -> 003 diff 包？
       是：下发 diff
       否：下发 full

客户端 apply diff 失败
  -> 丢弃 temp
  -> 重新请求 full 包
```

diff 失败永远不能阻塞更新，必须能降级全量。

## 风险边界

离线包不是前端单方面能落地的能力，它涉及客户端、服务端、前端发布和监控。

几个必须提前约定的风险边界：

- 前端新包不能强依赖尚未上线的后端接口，必须兼容上一个后端版本。
- 客户端离线包 SDK 自己也要灰度，因为 SDK bug 可能造成大面积白屏。
- 服务端要有一键关闭离线包功能的开关，极端情况下强制全部走在线。
- 本地总占用要有上限，例如所有业务线不超过 50MB，超过后按 LRU 清理低频业务包。
- iOS 离线包只更新 WebView 资源，不下发 Native 二进制；上线前仍然需要确认合规边界。

## 我喜欢的几个设计

第一，前端只构建一份产物。在线 CDN 和离线包复用同一个 `dist`，业务代码不感知运行环境。

第二，平台是唯一状态源。前端只负责注册版本，客户端只负责执行 `/check` 结果，灰度和拉黑都收敛在平台。

第三，客户端激活前做双重校验。先整包，再逐文件，降低半成品和篡改风险。

第四，原子切换足够简单。`temp -> active` 看起来朴素，但它是端上稳定性的核心。

第五，回滚分服务端和客户端两级。服务端止血，客户端自愈，覆盖了“还没下发”和“已经下发”两个阶段。

## 后续生产化清单

如果要从 demo 推到生产，我会按这个顺序补：

- 平台存储从 JSON 文件换成 MySQL 或 Postgres。
- 管理端加登录鉴权和 CI Token。
- 注册时生成 manifest 签名，客户端验签。
- `/check` 加 Redis 缓存，避免 App 启动高频请求打 DB。
- 平台支持白名单、地域、渠道、App 版本等多维灰度规则。
- Android 侧把 mock fallback 代码移除，只保留真实 CDN fallback。
- iOS 侧单独评审 `WKURLSchemeHandler` 的 fallback 成本。
- 接入白屏检测和 JS Error 监控，完成自动回滚闭环。
- 发布流水线增加审批和产物扫描。
- 体系稳定后再考虑 diff 增量更新。

这套离线包方案的价值，不只是“让 H5 更快一点”。它真正建立的是一条可治理的 Hybrid 资源发布链路：前端产物有版本，平台能灰度，客户端能校验，WebView 能兜底，监控能发现问题，端上还能自愈回滚。

当 H5 页面越来越像 App 内的重要业务模块时，这条链路就会从性能优化，变成稳定性基础设施。

最后更新：2026-02-18
