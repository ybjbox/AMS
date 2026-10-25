/**
 * 认领页的行内校验（qa-8）。
 *
 * 原先四栏格式问题只在提交后 toast 提示，4 秒就消失；手机尾号 3 位时
 * 用户拿不到「哪一格错了」。这里盯三件事：错误落在字段下方、焦点回到第一格、
 * 改对后错误消失且内容不丢。
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ClaimAccount from '@/pages/Claim';
import { claimApi } from '@/services/claimApi';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock('@/services/claimApi', () => ({
  claimApi: { submit: vi.fn() },
}));

const submit = vi.mocked(claimApi.submit);

const fill = (label: string, value: string) => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

beforeEach(() => {
  submit.mockReset();
  submit.mockResolvedValue({ id: 'claim-1', status: 'pending' });
});

describe('认领表单行内校验', () => {
  it('空表单提交：四格各自给 helper，焦点落在第一格', () => {
    render(<MemoryRouter><ClaimAccount /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: '提交，等管理员核对' }));

    expect(screen.getByText('请填姓名')).toBeInTheDocument();
    expect(screen.getByText('请填工号，例如 EMP0012')).toBeInTheDocument();
    expect(screen.getByText('手机号后 4 位要填 4 位数字')).toBeInTheDocument();
    expect(screen.getByText(/用户名只能用字母/)).toBeInTheDocument();
    expect(screen.getByLabelText('姓名')).toHaveFocus();
    expect(submit).not.toHaveBeenCalled();
  });

  it('尾号 3 位：只标尾号，改第 4 位后 helper 消失且内容保留', () => {
    render(<MemoryRouter><ClaimAccount /></MemoryRouter>);
    fill('姓名', '何斌');
    fill('工号', 'EMP0027');
    fill('手机号后 4 位', '123');
    fill('想用的用户名', 'heming');
    fireEvent.click(screen.getByRole('button', { name: '提交，等管理员核对' }));

    const error = screen.getByText('手机号后 4 位要填 4 位数字');
    expect(error).toBeInTheDocument();
    expect(screen.getByLabelText('手机号后 4 位')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('手机号后 4 位')).toHaveFocus();
    expect(submit).not.toHaveBeenCalled();

    fill('手机号后 4 位', '1234');
    expect(screen.queryByText('手机号后 4 位要填 4 位数字')).not.toBeInTheDocument();
    expect(screen.getByLabelText('姓名')).toHaveValue('何斌');
  });

  it('用户名格式不对：提示字符范围，不把内容清空', () => {
    render(<MemoryRouter><ClaimAccount /></MemoryRouter>);
    fill('姓名', '何斌');
    fill('工号', 'EMP0027');
    fill('手机号后 4 位', '1234');
    fill('想用的用户名', 'a');
    fireEvent.click(screen.getByRole('button', { name: '提交，等管理员核对' }));

    expect(screen.getByText(/用户名只能用字母/)).toBeInTheDocument();
    expect(screen.getByLabelText('想用的用户名')).toHaveValue('a');
    expect(submit).not.toHaveBeenCalled();
  });

  it('全部合法：提交一次，进入已提交态', async () => {
    render(<MemoryRouter><ClaimAccount /></MemoryRouter>);
    fill('姓名', '何斌');
    fill('工号', 'EMP0027');
    fill('手机号后 4 位', '1234');
    fill('想用的用户名', 'heming');
    fireEvent.click(screen.getByRole('button', { name: '提交，等管理员核对' }));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit).toHaveBeenCalledWith({
      desiredUsername: 'heming',
      employeeId: 'EMP0027',
      displayName: '何斌',
      phoneTail: '1234',
      note: '',
    });
    expect(await screen.findByText('已提交，等管理员核对')).toBeInTheDocument();
  });
});
