/* GET /api/settings —— 读取偏好设置
   PUT /api/settings —— 保存偏好设置（body: partial） */
import { Router } from 'express';
import { wrapRouter } from '../lib/asyncRouter.js';
import { db } from '../store/db.js';
import { ok, fail } from '../lib/utils.js';

const router = wrapRouter(Router());

router.get('/', async (_req, res) => {
  const s = await db.getSettings();
  res.json(ok(s));
});

router.put('/', async (req, res) => {
  const patch = req.body || {};
  const next = await db.saveSettings(patch);
  res.json(ok(next));
});

export default router;
