import React from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { TreeSelect } from '../../../components/common/TreeSelect';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { User, DepartmentNode, RoleNode, SystemRole } from '../../../types';

interface UserFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingUser: User | null;
  departments: DepartmentNode[];
  roles: RoleNode[];
  selectedDeptName: string;
  setSelectedDeptName: (name: string) => void;
  selectedRoleName: string;
  setSelectedRoleName: (name: string) => void;
}

export function UserFormModal({
  isOpen,
  onClose,
  editingUser,
  departments,
  roles,
  selectedDeptName,
  setSelectedDeptName,
  selectedRoleName,
  setSelectedRoleName
}: UserFormModalProps) {
  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={editingUser ? '编辑员工信息' : '新增员工'}
      size="4xl"
      footer={
        <>
          <button type="button" onClick={onClose} className="mt-3 w-full inline-flex justify-center rounded-md border border-zinc-200/80 dark:border-slate-600 shadow-sm px-4 py-2 bg-white dark:bg-slate-700 text-base font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-transform sm:mt-0 sm:w-auto sm:text-sm">取消</button>
          <button type="submit" form="employee-form" className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-base font-medium text-white hover:from-blue-500 hover:to-blue-600 active:scale-95 transition-transform sm:ml-0 sm:w-auto sm:text-sm">保存</button>
        </>
      }
    >
      <form id="employee-form" className="space-y-6" onSubmit={(e) => { e.preventDefault(); onClose(); }}>
        <div>
          <h4 className="text-sm font-medium text-slate-900 mb-3 border-l-2 border-blue-600 pl-2">基本信息</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700">姓名 <span className="text-red-500">*</span></label>
              <input required type="text" defaultValue={editingUser?.name || ''} className="mt-1 block w-full border border-zinc-200/80 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">身份证号码 <span className="text-red-500">*</span></label>
              <input required type="text" defaultValue={editingUser?.idCard || ''} className="mt-1 block w-full border border-zinc-200/80 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">联系电话 <span className="text-red-500">*</span></label>
              <input required type="text" defaultValue={editingUser?.phone || ''} className="mt-1 block w-full border border-zinc-200/80 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700">户口地址 <span className="text-red-500">*</span></label>
              <input required type="text" defaultValue={editingUser?.registeredAddress || ''} className="mt-1 block w-full border border-zinc-200/80 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700">现住址 <span className="text-red-500">*</span></label>
              <input required type="text" defaultValue={editingUser?.currentAddress || ''} className="mt-1 block w-full border border-zinc-200/80 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm" />
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium text-slate-900 mb-3 border-l-2 border-blue-600 pl-2">工作信息</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700">部门 <span className="text-red-500">*</span></label>
              <TreeSelect 
                required 
                value={selectedDeptName}
                onChange={setSelectedDeptName}
                nodes={departments}
                placeholder="请选择部门"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">职位 <span className="text-red-500">*</span></label>
              <TreeSelect 
                required 
                value={selectedRoleName}
                onChange={setSelectedRoleName}
                nodes={departments}
                placeholder="请选择职位"
                isNodeSelectable={() => false}
                renderLeaf={(node, depth, closeDropdown) => {
                  const deptRoles = roles.filter(r => r.departmentId === node.id);
                  if (deptRoles.length === 0) return null;
                  return deptRoles.map(role => (
                    <div 
                      key={`role-${role.id}`}
                      className="flex items-center py-2 px-3 hover:bg-blue-50 dark:hover:bg-slate-700 cursor-pointer text-sm text-slate-600 dark:text-slate-300"
                      style={{ paddingLeft: `${(depth + 1) * 1.5 + 0.75}rem` }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedRoleName(role.name);
                        setSelectedDeptName(node.name);
                        closeDropdown();
                      }}
                    >
                      <div className="w-5 h-5 flex items-center justify-center mr-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-500" />
                      </div>
                      <span className={selectedRoleName === role.name ? 'font-semibold text-blue-600 dark:text-blue-400' : ''}>{role.name}</span>
                    </div>
                  ));
                }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">状态 <span className="text-red-500">*</span></label>
              <Select
                required
                defaultValue={editingUser?.status === 'active' ? '在职' : editingUser?.status === 'inactive' ? '离职' : (editingUser?.status || '在职')}
              >
                <SelectTrigger className="w-full mt-1 bg-white dark:bg-slate-700 border-zinc-200/80 dark:border-slate-600">
                  <SelectValue placeholder="选择状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="在职">在职</SelectItem>
                  <SelectItem value="离职">离职</SelectItem>
                  <SelectItem value="试用期">试用期</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">入职时间 <span className="text-red-500">*</span></label>
              <input required type="date" defaultValue={editingUser?.joinDate || ''} className="mt-1 block w-full border border-zinc-200/80 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">用工形式 <span className="text-red-500">*</span></label>
              <Select
                required
                defaultValue={editingUser?.employmentType || '全职'}
              >
                <SelectTrigger className="w-full mt-1 bg-white dark:bg-slate-700 border-zinc-200/80 dark:border-slate-600">
                  <SelectValue placeholder="选择用工形式" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="全职">全职</SelectItem>
                  <SelectItem value="兼职">兼职</SelectItem>
                  <SelectItem value="实习">实习</SelectItem>
                  <SelectItem value="外包">外包</SelectItem>
                  <SelectItem value="退休返聘">退休返聘</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">变动情况 <span className="text-red-500">*</span></label>
              <input required type="text" defaultValue={editingUser?.changeStatus || '无'} className="mt-1 block w-full border border-zinc-200/80 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">系统角色 <span className="text-red-500">*</span></label>
              <Select
                required
                defaultValue={
                  editingUser?.systemRole === SystemRole.SUPER_ADMIN ? '超级管理员' : 
                  editingUser?.systemRole === SystemRole.ADMIN ? '管理员' : 
                  editingUser?.systemRole === SystemRole.HR ? '人事主管' : '普通员工'
                }
              >
                <SelectTrigger className="w-full mt-1 bg-white dark:bg-slate-700 border-zinc-200/80 dark:border-slate-600">
                  <SelectValue placeholder="选择系统角色" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="超级管理员">超级管理员</SelectItem>
                  <SelectItem value="管理员">管理员</SelectItem>
                  <SelectItem value="人事主管">人事主管</SelectItem>
                  <SelectItem value="普通员工">普通员工</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium text-slate-900 mb-3 border-l-2 border-blue-600 pl-2">合同与社保</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700">是否购买社保</label>
              <Select
                defaultValue={editingUser?.hasSocialSecurity || '是'}
              >
                <SelectTrigger className="w-full mt-1 bg-white dark:bg-slate-700 border-zinc-200/80 dark:border-slate-600">
                  <SelectValue placeholder="选择是否购买社保" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="是">是</SelectItem>
                  <SelectItem value="否">否</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">合同年限(年)</label>
              <input type="number" defaultValue={editingUser?.contractYears || 3} className="mt-1 block w-full border border-zinc-200/80 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">最新签订时间</label>
              <input type="date" defaultValue={editingUser?.contractSignDate || ''} className="mt-1 block w-full border border-zinc-200/80 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm" />
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium text-slate-900 mb-3 border-l-2 border-blue-600 pl-2">退役军人信息</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700">是否退役军人</label>
              <Select
                defaultValue={editingUser?.isVeteran || '否'}
              >
                <SelectTrigger className="w-full mt-1 bg-white dark:bg-slate-700 border-zinc-200/80 dark:border-slate-600">
                  <SelectValue placeholder="选择是否退役军人" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="是">是</SelectItem>
                  <SelectItem value="否">否</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">原服役单位</label>
              <input type="text" defaultValue={editingUser?.formerUnit || ''} className="mt-1 block w-full border border-zinc-200/80 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">入伍及退役时间</label>
              <input type="text" defaultValue={editingUser?.militaryDates || ''} placeholder="如: 2015-09 至 2017-09" className="mt-1 block w-full border border-zinc-200/80 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm" />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700">备注</label>
          <textarea rows={2} defaultValue={editingUser?.remarks || ''} className="mt-1 block w-full border border-zinc-200/80 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm"></textarea>
        </div>
      </form>
    </BaseModal>
  );
}
