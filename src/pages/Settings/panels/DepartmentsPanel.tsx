import React from 'react';
import Departments from '../../Departments/index';

export default function DepartmentsPanel() {
  return (
    <div className="h-full overflow-y-auto p-6 animate-in fade-in duration-300 flex flex-col">
      <div className="mb-6 shrink-0">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-white">部门与职位架构</h2>
        <p className="text-sm text-zinc-500 mt-1">管理公司的组织架构、部门层级及职位名称</p>
      </div>
      <div className="flex-1 min-h-0">
        <Departments />
      </div>
    </div>
  );
}
