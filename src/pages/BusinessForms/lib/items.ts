/**
 * 业务单条目模型：一次可以开多条（每人一张单据），条目之间字段互不相干。
 *
 * 放在这里而不是散进组件，是因为"正文跟着模板走、被手工改过就不再覆盖"这条规则
 * 同时被新增、改字段、换类型、沿用此条四个入口共用 —— 写在组件里就会有四份略有出入的版本。
 */
import { RELATION_OPTIONS, buildBody, templateOf, type BusinessForm, type FormKind } from './templates';

export interface BusinessFormItem extends BusinessForm {
  id: string;
  /** 正文被手工改过或 AI 润色过：不再被模板覆盖（可用「恢复模板原文」重置） */
  bodyEdited: boolean;
  /** 深链（从员工档案「生成业务单」进来）的那一条锁定申领人，与档案保持一致 */
  locked: boolean;
}

export function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const newId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `bf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** 新条目：类型决定默认金额，正文等填了申领人再按模板生成 */
export function newItem(seed: Partial<BusinessForm> & { locked?: boolean } = {}): BusinessFormItem {
  const kind = (seed.kind ?? 'condolence') as FormKind;
  const tpl = templateOf(kind);
  const item: BusinessFormItem = {
    id: newId(),
    kind,
    department: seed.department ?? '',
    name: seed.name ?? '',
    relation: seed.relation ?? RELATION_OPTIONS[0],
    date: seed.date ?? todayISO(),
    amount: seed.amount ?? tpl?.amount ?? 0,
    body: seed.body ?? '',
    bodyEdited: seed.body != null && seed.body !== '',
    locked: seed.locked ?? false,
  };
  return syncBody(item);
}

/** 未手工编辑过正文时，正文跟着业务类型/人员/金额重建（原件就是这套句式） */
export function syncBody(item: BusinessFormItem): BusinessFormItem {
  if (item.bodyEdited || !item.name.trim()) return item;
  return { ...item, body: buildBody(item) };
}

export function patchItem(item: BusinessFormItem, patch: Partial<BusinessForm>): BusinessFormItem {
  const next = { ...item, ...patch };
  // 正文一被手打就视为定稿，模板不再回头覆盖
  if (patch.body != null) return { ...next, bodyEdited: true };
  return syncBody(next);
}

/** 换业务类型：金额跟定制度标准，正文回到模板口径 */
export function setItemKind(item: BusinessFormItem, kind: FormKind): BusinessFormItem {
  const tpl = templateOf(kind);
  return syncBody({ ...item, kind, amount: tpl?.amount ?? item.amount, bodyEdited: false });
}

/** 「沿用此条新增」：类型/金额/部门/日期/关系照抄，申领人与正文留空重写 */
export function duplicateAsNew(item: BusinessFormItem): BusinessFormItem {
  return { ...item, id: newId(), name: '', body: '', bodyEdited: false, locked: false };
}

/** 打印/导出只要版面字段，条目自身的 id 等不该混进版面判定 */
export function formOf(item: BusinessFormItem): BusinessForm {
  const { kind, department, name, date, relation, amount, body } = item;
  return { kind, department, name, date, relation, amount, body };
}
