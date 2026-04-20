import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BaseModal } from '@/components/ui/BaseModal';
import { TreeSelect } from '../../../components/common/TreeSelect';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { User, DepartmentNode, RoleNode, SystemRole } from '../../../types';

const userSchema = z.object({
  name: z.string().min(1, '请输入姓名'),
  idCard: z.string().regex(/^\d{17}[\dXx]$/, '身份证号格式不正确'),
  phone: z.string().regex(/^1[3-9]\d{9}$/, '手机号格式不正确'),
  registeredAddress: z.string().optional(),
  currentAddress: z.string().optional(),
  department: z.string().min(1, '请选择部门'),
  role: z.string().optional(),
  joinDate: z.string().min(1, '请选择入职日期'),
  changeStatus: z.string().optional(),
  contractYears: z.any().optional(),
  formerUnit: z.string().optional(),
  militaryDates: z.string().optional(),
  remarks: z.string().optional(),
  contractSignDate: z.string().optional(),
});

type UserFormValues = z.infer<typeof userSchema>;

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
  setSelectedRoleName,
}: UserFormModalProps) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      name: '',
      idCard: '',
      phone: '',
      registeredAddress: '',
      currentAddress: '',
      department: '',
      role: '',
      joinDate: '',
      changeStatus: '无',
      contractYears: 3,
      formerUnit: '',
      militaryDates: '',
      remarks: '',
      contractSignDate: '',
    },
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        name: editingUser?.name || '',
        idCard: editingUser?.idCard || '',
        phone: editingUser?.phone || '',
        registeredAddress: editingUser?.registeredAddress || '',
        currentAddress: editingUser?.currentAddress || '',
        department: selectedDeptName || '',
        role: selectedRoleName || '',
        joinDate: editingUser?.joinDate || '',
        changeStatus: editingUser?.changeStatus || '无',
        contractYears: editingUser?.contractYears || 3,
        formerUnit: editingUser?.formerUnit || '',
        militaryDates: editingUser?.militaryDates || '',
        remarks: editingUser?.remarks || '',
        contractSignDate: editingUser?.contractSignDate || '',
      });
    }
  }, [isOpen, editingUser, selectedDeptName, selectedRoleName, reset]);

  useEffect(() => {
    setValue('department', selectedDeptName, { shouldValidate: !!selectedDeptName });
  }, [selectedDeptName, setValue]);

  useEffect(() => {
    setValue('role', selectedRoleName);
  }, [selectedRoleName, setValue]);

  const onSubmit = async () => {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        onClose();
        resolve();
      }, 500);
    });
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={editingUser ? '编辑员工信息' : '新增员工'}
      size="4xl"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="mt-3 w-full inline-flex justify-center rounded-md border border-zinc-200/80 dark:border-zinc-600 shadow-sm px-4 py-2 bg-white dark:bg-zinc-700 text-base font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-600 active:scale-95 transition-transform sm:mt-0 sm:w-auto sm:text-sm"
          >
            取消
          </button>
          <button
            type="submit"
            form="employee-form"
            disabled={isSubmitting}
            className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-base font-medium text-white hover:from-blue-500 hover:to-blue-600 active:scale-95 transition-transform sm:ml-0 sm:w-auto sm:text-sm disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isSubmitting ? '保存中...' : '保存'}
          </button>
        </>
      }
    >
      <form id="employee-form" className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
        <div>
          <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-200 mb-3 border-l-2 border-blue-600 pl-2">基本信息</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                姓名 <span className="text-red-500">*</span>
              </label>
              <input
                {...register('name')}
                type="text"
                className={`mt-1 block w-full border ${errors.name ? 'border-red-500 focus:ring-red-500/20 focus:border-red-500' : 'border-zinc-200 dark:border-zinc-700/80'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm`}
              />
              {errors.name && <p role="alert" className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.name.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                身份证号码 <span className="text-red-500">*</span>
              </label>
              <input
                {...register('idCard')}
                type="text"
                className={`mt-1 block w-full border ${errors.idCard ? 'border-red-500 focus:ring-red-500/20 focus:border-red-500' : 'border-zinc-200 dark:border-zinc-700/80'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm`}
              />
              {errors.idCard && <p role="alert" className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.idCard.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                联系电话 <span className="text-red-500">*</span>
              </label>
              <input
                {...register('phone')}
                type="text"
                className={`mt-1 block w-full border ${errors.phone ? 'border-red-500 focus:ring-red-500/20 focus:border-red-500' : 'border-zinc-200 dark:border-zinc-700/80'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm`}
              />
              {errors.phone && <p role="alert" className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.phone.message}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                户口地址 <span className="text-red-500">*</span>
              </label>
              <input
                {...register('registeredAddress')}
                type="text"
                className={`mt-1 block w-full border ${errors.registeredAddress ? 'border-red-500 focus:ring-red-500/20 focus:border-red-500' : 'border-zinc-200 dark:border-zinc-700/80'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm`}
              />
              {errors.registeredAddress && <p role="alert" className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.registeredAddress.message}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                现住址 <span className="text-red-500">*</span>
              </label>
              <input
                {...register('currentAddress')}
                type="text"
                className={`mt-1 block w-full border ${errors.currentAddress ? 'border-red-500 focus:ring-red-500/20 focus:border-red-500' : 'border-zinc-200 dark:border-zinc-700/80'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm`}
              />
              {errors.currentAddress && <p role="alert" className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.currentAddress.message}</p>}
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-200 mb-3 border-l-2 border-blue-600 pl-2">工作信息</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                部门 <span className="text-red-500">*</span>
              </label>
              <TreeSelect
                value={selectedDeptName}
                onChange={setSelectedDeptName}
                nodes={departments}
                placeholder="请选择部门"
              />
              {errors.department && <p role="alert" className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.department.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                职位 <span className="text-red-500">*</span>
              </label>
              <TreeSelect
                value={selectedRoleName}
                onChange={setSelectedRoleName}
                nodes={departments}
                placeholder="请选择职位"
                isNodeSelectable={() => false}
                renderLeaf={(node, depth, closeDropdown) => {
                  const deptRoles = roles.filter((r) => r.departmentId === node.id);
                  if (deptRoles.length === 0) return null;
                  return deptRoles.map((role) => (
                    <div
                      key={`role-${role.id}`}
                      className="flex items-center py-2 px-3 hover:bg-blue-50 dark:hover:bg-zinc-700 cursor-pointer text-sm text-zinc-600 dark:text-zinc-300"
                      style={{ paddingLeft: `${(depth + 1) * 1.5 + 0.75}rem` }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedRoleName(role.name);
                        setSelectedDeptName(node.name);
                        closeDropdown();
                      }}
                    >
                      <div className="w-5 h-5 flex items-center justify-center mr-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-500" />
                      </div>
                      <span
                        className={
                          selectedRoleName === role.name ? 'font-semibold text-blue-600 dark:text-blue-400' : ''
                        }
                      >
                        {role.name}
                      </span>
                    </div>
                  ));
                }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                状态 <span className="text-red-500">*</span>
              </label>
              <Select
                defaultValue={
                  editingUser?.status === 'active'
                    ? '在职'
                    : editingUser?.status === 'inactive'
                      ? '离职'
                      : editingUser?.status || '在职'
                }
              >
                <SelectTrigger className="w-full mt-1 bg-white dark:bg-zinc-700 border-zinc-200/80 dark:border-zinc-600">
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
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                入职时间 <span className="text-red-500">*</span>
              </label>
              <input
                {...register('joinDate')}
                type="date"
                className={`mt-1 block w-full border ${errors.joinDate ? 'border-red-500 focus:ring-red-500/20 focus:border-red-500' : 'border-zinc-200 dark:border-zinc-700/80'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm`}
              />
              {errors.joinDate && <p role="alert" className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.joinDate.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                用工形式 <span className="text-red-500">*</span>
              </label>
              <Select defaultValue={editingUser?.employmentType || '全职'}>
                <SelectTrigger className="w-full mt-1 bg-white dark:bg-zinc-700 border-zinc-200/80 dark:border-zinc-600">
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
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                变动情况 <span className="text-red-500">*</span>
              </label>
              <input
                {...register('changeStatus')}
                type="text"
                className={`mt-1 block w-full border ${errors.changeStatus ? 'border-red-500 focus:ring-red-500/20 focus:border-red-500' : 'border-zinc-200 dark:border-zinc-700/80'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                系统角色 <span className="text-red-500">*</span>
              </label>
              <Select
                defaultValue={
                  editingUser?.systemRole === SystemRole.SUPER_ADMIN
                    ? '超级管理员'
                    : editingUser?.systemRole === SystemRole.ADMIN
                      ? '管理员'
                      : editingUser?.systemRole === SystemRole.HR
                        ? '人事主管'
                        : '普通员工'
                }
              >
                <SelectTrigger className="w-full mt-1 bg-white dark:bg-zinc-700 border-zinc-200/80 dark:border-zinc-600">
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
          <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-200 mb-3 border-l-2 border-blue-600 pl-2">合同与社保</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">是否购买社保</label>
              <Select defaultValue={editingUser?.hasSocialSecurity || '是'}>
                <SelectTrigger className="w-full mt-1 bg-white dark:bg-zinc-700 border-zinc-200/80 dark:border-zinc-600">
                  <SelectValue placeholder="选择是否购买社保" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="是">是</SelectItem>
                  <SelectItem value="否">否</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">合同年限(年)</label>
              <input
                {...register('contractYears')}
                type="number"
                className="mt-1 block w-full border border-zinc-200 dark:border-zinc-700/80 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">最新签订时间</label>
              <input
                {...register('contractSignDate')}
                type="date"
                className="mt-1 block w-full border border-zinc-200 dark:border-zinc-700/80 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm"
              />
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-200 mb-3 border-l-2 border-blue-600 pl-2">退役军人信息</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">是否退役军人</label>
              <Select defaultValue={editingUser?.isVeteran || '否'}>
                <SelectTrigger className="w-full mt-1 bg-white dark:bg-zinc-700 border-zinc-200/80 dark:border-zinc-600">
                  <SelectValue placeholder="选择是否退役军人" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="是">是</SelectItem>
                  <SelectItem value="否">否</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">原服役单位</label>
              <input
                {...register('formerUnit')}
                type="text"
                className="mt-1 block w-full border border-zinc-200 dark:border-zinc-700/80 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">入伍及退役时间</label>
              <input
                {...register('militaryDates')}
                type="text"
                placeholder="如: 2015-09 至 2017-09"
                className="mt-1 block w-full border border-zinc-200 dark:border-zinc-700/80 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">备注</label>
          <textarea
            {...register('remarks')}
            rows={2}
            className="mt-1 block w-full border border-zinc-200 dark:border-zinc-700/80 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm"
          ></textarea>
        </div>
      </form>
    </BaseModal>
  );
}
