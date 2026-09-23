/**
 * 品牌资源端点回归（外观设置去 base64 化）：
 *  1. 读端点免鉴权（登录页要用），且**只**放开 background / icon 两个槽位；
 *  2. 写端点只给超管（未登录 401、HR 403）；
 *  3. 上传按真实字节头放行 PNG/JPEG、拒绝非图片，且拒绝时不留文件；
 *  4. 换类型时旧文件被清掉，删除后回到 404。
 *
 * 跑的是真 authGate + 真会话 token，所以公开路径白名单本身也被覆盖。
 * 运行环境：vitest server project，DATA_DIR=data-test。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { authGate } from '../authMiddleware.ts';
import { brandingRouter } from '../brandingRouter.ts';
import { BRANDING_DIR } from '../brandingDb.ts';
import { createAccount, deleteAccount, createSession } from '../authDb.ts';
import { setSetting } from '../settingsDb.ts';

const PW = 'Brand#Test2026-aa';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
const NOT_IMAGE = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'utf8');

let server: Server;
let origin = '';
let superToken = '';
let hrToken = '';

const UA = 'Mozilla/5.0 (vitest-branding)';

async function api(method: string, pathName: string, token?: string, body?: Buffer) {
  const res = await fetch(`${origin}${pathName}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/octet-stream' } : {}),
      'User-Agent': UA,
    },
    body,
  });
  const buf = Buffer.from(await res.arrayBuffer());
  let json: unknown = null;
  try {
    json = JSON.parse(buf.toString('utf8'));
  } catch {
    /* 图片响应不是 JSON */
  }
  return { status: res.status, json, buf, contentType: res.headers.get('content-type') ?? '' };
}

beforeAll(async () => {
  const app = express();
  app.use('/api', authGate);
  app.use('/api/branding', brandingRouter);
  server = await new Promise<Server>((r) => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/branding`;

  for (const u of ['branding-super', 'branding-hr']) {
    deleteAccount(u);
  }
  createAccount({ username: 'branding-super', password: PW, systemRole: 'SUPER_ADMIN' });
  createAccount({ username: 'branding-hr', password: PW, systemRole: 'HR' });
  superToken = createSession('branding-super', '127.0.0.1', UA).token;
  hrToken = createSession('branding-hr', '127.0.0.1', UA).token;
});

afterAll(async () => {
  for (const u of ['branding-super', 'branding-hr']) {
    deleteAccount(u);
  }
  setSetting('branding', {});
  for (const f of ['background.png', 'background.jpg', 'icon.png']) {
    try {
      fs.unlinkSync(path.join(BRANDING_DIR, f));
    } catch {
      /* 未生成 */
    }
  }
  await new Promise<void>((r) => server.close(() => r()));
});

describe('品牌资源端点', () => {
  it('未登录可读状态与两个槽位（登录页需要）', async () => {
    const status = await api('GET', '');
    expect(status.status).toBe(200);
    expect(status.json).toMatchObject({ background: null, icon: null });

    const missing = await api('GET', '/background');
    // 404 = 通过了鉴权、只是还没上传；若是 401 说明公开白名单没生效
    expect(missing.status).toBe(404);
  });

  it('未登录不能写；HR 也不能写（只开超管）', async () => {
    expect((await api('POST', '/icon', undefined, PNG)).status).toBe(401);
    expect((await api('POST', '/icon', hrToken, PNG)).status).toBe(403);
    expect((await api('DELETE', '/icon', hrToken)).status).toBe(403);
  });

  it('公开白名单只含两个槽位，其它路径仍需登录', async () => {
    expect((await api('GET', '/evil')).status).toBe(401);
  });

  it('超管上传 PNG → 未登录即可取回同一段字节', async () => {
    const up = await api('POST', '/icon', superToken, PNG);
    expect(up.status).toBe(201);
    expect(up.json).toMatchObject({ success: true, type: 'image/png', url: '/api/branding/icon' });

    const got = await api('GET', '/icon');
    expect(got.status).toBe(200);
    expect(got.contentType).toBe('image/png');
    expect(got.buf.equals(PNG)).toBe(true);

    const cleared = await api('DELETE', '/icon', superToken);
    expect(cleared.status).toBe(200);
    expect((await api('GET', '/icon')).status).toBe(404);
  });

  it('非图片字节头被拒，且不在磁盘上留文件', async () => {
    const bad = await api('POST', '/background', superToken, NOT_IMAGE);
    expect(bad.status).toBe(415);
    expect(String((bad.json as { error?: string })?.error)).toContain('PNG');
    expect(fs.existsSync(path.join(BRANDING_DIR, 'background.png'))).toBe(false);
    expect(fs.existsSync(path.join(BRANDING_DIR, 'background.svg'))).toBe(false);
  });

  it('换类型上传会顶掉旧扩展名的文件', async () => {
    expect((await api('POST', '/background', superToken, PNG)).status).toBe(201);
    expect(fs.existsSync(path.join(BRANDING_DIR, 'background.png'))).toBe(true);

    expect((await api('POST', '/background', superToken, JPEG)).status).toBe(201);
    expect(fs.existsSync(path.join(BRANDING_DIR, 'background.jpg'))).toBe(true);
    expect(fs.existsSync(path.join(BRANDING_DIR, 'background.png'))).toBe(false);

    const got = await api('GET', '/background');
    expect(got.contentType).toBe('image/jpeg');

    await api('DELETE', '/background', superToken);
  });

  it('超过槽位上限直接 413，不写盘', async () => {
    const tooBig = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(1024 * 1024 + 1, 7)]);
    const res = await api('POST', '/icon', superToken, tooBig);
    expect(res.status).toBe(413);
    expect(fs.existsSync(path.join(BRANDING_DIR, 'icon.png'))).toBe(false);
  });
});
