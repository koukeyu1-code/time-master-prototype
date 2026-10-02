# 时间管理大师 · 原型

React 18 + Vite 5 前端、Express 4 BFF（后端接口服务）。提供日程、常用地点、通勤方案和旅行规划原型；数据保存在本地 JSON 文件中，无需另装数据库。

当前适合本机开发和演示。部分数据和集成仍为示例或模板，构建成功不代表真实第三方服务已接通，也不代表可直接公开上线。

## 1. 准备环境

- Node.js 22 或更新版本及 npm；本次验证环境为 Node.js 24
- Git（通过 Git 拉取项目时需要）
- 仅同步真实飞书日历时需要：兼容本项目命令格式的 `lark-cli`，并由你在本机完成账号授权。项目不会自动安装或登录 CLI
- 仅查询真实地点、天气、路线时需要：高德开放平台的 **Web 服务 Key**

```sh
git clone https://github.com/koukeyu1-code/time-master-prototype.git
cd time-master-prototype
npm ci
```

依赖按 `package-lock.json` 安装。当前测试使用 Node 内置测试框架，不增加测试依赖。

## 2. 配置后端

复制示例文件到 `server/.env`：

```sh
# macOS / Linux
cp server/.env.example server/.env
```

Windows PowerShell：

```powershell
Copy-Item server/.env.example server/.env
```

按需编辑 `server/.env`。它由后端入口加载，**不是项目根目录的 `.env`**；已存在的进程环境变量优先于此文件。修改后需重启 BFF。

| 变量 | 默认值 / 用途 |
| --- | --- |
| `PORT` | `8787`，BFF 端口 |
| `LARK_CLI_BIN` | `lark-cli`；可设为可执行文件完整路径，路径可带空格；不要在值中附加命令参数 |
| `LARK_PROFILE` | 空；多账号时指定 CLI profile |
| `AGENDA_HOURS` | `24`；同步结束时间为当前时间加此小时数，起点为本地当天零点；请填写有效正数 |
| `AMAP_KEY` | 高德 Web 服务 Key；示例占位符不是真实 Key |
| `AMAP_BASE` | `https://restapi.amap.com/v3`，高德 v3 基础地址 |
| `DEFAULT_CITY_ADCODE` | `110000`（北京），默认城市编码 |
| `WEATHER_CACHE_MIN` / `ROUTE_CACHE_MIN` | `60` / `15`，缓存分钟数 |
| `CTRIP_API_KEY` / `CTRIP_API_SECRET` | 可选；留空时使用标为 `ctrip_mock` 的示例门票数据 |
| `CTRIP_API_BASE` | `https://openapi.ctrip.com` |

飞书配置在每次服务调用时读取，避免 ESM 导入先于 `dotenv.config()` 执行而忽略 `.env` 的问题。CLI 需支持 `calendar +agenda`、`calendar +get` 和 `auth status`；日历命令使用 JSON 输出，并可接收 `--profile` 参数。安装方式和授权方式请以你使用的 CLI 发行版文档为准。

携程真实接口代码目前是接入模板，端点、签名和响应格式仍需与获批接口核对；填写凭据不等于已验证可用。失败也可能回退到示例数据。

不要提交 `server/.env`、凭据或 `.run-data/`。不要把第三方密钥写进 `VITE_*` 变量：这些变量可能被打包进浏览器代码。

## 3. 启动开发环境

推荐先分开启动，方便区分前后端错误。以下命令都在项目根目录执行。

终端 A，启动 BFF（不自动重启）：

```sh
npm start
```

终端 B，启动前端开发服务器：

```sh
npm run dev
```

- 前端通常为 `http://localhost:5173`，端口占用时以 Vite 输出为准
- BFF 默认为 `http://localhost:8787`
- 前端默认请求 `/api`，由 Vite 转发到 BFF
- BFF 不提供前端页面，所以直接打开 BFF 根地址看到 `Cannot GET /` 属正常现象
- 在对应终端按 Ctrl+C 停止服务

也可以运行：

```sh
npm run server   # BFF 开发监听模式：后端已导入的代码变化后重启
npm run dev:all  # 同时启动 Vite 与 BFF 开发监听模式
```

