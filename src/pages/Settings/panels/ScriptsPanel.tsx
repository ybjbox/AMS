import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Save, FileCode, Palette } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { AnimatePresence, motion } from 'motion/react';
import { exportApi } from '@/services/exportApi';
import { describeSaveError } from '@/store/saveFailureCore';
import { Button } from '@/components/ui/button';

export default function ScriptsPanel() {
  const [scripts, setScripts] = useState<{ name: string; code: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingScript, setEditingScript] = useState<{ name: string; code: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchScripts();
  }, []);

  const fetchScripts = async () => {
    try {
      setScripts(await exportApi.listTemplates());
    } catch (error) {
      toast.error(describeSaveError(error, '加载脚本模板失败'));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editingScript || !editingScript.name || !editingScript.code) return;
    setSaving(true);
    try {
      // 名称白名单（字母/数字/下划线/中划线）由服务端校验，失败原因直接透传
      await exportApi.saveTemplate(editingScript.name, editingScript.code);
      setEditingScript(null);
      fetchScripts();
      toast.success(`保存成功: ${editingScript.name}.js`);
    } catch (error) {
      toast.error(describeSaveError(error, '保存脚本失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (name: string) => {
    try {
      await exportApi.deleteTemplate(name);
      fetchScripts();
      toast.success(`删除成功: ${name}`);
    } catch (error) {
      toast.error(describeSaveError(error, '删除脚本失败'));
    }
  };

  const handleAdd = () => {
    setEditingScript({
      name: `template_${Date.now()}`,
      code: `/**
 * @param {import('exceljs').Worksheet} worksheet
 * @param {any[]} data - 员工数据
 * @param {any} config - 导出配置
 */
export default async function applyTemplate(worksheet, data, config) {
  const { title, columns } = config;
  
  // 自定义逻辑开始
  worksheet.addRow([title + " (脚本生成)"]);
  worksheet.addRow(columns.map(c => c.header));
  
  data.forEach(item => {
    worksheet.addRow(columns.map(c => item[c.key]));
  });
}`,
    });
  };

  if (loading) return <div className="flex items-center justify-center h-full text-zinc-400">加载中…</div>;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-medium text-zinc-900 dark:text-white">导出脚本模板</h2>
          <p className="text-sm text-muted-foreground mt-1">
            使用 JavaScript 高度自定义 Excel 导出逻辑，支持 ExcelJS 所有 API
          </p>
        </div>
        {!editingScript && (
          <Button onClick={handleAdd}>
            <Plus className="w-4 h-4 mr-2" />
            创建脚本
          </Button>
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {editingScript ? (
          <motion.div
            key="edit"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="bg-white dark:bg-zinc-800 rounded-xl border border-brand-200 dark:border-brand-900 shadow-md overflow-hidden"
          >
            <div className="p-4 border-b border-zinc-100 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <FileCode className="w-5 h-5 text-brand-600 dark:text-brand-400" />
                <input
                  type="text"
                  value={editingScript.name}
                  onChange={(e) => setEditingScript({ ...editingScript, name: e.target.value })}
                  placeholder="脚本名称 (如: monthly_report)"
                  className="bg-transparent border-b border-brand-300 dark:border-brand-700 focus:border-brand-600 dark:focus:border-brand-400 outline-none px-1 font-semibold text-zinc-900 dark:text-white"
                />
                <span className="text-zinc-400 font-mono text-sm">.js</span>
              </div>
              <div className="flex items-center space-x-2">
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                  {saving ? '保存中…' : '保存脚本'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEditingScript(null)}>
                  取消
                </Button>
              </div>
            </div>
            <div className="p-0">
              <textarea
                value={editingScript.code}
                onChange={(e) => setEditingScript({ ...editingScript, code: e.target.value })}
                className="w-full h-[500px] p-4 font-mono text-sm bg-zinc-900 text-brand-400 outline-none resize-none"
                spellCheck={false}
              />
            </div>
            <div className="p-3 bg-zinc-800 text-3xs text-zinc-400 font-mono border-t border-zinc-700">
              提示: 脚本必须使用 export default 导出一个异步函数。
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {scripts.map((script) => (
              <div
                key={script.name}
                className="bg-white dark:bg-zinc-800 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-sm hover:shadow-md transition group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="p-2 bg-brand-50 dark:bg-brand-900/20 rounded-lg">
                    <FileCode className="w-6 h-6 text-brand-600 dark:text-brand-400" />
                  </div>
                  <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon-sm" onClick={() => setEditingScript(script)}>
                      <Palette className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(script.name)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <h3 className="font-semibold text-zinc-900 dark:text-white truncate">{script.name}.js</h3>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2 font-mono">{script.code.substring(0, 100)}…</p>
              </div>
            ))}
            {scripts.length === 0 && (
              <div className="col-span-full">
                <EmptyState
                  title="暂无脚本模板"
                  description="点击右上角创建"
                  icon={FileCode}
                  action={
                    <Button onClick={handleAdd}>
                      <Plus className="w-4 h-4 mr-2" />
                      立即创建
                    </Button>
                  }
                />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
