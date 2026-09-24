/**
 * 品牌资源 API：
 *   GET    /api/branding          — 公开，返回 { background, icon } 的可用状态与版本号
 *   GET    /api/branding/:slot    — 公开，回图片字节（登录页未登录也要能显示）
 *   POST   /api/branding/:slot    — 超管，原始二进制流式上传
 *   DELETE /api/branding/:slot    — 超管，恢复默认
 *
 * 读端点必须免鉴权：登录页在拿到 token 之前就要渲染背景与图标。
 * 因此写端点只开给 SUPER_ADMIN，且上传按真实字节头白名单校验（拒 SVG/HTML）。
 */
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import {
  BRANDING_MAX_BYTES,
  clearBrandingSlot,
  commitBrandingFile,
  getBrandingSlot,
  getBrandingStatus,
  isBrandingSlot,
  sniffImageType,
} from './brandingDb.ts';
import { requireRole } from './authMiddleware.ts';

export const brandingRouter = Router();

brandingRouter.get('/', (_req, res) => {
  res.json(getBrandingStatus());
});

brandingRouter.get('/:slot', (req, res) => {
  const slot = req.params.slot;
  if (!isBrandingSlot(slot)) return res.status(404).json({ error: '未知资源位' });
  const rec = getBrandingSlot(slot);
  if (!rec) return res.status(404).json({ error: '尚未上传' });

  const etag = `W/"${rec.updatedAt}-${rec.size}"`;
  if (req.headers['if-none-match'] === etag) return res.status(304).end();
  res.setHeader('Content-Type', rec.type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.setHeader('ETag', etag);
  // 流错误必须有监听者：文件被手工删掉/EMFILE 时 read stream 会抛 'error'，
  // 没人接就是 uncaughtException —— 而本站的兜底是 process.exit(1)，等于一个免鉴权请求能打停整站。
  const stream = fs.createReadStream(rec.absPath);
  stream.on('error', (e) => {
    console.error('[branding] 读取资源失败：', e);
    if (!res.headersSent) res.status(404).json({ error: '资源不存在' });
    else res.destroy(e);
  });
  stream.pipe(res);
});

brandingRouter.post('/:slot', requireRole('SUPER_ADMIN'), (req, res) => {
  const slot = req.params.slot;
  if (!isBrandingSlot(slot)) return res.status(400).json({ error: '未知资源位' });

  const max = BRANDING_MAX_BYTES[slot];
  const contentLength = Number(req.headers['content-length'] ?? 0);
  if (!contentLength) return res.status(411).json({ error: '缺少 Content-Length' });
  if (contentLength > max) {
    return res.status(413).json({ error: `图片超过 ${Math.round(max / 1024 / 1024)}MB 上限` });
  }

  const tmpPath = path.join(os.tmpdir(), `ams-branding-${slot}-${crypto.randomUUID()}`);
  const writeStream = fs.createWriteStream(tmpPath);
  const label = slot === 'background' ? '登录页背景' : '系统图标';

  let settled = false;
  const fail = (status: number, message: string) => {
    if (settled) return;
    settled = true;
    writeStream.destroy();
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      /* 文件可能还没建好 */
    }
    if (!res.headersSent) res.status(status).json({ error: message });
  };

  let bytes = 0;
  req.on('data', (chunk: Buffer) => {
    bytes += chunk.length;
    if (bytes > max) {
      req.unpipe(writeStream);
      fail(413, `${label}超过 ${Math.round(max / 1024 / 1024)}MB 上限`);
    }
  });
  req.on('aborted', () => fail(400, '上传中断'));
  req.on('error', () => fail(400, '上传流错误'));
  writeStream.on('error', () => fail(500, '写入失败'));
  req.pipe(writeStream);

  writeStream.on('finish', () => {
    if (settled) return;
    if (!bytes) return fail(400, '文件为空');
    const fd = fs.openSync(tmpPath, 'r');
    const head = Buffer.alloc(12);
    fs.readSync(fd, head, 0, 12, 0);
    fs.closeSync(fd);
    const sniff = sniffImageType(head);
    if (!sniff) return fail(415, '仅支持 PNG / JPEG / GIF / WebP 图片');
    try {
      const rec = commitBrandingFile(slot, tmpPath, sniff, bytes);
      settled = true;
      res.status(201).json({ success: true, slot, type: rec.type, size: rec.size, url: `/api/branding/${slot}` });
    } catch (error) {
      fail(500, `保存失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  });
});

brandingRouter.delete('/:slot', requireRole('SUPER_ADMIN'), (req, res) => {
  const slot = req.params.slot;
  if (!isBrandingSlot(slot)) return res.status(400).json({ error: '未知资源位' });
  clearBrandingSlot(slot);
  res.json({ success: true, slot });
});
