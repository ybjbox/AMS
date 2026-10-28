import { describe, expect, it } from 'vitest';
import { notificationTarget } from '../notificationTarget';
import type { Notification } from '@/types';

const n = (refKey?: string) => ({ refKey } as Notification);

describe('notificationTarget', () => {
  it('合同提醒落到合同页并按工号筛选', () => {
    expect(notificationTarget(n('contract:EMP0027'))).toBe('/contracts?q=EMP0027');
  });

  it('试用期提醒落到员工详情', () => {
    expect(notificationTarget(n('probation:EMP0027'))).toBe('/users?detail=EMP0027');
  });

  it('没有归并键或未知类型时不给假链接', () => {
    expect(notificationTarget(n())).toBeNull();
    expect(notificationTarget(n('approval:x'))).toBeNull();
    expect(notificationTarget(n('contract:'))).toBeNull();
  });
});
