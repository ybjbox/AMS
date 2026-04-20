import { User, SystemRole } from '../types';
import { Folder, Document, DocumentSet } from '../store/useDocumentStore';
import { Shift, EmployeeSchedule, PunchRecord, Anomaly } from '../store/useAttendanceStore';
import { useUserStore } from '../store/useUserStore';
import { generateIdCard, calculateAge, getGender } from '../utils/idCardUtils';
import { calculateYearsOfService, calculateDaysToExpiry } from '../utils/dateUtils';

// Mock Data
let mockUsers: User[] = Array.from({ length: 45 }).map((_, i) => {
  const idCard = generateIdCard();
  const joinDate = new Date(Date.now() - Math.random() * 100000000000).toISOString().split('T')[0];
  const contractSignDate = new Date(Date.now() - Math.random() * 31536000000).toISOString().split('T')[0];
  const contractYears = [1, 3, 5][Math.floor(Math.random() * 3)];
  const contractExpiry = new Date(
    new Date(contractSignDate).setFullYear(new Date(contractSignDate).getFullYear() + contractYears)
  )
    .toISOString()
    .split('T')[0];

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
    systemRole: [SystemRole.ADMIN, SystemRole.HR, SystemRole.EMPLOYEE][Math.floor(Math.random() * 3)],
  };
});

let mockFolders: Folder[] = [
  { id: 'f1', name: '人事文件', parentId: null },
  { id: 'f2', name: '入职办理', parentId: 'f1' },
  { id: 'f3', name: '离职办理', parentId: 'f1' },
  { id: 'f4', name: '公司制度', parentId: null },
];

let mockDocuments: Document[] = [
  {
    id: '1',
    name: '员工入职登记表.pdf',
    type: 'pdf',
    url: '#',
    size: 1024 * 500,
    uploadedAt: '2026-03-01',
    folderId: 'f2',
  },
  { id: '2', name: '保密协议.pdf', type: 'pdf', url: '#', size: 1024 * 800, uploadedAt: '2026-03-01', folderId: 'f2' },
  { id: '3', name: '员工手册.pdf', type: 'pdf', url: '#', size: 1024 * 2000, uploadedAt: '2026-03-01', folderId: 'f4' },
  {
    id: '4',
    name: '离职申请表.pdf',
    type: 'pdf',
    url: '#',
    size: 1024 * 300,
    uploadedAt: '2026-03-02',
    folderId: 'f3',
  },
  { id: '5', name: '交接清单.pdf', type: 'pdf', url: '#', size: 1024 * 400, uploadedAt: '2026-03-02', folderId: 'f3' },
];

let mockDocumentSets: DocumentSet[] = [
  { id: 'set1', name: '入职文件套件', description: '新员工入职需要填写的全部文件', documentIds: ['1', '2', '3'] },
  { id: 'set2', name: '离职文件套件', description: '员工离职需要填写的全部文件', documentIds: ['4', '5'] },
];

let mockShifts: Shift[] = [{ id: '1', name: '正常班', startTime: '09:00', endTime: '18:00' }];

let mockSchedules: EmployeeSchedule[] = [];
let mockRecords: PunchRecord[] = [];
let mockAnomalies: Anomaly[] = [];

// Utility to simulate network delay
const delay = (ms: number = 500) => new Promise((resolve) => setTimeout(resolve, ms));

