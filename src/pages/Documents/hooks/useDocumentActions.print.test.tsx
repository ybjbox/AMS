import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfirmProvider } from '@/hooks/useConfirm';
import { useDocumentStore } from '@/store/useDocumentStore';
import { documentApi } from '@/services/documentApi';
import { printInIframe } from '@/utils/printWindow';
import type { PrintPart } from '@/types/document';
import { useDocumentActions } from './useDocumentActions';

vi.mock('@/services/documentApi', () => ({
  documentApi: { getPrintPart: vi.fn() },
}));
vi.mock('@/utils/printWindow', () => ({
  printInIframe: vi.fn(() => Promise.resolve()),
  printInWindow: vi.fn(() => true),
}));

const getPrintPartMock = vi.mocked(documentApi.getPrintPart);
const printInIframeMock = vi.mocked(printInIframe);

const TXT: PrintPart = {
  documentId: 'd1',
  name: '考勤制度.txt',
  kind: 'text',
  text: '第一条 工作时间为 09:00。',
  truncated: false,
};
const ZIP: PrintPart = {
  documentId: 'd2',
  name: '素材包.zip',
  kind: 'unsupported',
  note: '暂不支持 .zip 类型的在线打印，请下载后本地打印',
};

function wrapper({ children }: { children: React.ReactNode }) {
  return <ConfirmProvider>{children}</ConfirmProvider>;
}

beforeEach(() => {
  getPrintPartMock.mockReset();
  printInIframeMock.mockReset();
  useDocumentStore.setState({
    documents: [
      { id: 'd1', name: '考勤制度.txt', type: 'txt', url: '/api/files/d1', size: 10, uploadedAt: '2026-09-21', folderId: null },
      { id: 'd2', name: '素材包.zip', type: 'zip', url: '/api/files/d2', size: 10, uploadedAt: '2026-09-21', folderId: null },
    ],
    folders: [],
    sets: [],
  } as never);
});

describe('handlePrintSet（第 7 批：真内容打包打印）', () => {
  it('逐份取片段后把合成版面交给打印内核，份数/灰度/原因都落在 HTML 里', async () => {
    getPrintPartMock.mockImplementation((id: string) =>
      Promise.resolve(id === 'd1' ? TXT : ZIP)
    );
    const { result } = renderHook(() => useDocumentActions(), { wrapper });

    act(() => {
      result.current.setPrintingSet({
        id: 's1',
        name: '入职材料',
        description: '',
        documentIds: ['d1', 'd2'],
        printSettings: {
          d1: { duplex: true, color: false, copies: 2 },
          d2: { duplex: false, color: true, copies: 1 },
        },
      } as never);
    });

    await act(async () => {
      await result.current.handlePrintSet();
    });

    expect(getPrintPartMock).toHaveBeenCalledTimes(2);
    expect(printInIframeMock).toHaveBeenCalledTimes(1);
    const html = printInIframeMock.mock.calls[0][0];
    expect(html).toContain('第一条 工作时间为 09:00。');
    expect(html).toContain('第 1/2 份');
    expect(html).toContain('dp-doc dp-mono');
    expect(html).toContain('@page :left');
    expect(html).toContain('暂不支持 .zip');
    // 旧实现印的是这张占位纸，回归守卫
    expect(html).not.toContain('实际打印时将输出文件真实内容');
    expect(result.current.isPrinting).toBe(false);
  });

  it('全部内容都取不到时不送打印，避免出白页', async () => {
    getPrintPartMock.mockImplementation((id: string) =>
      Promise.resolve(id === 'd1' ? ZIP : { ...ZIP, documentId: 'd2', note: '暂不支持 .zip' })
    );
    const { result } = renderHook(() => useDocumentActions(), { wrapper });

    act(() => {
      result.current.setPrintingSet({
        id: 's2',
        name: '只有压缩包',
        description: '',
        documentIds: ['d1', 'd2'],
        printSettings: {},
      } as never);
    });

    await act(async () => {
      await result.current.handlePrintSet();
    });

    expect(printInIframeMock).not.toHaveBeenCalled();
    expect(result.current.isPrinting).toBe(false);
  });
});
