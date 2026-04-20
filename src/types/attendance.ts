export interface AttendanceRecord {
  id: string;
  userId: string;
  userName: string;
  department: string;
  date: string;
  checkIn: string;
  checkOut: string;
  status: 'normal' | 'late' | 'early' | 'absent' | 'leave';
  workHours: number;
}
