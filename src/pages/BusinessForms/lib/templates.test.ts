import { describe, it, expect } from 'vitest';
import { LAYOUT, FORM_ROWS, cellWidth, dateLine } from './layout';
import {
  PAYEE_LINE,
  TEMPLATES,
  buildBody,
  formatDateCN,
  segments,
  type BusinessForm,
} from './templates';

const base: BusinessForm = {
  kind: 'condolence',
  department: '集团办公室',
  name: '林思婷',
  date: '2026-08-24',
  relation: '父亲',
  amount: 501,
  body: '',
};

describe('版面几何（取自原件 OOXML）', () => {
  it('每行单元格宽度之和等于表格总宽，且与六列网格一致', () => {
    const gridSum = LAYOUT.grid.reduce((a, b) => a + b, 0);
    expect(gridSum).toBe(LAYOUT.tableW);
    FORM_ROWS.forEach((row, ri) => {
      const sum = row.cells.reduce((a, _c, ci) => a + cellWidth(ri, ci), 0);
      expect(sum).toBe(LAYOUT.tableW);
    });
  });

  it('栏目标签与原件逐字一致', () => {
    const labels = FORM_ROWS.flatMap((r) => r.cells).filter((c) => c.label).map((c) => c.label);
    expect(labels).toEqual([
      '部 门',
      '姓 名',
      '需办理的业务',
      '部门主管签名',
      '财务主管签名',
      '总经理批示',
      '董事长批示',
    ]);
  });

  it('日期行用前导空格推到表格右上角（原件实测 55 格）', () => {
    expect(dateLine('2026年 8 月 24 日').match(/^ +/u)?.[0]).toHaveLength(55);
    // 更长的日期自动少补空格，右边界保持同一基线
    expect(dateLine('2026年 12 月 31 日').match(/^ +/u)?.[0]).toHaveLength(54);
  });
});

describe('内置业务模板', () => {
  it('亲属逝世慰问金：句式、金额与大写、呈批语', () => {
    const body = buildBody(base);
    expect(body).toBe(
      '根据集团规章制度规定，员工父母离世可申领慰问金，集团办公室员工林思婷，因其父亲不幸离世，' +
        '特为其申请亲属逝世慰问金：人民币501元（伍佰零壹元整）。\n呈上级领导批示。'
    );
  });

  it('非父母直系亲属改按「员工直系亲属」表述', () => {
    expect(buildBody({ ...base, relation: '子女' })).toContain('员工直系亲属离世可申领慰问金');
  });

  it('结婚贺喜红包：888 元 / 捌佰捌拾捌元整', () => {
    const tpl = TEMPLATES.find((t) => t.kind === 'wedding')!;
    expect(tpl.amount).toBe(888);
    const body = buildBody({ ...base, kind: 'wedding', amount: 888 });
    expect(body).toContain('员工结婚可申领贺喜红包');
    expect(body).toContain('人民币888元（捌佰捌拾捌元整）');
    expect(body.endsWith('\n呈上级领导批示。')).toBe(true);
  });

  it('自定义业务不预生成正文', () => {
    expect(buildBody({ ...base, kind: 'custom' })).toBe('');
  });
});

describe('正文辅助', () => {
  it('日期按原件写法留半角空格', () => {
    expect(formatDateCN('2026-08-24')).toBe('2026年 8 月 24 日');
    expect(formatDateCN('2026/08/24')).toBe('2026/08/24');
  });

  it('收款信息行不做首行缩进', () => {
    for (const line of ['户名：某某单位', '帐号：771900259310666', '开户银行：招商银行', '全称：某某服务部']) {
      expect(PAYEE_LINE.test(line)).toBe(true);
    }
    expect(PAYEE_LINE.test('根据集团规章制度规定……')).toBe(false);
  });

  it('姓名在段落内切成加粗片段', () => {
    expect(segments('员工林思婷，因其父亲', '林思婷')).toEqual([
      { text: '员工', bold: false },
      { text: '林思婷', bold: true },
      { text: '，因其父亲', bold: false },
    ]);
    expect(segments('无姓名', '')).toEqual([{ text: '无姓名', bold: false }]);
  });
});
