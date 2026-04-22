import React from 'react';
import { Building2, Briefcase, Plus } from 'lucide-react';
import { useBodyOverflow } from '../../hooks/useBodyOverflow';
import { useUserStore } from '../../store/useUserStore';
import { EmptyState } from '@/components/ui/EmptyState';
import { useDepartmentsLogic } from './hooks/useDepartments';
import { DepartmentTree } from './components/DepartmentTree';
import { RoleList } from './components/RoleList';
import { DepartmentModal } from './components/DepartmentModal';
import { RoleModal } from './components/RoleModal';

export default function Departments() {
  const hasPermission = useUserStore((state) => state.hasPermission);
  const logic = useDepartmentsLogic();
  
  useBodyOverflow(logic.modal.isOpen || logic.roleModal.isOpen);

  const canManage = hasPermission('settings:manage');

  return (
    <div className="h-full flex flex-col">
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* 部门架构 */}
        <div className="lg:col-span-2 xl:col-span-2 bg-white dark:bg-zinc-800 shadow-sm border border-zinc-200/60 dark:border-zinc-700/60 rounded-xl flex flex-col min-h-0">
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-800/50 rounded-t-xl">
            <div className="flex items-center space-x-2">
              <Building2 className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />
              <h2 className="text-base font-medium text-zinc-800 dark:text-zinc-200">
                部门架构 ({logic.flatDepts.length})
              </h2>
            </div>
            {canManage && (
              <button
                onClick={logic.handleAddRoot}
                className="inline-flex items-center justify-center px-3 py-1.5 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-white text-sm font-medium rounded-lg hover:from-blue-500 hover:to-blue-600 active:scale-95 transition-transform shadow-sm"
              >
                <Plus className="h-4 w-4 mr-1" />
                新增一级部门
              </button>
            )}
          </div>
          <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
            {logic.departments.length > 0 ? (
              <DepartmentTree
                departments={logic.departments}
                expandedIds={logic.expandedIds}
                toggleExpand={logic.toggleExpand}
                handleAddChild={logic.handleAddChild}
                handleEdit={logic.handleEdit}
                handleDelete={logic.handleDelete}
                canManage={canManage}
              />
            ) : (
              <div className="py-12">
                <EmptyState
                  title="暂无部门数据"
                  description="开始添加您的第一个公司部门吧"
                  icon={Building2}
                  action={
                    <button
                      onClick={logic.handleAddRoot}
                      className="inline-flex items-center px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-white rounded-lg hover:from-blue-500 hover:to-blue-600 active:scale-95 transition-transform shadow-sm"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      立即创建
                    </button>
                  }
                />
              </div>
            )}
          </div>
        </div>

        {/* 职位设置 */}
        <div className="lg:col-span-2 xl:col-span-1 bg-white dark:bg-zinc-800 shadow-sm border border-zinc-200/60 dark:border-zinc-700/60 rounded-xl flex flex-col min-h-0">
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-800/50 rounded-t-xl">
            <div className="flex items-center space-x-2">
              <Briefcase className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />
              <h2 className="text-base font-medium text-zinc-800 dark:text-zinc-200">职位设置 ({logic.roles.length})</h2>
            </div>
            {logic.departments.length > 0 && (
              <button
                onClick={logic.isAllRoleDeptsExpanded ? logic.collapseAllRoleDepts : logic.expandAllRoleDepts}
                className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors"
              >
                {logic.isAllRoleDeptsExpanded ? '一键收起' : '一键展开'}
              </button>
            )}
          </div>
          <div className="p-4 flex-1 overflow-y-auto space-y-3 custom-scrollbar">
            {logic.departments.length > 0 ? (
              <RoleList
                departments={logic.departments}
                roles={logic.roles}
                expandedRoleDepts={logic.expandedRoleDepts}
                toggleRoleDept={logic.toggleRoleDept}
                handleAddRole={logic.handleAddRole}
                handleEditRole={logic.handleEditRole}
                handleDeleteRole={logic.handleDeleteRole}
                canManage={canManage}
              />
            ) : (
              <div className="py-12">
                <EmptyState title="暂无部门数据" description="请先在左侧添加部门" icon={Briefcase} />
              </div>
            )}
          </div>
        </div>
      </div>

      <DepartmentModal
        modal={logic.modal}
        onClose={() => logic.setModal((prev) => ({ ...prev, isOpen: false }))}
        onSubmit={logic.handleModalSubmit}
        flatDepts={logic.flatDepts}
      />

      <RoleModal
        modal={logic.roleModal}
        onClose={() => logic.setRoleModal((prev) => ({ ...prev, isOpen: false }))}
        onSubmit={logic.handleRoleModalSubmit}
      />
    </div>
  );
}
