/**
 * #15 通知出站通道：载荷格式 / 掩码合并 / 派发容错。
 * 不依赖真实外部服务：fetch 用 vi.stubGlobal 模拟。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildWebhookPayload, sendWebhook, sendOutbound } from '../notifyDispatch.ts';
import {
  defaultNotifyConfig,
  mergeNotifyConfig,
  maskedNotifyConfig,
  maskSecret,
  setNotifyConfig,
  getNotifyConfig,
  MASK_SENTINEL,
  CLEAR_SENTINEL,
} from '../notifyDb.ts';

describe('webhook 载荷格式', () => {
  it('钉钉/企微用 text.content，飞书用 content.text，通用用 { text }', () => {
    expect(buildWebhookPayload('dingtalk', 'hi')).toEqual({ msgtype: 'text', text: { content: 'hi' } });
    expect(buildWebhookPayload('wecom', 'hi')).toEqual({ msgtype: 'text', text: { content: 'hi' } });
    expect(buildWebhookPayload('feishu', 'hi')).toEqual({ msg_type: 'text', content: { text: 'hi' } });
    expect(buildWebhookPayload('generic', 'hi')).toEqual({ text: 'hi' });
  });
});

describe('sendWebhook 容错', () => {
  afterEach(() => vi.unstubAllGlobals());

  const cfg = { enabled: true, url: 'https://example.com/hook', format: 'dingtalk' as const };

  it('HTTP 200 且无错误码 → 成功（null）', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '{"errcode":0}' });
    vi.stubGlobal('fetch', fetchMock);
    await expect(sendWebhook(cfg, { title: 't', message: 'm', type: 'info', recipient: 'u' })).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('HTTP 200 但机器人返回 errcode≠0 → 记为失败', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '{"errcode":310000}' }));
    await expect(sendWebhook(cfg, { title: 't', message: 'm', type: 'info', recipient: 'u' })).resolves.toContain('310000');
  });

  it('网络异常被收敛为失败字符串，不抛出', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await expect(sendWebhook(cfg, { title: 't', message: 'm', type: 'info', recipient: 'u' })).resolves.toContain('ECONNREFUSED');
  });

  it('通道未启用 → 直接跳过', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      sendWebhook({ ...cfg, enabled: false }, { title: 't', message: 'm', type: 'info', recipient: 'u' })
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sendOutbound 两通道都关闭时零副作用', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const r = await sendOutbound(defaultNotifyConfig(), { title: 't', message: 'm', type: 'info', recipient: 'u' });
    expect(r).toEqual({ webhook: null, email: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('配置掩码与合并', () => {
  it('maskSecret 保留头尾、短串全掩码', () => {
    const masked = maskSecret('https://oapi.dingtalk.com/robot/send?access_token=abc123');
    expect(masked).toContain(MASK_SENTINEL);
    expect(masked).not.toContain('access_token=abc123');
    expect(maskSecret('short')).toBe(MASK_SENTINEL);
    expect(maskSecret('')).toBe('');
  });

  it('回传掩码串 = 保持原凭据；回传新值 = 覆盖', () => {
    setNotifyConfig({
      webhook: { enabled: true, url: 'https://old.hook/token=secret123456', format: 'generic' },
      email: { enabled: false, host: 'h', port: 25, secure: false, user: 'u', password: 'p@ss', from: 'f' },
    });
    const merged = mergeNotifyConfig({
      webhook: { enabled: true, url: MASK_SENTINEL, format: 'wecom' },
      email: { enabled: true, host: 'h2', port: 465, secure: true, user: 'u2', password: MASK_SENTINEL, from: 'f2' },
    });
    expect(merged.webhook.url).toBe('https://old.hook/token=secret123456');
    expect(merged.webhook.format).toBe('wecom');
    expect(merged.email.password).toBe('p@ss');
    expect(merged.email.host).toBe('h2');
    // 非法 format 回退到当前存储值（上一步 setNotifyConfig 存的是 generic；merge 结果未回存）
    expect(mergeNotifyConfig({ webhook: { enabled: true, url: 'x', format: 'sms' as never } }).webhook.format).toBe('generic');
  });

  it('回传 CLEAR_SENTINEL = 显式清空已存凭据（空串/掩码仍表示保持）', () => {
    setNotifyConfig({
      webhook: { enabled: true, url: 'https://old.hook/token=secret123456', format: 'generic' },
      email: { enabled: false, host: 'h', port: 25, secure: false, user: 'u', password: 'p@ss', from: 'f' },
    });
    // 空串 = 保持（旧语义不变）
    expect(mergeNotifyConfig({ webhook: { enabled: true, url: '', format: 'generic' } }).webhook.url).toBe(
      'https://old.hook/token=secret123456',
    );
    // 显式清除
    const cleared = mergeNotifyConfig({
      webhook: { enabled: false, url: CLEAR_SENTINEL, format: 'generic' },
      email: { enabled: false, host: 'h', port: 25, secure: false, user: 'u', password: CLEAR_SENTINEL, from: 'f' },
    });
    expect(cleared.webhook.url).toBe('');
    expect(cleared.email.password).toBe('');
  });

  it('GET 面板视图不含任何明文凭据', () => {
    setNotifyConfig({
      webhook: { enabled: true, url: 'https://hook.example.com/abcdef0123456789', format: 'generic' },
      email: defaultNotifyConfig().email,
    });
    const masked = maskedNotifyConfig();
    expect(masked.webhook.url).not.toContain('abcdef0123456789');
    expect(getNotifyConfig().webhook.url).toContain('abcdef0123456789');
  });
});
