/**
 * 报错文案回归（用户可读性）。
 *
 * 这层改的是「报错甩到界面上长什么样」，原先有三处真问题：
 *  1. `formatZodError` 把 zod 的英文键拼在前面 → 界面出现 `employeeName: 排班缺少姓名`；
 *  2. 文件夹 / 文档套件的必填提示直接写死英文 `"name is required"`；
 *  3. 对话接口报 `"messages 不能为空"`，把内部字段名甩给用户。
 *
 * 这里逐条钉死：英文键一律不外泄、必填提示是中文、字段名用界面上的那个词，
 * 且不重复拼接（`姓名：排班缺少姓名` 这种啰嗦串也要挡住）。
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  formatZodError,
  folderCreateSchema,
  documentSetCreateSchema,
  chatMessagesSchema,
  deptShiftRuleSchema,
} from '../validation.ts';

/** 跑一次 schema 并把错误交给 formatZodError —— 与 validateBody 的真实链路一致。 */
function messageFor(schema: z.ZodTypeAny, value: unknown): string {
  const r = schema.safeParse(value);
  if (r.success) throw new Error('预期校验失败，却通过了');
  return formatZodError(r.error);
}

describe('formatZodError：报错只说人话', () => {
  it('英文键不再出现在报错里（原先是 employeeName: 排班缺少姓名）', () => {
    const s = z.object({ employeeName: z.string({ error: '排班缺少姓名' }).min(1, '排班缺少姓名') });
    const msg = messageFor(s, {});
    expect(msg).not.toMatch(/employeeName/);
    expect(msg).toContain('排班缺少姓名');
  });

  it('消息本身已点名时不再重复拼字段名（不要「名称：名称不能为空」）', () => {
    const s = z.object({ name: z.string({ error: '名称不能为空' }).min(1, '名称不能为空') });
    expect(messageFor(s, {})).toBe('名称不能为空');
  });

  it('消息没点名时才补中文标签，且标签用界面上的词', () => {
    const s = z.object({ employeeId: z.string({ error: '必须是字符串' }) });
    const msg = messageFor(s, {});
    expect(msg).toBe('员工编号：必须是字符串');
    expect(msg).not.toMatch(/employeeId/);
  });

  it('表里没有的英文键直接不暴露，宁可少一层上下文', () => {
    const s = z.object({ someInternalThing: z.string({ error: '必须是字符串' }) });
    const msg = messageFor(s, {});
    expect(msg).toBe('必须是字符串');
    expect(msg).not.toContain('someInternalThing');
  });

  it('多个错误用「；」连接，最多显示 5 条', () => {
    const s = z.object({
      a1: z.string({ error: '一' }),
      a2: z.string({ error: '二' }),
      a3: z.string({ error: '三' }),
      a4: z.string({ error: '四' }),
      a5: z.string({ error: '五' }),
      a6: z.string({ error: '六' }),
    });
    expect(messageFor(s, {}).split('；')).toHaveLength(5);
  });
});

describe('必填提示已是中文（原先漏英文）', () => {
  it('文件夹名称', () => {
    expect(messageFor(folderCreateSchema, {})).toBe('文件夹名称不能为空');
  });

  it('文档套件名称', () => {
    expect(messageFor(documentSetCreateSchema, {})).toBe('文档套件名称不能为空');
  });

  it('聊天接口不甩 messages 字段名', () => {
    const msg = messageFor(chatMessagesSchema, { messages: [] });
    expect(msg).toBe('请至少发一条消息');
    expect(msg).not.toContain('messages');
  });
});

describe('考勤时段字段的提示可读', () => {
  it('工作日越界时说清 1~7 分别是什么', () => {
    const msg = messageFor(deptShiftRuleSchema, {
      departmentId: 'D1',
      name: '早班',
      startTime: '08:00',
      endTime: '16:00',
      workdays: [9],
    });
    expect(msg).toContain('1=周一');
    expect(msg).not.toMatch(/workdays/);
  });

  it('加班余量上限标出等值小时数', () => {
    const msg = messageFor(deptShiftRuleSchema, {
      departmentId: 'D1',
      name: '早班',
      startTime: '08:00',
      endTime: '16:00',
      workdays: [1],
      overtimeGraceMinutes: 9999,
    });
    expect(msg).toContain('12 小时');
  });
});