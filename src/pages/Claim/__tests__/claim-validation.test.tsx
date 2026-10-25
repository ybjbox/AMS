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
  claimApi: { submit: vi.fn(), lookup: vi.fn() },
}));

const submit = vi.mocked(claimApi.submit);
const lookup = vi.mocked(claimApi.lookup);

const fill = (label: string, value: string) => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

beforeEach(() => {
  submit.mockReset();
  submit.mockResolvedValue({ id: 'claim-1', status: 'pending' });
  lookup.mockReset();
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

describe('认领进度查询（qa-3）', () => {
  const openAndQuery = (displayName: string, phoneTail: string) => {
    render(<MemoryRouter><ClaimAccount /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /查询进度/ }));
    fill('姓名', displayName);
    fill('手机号后 4 位', phoneTail);
    fireEvent.click(screen.getByRole('button', { name: '查询' }));
  };

  it('待核对：显示申请时间与下一步，不回显口令', async () => {
    lookup.mockResolvedValue({
      status: 'pending',
      desiredUsername: 'hebing',
      createdAt: '2026-10-25 10:00:00',
      reviewedAt: null,
      rejectReason: '',
      accountOpened: false,
    });
    openAndQuery('何斌', '1234');

    expect(await screen.findByText('还在等管理员核对')).toBeInTheDocument();
    expect(lookup).toHaveBeenCalledWith({ displayName: '何斌', phoneTail: '1234' });
    expect(screen.queryByText(/^一次性口令/)).not.toBeInTheDocument();
  });

  it('未通过：显示驳回原因，可带着原姓名回到表单重提', async () => {
    lookup.mockResolvedValue({
      status: 'rejected',
      desiredUsername: 'hebing',
      createdAt: '2026-10-20 09:00:00',
      reviewedAt: '2026-10-21 14:00:00',
      rejectReason: '工号与手机尾号对不上',
      accountOpened: false,
    });
    openAndQuery('何斌', '1234');

    expect(await screen.findByText('申请未通过')).toBeInTheDocument();
    expect(screen.getByText('工号与手机尾号对不上')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新提交申请' }));

    expect(screen.getByRole('button', { name: '提交，等管理员核对' })).toBeInTheDocument();
    expect(screen.getByLabelText('姓名')).toHaveValue('何斌');
    expect(screen.getByLabelText('手机号后 4 位')).toHaveValue('1234');
    expect(screen.getByLabelText('想用的用户名')).toHaveValue('hebing');
  });

  it('查不到：给同一条提示，不区分姓名错还是尾号错', async () => {
    lookup.mockRejectedValue({ error: '没有查到对应的申请，请核对姓名和手机号后 4 位' });
    openAndQuery('何斌', '0000');

    expect(await screen.findByRole('alert')).toHaveTextContent('没有查到对应的申请');
  });

  it('已开通：显示用户名与去登录入口', async () => {
    lookup.mockResolvedValue({
      status: 'approved',
      desiredUsername: 'hebing',
      createdAt: '2026-10-20 09:00:00',
      reviewedAt: '2026-10-21 14:00:00',
      rejectReason: '',
      accountOpened: true,
    });
    openAndQuery('何斌', '1234');

    expect(await screen.findByText('账号已开通')).toBeInTheDocument();
    expect(screen.getByText('hebing')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '去登录' })).toHaveAttribute('href', '/login');
  });
});
