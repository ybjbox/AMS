import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SystemRole } from '../types';

// 辅助函数
const generateIdCard = () => {
  const year = 1970 + Math.floor(Math.random() * 30);
  const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
  const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
  return `440106${year}${month}${day}${Math.floor(Math.random() * 9000) + 1000}`;
};

const calculateAge = (idCard: string) => {
  if (!idCard || idCard.length !== 18) return '-';
  const year = parseInt(idCard.substring(6, 10));
  const month = parseInt(idCard.substring(10, 12));
  const day = parseInt(idCard.substring(12, 14));
  const today = new Date();
  let age = today.getFullYear() - year;
  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age--;
  return age;
};

const getGender = (idCard: string) => {
  if (!idCard || idCard.length !== 18) return '-';
  return parseInt(idCard.charAt(16)) % 2 === 0 ? '女' : '男';
};

const calculateYearsOfService = (joinDate: string) => {
  if (!joinDate) return '-';
  const join = new Date(joinDate);
  const today = new Date();
  let years = today.getFullYear() - join.getFullYear();
  let months = today.getMonth() - join.getMonth();
  if (months < 0 || (months === 0 && today.getDate() < join.getDate())) {
    years--;
    months += 12;
  }
  return `${years}年${months}个月`;
};

const calculateDaysToExpiry = (expiryDate: string) => {
  if (!expiryDate) return '-';
  const expiry = new Date(expiryDate);
  const today = new Date();
  const diffTime = expiry.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

export interface UserData {
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

interface UserStore {
  users: UserData[];
  setUsers: (users: UserData[]) => void;
  addUser: (user: UserData) => void;
  updateUser: (user: UserData) => void;
  deleteUser: (id: string) => void;
}

const initialUsers: UserData[] = Array.from({ length: 45 }).map((_, i) => {
  const idCard = generateIdCard();
  const joinDate = new Date(Date.now() - Math.random() * 100000000000).toISOString().split('T')[0];
  const contractSignDate = new Date(Date.now() - Math.random() * 31536000000).toISOString().split('T')[0];
  const contractYears = [1, 3, 5][Math.floor(Math.random() * 3)];
  const contractExpiry = new Date(new Date(contractSignDate).setFullYear(new Date(contractSignDate).getFullYear() + contractYears)).toISOString().split('T')[0];
  
  return {
    id: `EMP${String(i + 1).padStart(4, '0')}`,
    name: `员工 ${i + 1}`,
    idCard,
    gender: getGender(idCard),
    age: calculateAge(idCard),
    phone: `13${Math.floor(Math.random() * 900000000) + 100000000}`,
    department: ['研发部', '产品部', '设计部', '市场部', '人事部'][Math.floor(Math.random() * 5)],
    role: ['前端工程师', '后端工程师', '产品经理', 'UI设计师', 'HR'][Math.floor(Math.random() * 5)],
    status: Math.random() > 0.2 ? '在职' : '试用期',
    joinDate,
    yearsOfService: calculateYearsOfService(joinDate),
    employmentType: ['全职', '兼职', '实习', '外包'][Math.floor(Math.random() * 4)],
    hasSocialSecurity: Math.random() > 0.1 ? '是' : '否',
    contractYears,
    contractSignDate,
    contractExpiry,
    daysToExpiry: calculateDaysToExpiry(contractExpiry),
    changeStatus: ['无', '晋升', '调岗', '降职'][Math.floor(Math.random() * 4)],
    registeredAddress: '广东省广州市天河区XX路XX号',
    currentAddress: '广东省广州市海珠区XX路XX号',
    isVeteran: Math.random() > 0.9 ? '是' : '否',
    formerUnit: Math.random() > 0.9 ? '某某部队' : '无',
    militaryDates: Math.random() > 0.9 ? '2015-09 至 2017-09' : '无',
    remarks: '无',
    systemRole: [SystemRole.ADMIN, SystemRole.HR, SystemRole.EMPLOYEE][Math.floor(Math.random() * 3)]
  };
});

export const useUserStore = create<UserStore>()(
  persist(
    (set) => ({
      users: initialUsers,
      setUsers: (users) => set({ users }),
      addUser: (user) => set((state) => ({ users: [user, ...state.users] })),
      updateUser: (user) => set((state) => ({
        users: state.users.map((u) => u.id === user.id ? user : u)
      })),
      deleteUser: (id) => set((state) => ({
        users: state.users.filter((u) => u.id !== id)
      })),
    }),
    {
      name: 'user-storage',
    }
  )
);
