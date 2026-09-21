export interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
  type?: 'info' | 'warning' | 'success' | 'error';
  /** 同类提醒的归并键（如 `contract:EMP0034`）；带键的周期提醒会原地刷新而非重复新增 */
  refKey?: string;
}
