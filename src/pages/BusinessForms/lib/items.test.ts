import { describe, it, expect } from 'vitest';
import { duplicateAsNew, formOf, newItem, patchItem, setItemKind, syncBody } from './items';
import { TEMPLATES } from './templates';

describe('业务单条目模型', () => {
  it('新条目：当天日期 + 制度标准金额，没填申领人前不硬编正文', () => {
    const item = newItem();
    expect(item.kind).toBe('condolence');
    expect(item.amount).toBe(TEMPLATES[0].amount);
    expect(item.date).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
    expect(item.body).toBe('');
    expect(item.bodyEdited).toBe(false);
    expect(item.locked).toBe(false);
    expect(item.id).toBeTruthy();
  });

  it('两条新条目的 id 不撞（React key 与字段定位都靠它）', () => {
    expect(new Set([newItem().id, newItem().id, newItem().id]).size).toBe(3);
  });

  it('填了申领人才按模板生成正文，之后改字段仍跟着重建', () => {
    const a = patchItem(newItem(), { name: '杨新宇' });
    expect(a.body).toContain('杨新宇');
    expect(a.body).toContain('慰问金');
    const b = patchItem(a, { department: '财务部' });
    expect(b.body).toContain('财务部');
    expect(b.body).not.toContain('集团办公室');
  });

  it('正文一被手打就定稿，模板不再回头覆盖', () => {
    const a = patchItem(newItem(), { name: '杨新宇' });
    const edited = patchItem(a, { body: '自己写的申请事由' });
    expect(edited.bodyEdited).toBe(true);
    const later = patchItem(edited, { amount: 999 });
    expect(later.body).toBe('自己写的申请事由');
    // 「恢复模板原文」把这条规则关掉
    expect(syncBody({ ...later, body: '', bodyEdited: false }).body).toContain('999');
  });

  it('换业务类型：金额跟定制度的标准，正文回到模板口径', () => {
    const wedding = setItemKind(patchItem(newItem(), { name: '杨新宇' }), 'wedding');
    expect(wedding.amount).toBe(888);
    expect(wedding.body).toContain('结婚贺喜红包');
    expect(wedding.body).toContain('杨新宇');
    // 自定义类型没有标准金额，保留原值由人自己改
    expect(setItemKind(wedding, 'custom').amount).toBe(888);
  });

  it('「沿用新增」抄走类型/金额/部门/日期，清空申领人与正文', () => {
    const src = patchItem(newItem({ department: '集团办公室' }), { name: '杨新宇' });
    const copy = duplicateAsNew(src);
    expect(copy.id).not.toBe(src.id);
    expect(copy.department).toBe('集团办公室');
    expect(copy.kind).toBe(src.kind);
    expect(copy.amount).toBe(src.amount);
    expect(copy.date).toBe(src.date);
    expect(copy.name).toBe('');
    expect(copy.body).toBe('');
    expect(copy.bodyEdited).toBe(false);
    // 深链带来的锁定不该被复制传播到新一条
    expect(duplicateAsNew({ ...src, locked: true }).locked).toBe(false);
  });

  it('seed 带正文时视为已定稿（归档回读、草稿恢复都靠这条）', () => {
    const seeded = newItem({ body: '从档案里读回来的正文' });
    expect(seeded.body).toBe('从档案里读回来的正文');
    expect(seeded.bodyEdited).toBe(true);
    expect(patchItem(seeded, { name: '杨新宇' }).body).toBe('从档案里读回来的正文');
  });

  it('formOf 只留版面字段，条目自身的 id/标记不混进排版判定', () => {
    const item = newItem({ name: '杨新宇', department: '集团办公室' });
    expect(Object.keys(formOf(item)).sort()).toEqual(
      ['amount', 'body', 'date', 'department', 'kind', 'name', 'relation'].sort()
    );
  });
});
