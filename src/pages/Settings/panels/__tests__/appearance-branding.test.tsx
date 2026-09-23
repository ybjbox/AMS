import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AppearancePanel from '@/pages/Settings/panels/AppearancePanel';
import { brandingApi } from '@/services/brandingApi';
import { useAppSettings } from '@/store/appSettings';

/**
 * 旧版本把整张图编成 base64 存在本机 localStorage（撑配额、且只在这台浏览器生效）。
 * 这里钉住两件事：打开面板时把这类残留自动上传到服务器并换成地址；
 * 「恢复默认」真的会调服务端删除而不是只清本地。
 */
vi.mock('@/services/brandingApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/brandingApi')>()),
  brandingApi: {
    status: vi.fn(),
    upload: vi.fn(),
    remove: vi.fn(),
  },
}));

const statusMock = vi.mocked(brandingApi.status);
const uploadMock = vi.mocked(brandingApi.upload);
const removeMock = vi.mocked(brandingApi.remove);

const LEGACY = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

beforeEach(() => {
  statusMock.mockReset();
  uploadMock.mockReset();
  removeMock.mockReset();
  useAppSettings.getState().applyBranding({ background: null, icon: null });
});

describe('外观设置图片迁移与恢复默认', () => {
  it('本机残留的 data URL 会被自动上传并换成服务端地址', async () => {
    // fetch 用于把 data URL 转成 Blob（dataUrlToFile）
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['x'], { type: 'image/png'}))));
    statusMock.mockResolvedValue({ background: null, icon: null });
    uploadMock.mockResolvedValue({ success: true, url: '/api/branding/background', type: 'image/png', size: 1 });
    useAppSettings.getState().applyBranding({ background: LEGACY, icon: null });

    render(<AppearancePanel />);

    await waitFor(() => expect(uploadMock).toHaveBeenCalledTimes(1));
    expect(uploadMock.mock.calls[0][0]).toBe('background');
    await waitFor(() =>
      expect(useAppSettings.getState().loginBackground).toBe('/api/branding/background')
    );
    vi.unstubAllGlobals();
  });

  it('服务端已有更新的图时，本机旧值直接让位，不重复上传', async () => {
    statusMock.mockResolvedValue({
      background: { url: '/api/branding/background', updatedAt: 'x', size: 2, type: 'image/png' },
      icon: null,
    });
    useAppSettings.getState().applyBranding({ background: LEGACY, icon: null });

    render(<AppearancePanel />);

    await waitFor(() => expect(useAppSettings.getState().loginBackground).toBe('/api/branding/background'));
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('恢复默认会请求服务端删除并清空本地值', async () => {
    statusMock.mockResolvedValue({ background: null, icon: null });
    useAppSettings.getState().applyBranding({ background: '/api/branding/background', icon: null });

    render(<AppearancePanel />);

    fireEvent.click(await screen.findByRole('button', { name: '恢复默认' }));
    await waitFor(() => expect(removeMock).toHaveBeenCalledWith('background'));
    await waitFor(() => expect(useAppSettings.getState().loginBackground).toBeNull());
  });
});