监听使用 `node --watch`，不依赖显式目录监听参数。`.env` 不在导入图中，修改配置后仍请手动重启。运行时 JSON 数据放在源码目录外，不作为模块导入。

### 检查服务

打开 `http://localhost:8787/api/health`，或执行：

```sh
curl http://localhost:8787/api/health
```

应返回类似 `{"code":0,"data":{"ok":true,"ts":...}}` 的 JSON。这只检查 BFF 存活，不会请求飞书、高德或携程。

首次启动会创建 `.run-data/`：常用地点和偏好为种子示例，日程初始为空，旅行行程尚未生成。种子设置中的“已连接”等字段不代表真实账号已授权。

没有第三方凭据也能启动 BFF、访问健康接口并查看本地数据；同步飞书、真实天气/路线等功能则需要对应配置。`/api/events/health` 会真正调用 CLI 检查账号状态，和普通健康接口不同。

### 更改后端端口

例如在 `server/.env` 中改成 `PORT=8788` 后，前端也需使用新的代理目标。`VITE_BFF_TARGET` 由 `vite.config.js` 直接读取**启动 Vite 的进程环境**，放进 `server/.env` 不会生效。

```sh
# macOS / Linux，启动前端
VITE_BFF_TARGET=http://localhost:8788 npm run dev
```

```powershell
# Windows PowerShell，启动前端
$env:VITE_BFF_TARGET = 'http://localhost:8788'
npm run dev
```

## 4. 基础测试与构建

```sh
npm test
npm run build
```

测试覆盖：

- 飞书模块导入后才加载 `.env` 时，CLI 路径、profile、日程窗口仍然生效
- 默认值、环境变量覆盖、显式小时参数优先级
- CLI 参数及超时/缓冲区约定、业务错误、坏 JSON、执行失败、账号健康结果
- 日程归一化、同步缓存调用以及失败时不写入
- 临时项目副本中的 BFF 启动、健康检查、空日程读取和未创建行程的响应

测试不会运行真实 CLI，也不会请求高德或携程。飞书单元测试 mock 子进程与数据库方法；BFF 冒烟测试在系统临时目录复制代码、隔离配置及数据，结束后清理，不读写开发目录的 `.run-data/`。它们不等于浏览器端到端测试或真实账号联调。

### 构建产物的边界

- `npm run build` 生成前端静态资源到 `dist/`
- `npm run preview` 仅供本地预览前端构建，仍需另开 BFF；本配置的预览代理沿用开发代理目标
- 可选单文件构建：`npm run build -- --config vite.config.single.js`，输出 `dist-single/index.html`
- 两种构建都**不包含 BFF、CLI 或本地数据库**；单文件也不是完整离线应用
- 部署到静态托管后，Vite 开发代理不存在。必须另外运行 BFF 并配置 `/api` 反向代理，或在构建时设置 `VITE_API_BASE` 为可访问的 BFF API 地址（包含 `/api`，不要以 `/` 结尾）
- `VITE_API_BASE` 可通过根目录 `.env.local` 或构建进程环境提供，属于前端配置；修改后需要重新构建

当前 BFF 没有应用级用户鉴权，CORS 较宽松，JSON 存储也未面向多用户并发设计。不要直接暴露到公网；这里的启动说明不提供生产部署或数据迁移方案。

## 5. 常见问题

- **前端 API 失败 / 代理连接被拒绝**：先检查 BFF 终端和 `/api/health`，再确认 `PORT` 与 `VITE_BFF_TARGET` 一致
- **`lark-cli` 找不到 / `ENOENT`**：检查可执行文件是否在 PATH，或为 `LARK_CLI_BIN` 填写正确路径；必要时在运行 BFF 的同一个终端确认 CLI 能运行
- **飞书同步报权限或认证错误**：检查本机 CLI 授权和 `LARK_PROFILE`；更改 `.env` 后重启 BFF
- **高德提示 Key 未配置**：把 `AMAP_KEY=your_amap_key_here` 替换为你自己的 Web 服务 Key
- **旅行接口返回 404“行程尚未生成”**：初始状态正常，需要先在页面创建行程
- **数据保存在哪里**：项目根目录 `.run-data/`，包含日程、行程、地点、偏好与缓存。它不是临时构建产物；有实际数据后请先备份再做清理
