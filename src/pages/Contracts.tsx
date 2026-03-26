import React, { useState, useRef, useEffect } from 'react';
import { useUserStore } from '../store/users';
import { useContractStore, defaultTemplate } from '../store/contracts';
import { Search, Filter, FileSignature, Printer, Eye, X, FileEdit, Upload, Save } from 'lucide-react';
import { BaseModal } from '../components/ui/BaseModal';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';

const ContractTemplate = ({ user }: { user: any }) => {
  const { template } = useContractStore();
  
  if (!user) return null;

  const signDate = user.contractSignDate ? new Date(user.contractSignDate) : null;
  const expiryDate = user.contractExpiry ? new Date(user.contractExpiry) : null;
  
  const replacements: Record<string, string> = {
    '{name}': user.name || '',
    '{idCard}': user.idCard || '__________________',
    '{phone}': user.phone || '__________________',
    '{department}': user.department || '',
    '{role}': user.role || '员工',
    '{contractYears}': String(user.contractYears || 3),
    '{signYear}': signDate ? String(signDate.getFullYear()) : '____',
    '{signMonth}': signDate ? String(signDate.getMonth() + 1) : '__',
    '{signDay}': signDate ? String(signDate.getDate()) : '__',
    '{expiryYear}': expiryDate ? String(expiryDate.getFullYear()) : '____',
    '{expiryMonth}': expiryDate ? String(expiryDate.getMonth() + 1) : '__',
    '{expiryDay}': expiryDate ? String(expiryDate.getDate()) : '__',
  };

  let processed = template;
  for (const [key, value] of Object.entries(replacements)) {
    processed = processed.replace(new RegExp(key, 'g'), value);
  }

  return (
    <div 
      className="bg-white max-w-3xl mx-auto p-12 shadow-sm border border-slate-200 min-h-[1056px] text-black"
      style={{ fontFamily: 'SimSun, "Songti SC", serif' }}
      dangerouslySetInnerHTML={{ __html: processed }}
    />
  );
};

