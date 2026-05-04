import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Save, FileCode, Palette } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { AnimatePresence, motion } from 'motion/react';

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
      // Mock backend processing
      await new Promise((resolve) => setTimeout(resolve, 500));
      setScripts([
        { name: 'default_template', code: '// 默认导出模板' },
        { name: 'custom_template', code: '// 自定义导出模板' },
      ]);
    } catch (error) {
      console.error('Failed to fetch scripts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editingScript || !editingScript.name || !editingScript.code) return;
    setSaving(true);
    try {
      // Mock backend processing
      await new Promise((resolve) => setTimeout(resolve, 500));
      setEditingScript(null);
      fetchScripts();
      toast.success('保存成功 (Mock)');
    } catch (error) {
      console.error('Failed to save script:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (name: string) => {
    // Mock backend processing
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      fetchScripts();
      toast.success(`删除成功: ${name} (Mock)`);
    } catch (error) {
      console.error('Failed to delete script:', error);
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

  if (loading) return <div className="flex items-center justify-center h-full text-zinc-400">加载中...</div>;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-medium text-zinc-900 dark:text-white">导出脚本模板</h2>
          <p className="text-sm text-zinc-500 mt-1">
            使用 JavaScript 高度自定义 Excel 导出逻辑，支持 ExcelJS 所有 API
          </p>
        </div>
        {!editingScript && (
          <button
            onClick={handleAdd}
            className="flex items-center px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-white rounded-lg hover:from-blue-500 hover:to-blue-600 active:scale-95 transition-transform text-sm font-medium shadow-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            创建脚本
          </button>
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
            className="bg-white dark:bg-zinc-800 rounded-xl border border-blue-200 dark:border-blue-900 shadow-md overflow-hidden"
          >
            <div className="p-4 border-b border-zinc-100 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <FileCode className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <input
                  type="text"
                  value={editingScript.name}
                  onChange={(e) => setEditingScript({ ...editingScript, name: e.target.value })}
                  placeholder="脚本名称 (如: monthly_report)"
                  className="bg-transparent border-b border-blue-300 dark:border-blue-700 focus:border-blue-600 dark:focus:border-blue-400 outline-none px-1 font-semibold text-zinc-900 dark:text-white"
                />
                <span className="text-zinc-400 font-mono text-sm">.js</span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 active:scale-95 transition-transform text-xs font-medium"
                >
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                  {saving ? '保存中...' : '保存脚本'}
                </button>
                <button
                  onClick={() => setEditingScript(null)}
                  className="flex items-center px-3 py-1.5 bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-zinc-300 dark:hover:bg-zinc-600 active:scale-95 transition-transform text-xs font-medium"
                >
                  取消
                </button>
              </div>
            </div>
            <div className="p-0">
              <textarea
                value={editingScript.code}
                onChange={(e) => setEditingScript({ ...editingScript, code: e.target.value })}
                className="w-full h-[500px] p-4 font-mono text-sm bg-zinc-900 text-emerald-400 outline-none resize-none"
                spellCheck={false}
              />
            </div>
            <div className="p-3 bg-zinc-800 text-[10px] text-zinc-400 font-mono border-t border-zinc-700">
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
                className="bg-white dark:bg-zinc-800 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-sm hover:shadow-md transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <FileCode className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setEditingScript(script)}
                      className="p-1.5 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                    >
                      <Palette className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(script.name)}
                      className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-md transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <h3 className="font-semibold text-zinc-900 dark:text-white truncate">{script.name}.js</h3>
                <p className="text-xs text-zinc-500 mt-1 line-clamp-2 font-mono">{script.code.substring(0, 100)}...</p>
              </div>
            ))}
            {scripts.length === 0 && (
              <div className="col-span-full">
                <EmptyState
                  title="暂无脚本模板"
                  description="点击右上角创建"
                  icon={FileCode}
                  action={
                    <button
                      onClick={handleAdd}
                      className="inline-flex items-center px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-white rounded-lg hover:from-blue-500 hover:to-blue-600 active:scale-95 transition-transform shadow-sm"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      立即创建
                    </button>
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
