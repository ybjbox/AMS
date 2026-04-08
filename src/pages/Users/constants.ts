import { User } from '../../types';

export interface ExportColumn {
  key: keyof User | string;
  label: string;
  selected: boolean;
}

export interface ExportTheme {
  id: string;
  name: string;
  titleFill: string;
  headerFill: string;
  headerFontColor: string;
  zebraFill: string;
}

export interface ExportScript {
  id: string;
  name: string;
  code: string;
}

export const TABLE_STYLE: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' };
export const TD_DEPT_STYLE: React.CSSProperties = { verticalAlign: 'middle', textAlign: 'center' };
export const DEPT_COUNT_STYLE: React.CSSProperties = { fontSize: '0.75rem', color: '#64748b', marginTop: '2px' };
export const TD_CENTER_STYLE: React.CSSProperties = { textAlign: 'center' };

export const DEFAULT_ROSTER_COLUMNS: ExportColumn[] = [
  { key: 'id', label: '工号', selected: true },
  { key: 'name', label: '姓名', selected: true },
  { key: 'department', label: '部门', selected: true },
  { key: 'role', label: '职位', selected: true },
  { key: 'status', label: '状态', selected: true },
  { key: 'phone', label: '联系电话', selected: true },
  { key: 'gender', label: '性别', selected: false },
  { key: 'age', label: '年龄', selected: false },
  { key: 'joinDate', label: '入职时间', selected: true },
  { key: 'yearsOfService', label: '工龄', selected: false },
  { key: 'employmentType', label: '用工形式', selected: false },
  { key: 'contractExpiry', label: '合同到期', selected: true },
];

export const DEFAULT_ADDRESS_BOOK_COLUMNS: ExportColumn[] = [
  { key: 'name', label: '姓名', selected: true },
  { key: 'department', label: '部门', selected: true },
  { key: 'role', label: '职位', selected: true },
  { key: 'phone', label: '联系电话', selected: true },
  { key: 'id', label: '工号', selected: false },
  { key: 'gender', label: '性别', selected: false },
  { key: 'status', label: '状态', selected: false },
];
