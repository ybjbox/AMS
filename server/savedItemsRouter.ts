/**
 * 用户留存条目 API（/api/saved-items）：座位方案 / 台卡与座次的打印参数 / 未保存草稿。
 *
 * 全部按 req.auth.username 归属隔离：列表只返回自己的、删除只允许删自己的，
 * 不提供「管理员看别人方案」的入口（这类半成品名单没有跨人价值）。
 */
import { Router, json } from 'express';
import {
  deleteSavedItem,
  isSavedItemKind,
  listSavedItems,
  upsertSavedItem,
  type SavedItemKind,
} from './savedItemsDb.ts';
import { validateBody, savedItemUpsertSchema, errMessage } from './validation.ts';

export const savedItemsRouter = Router();
savedItemsRouter.use(json({ limit: '512kb' }));

savedItemsRouter.get('/', (req, res) => {
  const kindParam = typeof req.query.kind === 'string' ? req.query.kind : null;
  if (kindParam && !isSavedItemKind(kindParam)) {
    return res.status(400).json({ error: '未知的留存类型' });
  }
  res.json(listSavedItems(kindParam as SavedItemKind | null, req.auth!.username));
});

savedItemsRouter.post('/', validateBody(savedItemUpsertSchema), (req, res) => {
  const { kind, name, payload } = req.body;
  if (!isSavedItemKind(kind)) return res.status(400).json({ error: '未知的留存类型' });
  try {
    res.status(201).json(upsertSavedItem({ kind, name, payload, owner: req.auth!.username }));
  } catch (error) {
    res.status(400).json({ error: errMessage(error) });
  }
});

savedItemsRouter.delete('/:id', (req, res) => {
  if (!deleteSavedItem(req.params.id, req.auth!.username)) {
    return res.status(404).json({ error: '条目不存在或不属于当前账号' });
  }
  res.json({ success: true });
});
