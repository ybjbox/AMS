export enum SystemRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  HR = 'HR',
  EMPLOYEE = 'EMPLOYEE',
}

export enum Permission {
  VIEW_DASHBOARD = 'VIEW_DASHBOARD',
  MANAGE_USERS = 'MANAGE_USERS',
  VIEW_USERS = 'VIEW_USERS',
  MANAGE_SETTINGS = 'MANAGE_SETTINGS',
  VIEW_SETTINGS = 'VIEW_SETTINGS',
  MANAGE_ATTENDANCE = 'MANAGE_ATTENDANCE',
}

export interface User {
  id: string;
  name: string;
  idCard: string;
  gender: string;
  age: number | string;
  phone: string;
  department: string;
  role: string;
  status: string;
  joinDate: string;
  yearsOfService: string;
  employmentType: string;
  hasSocialSecurity: string;
  contractYears: number;
  contractSignDate: string;
  contractExpiry: string;
  daysToExpiry: number | string;
  changeStatus: string;
  registeredAddress: string;
  currentAddress: string;
  isVeteran: string;
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