// Users API
export const api = {
  // Users
  fetchUsers: async (): Promise<User[]> => {
    await delay();
    const userInfo = useUserStore.getState().userInfo;
    if (!userInfo) return [];
    return mockUsers;
  },
  createUser: async (user: User): Promise<User> => {
    await delay();
    mockUsers = [user, ...mockUsers];
    return user;
  },
  updateUser: async (user: User): Promise<User> => {
    await delay();
    mockUsers = mockUsers.map((u) => (u.id === user.id ? user : u));
    return user;
  },
  deleteUser: async (id: string): Promise<void> => {
    await delay();
    mockUsers = mockUsers.filter((u) => u.id !== id);
  },

  // Documents
  fetchFolders: async (): Promise<Folder[]> => {
    await delay();
    return [...mockFolders];
  },
  createFolder: async (folder: Folder): Promise<Folder> => {
    await delay();
    mockFolders = [...mockFolders, folder];
    return folder;
  },
  updateFolder: async (id: string, folder: Partial<Folder>): Promise<Folder> => {
    await delay();
    mockFolders = mockFolders.map((f) => (f.id === id ? { ...f, ...folder } : f));
    return mockFolders.find((f) => f.id === id)!;
  },
  deleteFolder: async (id: string): Promise<void> => {
    await delay();
    const getSubFolders = (parentId: string, allFolders: Folder[]): string[] => {
      const children = allFolders.filter((f) => f.parentId === parentId).map((f) => f.id);
      return children.reduce((acc, childId) => [...acc, ...getSubFolders(childId, allFolders)], children);
    };
    const folderIdsToRemove = [id, ...getSubFolders(id, mockFolders)];

    const removedDocIds = mockDocuments
      .filter((d) => d.folderId !== null && folderIdsToRemove.includes(d.folderId))
      .map((d) => d.id);

    mockFolders = mockFolders.filter((f) => !folderIdsToRemove.includes(f.id));
    mockDocuments = mockDocuments.filter((d) => d.folderId === null || !folderIdsToRemove.includes(d.folderId));
    mockDocumentSets = mockDocumentSets.map((s) => ({
      ...s,
      documentIds: s.documentIds.filter((did: string) => !removedDocIds.includes(did)),
    }));
  },

  fetchDocuments: async (): Promise<Document[]> => {
    await delay();
    return [...mockDocuments];
  },
  createDocument: async (doc: Document): Promise<Document> => {
    await delay();
    mockDocuments = [...mockDocuments, doc];
    return doc;
  },
  updateDocument: async (id: string, doc: Partial<Document>): Promise<Document> => {
    await delay();
    mockDocuments = mockDocuments.map((d) => (d.id === id ? { ...d, ...doc } : d));
    return mockDocuments.find((d) => d.id === id)!;
  },
  deleteDocument: async (id: string): Promise<void> => {
    await delay();
    mockDocuments = mockDocuments.filter((d) => d.id !== id);
    mockDocumentSets = mockDocumentSets.map((s) => ({ ...s, documentIds: s.documentIds.filter((did: string) => did !== id) }));
  },

  fetchDocumentSets: async (): Promise<DocumentSet[]> => {
    await delay();
    return [...mockDocumentSets];
  },
  createDocumentSet: async (set: DocumentSet): Promise<DocumentSet> => {
    await delay();
    mockDocumentSets = [...mockDocumentSets, set];
    return set;
  },
  updateDocumentSet: async (id: string, set: Partial<DocumentSet>): Promise<DocumentSet> => {
    await delay();
    mockDocumentSets = mockDocumentSets.map((s) => (s.id === id ? { ...s, ...set } : s));
    return mockDocumentSets.find((s) => s.id === id)!;
  },
  deleteDocumentSet: async (id: string): Promise<void> => {
    await delay();
    mockDocumentSets = mockDocumentSets.filter((s) => s.id !== id);
  },

  // Attendance
  fetchShifts: async (): Promise<Shift[]> => {
    await delay();
    return [...mockShifts];
  },
  createShift: async (shift: Shift): Promise<Shift> => {
    await delay();
    mockShifts = [...mockShifts, shift];
    return shift;
  },
  updateShift: async (id: string, shift: Partial<Shift>): Promise<Shift> => {
    await delay();
    mockShifts = mockShifts.map((s) => (s.id === id ? { ...s, ...shift } : s));
    return mockShifts.find((s) => s.id === id)!;
  },
  deleteShift: async (id: string): Promise<void> => {
    await delay();
    mockShifts = mockShifts.filter((s) => s.id !== id);
  },

  fetchSchedules: async (): Promise<EmployeeSchedule[]> => {
    await delay();
    const userInfo = useUserStore.getState().userInfo;
    if (!userInfo) return [];
    return mockSchedules;
  },
  updateSchedules: async (schedules: EmployeeSchedule[]): Promise<EmployeeSchedule[]> => {
    await delay();
    mockSchedules = schedules;
    return [...mockSchedules];
  },

  fetchRecords: async (): Promise<PunchRecord[]> => {
    await delay();
    const userInfo = useUserStore.getState().userInfo;
    if (!userInfo) return [];
    return mockRecords;
  },
  updateRecords: async (records: PunchRecord[]): Promise<PunchRecord[]> => {
    await delay();
    mockRecords = records;
    return [...mockRecords];
  },

  fetchAnomalies: async (): Promise<Anomaly[]> => {
    await delay();
    const userInfo = useUserStore.getState().userInfo;
    if (!userInfo) return [];
    return mockAnomalies;
  },
  analyzeAnomalies: async (): Promise<Anomaly[]> => {
    await delay(1000); // Simulate longer processing time
    mockAnomalies = [
      {
        id: '1',
        employeeId: 'EMP001',
        employeeName: '张三',
        date: '2026-03-16',
        type: 'LATE_5',
        minutes: 10,
        description: '迟到 10 分钟',
      },
      {
        id: '2',
        employeeId: 'EMP002',
        employeeName: '李四',
        date: '2026-03-16',
        type: 'MISSING_OUT',
        description: '缺下班卡',
      },
    ];
    return [...mockAnomalies];
  },
};
