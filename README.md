# 时间管理大师 · 个人版原型

React 18 + Vite 5 前端、Express 4 BFF，单人使用、同源访问、单个 Node 进程、JSON 持久化，不需要额外数据库。

已补充个人访问保护、安全保存与自定义景点重启恢复。**这不是已完成公网部署的证明**：HTTPS/反向代理、持久卷、真实账号授权与第三方联调仍需在实际环境验证；部分页面仍展示示例数据。

## 1. 环境与安装

- Node.js 22+、npm；本次验证使用 Node.js 24
- 真实飞书同步另外需要兼容本项目命令格式的 `lark-cli`，由你自行在本机安装和授权
- 真实地点、天气和路线另外需要高德 Web 服务 Key

```sh
git clone https://github.com/koukeyu1-code/time-master-prototype.git
cd time-master-prototype
npm ci
cp server/.env.example server/.env
```

PowerShell 复制配置：`Copy-Item server/.env.example server/.env`。入口加载 **server/.env**；已有进程环境变量优先，修改后重启。不要提交 `.env`、密码哈希、密钥、`.run-data/` 或外置数据目录，也不要把任何密钥放入 `VITE_*`。

## 2. 个人访问保护与同源启动

默认拒绝无登录配置的启动。密码哈希格式由本机交互脚本生成：

```sh
npm run auth:hash
```

脚本要求在你的交互式终端输入两次至少 16 字符的高强度密码（建议用密码管理器生成），不回显，不通过命令行参数传密码；使用随机盐和 scrypt。将输出的 `AUTH_PASSWORD_HASH='…'` 行放进服务端 `.env` 或主机的安全配置中。**真实密码与哈希由你自己保管，不要发送到聊天、提交代码或填写示例密码。** 本次测试只使用临时虚构凭据，没有为实际服务生成或配置密码。

```sh
npm run build
npm start
```

本机打开 `http://127.0.0.1:8787`，先看到登录页面。BFF 在同一个端口提供整个 `dist/` 和 `/api`；API、健康检查、JS/CSS、页面深链接都位于登录保护之后。生产不能单独把 `dist/` 放到无保护的静态站点/CDN，也不能公开 Vite 开发/预览端口。

- 登录 cookie 为 HttpOnly、SameSite=Strict，生产还有 Secure、`__Host-` 前缀
- 会话最多 8 小时，重启或更改密码并重启后全部失效；“退出登录”立即撤销当前会话
- 修改请求要求同源 Origin 和会话 CSRF token；前端自动处理；跨站访问拒绝，不开放跨域 CORS
- 登录全局限制每 15 分钟最多 10 次尝试（含成功），并限制同时验证数量；触发后等待窗口结束。重启会清空内存限流，因此公网入口仍应配置额外限流
- 健康接口 `/api/health` 只测本进程，登录后查看；`/api/events/health` 会真正调用飞书 CLI

### 生产必须由你完成的配置

| 变量 | 要求 |
| --- | --- |
| `NODE_ENV` | `production` |
| `AUTH_PASSWORD_HASH` | 本机生成并安全配置的 scrypt 哈希；缺失或格式错误拒绝启动 |
| `PUBLIC_ORIGIN` | 例如 `https://time.example.com`；精确 HTTPS origin，无路径、查询或尾斜杠 |
| `HOST` | 默认 `127.0.0.1`；推荐由同机 HTTPS 反向代理访问 |
| `PORT` | 默认 `8787` |
| `DATA_DIR` | 推荐绝对路径，挂载可靠持久卷，例如 `/var/lib/time-master`；不能依赖临时容器磁盘 |
| `AUTH_DISABLED` | 保持 `false`；production 下 `true` 会直接拒绝启动 |

先构建，再启动。生产还会检查 `dist/index.html` 是否存在。反向代理须保留真实 `Host`（与 PUBLIC_ORIGIN 的域名/端口一致）、终止 TLS，并把**所有页面/静态资源/API**统一转到该 Node 服务。HTTP 公网端口只能跳转 HTTPS，不能显示登录表单或转发密码；Node 明文后端必须仅本机/隔离内网可达，禁止公网直连。容器如必须 `HOST=0.0.0.0`，需由宿主网络/防火墙防止后端端口暴露。

