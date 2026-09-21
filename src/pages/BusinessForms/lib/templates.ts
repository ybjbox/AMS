import { formatAmount, rmbUpper } from './rmb';

/**
 * 业务单内置业务模板。
 *
 * 句式取自纸质原件的实际写法（如「根据集团规章制度规定，员工父母离世可申领慰问金，…
 * 特为其申请亲属逝世慰问金：人民币501元（伍佰零壹元整）。呈上级领导批示。」），
 * 生成后正文仍可整段改写；AI 润色是可选项，只在用户点击「仅润色正文」时调用并计一次额度。
 */

export type FormKind = 'condolence' | 'wedding' | 'custom';

export interface BusinessForm {
  kind: FormKind;
  /** 申领部门 */
  department: string;
  /** 申领人姓名 */
  name: string;
  /** 单据日期 ISO yyyy-mm-dd */
  date: string;
  /** 慰问金：与员工的称谓关系 */
  relation: string;
  /** 金额（元）；0 表示不涉及金额 */
  amount: number;
  /** 正文（多段，\n 分隔） */
  body: string;
}

export interface TemplateMeta {
  kind: Exclude<FormKind, 'custom'>;
  label: string;
  /** 制度标准金额（元） */
  amount: number;
  /** 表单提示语 */
  hint: string;
  build: (f: BusinessForm) => string;
}

/** 收款信息类行首：原件中这些行不做首行缩进 */
export const PAYEE_LINE = /^(户名|帐号|账号|全称|开户行|开户银行|收款人|统一社会信用代码)\s*[:：]/u;

const PARENT_RELATIONS = ['父亲', '母亲', '公公', '婆婆', '岳父', '岳母'];

export const TEMPLATES: TemplateMeta[] = [
  {
    kind: 'condolence',
    label: '亲属逝世慰问金',
    amount: 501,
    hint: '员工父母或直系亲属过世，按制度申领慰问金 501 元',
    build: (f) => {
      const rel = f.relation.trim() || '父亲';
      const scope = PARENT_RELATIONS.includes(rel) ? '员工父母' : '员工直系亲属';
      const amountText = `人民币${formatAmount(f.amount)}元（${rmbUpper(f.amount)}）`;
      return (
        `根据集团规章制度规定，${scope}离世可申领慰问金，` +
        `${f.department.trim()}员工${f.name.trim()}，因其${rel}不幸离世，` +
        `特为其申请亲属逝世慰问金：${amountText}。\n呈上级领导批示。`
      );
    },
  },
  {
    kind: 'wedding',
    label: '员工结婚贺喜红包',
    amount: 888,
    hint: '员工登记结婚，按制度申领贺喜红包 888 元',
    build: (f) => {
      const amountText = `人民币${formatAmount(f.amount)}元（${rmbUpper(f.amount)}）`;
      return (
        `根据集团规章制度规定，员工结婚可申领贺喜红包，` +
        `${f.department.trim()}员工${f.name.trim()}，本人已登记结婚，` +
        `特为其申请结婚贺喜红包：${amountText}。\n呈上级领导批示。`
      );
    },
  },
];

export const RELATION_OPTIONS = [...PARENT_RELATIONS, '祖父', '祖母', '外祖父', '外祖母', '子女'];

export function templateOf(kind: FormKind): TemplateMeta | undefined {
  return TEMPLATES.find((t) => t.kind === kind);
}

/** 按业务类型生成初始正文（自定义类型返回空，由用户自行填写） */
export function buildBody(form: BusinessForm): string {
  const tpl = templateOf(form.kind);
  return tpl ? tpl.build(form) : '';
}

/** 日期 ISO → 原件写法「2026年 9 月 19 日」（月/日两侧留半角空格） */
export function formatDateCN(iso: string): string {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/u.exec(iso.trim());
  if (!m) return iso;
  return `${m[1]}年 ${Number(m[2])} 月 ${Number(m[3])} 日`;
}

/** 正文拆段（保留空行语义：连续换行按空段处理） */
export function splitParagraphs(body: string): string[] {
  return body.replace(/\r/gu, '').split('\n');
}

/**
 * 段落内按申领人姓名切出加粗片段（原件中员工姓名为加粗 run）。
 * 打印 HTML 与 .docx 共用，保证两种输出一致。
 */
export function segments(text: string, term: string): Array<{ text: string; bold: boolean }> {
  const needle = term.trim();
  if (!needle) return [{ text, bold: false }];
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return text
    .split(new RegExp(`(${escaped})`, 'gu'))
    .filter((s) => s !== '')
    .map((s) => ({ text: s, bold: s === needle }));
}
