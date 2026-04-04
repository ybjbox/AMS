import React, { useState, useEffect, useCallback } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Plus, Edit2, Trash2, Building2, X, Briefcase } from 'lucide-react';
import { useDepartments, DepartmentNode, RoleNode, flattenDepartments } from '../store/departments';
import { useAuth } from '../store/auth';
import { Permission } from '../types';
import { BaseModal } from '../components/ui/BaseModal';

type ModalState = {
  isOpen: boolean;
  mode: 'add' | 'edit';
  targetId: string | null;
  parentId: string | null;
  defaultName: string;
  defaultPriority: number;
};

type RoleModalState = {
  isOpen: boolean;
  mode: 'add' | 'edit';
  targetId: string | null;
  departmentId: string | null;
  defaultName: string;
  defaultPriority: number;
};

export default function Departments() {
  const hasPermission = useAuth(state => state.hasPermission);
  const departments = useDepartments(state => state.departments);
  const setDepartments = useDepartments(state => state.setDepartments);
  const roles = useDepartments(state => state.roles);
  const setRoles = useDepartments(state => state.setRoles);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [expandedRoleDepts, setExpandedRoleDepts] = useState<Set<string>>(new Set());
  
  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    mode: 'add',
    targetId: null,
    parentId: null,
    defaultName: '',
    defaultPriority: 0
  });

  const [roleModal, setRoleModal] = useState<RoleModalState>({
    isOpen: false,
    mode: 'add',
    targetId: null,
    departmentId: null,
    defaultName: '',
    defaultPriority: 0
  });

  // 防止弹窗打开时底层页面滚动
  useEffect(() => {
    if (modal.isOpen || roleModal.isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [modal.isOpen, roleModal.isOpen]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(id)) {
        newExpanded.delete(id);
      } else {
        newExpanded.add(id);
      }
      return newExpanded;
    });
  }, []);

  const handleAddChild = useCallback((parentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setModal({ isOpen: true, mode: 'add', targetId: null, parentId, defaultName: '', defaultPriority: 0 });
  }, []);

  const handleAddRoot = useCallback(() => {
    setModal({ isOpen: true, mode: 'add', targetId: null, parentId: null, defaultName: '', defaultPriority: 0 });
  }, []);

  const handleEdit = useCallback((node: DepartmentNode, e: React.MouseEvent) => {
    e.stopPropagation();
    setModal({ isOpen: true, mode: 'edit', targetId: node.id, parentId: null, defaultName: node.name, defaultPriority: node.priority || 0 });
  }, []);

  const handleDelete = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('确定要删除该部门吗？如果包含子部门也将一并删除。')) {
      const deleteNode = (nodes: DepartmentNode[]): DepartmentNode[] => {
        return nodes.filter(n => n.id !== id).map(n => ({
          ...n,
          children: n.children ? deleteNode(n.children) : undefined
        }));
      };
      setDepartments(deleteNode(departments));
    }
  }, [departments, setDepartments]);

  const handleModalSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const priority = parseInt(formData.get('priority') as string) || 0;
    
    if (modal.mode === 'add') {
      const newNode: DepartmentNode = { id: Date.now().toString(), name, priority };
      if (modal.parentId) {
        const addNode = (nodes: DepartmentNode[]): DepartmentNode[] => {
          return nodes.map(n => {
            if (n.id === modal.parentId) {
              return { ...n, children: [...(n.children || []), newNode] };
            }
            return { ...n, children: n.children ? addNode(n.children) : undefined };
          });
        };
        setDepartments(addNode(departments));
        setExpandedIds(prev => new Set(prev).add(modal.parentId!));
      } else {
        setDepartments([...departments, newNode]);
      }
    } else if (modal.mode === 'edit' && modal.targetId) {
      const editNode = (nodes: DepartmentNode[]): DepartmentNode[] => {
        return nodes.map(n => {
          if (n.id === modal.targetId) {
            return { ...n, name, priority };
          }
          return { ...n, children: n.children ? editNode(n.children) : undefined };
        });
      };
      setDepartments(editNode(departments));
    }
    
    setModal(prev => ({ ...prev, isOpen: false }));
  }, [modal, departments, setDepartments]);

  // --- Role Handlers ---
  const toggleRoleDept = useCallback((id: string) => {
    setExpandedRoleDepts(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(id)) newExpanded.delete(id);
      else newExpanded.add(id);
      return newExpanded;
    });
  }, []);

  const handleAddRole = useCallback((departmentId: string) => {
    setRoleModal({ isOpen: true, mode: 'add', targetId: null, departmentId, defaultName: '', defaultPriority: 0 });
  }, []);

  const handleEditRole = useCallback((role: RoleNode) => {
    setRoleModal({ isOpen: true, mode: 'edit', targetId: role.id, departmentId: role.departmentId, defaultName: role.name, defaultPriority: role.priority || 0 });
  }, []);

  const handleDeleteRole = useCallback((id: string) => {
    if (confirm('确定要删除该职位吗？')) {
      setRoles(roles.filter(r => r.id !== id));
    }
  }, [roles, setRoles]);

  const handleRoleModalSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const priority = parseInt(formData.get('priority') as string) || 0;
    
    if (roleModal.mode === 'add' && roleModal.departmentId) {
      setRoles([...roles, { id: Date.now().toString(), name, departmentId: roleModal.departmentId, priority }]);
    } else if (roleModal.mode === 'edit' && roleModal.targetId) {
      setRoles(roles.map(r => r.id === roleModal.targetId ? { ...r, name, priority } : r));
    }
    setRoleModal(prev => ({ ...prev, isOpen: false }));
  }, [roleModal, roles, setRoles]);

  const onToggleExpandClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const id = e.currentTarget.dataset.id;
    const hasChildren = e.currentTarget.dataset.haschildren === 'true';
    if (id && hasChildren) {
      toggleExpand(id);
    }
  }, [toggleExpand]);

  const onAddChildClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const id = e.currentTarget.dataset.id;
    if (id) {
      handleAddChild(id, e);
    }
  }, [handleAddChild]);

  const onEditClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const id = e.currentTarget.dataset.id;
    const findNode = (nodes: DepartmentNode[]): DepartmentNode | undefined => {
      for (const node of nodes) {
        if (node.id === id) return node;
        if (node.children) {
          const found = findNode(node.children);
          if (found) return found;
        }
      }
      return undefined;
    };
    const node = findNode(departments);
    if (node) {
      handleEdit(node, e);
    }
  }, [departments, handleEdit]);

  const onDeleteClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const id = e.currentTarget.dataset.id;
    if (id) {
      handleDelete(id, e);
    }
  }, [handleDelete]);

  const renderTree = useCallback((nodes: DepartmentNode[], level = 0) => {
    return (
      <ul className={`space-y-1 ${level > 0 ? 'ml-6 border-l border-slate-200 pl-2 mt-1' : ''}`}>
        {nodes.map(node => {
          const isExpanded = expandedIds.has(node.id);
          const hasChildren = node.children && node.children.length > 0;
          
          return (
            <li key={node.id} className="relative">
              <div 
                className={`flex items-center justify-between py-2 px-3 rounded-lg cursor-pointer transition-colors hover:bg-slate-100 group ${level === 0 ? 'bg-slate-50 border border-slate-200 mb-2' : ''}`}
                data-id={node.id}
                data-haschildren={hasChildren}
                onClick={onToggleExpandClick}
              >
                <div className="flex items-center space-x-2">
                  <span className="w-5 h-5 flex items-center justify-center text-slate-400 shrink-0">
                    {hasChildren ? (
                      isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
                    ) : (
                      <span className="w-4 h-4" /> // Placeholder for alignment
                    )}
                  </span>
                  
                  {level === 0 ? (
                    <Building2 className="w-5 h-5 text-blue-600 shrink-0" />
                  ) : (
                    isExpanded && hasChildren ? (
                      <FolderOpen className="w-4 h-4 text-blue-600 shrink-0" />
                    ) : (
                      <Folder className="w-4 h-4 text-blue-600 shrink-0" />
                    )
                  )}
                  
                  <span className={`text-sm ${level === 0 ? 'font-semibold text-slate-800' : 'font-medium text-slate-700'}`}>
                    {node.name}
                  </span>
                  
                  {hasChildren && (
                    <span className="ml-2 px-2 py-0.5 text-[10px] font-medium bg-slate-200 text-slate-600 rounded-full">
                      {node.children!.length}
                    </span>
                  )}
                </div>
                
                <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {hasPermission(Permission.MANAGE_SETTINGS) && (
                    <>
                      <button 
                        data-id={node.id}
                        onClick={onAddChildClick}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                        title="添加子部门"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button 
                        data-id={node.id}
                        onClick={onEditClick}
                        className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
                        title="编辑"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        data-id={node.id}
                        onClick={onDeleteClick}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              
              {isExpanded && hasChildren && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                  {renderTree(node.children!, level + 1)}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    );
  }, [expandedIds, hasPermission, toggleExpand, handleAddChild, handleEdit, handleDelete]);

  const flatDepts = flattenDepartments(departments);

  const expandAllRoleDepts = useCallback(() => {
    setExpandedRoleDepts(new Set(flatDepts.map(d => d.id)));
  }, [flatDepts]);

  const collapseAllRoleDepts = useCallback(() => {
    setExpandedRoleDepts(new Set());
  }, []);

  const isAllRoleDeptsExpanded = flatDepts.length > 0 && expandedRoleDepts.size === flatDepts.length;

  const onToggleRoleDeptClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const id = e.currentTarget.dataset.id;
    if (id) {
      toggleRoleDept(id);
    }
  }, [toggleRoleDept]);

  const onAddRoleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const id = e.currentTarget.dataset.id;
    if (id) {
      handleAddRole(id);
    }
  }, [handleAddRole]);

  const onEditRoleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const id = e.currentTarget.dataset.id;
    const role = roles.find(r => r.id === id);
    if (role) {
      handleEditRole(role);
    }
  }, [roles, handleEditRole]);

  const onDeleteRoleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const id = e.currentTarget.dataset.id;
    if (id) {
      handleDeleteRole(id);
    }
  }, [handleDeleteRole]);

  const renderRoleTree = useCallback((nodes: DepartmentNode[], level = 0) => {
    return (
      <ul className={`space-y-2 ${level > 0 ? 'ml-4 border-l border-slate-200 dark:border-slate-700 pl-2 mt-2' : ''}`}>
        {nodes.map(node => {
          const isExpanded = expandedRoleDepts.has(node.id);
          const hasChildren = node.children && node.children.length > 0;
          const deptRoles = roles.filter(r => r.departmentId === node.id);
          
          return (
            <li key={node.id} className="relative">
              <div className={`border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden ${level === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/50 dark:bg-slate-800/30'}`}>
                <div 
                  className={`px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors ${level === 0 ? 'bg-slate-50 dark:bg-slate-800/50 font-medium' : ''}`}
                  data-id={node.id}
                  onClick={onToggleRoleDeptClick}
                >
                  <div className="flex items-center space-x-2">
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                    <span className="text-sm text-slate-700 dark:text-slate-300">{node.name}</span>
                    <span className="text-xs text-slate-400">({deptRoles.length})</span>
                  </div>
                  {hasPermission(Permission.MANAGE_SETTINGS) && (
                    <button 
                      data-id={node.id}
                      onClick={onAddRoleClick}
                      className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md transition-colors shrink-0"
                      title="新增职位"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  )}
                </div>
                
                {isExpanded && (
                  <div className="p-2 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700">
                    {deptRoles.length > 0 ? (
                      <ul className="space-y-1">
                        {deptRoles.map(role => (
                          <li key={role.id} className="flex items-center justify-between p-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700/50 group">
                            <span className="text-sm text-slate-600 dark:text-slate-300">{role.name}</span>
                            {hasPermission(Permission.MANAGE_SETTINGS) && (
                              <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                  data-id={role.id}
                                  onClick={onEditRoleClick}
                                  className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-md transition-colors"
                                  title="编辑"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button 
                                  data-id={role.id}
                                  onClick={onDeleteRoleClick}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors"
                                  title="删除"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-xs text-slate-400 text-center py-2">暂无职位</div>
                    )}
                    
                    {hasChildren && (
                      <div className="mt-2">
                        {renderRoleTree(node.children!, level + 1)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    );
  }, [expandedRoleDepts, roles, hasPermission, onToggleRoleDeptClick, onAddRoleClick, onEditRoleClick, onDeleteRoleClick]);

  return (
    <div className="h-full flex flex-col">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* 部门架构 */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 shadow-sm border border-slate-200/60 dark:border-slate-700/60 rounded-xl flex flex-col min-h-0">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50 rounded-t-xl">
            <div className="flex items-center space-x-2">
              <Building2 className="w-5 h-5 text-slate-500 dark:text-slate-400" />
              <h2 className="text-base font-medium text-slate-800 dark:text-slate-200">部门架构 ({flatDepts.length})</h2>
            </div>
            {hasPermission(Permission.MANAGE_SETTINGS) && (
              <button 
                onClick={handleAddRoot}
                className="inline-flex items-center justify-center px-3 py-1.5 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-white text-sm font-medium rounded-lg hover:from-blue-600 hover:to-blue-700 active:scale-95 transition-transform shadow-sm"
              >
                <Plus className="h-4 w-4 mr-1" />
                新增一级部门
              </button>
            )}
          </div>
          <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
            {departments.length > 0 ? (
              renderTree(departments)
            ) : (
              <div className="text-center py-12">
                <Building2 className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" />
                <h3 className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-200">暂无部门数据</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 mb-6">开始添加您的第一个公司部门吧。</p>
                <button
                  onClick={handleAddRoot}
                  className="inline-flex items-center px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-white rounded-lg hover:from-blue-600 hover:to-blue-700 active:scale-95 transition-transform shadow-sm"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  立即创建
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 职位设置 */}
        <div className="lg:col-span-1 bg-white dark:bg-slate-800 shadow-sm border border-slate-200/60 dark:border-slate-700/60 rounded-xl flex flex-col min-h-0">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50 rounded-t-xl">
            <div className="flex items-center space-x-2">
              <Briefcase className="w-5 h-5 text-slate-500 dark:text-slate-400" />
              <h2 className="text-base font-medium text-slate-800 dark:text-slate-200">职位设置 ({roles.length})</h2>
            </div>
            {departments.length > 0 && (
              <button
                onClick={isAllRoleDeptsExpanded ? collapseAllRoleDepts : expandAllRoleDepts}
                className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors"
              >
                {isAllRoleDeptsExpanded ? '一键收起' : '一键展开'}
              </button>
            )}
          </div>
          <div className="p-4 flex-1 overflow-y-auto space-y-3 custom-scrollbar">
            {departments.length > 0 ? (
              renderRoleTree(departments)
            ) : (
              <div className="text-center py-12">
                <Briefcase className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" />
                <h3 className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-200">暂无部门数据</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">请先在左侧添加部门</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Department Modal */}
      <BaseModal
        isOpen={modal.isOpen}
        onClose={() => setModal(prev => ({ ...prev, isOpen: false }))}
        title={modal.mode === 'add' ? (modal.parentId ? '新增子部门' : '新增一级部门') : '编辑部门'}
        size="md"
        footer={
          <>
            <button type="button" onClick={() => setModal(prev => ({ ...prev, isOpen: false }))} className="mt-3 w-full inline-flex justify-center rounded-md border border-zinc-200/80 shadow-sm px-4 py-2 bg-white text-base font-medium text-slate-700 hover:bg-slate-50 active:scale-95 transition-transform sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">取消</button>
            <button type="submit" form="dept-form" className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-base font-medium text-white hover:from-blue-600 hover:to-blue-700 active:scale-95 transition-transform sm:ml-3 sm:w-auto sm:text-sm">保存</button>
          </>
        }
      >
        <form id="dept-form" onSubmit={handleModalSubmit} className="space-y-4">
          {modal.mode === 'add' && modal.parentId && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">上级部门</label>
              <input 
                type="text" 
                disabled 
                value={flatDepts.find(d => d.id === modal.parentId)?.name || ''} 
                className="block w-full border border-slate-200 bg-slate-50 rounded-md shadow-sm py-2 px-3 text-slate-500 sm:text-sm" 
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">部门名称 <span className="text-red-500">*</span></label>
            <input 
              required 
              autoFocus
              name="name"
              type="text" 
              defaultValue={modal.defaultName} 
              placeholder="请输入部门名称"
              className="block w-full border border-zinc-200/80 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">优先级</label>
            <input 
              name="priority"
              type="number" 
              defaultValue={modal.defaultPriority} 
              placeholder="数字越大越靠前"
              className="block w-full border border-zinc-200/80 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm" 
            />
            <p className="mt-1 text-xs text-slate-500">数字越大，在列表中的排序越靠前</p>
          </div>
        </form>
      </BaseModal>

      {/* Role Modal */}
      <BaseModal
        isOpen={roleModal.isOpen}
        onClose={() => setRoleModal(prev => ({ ...prev, isOpen: false }))}
        title={roleModal.mode === 'add' ? '新增职位' : '编辑职位'}
        size="md"
        footer={
          <>
            <button type="button" onClick={() => setRoleModal(prev => ({ ...prev, isOpen: false }))} className="mt-3 w-full inline-flex justify-center rounded-md border border-zinc-200/80 shadow-sm px-4 py-2 bg-white text-base font-medium text-slate-700 hover:bg-slate-50 active:scale-95 transition-transform sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm">取消</button>
            <button type="submit" form="role-form" className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-base font-medium text-white hover:from-blue-600 hover:to-blue-700 active:scale-95 transition-transform sm:ml-3 sm:w-auto sm:text-sm">保存</button>
          </>
        }
      >
        <form id="role-form" onSubmit={handleRoleModalSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">职位名称 <span className="text-red-500">*</span></label>
            <input 
              required 
              autoFocus
              name="name"
              type="text" 
              defaultValue={roleModal.defaultName} 
              placeholder="请输入职位名称"
              className="block w-full border border-zinc-200/80 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">优先级</label>
            <input 
              name="priority"
              type="number" 
              defaultValue={roleModal.defaultPriority} 
              placeholder="数字越大越靠前"
              className="block w-full border border-zinc-200/80 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 sm:text-sm" 
            />
            <p className="mt-1 text-xs text-slate-500">数字越大，在列表中的排序越靠前</p>
          </div>
        </form>
      </BaseModal>
    </div>
  );
}
