/**
 * 客户端 Excel 解析工具（基于已安装的 xlsx 库）
 *
 * 用于把上传的 .xls/.xlsx 文件真正解析为结构化数据，替代原先「忽略文件内容、塞演示数据」的空壳逻辑。
 * 列名支持中英文别名（不区分大小写），缺失列回退为默认值。
 */
import * as XLSX from 'xlsx';
import { User } from '@/types';
import { PunchRecord } from '@/store/useAttendanceStore';

type Row = Record<string, unknown>;

/** 读取首个工作表，返回对象数组（键为表头，空单元格为 ''） */
async function readFirstSheet(file: File): Promise<Row[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return [];
  const ws = wb.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json<Row>(ws, { defval: '', raw: false });
}

/** 在一行里按别名找第一个命中的值（表头大小写不敏感） */
function pick(row: Row, aliases: string[]): unknown {
  const lower = aliases.map((a) => a.toLowerCase());
  for (const key of Object.keys(row)) {
    if (lower.includes(key.toLowerCase())) return row[key];
  }
  return undefined;
}

function str(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

/** Excel 序列值 / 字符串 -> YYYY-MM-DD */
function normalizeDate(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'number') {
    // Excel 序列值按 UTC 计算，避免时区偏移
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
  }
  const s = str(v);
  const m = s.match(/(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    // 直接拼接，不经过本地时区的 Date，避免 GMT+8 下少一天
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
}

/** Excel 序列值 / 字符串 -> HH:mm:ss */
function normalizeTime(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'number') {
    const total = Math.round(v * 86400);
    const h = Math.floor(total / 3600) % 24;
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
  }
  const s = str(v);
  const m = s.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
  if (m) {
    const h = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    const ss = (m[3] || '00').padStart(2, '0');
    return `${h}:${mm}:${ss}`;
  }
  return s;
}

const NAME_KEYS = ['姓名', '名字', '员工姓名', 'name'];
const DEPT_KEYS = ['部门', '部门名称', 'name of department', 'department', 'dept'];
const ROLE_KEYS = ['岗位', '职位', '职务', 'role', 'title'];
const ID_KEYS = ['工号', '编号', '员工编号', 'employeeid', 'employee_id', 'id', 'userid'];
const STATUS_KEYS = ['状态', 'status'];

/** 解析员工名单（座位 / 名片上传）：返回 User[]，过滤掉无姓名行 */
export async function parseExcelToUsers(file: File): Promise<User[]> {
  const rows = await readFirstSheet(file);
  return rows
    .map((row, i): User => {
      const name = str(pick(row, NAME_KEYS));
      const department = str(pick(row, DEPT_KEYS));
      const role = str(pick(row, ROLE_KEYS));
      const id = str(pick(row, ID_KEYS)) || `uploaded-${Date.now()}-${i}`;
      const status = (str(pick(row, STATUS_KEYS)) || '在职') as User['status'];
      return { id, name, department, role, status } as User;
    })
    .filter((u) => u.name);
}

const PUNCH_EMPID_KEYS = ['工号', '编号', '员工编号', 'employeeid', 'employee_id', 'userid', 'user_id', 'id'];
const PUNCH_NAME_KEYS = ['姓名', '名字', '员工姓名', 'name', 'employeename'];
const PUNCH_DATE_KEYS = ['日期', '打卡日期', 'date', 'day'];
const PUNCH_TIME_KEYS = ['时间', '打卡时间', 'time', 'clockin', '签到时间', '上班时间', 'clockout', '签退时间'];

/** 解析打卡记录（考勤上传）：返回 PunchRecord[]，跳过缺日期或时间的行 */
export async function parseExcelToPunchRecords(file: File): Promise<PunchRecord[]> {
  const rows = await readFirstSheet(file);
  const result: PunchRecord[] = [];
  rows.forEach((row, i) => {
    const date = normalizeDate(pick(row, PUNCH_DATE_KEYS));
    const time = normalizeTime(pick(row, PUNCH_TIME_KEYS));
    if (!date || !time) return;
    result.push({
      id: `rec-${Date.now()}-${i}`,
      employeeId: str(pick(row, PUNCH_EMPID_KEYS)),
      employeeName: str(pick(row, PUNCH_NAME_KEYS)),
      date,
      time,
    });
  });
  return result;
}
