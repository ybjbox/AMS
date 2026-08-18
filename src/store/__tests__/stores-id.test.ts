import { describe, it, expect } from 'vitest';
import { genId } from '../../utils/id';

// 前端 store 在 P2-7 已改为后端驱动（ID 由服务端生成，跨设备同步）。
// 此处只验证 P2-6 的核心修复：ID 生成策略已从 Math.random().toString(36) 换成
// 标准 uuid（安全上下文 crypto.randomUUID，非安全上下文回退串也保证唯一）。
// store 的异步创建/同步行为由 scripts/verify-todos.ts 的端到端回归覆盖。
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('ID 生成（P2-6：替换 Math.random 碰撞风险 → 标准 uuid）', () => {
  it('genId 返回非空字符串', () => {
    const id = genId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('安全上下文下为标准 uuid v4 格式（而非旧的 11 位 base36）', () => {
    expect(genId()).toMatch(UUID_V4_RE);
    expect(genId()).toMatch(UUID_V4_RE);
  });

  it('连续 1000 次生成无碰撞', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(genId());
    expect(ids.size).toBe(1000);
  });
});
