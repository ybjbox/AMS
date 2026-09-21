import { describe, it, expect } from 'vitest';
import type { User } from '@/types';
import { applyPlan, serializePlan } from './plan';

const u = (id: string, name: string, over: Partial<User> = {}): User =>
  ({ id, name, department: '办公室', role: '科员', status: '在职', joinDate: '2026-01-01', ...over }) as User;

const users = [u('EMP0001', '张三'), u('EMP0002', '李四'), u('EMP0003', '王五')];

describe('座位方案序列化（第 9 批）', () => {
  it('只存工号，载入后按当前档案还原对象', () => {
    const payload = serializePlan({
      skippedNumbers: '4,14',
      tableCapacities: [
        { id: 'a', tableNumber: 1, capacity: 2 },
        { id: 'b', tableNumber: 3, capacity: 4 },
      ],
      tables: [
        { number: 1, members: [users[0], users[1]] },
        { number: 3, members: [users[2]] },
      ],
    });
    expect(JSON.stringify(payload)).not.toContain('张三');
    expect(payload.tables[0].memberIds).toEqual(['EMP0001', 'EMP0002']);

    const back = applyPlan(payload, users);
    expect(back.tables[0].members.map((m) => m.name)).toEqual(['张三', '李四']);
    expect(back.tableCapacities.map((c) => c.tableNumber)).toEqual([1, 3]);
    expect(back.skippedNumbers).toBe('4,14');
    expect(back.missing).toEqual([]);
  });

  it('员工改了姓名/部门，载入的是最新值', () => {
    const payload = serializePlan({
      skippedNumbers: '',
      tableCapacities: [{ id: 'a', tableNumber: 1, capacity: 2 }],
      tables: [{ number: 1, members: [users[0]] }],
    });
    const renamed = [u('EMP0001', '张三改', { department: '研发部' }), users[1], users[2]];
    expect(applyPlan(payload, renamed).tables[0].members[0].department).toBe('研发部');
  });

  it('被删掉的人进 missing，整桌空了就不重建这张桌', () => {
    const payload = serializePlan({
      skippedNumbers: '',
      tableCapacities: [{ id: 'a', tableNumber: 1, capacity: 2 }],
      tables: [
        { number: 1, members: [users[2]] },
        { number: 3, members: [users[0]] },
      ],
    });
    const gone = [u('EMP0003', '王五')];
    const result = applyPlan(payload, gone);
    expect(result.missing).toEqual(['EMP0001']);
    expect(result.tables.map((t) => t.number)).toEqual([1]);
  });

  it('坏数据回退默认而不是抛错', () => {
    expect(applyPlan(null, users).tables).toEqual([]);
    expect(applyPlan({} as never, users).skippedNumbers).toBe('4,14,24');
    const weird = applyPlan(
      { version: 1, skippedNumbers: '4', capacities: [{ tableNumber: 9, capacity: 0 }], tables: [{ number: 9, memberIds: null as never }] },
      users
    );
    expect(weird.tableCapacities[0].capacity).toBe(1);
    expect(weird.tables).toEqual([]);
  });
});