export default function Contracts() {
  const { users, fetchUsers } = useUserStore();
  const { template, setTemplate } = useContractStore();
  
  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isTemplateEditorOpen, setIsTemplateEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(template);
  const [isDoubleSided, setIsDoubleSided] = useState(true);
  
  const printRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isPreviewOpen || isTemplateEditorOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isPreviewOpen, isTemplateEditorOpen]);

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.department.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = filterStatus === 'ALL' || user.status === filterStatus;
    
    return matchesSearch && matchesStatus;
  });

  const handlePreview = (user: any) => {
    setSelectedUser(user);
    setIsPreviewOpen(true);
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    
    const printContent = printRef.current.innerHTML;
    const originalContent = document.body.innerHTML;
    
    const printStyle = `
      <style>
        @media print {
          @page {
            size: A4;
            margin: 20mm;
          }
          ${isDoubleSided ? `
          @page :left {
            margin-left: 15mm;
            margin-right: 25mm;
          }
          @page :right {
            margin-left: 25mm;
            margin-right: 15mm;
          }
          ` : `
          @page {
            margin-left: 25mm;
            margin-right: 15mm;
          }
          `}
        }
      </style>
    `;
    
    document.body.innerHTML = printStyle + printContent;
    window.print();
    document.body.innerHTML = originalContent;
    window.location.reload(); // Reload to restore React bindings
  };

  const handleDirectPrint = (user: any) => {
    setSelectedUser(user);
    setTimeout(() => {
      handlePrint();
    }, 100);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Mock backend processing
    setTimeout(() => {
      setEditingTemplate('<h1>Mock Contract Template</h1><p>Name: {name}</p>');
      alert('成功上传合同模板 (Mock)');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }, 500);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">合同管理</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">劳动合同管理、生成与打印</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => {
              setEditingTemplate(template);
              setIsTemplateEditorOpen(true);
            }}
            className="flex items-center px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600 dark:hover:bg-slate-700 transition-colors"
          >
            <FileEdit className="w-4 h-4 mr-2" />
            模板设置
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索员工姓名、工号或部门..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px] text-sm border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white">
                <SelectValue placeholder="选择状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">所有状态</SelectItem>
                <SelectItem value="在职">在职</SelectItem>
                <SelectItem value="试用期">试用期</SelectItem>
                <SelectItem value="离职">离职</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
            <thead className="bg-slate-50 dark:bg-slate-900/50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">工号</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">姓名</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">部门</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">合同状态</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">签订日期</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">到期日期</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
              {filteredUsers.map((user) => {
                const daysToExpiry = typeof user.daysToExpiry === 'number' ? user.daysToExpiry : parseInt(user.daysToExpiry as string) || 999;
                const isExpiringSoon = daysToExpiry <= 30 && daysToExpiry > 0;
                const isExpired = daysToExpiry <= 0;

                return (
                  <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 dark:text-white">{user.id}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">{user.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">{user.department}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        isExpired ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                        isExpiringSoon ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' :
                        'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                      }`}>
                        {isExpired ? '已过期' : isExpiringSoon ? '即将到期' : '正常'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">{user.contractSignDate || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                      {user.contractExpiry || '-'}
                      {isExpiringSoon && <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">({daysToExpiry}天后)</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-3">
                        <button
                          onClick={() => handlePreview(user)}
                          className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 flex items-center"
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          预览
                        </button>
                        <button
                          onClick={() => handleDirectPrint(user)}
                          className="text-emerald-600 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300 flex items-center"
                        >
                          <Printer className="w-4 h-4 mr-1" />
                          打印
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    没有找到符合条件的员工记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Contract Preview Modal */}
      <BaseModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        title={
          <div className="flex items-center">
            <FileSignature className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" />
            劳动合同预览 - {selectedUser?.name}
          </div>
        }
        size="4xl"
        bodyClassName="p-0"
        footer={
          <div className="flex items-center w-full justify-between">
            <div className="flex items-center bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
              <button
                onClick={() => setIsDoubleSided(false)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${!isDoubleSided ? 'bg-white dark:bg-slate-600 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
              >
                单面
              </button>
              <button
                onClick={() => setIsDoubleSided(true)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${isDoubleSided ? 'bg-white dark:bg-slate-600 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
              >
                双面
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsPreviewOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600 dark:hover:bg-slate-700 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 active:scale-95 transition-transform"
              >
                <Printer className="w-4 h-4 mr-2" />
                打印合同
              </button>
            </div>
          </div>
        }
      >
        <div className="flex-1 overflow-y-auto p-8 bg-slate-100 dark:bg-slate-900 w-full h-[70vh]">
          {/* Printable Contract Area */}
          {selectedUser && <ContractTemplate user={selectedUser} />}
        </div>
      </BaseModal>

      {/* Hidden Printable Area for Direct Print */}
      <div className="hidden">
        <div ref={printRef}>
          {selectedUser && <ContractTemplate user={selectedUser} />}
        </div>
      </div>

      {/* Template Editor Modal */}
      <BaseModal
        isOpen={isTemplateEditorOpen}
        onClose={() => setIsTemplateEditorOpen(false)}
        title={
          <div className="flex items-center">
            <FileEdit className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" />
            劳动合同模板设置
          </div>
        }
        size="5xl"
        bodyClassName="p-0"
        footer={
          <div className="flex items-center w-full justify-between">
            <div className="flex items-center">
              <input 
                type="file" 
                accept=".html,.txt" 
                className="hidden" 
                ref={fileInputRef}
                onChange={handleFileUpload}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center px-3 py-1.5 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                <Upload className="w-4 h-4 mr-1" />
                上传模板
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsTemplateEditorOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600 dark:hover:bg-slate-700 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  setTemplate(editingTemplate);
                  setIsTemplateEditorOpen(false);
                }}
                className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 active:scale-95 transition-transform"
              >
                <Save className="w-4 h-4 mr-2" />
                保存
              </button>
            </div>
          </div>
        }
      >
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row w-full h-[70vh]">
          <div className="w-full md:w-2/3 p-4 flex flex-col border-r border-slate-200 dark:border-slate-700">
             <div className="mb-2 flex justify-between items-center">
               <span className="text-sm font-medium text-slate-700 dark:text-slate-300">HTML 模板源码</span>
               <button 
                 onClick={() => setEditingTemplate(defaultTemplate)}
                 className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
               >
                 恢复默认模板
               </button>
             </div>
             <textarea
               value={editingTemplate}
               onChange={(e) => setEditingTemplate(e.target.value)}
               className="flex-1 w-full p-4 font-mono text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
               spellCheck={false}
             />
          </div>
          <div className="w-full md:w-1/3 p-4 bg-slate-50 dark:bg-slate-800/50 overflow-y-auto">
            <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-4">可用变量</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">在左侧模板中使用以下变量，生成合同时会自动替换为员工的实际信息。</p>
            <div className="space-y-2">
              {[
                { key: '{name}', desc: '员工姓名' },
                { key: '{idCard}', desc: '身份证号码' },
                { key: '{phone}', desc: '联系电话' },
                { key: '{department}', desc: '所属部门' },
                { key: '{role}', desc: '担任岗位' },
                { key: '{contractYears}', desc: '合同年限' },
                { key: '{signYear}', desc: '签订年份' },
                { key: '{signMonth}', desc: '签订月份' },
                { key: '{signDay}', desc: '签订日期' },
                { key: '{expiryYear}', desc: '到期年份' },
                { key: '{expiryMonth}', desc: '到期月份' },
                { key: '{expiryDay}', desc: '到期日期' },
              ].map(v => (
                <div key={v.key} className="flex items-center justify-between bg-white dark:bg-slate-700 p-2 rounded border border-slate-200 dark:border-slate-600">
                  <code className="text-xs text-blue-600 dark:text-blue-400 font-mono bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">{v.key}</code>
                  <span className="text-xs text-slate-600 dark:text-slate-300">{v.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </BaseModal>
    </div>
  );
}