本程序不信任客户端自报的 `X-Forwarded-*`，也不会自动申请证书。仅填写 HTTPS origin 并不建立 TLS。请在确认 HTTPS 证书、重定向和后端隔离后再输入真实密码。未提供多用户、找回密码、跨域或多副本方案。

## 3. 仅本机开发

需要热更新时可在本机 `server/.env` 显式设 `AUTH_DISABLED=true`，并保持非 production、`HOST=127.0.0.1`；这个绕过只适合本机开发，不是部署方案。

```sh
npm run dev:all
# 或分开运行 npm run server 与 npm run dev
```

Vite 默认绑定回环地址，一般为 `http://127.0.0.1:5173`；`/api` 与 `/login` 代理到 BFF，并保留浏览器 Host/Origin。若本机开发也启用密码，保持 `AUTH_DISABLED=false`；开发未设 PUBLIC_ORIGIN 时允许回环 origin。Vite 自身静态资源不经过 Node 鉴权，因此带鉴权的完整访问验证应使用上一节的 `build + start`。

BFF 改为 `PORT=8788` 后，启动 Vite 的进程需设置 `VITE_BFF_TARGET=http://localhost:8788`。该变量不读取 `server/.env`。PowerShell 用 `$env:VITE_BFF_TARGET = 'http://localhost:8788'`。前端 API 固定同源 `/api`，不再支持跨域 `VITE_API_BASE`。

`node --watch` 监听后端已导入代码，`.env` 改动仍需手动重启。`npm run preview` 仅可本机预览，不能作为受保护的生产入口。可选单文件构建 `npm run build -- --config vite.config.single.js` 输出 `dist-single/index.html`，只是静态演示产物，不包含 API/数据/登录保护，不应公开部署。

## 4. JSON 保存、备份与恢复

DATA_DIR 在入口加载 `.env` **之后**解析，默认项目根 `.run-data/`，包含 `places.json`、`settings.json`、`events.json`、`cache.json`、`trip.json`。旧版五个原始 JSON 文件无需格式迁移即可读取；首次全新目录填充示例地点/偏好、空日程和空行程。

每个文件独立串行化读写和完整读-改-写事务，覆盖地点增删改、设置、缓存、飞书本地修正、行程生成/编辑/重算。不同文件仍可能独立成功或失败，**不构成跨文件事务**。不要手动同时修改运行中的文件，不要用 cluster、多个容器或多个 Node 进程共享此目录。

保存步骤：在同一目录写独占临时文件 → fsync → rename；权限为 0600。更新前先原子保存已验证的上一版到 `.json.bak`，再替换主文件。写入/磁盘满/改名失败会报错，原有完整数据保留，失败不会阻塞后续队列。目录 fsync 在平台不支持或失败时会打印警告，此时不能保证断电持久性；请选择支持持久化原子 rename 的本地卷。

主文件丢失、JSON 损坏或顶层结构错误时，会验证备份后恢复并明确记录警告；**恢复可能退回上一版，最后一次修改可能丢失**。主文件和备份都不可用时停止启动/当前操作，不以种子覆盖。启动时可从有效主文件重建缺失或损坏备份。若在首次初始化中断导致部分文件缺失，需先保留整个目录，再人工确认恢复；不会假装这是全新空库。

`.bak` 与主文件在同一磁盘，只保护最近一次版本，不防磁盘损坏、丢盘、误删或攻击。实际使用前还应配置独立离机/异机备份并验证恢复。备份整个 DATA_DIR 时先停 Node，以获得一致的多文件快照；恢复同样先停止服务，保留故障目录副本，恢复已验证的完整目录后再启动。不要只拷贝单个文件混合不同时刻数据。本次没有迁移或改动任何实际用户数据。

### 自定义景点

选中高德/携程等动态景点时，前端提交完整景点，服务端把校验后的快照与 stops/路线保存在同一个 `trip.json` 事务中。重启后直接从快照恢复；旧行程缺少快照字段时可从已保存的 stop/leg 端点恢复。若自定义 key 完全没有可恢复坐标，重算会明确报错并保留原文件，不再静默删掉景点或缩短路线。内置 POI 不能被自定义数据覆盖。

## 5. 第三方配置与边界

