import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { BaseModal } from '@/components/ui/BaseModal';
import { TreeSelect } from '@/components/common/TreeSelect';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { User, DepartmentNode, RoleNode } from '@/types';
import * as userApi from '@/services/userApi';
import { useEmployeeStore } from '@/store/useEmployeeStore';

const userSchema = z.object({
  name: z.string().min(1, '请输入姓名'),
  idCard: z.string().regex(/^\d{17}[\dXx]$/, '身份证号格式不正确'),
  phone: z.string().regex(/^1[3-9]\d{9}$/, '手机号格式不正确'),
  registeredAddress: z.string().optional(),
  currentAddress: z.string().optional(),
  department: z.string().min(1, '请选择部门'),
  role: z.string().optional(),
  status: z.string().min(1, '请选择状态'),
  joinDate: z.string().min(1, '请选择入职日期'),
  employmentType: z.string().min(1, '请选择用工形式'),
  hasSocialSecurity: z.string().optional(),
  isVeteran: z.string().optional(),
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
    watch,
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
      status: '在职',
      joinDate: '',
      employmentType: '全职',
      hasSocialSecurity: '否',
      isVeteran: '否',
      changeStatus: '无',
      contractYears: 3,
      formerUnit: '',
      militaryDates: '',
      remarks: '',
      contractSignDate: '',
    },
  });

  // 只按「打开时编辑谁」重置：部门/职位的变化由下面两个 setValue effect 同步。
  // 若把 selectedDeptName 放进依赖，用户改部门时会把其他已填字段一起打回原值。
  useEffect(() => {
    if (!isOpen) return;
    reset({
      name: editingUser?.name || '',
      idCard: editingUser?.idCard || '',
      phone: editingUser?.phone || '',
      registeredAddress: editingUser?.registeredAddress || '',
      currentAddress: editingUser?.currentAddress || '',
      department: editingUser?.department || '',
      role: editingUser?.role || '',
      status: editingUser?.status || '在职',
      joinDate: editingUser?.joinDate || '',
      employmentType: editingUser?.employmentType || '全职',
      hasSocialSecurity: editingUser?.hasSocialSecurity ? '是' : '否',
      isVeteran: editingUser?.isVeteran ? '是' : '否',
      changeStatus: editingUser?.changeStatus || '无',
      contractYears: editingUser?.contractYears || 3,
      formerUnit: editingUser?.formerUnit || '',
      militaryDates: editingUser?.militaryDates || '',
      remarks: editingUser?.remarks || '',
      contractSignDate: editingUser?.contractSignDate || '',
    });
  }, [isOpen, editingUser, reset]);

  useEffect(() => {
    setValue('department', selectedDeptName, { shouldValidate: !!selectedDeptName });
  }, [selectedDeptName, setValue]);

  useEffect(() => {
    setValue('role', selectedRoleName);
  }, [selectedRoleName, setValue]);

  const errText = (e: unknown, fallback: string) => (e as { error?: string })?.error || fallback;

  const onSubmit = async (data: UserFormValues) => {
    const fields = {
      name: data.name.trim(),
      idCard: data.idCard.trim(),
      phone: data.phone.trim(),
      registeredAddress: data.registeredAddress || '',
      currentAddress: data.currentAddress || '',
      department: data.department,
      role: data.role || '',
      status: data.status as User['status'],
      joinDate: data.joinDate,
      employmentType: data.employmentType as User['employmentType'],
      hasSocialSecurity: data.hasSocialSecurity === '是',
      isVeteran: data.isVeteran === '是',
      changeStatus: (data.changeStatus || '无') as User['changeStatus'],
      contractYears: Number(data.contractYears) || 0,
      contractSignDate: data.contractSignDate || '',
      formerUnit: data.formerUnit || '',
      militaryDates: data.militaryDates || '',
      remarks: data.remarks || '',
    };
    try {
      const saved = editingUser
        ? await userApi.updateUser(editingUser.id, fields)
        : // 表单不含性别/年龄/合同到期等派生项：新建时留给服务端默认值与「合同续签」流程维护
          await userApi.createUser(fields as unknown as Omit<User, 'id'>);
      useEmployeeStore.setState((s) => ({
        users: editingUser ? s.users.map((u) => (u.id === saved.id ? saved : u)) : [saved, ...s.users],
      }));
      toast.success(editingUser ? '员工信息已保存' : '员工已建档');
      onClose();
    } catch (e) {
      toast.error(errText(e, editingUser ? '保存失败' : '建档失败'));
    }
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
            className="btn-secondary w-full sm:w-auto"
          >
            取消
          </button>
          <button
            type="submit"
            form="employee-form"
            disabled={isSubmitting}
            className="btn-primary w-full sm:w-auto disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isSubmitting ? '保存中…' : '保存'}
          </button>
        </>
      }
    >
      <form id="employee-form" className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
        <div>
          <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-200 mb-3 border-l-2 border-brand-600 pl-2">基本信息</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                姓名 <span className="text-red-500">*</span>
              </label>
              <Input
                {...register('name')}
                type="text"
                className={`mt-1 ${errors.name ? 'border-red-500 focus:ring-red-500/20 focus:border-red-500' : ''}`}
              />
              {errors.name && <p role="alert" className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.name.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                身份证号码 <span className="text-red-500">*</span>
              </label>
              <Input
                {...register('idCard')}
                type="text"
                className={`mt-1 ${errors.idCard ? 'border-red-500 focus:ring-red-500/20 focus:border-red-500' : ''}`}
              />
              {errors.idCard && <p role="alert" className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.idCard.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                联系电话 <span className="text-red-500">*</span>
              </label>
              <Input
                {...register('phone')}
                type="text"
                className={`mt-1 ${errors.phone ? 'border-red-500 focus:ring-red-500/20 focus:border-red-500' : ''}`}
              />
              {errors.phone && <p role="alert" className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.phone.message}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                户口地址 <span className="text-red-500">*</span>
              </label>
              <Input
                {...register('registeredAddress')}
                type="text"
                className={`mt-1 ${errors.registeredAddress ? 'border-red-500 focus:ring-red-500/20 focus:border-red-500' : ''}`}
              />
              {errors.registeredAddress && <p role="alert" className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.registeredAddress.message}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                现住址 <span className="text-red-500">*</span>
              </label>
              <Input
                {...register('currentAddress')}
                type="text"
                className={`mt-1 ${errors.currentAddress ? 'border-red-500 focus:ring-red-500/20 focus:border-red-500' : ''}`}
              />
              {errors.currentAddress && <p role="alert" className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.currentAddress.message}</p>}
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-200 mb-3 border-l-2 border-brand-600 pl-2">工作信息</h4>
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
                      className="flex items-center py-2 px-3 hover:bg-brand-50 dark:hover:bg-zinc-700 cursor-pointer text-sm text-zinc-600 dark:text-zinc-300"
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
                          selectedRoleName === role.name ? 'font-semibold text-brand-600 dark:text-brand-400' : ''
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
                value={watch('status')}
                onValueChange={(v) => setValue('status', String(v), { shouldValidate: true })}
              >
                <SelectTrigger className="w-full mt-1">
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
              <Input
                {...register('joinDate')}
                type="date"
                className={`mt-1 ${errors.joinDate ? 'border-red-500 focus:ring-red-500/20 focus:border-red-500' : ''}`}
              />
              {errors.joinDate && <p role="alert" className="text-xs text-red-500 dark:text-red-400 mt-1">{errors.joinDate.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                用工形式 <span className="text-red-500">*</span>
              </label>
              <Select
                value={watch('employmentType')}
                onValueChange={(v) => setValue('employmentType', String(v), { shouldValidate: true })}
              >
                <SelectTrigger className="w-full mt-1">
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
              <Input
                {...register('changeStatus')}
                type="text"
                className={`mt-1 ${errors.changeStatus ? 'border-red-500 focus:ring-red-500/20 focus:border-red-500' : ''}`}
              />
            </div>
            {/* 系统角色不在此编辑：真实角色只存 accounts，
                由员工档案的「系统账号」区块开通/关联，写员工表那列不改变任何权限 */}
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-200 mb-3 border-l-2 border-brand-600 pl-2">合同与社保</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">是否购买社保</label>
              <Select
                value={watch('hasSocialSecurity')}
                onValueChange={(v) => setValue('hasSocialSecurity', String(v))}
              >
                <SelectTrigger className="w-full mt-1">
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
              <Input
                {...register('contractYears')}
                type="number"
                className="mt-1"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">最新签订时间</label>
              <Input
                {...register('contractSignDate')}
                type="date"
                className="mt-1"
              />
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-200 mb-3 border-l-2 border-brand-600 pl-2">退役军人信息</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">是否退役军人</label>
              <Select
                value={watch('isVeteran')}
                onValueChange={(v) => setValue('isVeteran', String(v))}
              >
                <SelectTrigger className="w-full mt-1">
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
              <Input
                {...register('formerUnit')}
                type="text"
                className="mt-1"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">入伍及退役时间</label>
              <Input
                {...register('militaryDates')}
                type="text"
                placeholder="如: 2015-09 至 2017-09"
                className="mt-1"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">备注</label>
          <Textarea
            {...register('remarks')}
            rows={2}
            className="mt-1 field-sizing-fixed resize-y"
          />
        </div>
      </form>
    </BaseModal>
  );
}
