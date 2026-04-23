export enum SystemRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  HR = 'HR',
  EMPLOYEE = 'EMPLOYEE',
}

export interface User {
  id: string;
  name: string;
  idCard: string;
  gender: '男' | '女';
  age: number;
  phone: string;
  department: string;
  role: string;
  status: '在职' | '试用期' | '离职';
  joinDate: string;
  yearsOfService: string;
  employmentType: '全职' | '兼职' | '实习' | '外包';
  hasSocialSecurity: boolean;
  contractYears: number;
  contractSignDate: string;
  contractExpiry: string;
  daysToExpiry: number;
  changeStatus: '无' | '晋升' | '调岗' | '降职';
  registeredAddress: string;
  currentAddress: string;
  isVeteran: boolean;
  formerUnit: string;
  militaryDates: string;
  remarks: string;
  systemRole: SystemRole;
}

export interface UserInfo {
  id: string | number;
  username: string;
  email: string;
  phone?: string;
  avatar?: string;
  status?: number;
  role?: string;
  createdAt?: string;
}
