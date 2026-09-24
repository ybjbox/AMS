/**
 * 合同模板「上传」必须是真读文件（全系统检查 B1）。
 * 这条回归钉的是：载入的内容来自文件本身、空文件与超限要当场报错，
 * 以及绝不再出现"塞一段假模板还提示上传成功"的那种假功能。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

import { toast } from 'sonner';
import { ContractTemplateEditor } from '../components/ContractTemplateEditor';
import { useContractStore } from '@/store/useContractStore';

function fileInput(): HTMLInputElement {
  const el = document.querySelector('input[type="file"]') as HTMLInputElement | null;
  if (!el) throw new Error('找不到模板上传的文件输入框');
  return el;
}

function pickFile(file: File) {
  fireEvent.change(fileInput(), { target: { files: [file] } });
}

beforeEach(() => {
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.success).mockClear();
  useContractStore.setState({ template: '<p>默认 {name}</p>' });
  render(<ContractTemplateEditor isOpen onClose={() => {}} />);
});

describe('合同模板上传', () => {
  it('读的是文件真实内容，且不再出现 Mock 文案', async () => {
    pickFile(new File(['<h2>劳动合同补充页</h2><p>{name} · {department}</p>'], '模板.html', { type: 'text/html' }));
    const box = await screen.findByRole('textbox', { name: /合同模板源码/u });
    await waitFor(() => expect(box).toHaveValue('<h2>劳动合同补充页</h2><p>{name} · {department}</p>'));
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('已载入 模板.html'));
    expect(document.body.textContent).not.toMatch(/Mock/u);
  });

  it('空文件：明确报错，编辑器内容保持不变', async () => {
    pickFile(new File(['   '], 'blank.txt', { type: 'text/plain' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('空文件')));
    const box = screen.getByRole('textbox', { name: /合同模板源码/u });
    expect(box).toHaveValue('<p>默认 {name}</p>');
  });

  it('超过上限：拒绝载入并说明上限', async () => {
    const big = new File(['x'.repeat(513 * 1024)], 'big.html', { type: 'text/html' });
    pickFile(big);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('512KB')));
    expect(screen.getByRole('textbox', { name: /合同模板源码/u })).toHaveValue('<p>默认 {name}</p>');
  });
});
