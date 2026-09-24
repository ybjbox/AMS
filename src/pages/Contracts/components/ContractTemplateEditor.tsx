import React, { useRef, useCallback, useState } from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Textarea } from '@/components/ui/textarea';
import { FileEdit, Upload, Save } from 'lucide-react';
import { toast } from 'sonner';
import { defaultTemplate } from '@/config/defaultContractTemplate';
import { useContractStore } from '@/store/useContractStore';

interface ContractTemplateEditorProps {
  isOpen: boolean;
  onClose: () => void;
}

/** 模板要整份塞进 textarea 并持久化，给个够用的上限（合同正文 HTML 通常 10–30KB） */
const MAX_TEMPLATE_BYTES = 512 * 1024;

export const ContractTemplateEditor = ({ isOpen, onClose }: ContractTemplateEditorProps) => {
  const template = useContractStore((state) => state.template);
  const setTemplate = useContractStore((state) => state.setTemplate);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingTemplate, setEditingTemplate] = useState(template);

  /**
   * 真读文件：模板就是 HTML/纯文本源码（输入框 accept=".html,.txt"），
   * 所以浏览器读文本即可，不需要后端 —— 也不该假装能解析 docx。
   */
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;
    if (file.size > MAX_TEMPLATE_BYTES) {
      toast.error(`模板文件超过 ${MAX_TEMPLATE_BYTES / 1024}KB，无法载入`);
      return;
    }
    try {
      const text = await file.text();
      if (!text.trim()) {
        toast.error(`${file.name} 是空文件，没有可载入的模板内容`);
        return;
      }
      setEditingTemplate(text);
      toast.success(`已载入 ${file.name}（${text.length} 字符），确认后点保存生效`);
    } catch (error) {
      toast.error(`读取文件失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }, []);

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center">
          <FileEdit className="w-5 h-5 mr-2 text-brand-600 dark:text-brand-400" />
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
              className="btn-secondary"
            >
              <Upload className="w-4 h-4 mr-1" />
              上传模板
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="btn-secondary"
            >
              取消
            </button>
            <button
              onClick={() => {
                setTemplate(editingTemplate);
                onClose();
              }}
              className="btn-primary"
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
              className="text-xs text-brand-600 hover:text-brand-700 dark:text-brand-400"
            >
              恢复默认模板
            </button>
          </div>
          <Textarea
            value={editingTemplate}
            onChange={(e) => setEditingTemplate(e.target.value)}
            aria-label="HTML 合同模板源码"
            spellCheck={false}
            className="field-sizing-fixed flex-1 w-full p-4 font-mono resize-none"
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
                <code className="text-xs text-brand-600 dark:text-brand-400 font-mono bg-brand-50 dark:bg-brand-900/30 px-1.5 py-0.5 rounded">
                  {v.key}
                </code>
                <span className="text-xs text-zinc-600 dark:text-zinc-300">{v.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </BaseModal>
  );
};
