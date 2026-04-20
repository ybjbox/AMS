import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useBodyOverflow } from '../hooks/useBodyOverflow';
import { useEmployeeStore } from '../store/useEmployeeStore';
import { useContractStore, defaultTemplate } from '../store/useContractStore';
import { Search, Filter, FileSignature, Printer, Eye, FileEdit, Upload, Save, FileText } from 'lucide-react';
import { BaseModal } from '@/components/ui/BaseModal';
import { EmptyState } from '@/components/ui/EmptyState';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { User } from '../types';
import DOMPurify from 'dompurify';

const CONTRACT_STYLE: React.CSSProperties = { fontFamily: 'SimSun, "Songti SC", serif' };

const ContractTemplate = ({ user }: { user: User }) => {
  const template = useContractStore((state) => state.template);

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

  const sanitizedHTML = DOMPurify.sanitize(processed, {
    ALLOWED_TAGS: ['h1','h2','h3','h4','p','div','span','br','table','thead','tbody','tr','td','th','strong','em','u','ol','ul','li','hr'],
    ALLOWED_ATTR: ['style','class','colspan','rowspan']
  });

  return (
    <div
      id="contract-print-area"
      className="bg-white dark:bg-zinc-800 max-w-3xl mx-auto p-12 shadow-sm border border-zinc-200 dark:border-zinc-700 min-h-[1056px] text-black"
      style={CONTRACT_STYLE}
      dangerouslySetInnerHTML={{ __html: sanitizedHTML }}
    />
  );
};

