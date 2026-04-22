export interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
  type?: 'info' | 'warning' | 'success' | 'error';
}
