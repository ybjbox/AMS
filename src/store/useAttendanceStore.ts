import { create } from 'zustand';
import { attendanceApi } from '../services/attendanceApi';
import type { AnalyzeCoverage, DayVerdict, DeptShiftRule } from '../services/attendanceApi';
import { createAsyncAction } from './utils';
import { describeSaveError } from './saveFailureCore';

/**
 * 班次与排班类型仍保留导出：`attendanceApi` 还有这几个端点，服务端判定链路
 * `attendanceDb.buildShiftPlanner` 也仍以它们为兜底（部门时段没配时逐日排班）。
 * 2026-10-10 把这两页的界面撤了，所以 store 不再持有它们 —— 见 fetchData 注释。
 */
export type Shift = {
  id: string;
  name: string;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
};

export type EmployeeSchedule = {
  employeeId: string;
  employeeName: string;
  shiftIds: string[];
};

export type PunchRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:mm:ss"
  /** 数据来源：'' = 补卡/导入/手工（历史行也是），'wecom' = 企业微信同步 */
  source: string;
};

export type Anomaly = {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  type: 'LATE_5' | 'LATE_15' | 'MISSING_IN' | 'MISSING_OUT' | 'EARLY_LEAVE';
  minutes?: number;
  description: string;
};

interface AttendanceState {
  /** 部门工作时段：判定链路的**实际**口径来源，进页面就要拿到（统计卡与工作流条都读它） */
  shiftRules: DeptShiftRule[];
  records: PunchRecord[];
  anomalies: Anomaly[];
  /** 最近一次异常分析的覆盖统计（null = 服务端还没有留档） */
  analyzeCoverage: AnalyzeCoverage | null;
  /** 该次分析的时间（ISO），来自服务端留档 */
  analyzeCoverageAt: string | null;
  /**
   * 逐日判定结果，按月份缓存（服务端同一份装配，与校对表导出逐字一致）。
   * 只在打开某人某月的打卡时才取 —— 全月全员算一遍不便宜，而多数时候只看一个人。
   */
  verdictsByMonth: Record<string, DayVerdict[]>;
  isLoading: boolean;
  error: string | null;

  fetchData: () => Promise<string | null>;
  /** 时段被增删改后单独回读，不必整页重取 */
  fetchShiftRules: () => Promise<string | null>;
  /** 取某月判定结果（已缓存则直接返回）；失败原因作为返回值，不置 isLoading */
  loadVerdicts: (month: string) => Promise<string | null>;

  setRecords: (records: PunchRecord[]) => Promise<string | null>;
  removeRecord: (id: string) => Promise<string | null>;
  clearRecords: () => Promise<string | null>;

  analyzeAnomalies: () => Promise<string | null>;
}

export const useAttendanceStore = create<AttendanceState>()((set, get) => ({
  shiftRules: [],
  records: [],
  anomalies: [],
  analyzeCoverage: null,
  analyzeCoverageAt: null,
  verdictsByMonth: {},
  isLoading: false,
  error: null,

  /**
   * 一次拉齐考勤页需要的全部数据。
   *
   * 这里原先还并发了 `fetchShifts()` 与 `fetchSchedules()`：班次与排班的界面
   * 2026-10-10 已撤，全站没有任何组件读 `state.shifts` / `state.schedules`，
   * 于是每次进页面白打两个请求、取回没人看的数据。班次/排班本身仍是服务端的
   * 兜底链路，所以端点保留，只是界面不再替它去取。
   *
   * 部门时段原先不在这里取 —— 页面用 `useEffect([activeTab])` 单独拉一次来喂
   * 统计卡，切标签才刷新。那是个自认的绕法（注释里写着"避免再引一层全局
   * store"），后果是统计卡的"部门时段"初次进页面显示 0、切一下标签才对。
   * 现在时段是一等公民，跟记录/异常一起进来。
   */
  fetchData: async () => {
    return createAsyncAction(set, async () => {
      const [shiftRules, records, anomalies, analysis] = await Promise.all([
        attendanceApi.fetchShiftRules(),
        attendanceApi.fetchRecords(),
        attendanceApi.fetchAnomalies(),
        attendanceApi.fetchAnalysisStatus(),
      ]);
      return {
        shiftRules,
        records,
        anomalies,
        analyzeCoverage: analysis.coverage,
        analyzeCoverageAt: analysis.at,
      };
    });
  },

  fetchShiftRules: async () => {
    return createAsyncAction(set, async () => {
      return { shiftRules: await attendanceApi.fetchShiftRules() };
    });
  },

  /**
   * 判定结果走独立通道，不套 `createAsyncAction`：那个包装会翻全局 `isLoading`，
   * 而统计卡/主表都读它 —— 点开一个人的弹窗看判定，不该让整张表闪回骨架屏。
   */
  loadVerdicts: async (month) => {
    if (get().verdictsByMonth[month]) return null;
    try {
      const res = await attendanceApi.fetchDayVerdicts(month);
      set((state) => ({ verdictsByMonth: { ...state.verdictsByMonth, [month]: res.days } }));
      return null;
    } catch (error: unknown) {
      return describeSaveError(error, '判定结果加载失败');
    }
  },

  setRecords: async (records) => {
    return createAsyncAction(set, async () => {
      const updatedRecords = await attendanceApi.updateRecords(records);
      return { records: updatedRecords, verdictsByMonth: {} };
    });
  },

  /** 删除单条打卡记录 */
  removeRecord: async (id) => {
    return createAsyncAction(set, async () => {
      await attendanceApi.deleteRecord(id);
      // 判定缓存整月作废：删掉一张卡可能让隔壁那天的班次重新归属，按单月失效不够安全
      return { records: get().records.filter((r) => r.id !== id), verdictsByMonth: {} };
    });
  },

  /** 清空全部打卡记录（服务端仅 ADMIN；PUT /records 传空数组已被服务端拒） */
  clearRecords: async () => {
    return createAsyncAction(set, async () => {
      const records = await attendanceApi.clearRecords();
      return { records, verdictsByMonth: {} };
    });
  },

  analyzeAnomalies: async () => {
    return createAsyncAction(set, async () => {
      const { anomalies } = await attendanceApi.analyzeAnomalies();
      // 覆盖率回读服务端留档：界面上的"上次分析 …"与刷新后看到的必须是同一份
      const status = await attendanceApi.fetchAnalysisStatus();
      return {
        anomalies,
        analyzeCoverage: status.coverage,
        analyzeCoverageAt: status.at,
        verdictsByMonth: {},
      };
    });
  },
}));