export default function Contracts() {
  const users = useEmployeeStore((state) => state.users);
  const fetchUsers = useEmployeeStore((state) => state.fetchUsers);
  const template = useContractStore((state) => state.template);
  const setTemplate = useContractStore((state) => state.setTemplate);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isTemplateEditorOpen, setIsTemplateEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(template);
  const [isDoubleSided, setIsDoubleSided] = useState(true);

  const printRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useBodyOverflow(isPreviewOpen || isTemplateEditorOpen);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesSearch =
        user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.department.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = filterStatus === 'ALL' || user.status === filterStatus;

      return matchesSearch && matchesStatus;
    });
  }, [users, searchQuery, filterStatus]);

  const handlePreview = useCallback((user: User) => {
    setSelectedUser(user);
    setIsPreviewOpen(true);
  }, []);

  const handlePrint = useCallback(() => {
    const printArea = document.getElementById('contract-print-area');
    if (!printArea) return;

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:none';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) { document.body.removeChild(iframe); return; }

    doc.open();
    doc.write(`<!DOCTYPE html><html><head><style>
      body { margin:0; padding:0; font-family: SimSun,"Songti SC",serif; }
      @page { size:A4; margin:0; }
      ${isDoubleSided ? '.page { page-break-after: always; }' : ''}
    </style></head><body>${printArea.outerHTML}</body></html>`);
    doc.close();

    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) document.body.removeChild(iframe);
      }, 1000);
    };
  }, [isDoubleSided]);

  const handleDirectPrint = useCallback(
    (user: User) => {
      setSelectedUser(user);
      setTimeout(() => {
        handlePrint();
      }, 100);
    },
    [handlePrint]
  );

  const onPreviewClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const userId = e.currentTarget.dataset.userid;
      const user = users.find((u) => u.id === userId);
      if (user) {
        handlePreview(user);
      }
    },
    [users, handlePreview]
  );

  const onDirectPrintClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const userId = e.currentTarget.dataset.userid;
      const user = users.find((u) => u.id === userId);
      if (user) {
        handleDirectPrint(user);
      }
    },
    [users, handleDirectPrint]
  );

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Mock backend processing
    setTimeout(() => {
      setEditingTemplate('<h1>Mock Contract Template</h1><p>Name: {name}</p>');
      toast.success('成功上传合同模板 (Mock)');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }, 500);
  }, []);

  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredUsers.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 61,
    overscan: 5,
  });

  return (
    <div className="absolute inset-0 w-full flex flex-col p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col min-h-0 space-y-6 animate-in fade-in duration-500">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shrink-0">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white">合同管理</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">劳动合同管理、生成与打印</p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => {
                setEditingTemplate(template);
                setIsTemplateEditorOpen(true);
              }}
              className="flex items-center px-4 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-200/80 rounded-lg hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-600 dark:hover:bg-zinc-700 transition-colors"
            >
              <FileEdit className="w-4 h-4 mr-2" />
              模板设置
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 bg-white dark:bg-zinc-800 shadow-sm border border-zinc-200/60 dark:border-zinc-700/60 rounded-xl overflow-hidden flex flex-col">
          <div className="shrink-0 p-4 border-b border-zinc-200 dark:border-zinc-700 flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                placeholder="搜索员工姓名、工号或部门..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-zinc-200/80 dark:border-zinc-600 rounded-lg bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-white focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200"
              />
            </div>
            <div className="flex items-center space-x-2 shrink-0">
              <Filter className="w-4 h-4 text-zinc-400" />
              <Select value={filterStatus} onValueChange={(val) => setFilterStatus(val || 'ALL')}>
                <SelectTrigger className="w-[180px] text-sm border-zinc-200/80 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-white">
                  <SelectValue placeholder="选择状态">
                    {(val) =>
                      val === 'ALL'
                        ? '所有状态'
                        : val === '在职'
                          ? '在职'
                          : val === '试用期'
                            ? '试用期'
                            : val === '离职'
                              ? '离职'
                              : '选择状态'
                    }
                  </SelectValue>
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

          <div className="relative flex-1 rounded-b-xl border-t border-zinc-200 dark:border-zinc-700 h-full min-h-0">
            <div ref={parentRef} className="h-full overflow-x-auto custom-scrollbar">
              <table className="w-full min-w-[800px] text-left border-collapse relative" aria-label="合同列表">
                <thead className="bg-zinc-50 dark:bg-zinc-900/50 sticky top-0 z-20">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider relative z-30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] dark:shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)] bg-zinc-50 dark:bg-zinc-900/50"
                >
                  工号
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider bg-zinc-50 dark:bg-zinc-900/50"
                >
                  姓名
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider bg-zinc-50 dark:bg-zinc-900/50"
                >
                  部门
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider bg-zinc-50 dark:bg-zinc-900/50"
                >
                  合同状态
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider bg-zinc-50 dark:bg-zinc-900/50"
                >
                  签订日期
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider bg-zinc-50 dark:bg-zinc-900/50"
                >
                  到期日期
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider relative z-30 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)] dark:shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.5)] bg-zinc-50 dark:bg-zinc-900/50"
                >
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-700">
              {filteredUsers.length > 0 ? (
                <>
                  {rowVirtualizer.getVirtualItems().length > 0 && rowVirtualizer.getVirtualItems()[0]?.start > 0 && (
                    <tr>
                      <td colSpan={7} style={{ height: `${rowVirtualizer.getVirtualItems()[0].start}px`, padding: 0, border: 'none' }} />
                    </tr>
                  )}
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                      const user = filteredUsers[virtualRow.index];
                      const daysToExpiry =
                        typeof user.daysToExpiry === 'number'
                          ? user.daysToExpiry
                          : parseInt(user.daysToExpiry as string) || 999;
                      const isExpiringSoon = daysToExpiry <= 30 && daysToExpiry > 0;
                      const isExpired = daysToExpiry <= 0;

                      return (
                        <tr
                          key={user.id}
                          className="w-full hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors"
                        >
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-zinc-900 dark:text-white sticky left-0 z-10 bg-white dark:bg-zinc-800 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-700/50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] dark:shadow-[2px_0_5px_-2px_rgba(0,0,0,0.5)]">
                            {user.id}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400">
                            {user.name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400">
                            {user.department}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                isExpired
                                  ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                  : isExpiringSoon
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                              }`}
                            >
                              {isExpired ? '已过期' : isExpiringSoon ? '即将到期' : '正常'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400">
                            {user.contractSignDate || '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-500 dark:text-zinc-400">
                            {user.contractExpiry || '-'}
                            {isExpiringSoon && (
                              <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">({daysToExpiry}天后)</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium sticky right-0 z-10 bg-white dark:bg-zinc-800 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-700/50 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)] dark:shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.5)]">
                            <div className="flex items-center justify-end space-x-3">
                              <button
                                data-userid={user.id}
                                onClick={onPreviewClick}
                                className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 flex items-center"
                              >
                                <Eye className="w-4 h-4 mr-1" />
                                预览
                              </button>
                              <button
                                data-userid={user.id}
                                onClick={onDirectPrintClick}
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
                  {rowVirtualizer.getVirtualItems().length > 0 && rowVirtualizer.getTotalSize() - rowVirtualizer.getVirtualItems()[rowVirtualizer.getVirtualItems().length - 1].end > 0 && (
                    <tr>
                      <td colSpan={7} style={{ height: `${rowVirtualizer.getTotalSize() - rowVirtualizer.getVirtualItems()[rowVirtualizer.getVirtualItems().length - 1].end}px`, padding: 0, border: 'none' }} />
                    </tr>
                  )}
                </>
              ) : (
                <tr>
                  <td colSpan={7} className="p-0">
                    <EmptyState
                      title="没有找到符合条件的员工记录"
                      description="请尝试调整搜索条件或筛选器"
                      icon={FileText}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {/* 右侧渐变遮罩提示可横向滚动 */}
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white dark:from-zinc-800 to-transparent pointer-events-none md:hidden rounded-br-xl" />
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
            <div className="flex items-center bg-zinc-100 dark:bg-zinc-700 p-1 rounded-lg">
              <button
                onClick={() => setIsDoubleSided(false)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${!isDoubleSided ? 'bg-white dark:bg-zinc-600 shadow-sm text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}
              >
                单面
              </button>
              <button
                onClick={() => setIsDoubleSided(true)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${isDoubleSided ? 'bg-white dark:bg-zinc-600 shadow-sm text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}
              >
                双面
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsPreviewOpen(false)}
                className="mt-3 w-full inline-flex justify-center rounded-md border border-zinc-200/80 dark:border-zinc-600 shadow-sm px-4 py-2 bg-white dark:bg-zinc-700 text-base font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-600 active:scale-95 transition-transform sm:mt-0 sm:w-auto sm:text-sm"
              >
                取消
              </button>
              <button
                onClick={handlePrint}
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-base font-medium text-white hover:from-blue-500 hover:to-blue-600 active:scale-95 transition-transform sm:ml-0 sm:w-auto sm:text-sm"
              >
                <Printer className="w-4 h-4 mr-2" />
                打印合同
              </button>
            </div>
          </div>
        }
      >
        <div className="flex-1 overflow-y-auto p-8 bg-zinc-100 dark:bg-zinc-900 w-full h-[70vh]">
          {/* Printable Contract Area */}
          {selectedUser && <ContractTemplate user={selectedUser} />}
        </div>
      </BaseModal>

      {/* Hidden Printable Area for Direct Print */}
      <div className="hidden">
        <div ref={printRef}>{selectedUser && <ContractTemplate user={selectedUser} />}</div>
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
                className="flex items-center px-3 py-1.5 text-sm font-medium text-zinc-700 bg-zinc-100 rounded-lg hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600 transition-colors"
              >
                <Upload className="w-4 h-4 mr-1" />
                上传模板
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsTemplateEditorOpen(false)}
                className="mt-3 w-full inline-flex justify-center rounded-md border border-zinc-200/80 dark:border-zinc-600 shadow-sm px-4 py-2 bg-white dark:bg-zinc-700 text-base font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-600 active:scale-95 transition-transform sm:mt-0 sm:w-auto sm:text-sm"
              >
                取消
              </button>
              <button
                onClick={() => {
                  setTemplate(editingTemplate);
                  setIsTemplateEditorOpen(false);
                }}
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-base font-medium text-white hover:from-blue-500 hover:to-blue-600 active:scale-95 transition-transform sm:ml-0 sm:w-auto sm:text-sm"
              >
                <Save className="w-4 h-4 mr-2" />
                保存
              </button>
            </div>
          </div>
        }
      >
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row w-full h-[70vh]">
          <div className="w-full md:w-2/3 p-4 flex flex-col border-r border-zinc-200 dark:border-zinc-700">
            <div className="mb-2 flex justify-between items-center">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">HTML 模板源码</span>
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
              className="flex-1 w-full p-4 font-mono text-sm border border-zinc-200/80 dark:border-zinc-600 rounded-lg bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-300 focus:outline-none focus:ring-4 focus:ring-blue-600/20 focus:border-blue-600 transition-all duration-200 resize-none"
              spellCheck={false}
            />
          </div>
          <div className="w-full md:w-1/3 p-4 bg-zinc-50 dark:bg-zinc-800/50 overflow-y-auto">
            <h4 className="text-sm font-medium text-zinc-900 dark:text-white mb-4">可用变量</h4>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
              在左侧模板中使用以下变量，生成合同时会自动替换为员工的实际信息。
            </p>
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
              ].map((v) => (
                <div
                  key={v.key}
                  className="flex items-center justify-between bg-white dark:bg-zinc-700 p-2 rounded border border-zinc-200 dark:border-zinc-600"
                >
                  <code className="text-xs text-blue-600 dark:text-blue-400 font-mono bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">
                    {v.key}
                  </code>
                  <span className="text-xs text-zinc-600 dark:text-zinc-300">{v.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </BaseModal>
    </div>
    </div>
  );
}
