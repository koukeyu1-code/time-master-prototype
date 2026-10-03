/* 同源入口：鉴权先于 API 和全部前端静态文件。 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { access } from 'node:fs/promises';
import { createApp } from './app.js';
import { readAuthConfig } from './lib/auth.js';
import { ensureSeed } from './store/db.js';

const root = fileURLToPath(new URL('../', import.meta.url));
dotenv.config({ path: path.join(root, 'server', '.env') });
const config = readAuthConfig(); // Fail before touching data or opening any listener.
const PORT = Number(process.env.PORT || 8787);
if (!Number.isInteger(PORT) || PORT < 0 || PORT > 65535) throw new Error('PORT 无效');
if (config.production) await access(path.join(root, 'dist', 'index.html'));
await ensureSeed();
const app = createApp({ authConfig: config });
app.listen(PORT, config.host, () => {
  console.log(`时间管理大师已启动：${config.origin || `http://${config.host}:${PORT}`}（${config.disabled ? '仅限本机开发，访问保护已显式关闭' : '个人访问保护开启'}）`);
});