| 变量 | 默认/用途 |
| --- | --- |
| `LARK_CLI_BIN` | `lark-cli`；可用完整路径，勿附加命令参数 |
| `LARK_PROFILE` | 空；多账号指定 profile |
| `AGENDA_HOURS` | `24`；同步窗口小时数，请填有效正数 |
| `AMAP_KEY` | 真实高德 Web 服务 Key；示例占位符无效 |
| `AMAP_BASE` | `https://restapi.amap.com/v3` |
| `DEFAULT_CITY_ADCODE` | `110000` 北京 |
| `WEATHER_CACHE_MIN` / `ROUTE_CACHE_MIN` | `60` / `15` |
| `CTRIP_API_KEY` / `CTRIP_API_SECRET` | 可选；未填可退回 `ctrip_mock` 示例 |
| `CTRIP_API_BASE` | `https://openapi.ctrip.com` |

飞书配置在服务调用时读取，CLI 需支持 `calendar +agenda`、`calendar +get`、`auth status`、JSON 和 `--profile`。本项目不会自动安装/登录 CLI。携程端点/签名仍是待核对接入模板；填入凭据不代表联调完成。路线失败可能回退直线估算，不能当作实时导航。页面中的“飞书已连接”、同步时间等部分展示仍来自原型示例，不是连接状态承诺。

## 6. 回归验证

```sh
npm test
npm run build
npm run build -- --config vite.config.single.js
npm run test:http
```

`test:http` 在构建后启动全新隔离服务，验证实际 HTTP 登录、静态资源/API 拦截、添加景点、强制结束进程并重启、重新登录重算与退出。它显式发送 Origin，不能模拟浏览器原生表单的请求头生成。

Node 内置测试覆盖飞书运行时配置及失败路径、真实入口隔离启动、登录/CSRF/会话/限流/生产 fail-closed、原子写入/备份错误/并发更新、动态 POI 跨进程重启与旧数据恢复。所有测试使用临时目录、mock API/CLI、虚构密码，不读写本地真实数据或访问第三方账号。

实际浏览器回归脚本（首次在独立测试环境安装可选测试工具，不修改生产依赖声明和 lockfile）：

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
npm run build
npm run test:browser
```

若已有 Playwright/Chromium，可跳过安装，例如：

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs CHROMIUM_PATH=/absolute/path/to/chromium npm run test:browser
```

浏览器回归另需在测试环境提供 Playwright 与 Chromium；可使用 `PLAYWRIGHT_MODULE` 指定现有 Playwright 模块，`CHROMIUM_PATH` 指定 Chromium 可执行文件，不会由脚本自动安装。脚本启动独立的临时 Node 服务、模拟第三方，验证原生表单错误密码后再次登录（检查浏览器实际发送的 Origin，不注入请求头）、界面添加景点、真正重启后重新登录与重算、退出登录。它不证明实际 HTTPS/代理/持久卷或真实第三方集成可用。

登录响应使用 `Referrer-Policy: same-origin`，包括错误密码与限流后的重试表单。旧版 `no-referrer` 会让原生表单 POST 携带 `Origin: null`，导致同源检查返回 403；这属于应用响应头问题，不是 Playwright 安装问题。详见 [Fetch 的 Origin 生成规则](https://fetch.spec.whatwg.org/#append-a-request-origin-header)。修复保留严格 Origin/CSRF 检查，缺失、`null` 或跨站 Origin 仍会被拒绝；`same-origin` 仍不向其他来源发送 Referer。

浏览器脚本的网络拦截会让 Playwright 的 `allHeaders()` 返回暂停请求时的快照，其中可能未暴露 `Sec-Fetch-Site` / `Sec-Fetch-Mode`；这不能证明实际网络请求未发送这些头。脚本使用 `isNavigationRequest()` 判断原生导航，仅在这两个元数据头可见时校验其值；精确 Origin、响应状态和 Referrer-Policy 仍必须通过。Node 单元测试覆盖该观察接口的兼容性，不代表浏览器端到端已通过。

本次受运行环境限制，真实浏览器回归尚未完成：Chromium 创建本地 socket 被系统拒绝，受支持云浏览器也阻止访问测试 loopback 地址。脚本已保留供允许浏览器访问的环境运行；HTTP 接口验证和 Node 跨进程重启验证不能替代浏览器通过结果。
