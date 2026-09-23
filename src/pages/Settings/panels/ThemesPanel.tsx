import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Save, RotateCcw, Palette } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { exportApi } from '@/services/exportApi';
import { describeSaveError } from '@/store/saveFailureCore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Theme {
  id: string;
  name: string;
  titleFill: string;
  headerFill: string;
  headerFontColor: string;
  zebraFill: string;
}

/** 颜色字段：label 必须与控件关联，否则读屏只报「编辑框」而说不出是哪一项配色 */
function ColorField({
  fieldId,
  label,
  hex,
  disabled,
  onChange,
}: {
  fieldId: string;
  label: string;
  hex: string;
  disabled: boolean;
  onChange: (hex: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={fieldId} className="block text-xs font-bold text-muted-foreground uppercase tracking-wider">
        {label}
      </label>
      <div className="flex items-center space-x-3">
        <Input
          id={fieldId}
          type="color"
          value={`#${hex}`}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value.substring(1).toUpperCase())}
          className="w-10 h-10 border-0 p-0 cursor-pointer bg-transparent"
        />
        <span className="text-sm font-mono text-zinc-600 dark:text-zinc-400">#{hex}</span>
      </div>
    </div>
  );
}

export default function ThemesPanel() {
  const [themes, setThemes] = useState<Record<string, Theme>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    fetchThemes();
  }, []);

  const fetchThemes = async () => {
    try {
      const data = await exportApi.fetchThemes();
      setThemes(data);
    } catch (error) {
      toast.error(describeSaveError(error, '加载主题失败'));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await exportApi.saveThemes(themes);
      // 以服务端回读结果为准，保证 UI 与持久化一致
      setThemes(res.themes as Record<string, Theme>);
      setEditingId(null);
      toast.success('保存成功');
    } catch (error) {
      toast.error(describeSaveError(error, '保存主题失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateTheme = (id: string, field: keyof Theme, value: string) => {
    setThemes((prev: Record<string, Theme>) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  const handleAddTheme = () => {
    const newId = `theme_${Date.now()}`;
    const newTheme = {
      id: newId,
      name: '新主题',
      titleFill: 'FFF1F5F9',
      headerFill: 'FF2563EB',
      headerFontColor: 'FFFFFFFF',
      zebraFill: 'FFF8FAFC',
    };
    setThemes((prev: Record<string, Theme>) => ({ ...prev, [newId]: newTheme }));
    setEditingId(newId);
  };

  const handleDeleteTheme = (id: string) => {
    if (id === 'default' || id === 'theme_1') {
      toast.warning('默认主题无法删除');
      return;
    }
    const newThemes = { ...themes };
    delete newThemes[id];
    setThemes(newThemes);
    handleSave();
  };

  if (loading) return <div className="flex items-center justify-center h-full text-zinc-400">加载中…</div>;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-medium text-zinc-900 dark:text-white">导出主题管理</h2>
          <p className="text-sm text-muted-foreground mt-1">自定义 Excel 导出的配色方案，包括标题、表头及隔行变色</p>
        </div>
        <Button onClick={handleAddTheme}>
          <Plus className="w-4 h-4 mr-2" />
          新增主题
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <AnimatePresence>
          {Object.values(themes).map((theme: Theme) => (
            <motion.div
              key={theme.id}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className={`bg-white dark:bg-zinc-800 rounded-xl border transition overflow-hidden ${
                editingId === theme.id ? 'border-brand-400 ring-4 ring-brand-600/5' : 'border-zinc-200 dark:border-zinc-700 shadow-sm'
              }`}
            >
              <div className="p-4 border-b border-zinc-100 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div
                    className="w-8 h-8 rounded-lg shadow-inner border border-black/10 dark:border-white/10"
                    style={{ backgroundColor: `#${theme.headerFill.substring(2)}` }}
                  ></div>
                  {editingId === theme.id ? (
                    <input
                      type="text"
                      value={theme.name}
                      onChange={(e) => handleUpdateTheme(theme.id, 'name', e.target.value)}
                      className="px-2 py-1 bg-transparent border border-brand-300 rounded text-sm font-semibold outline-none focus:outline-none focus:ring-4 focus:ring-brand-600/20 text-zinc-900 dark:text-white transition duration-200"
                    />
                  ) : (
                    <h3 className="font-semibold text-zinc-900 dark:text-white">{theme.name}</h3>
                  )}
                  {(theme.id === 'default' || theme.id === 'theme_1') && (
                    <span className="text-3xs bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400 px-2 py-0.5 rounded-full font-bold">默认</span>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  {editingId === theme.id ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleSave()}
                        disabled={saving}
                        title="保存"
                      >
                        <Save className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          setEditingId(null);
                          fetchThemes();
                        }}
                        title="取消"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" size="icon-sm" onClick={() => setEditingId(theme.id)} title="编辑">
                        <Palette className="w-4 h-4" />
                      </Button>
                      {theme.id !== 'default' && theme.id !== 'theme_1' && (
                        <Button variant="ghost" size="icon-sm" onClick={() => handleDeleteTheme(theme.id)} title="删除">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  <ColorField
                    fieldId={`${theme.id}-titleFill`}
                    label="大标题背景色"
                    hex={theme.titleFill.substring(2)}
                    disabled={editingId !== theme.id}
                    onChange={(hex) => handleUpdateTheme(theme.id, 'titleFill', `FF${hex}`)}
                  />
                  <ColorField
                    fieldId={`${theme.id}-headerFill`}
                    label="表头背景色"
                    hex={theme.headerFill.substring(2)}
                    disabled={editingId !== theme.id}
                    onChange={(hex) => handleUpdateTheme(theme.id, 'headerFill', `FF${hex}`)}
                  />
                  <ColorField
                    fieldId={`${theme.id}-headerFontColor`}
                    label="表头文字颜色"
                    hex={theme.headerFontColor.substring(2)}
                    disabled={editingId !== theme.id}
                    onChange={(hex) => handleUpdateTheme(theme.id, 'headerFontColor', `FF${hex}`)}
                  />
                  <ColorField
                    fieldId={`${theme.id}-zebraFill`}
                    label="隔行变色填充"
                    hex={theme.zebraFill.substring(2)}
                    disabled={editingId !== theme.id}
                    onChange={(hex) => handleUpdateTheme(theme.id, 'zebraFill', `FF${hex}`)}
                  />
                </div>

                {/* Preview Area */}
                <div className="mt-8">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">效果预览</p>
                  <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden shadow-sm">
                    <div
                      className="h-10 flex items-center justify-center text-sm font-bold text-zinc-900"
                      style={{ backgroundColor: `#${theme.titleFill.substring(2)}` }}
                    >
                      员工信息表预览
                    </div>
                    <div className="h-8 grid grid-cols-3 gap-px bg-zinc-200">
                      <div
                        className="flex items-center justify-center text-3xs font-bold"
                        style={{
                          backgroundColor: `#${theme.headerFill.substring(2)}`,
                          color: `#${theme.headerFontColor.substring(2)}`,
                        }}
                      >
                        工号
                      </div>
                      <div
                        className="flex items-center justify-center text-3xs font-bold"
                        style={{
                          backgroundColor: `#${theme.headerFill.substring(2)}`,
                          color: `#${theme.headerFontColor.substring(2)}`,
                        }}
                      >
                        姓名
                      </div>
                      <div
                        className="flex items-center justify-center text-3xs font-bold"
                        style={{
                          backgroundColor: `#${theme.headerFill.substring(2)}`,
                          color: `#${theme.headerFontColor.substring(2)}`,
                        }}
                      >
                        部门
                      </div>
                    </div>
                    <div className="h-6 grid grid-cols-3 gap-px bg-zinc-200">
                      <div className="bg-white flex items-center px-2 text-3xs text-zinc-900">001</div>
                      <div className="bg-white flex items-center px-2 text-3xs text-zinc-900">张三</div>
                      <div className="bg-white flex items-center px-2 text-3xs text-zinc-900">技术部</div>
                    </div>
                    <div className="h-6 grid grid-cols-3 gap-px bg-zinc-200">
                      <div
                        className="flex items-center px-2 text-3xs text-zinc-900"
                        style={{ backgroundColor: `#${theme.zebraFill.substring(2)}` }}
                      >
                        002
                      </div>
                      <div
                        className="flex items-center px-2 text-3xs text-zinc-900"
                        style={{ backgroundColor: `#${theme.zebraFill.substring(2)}` }}
                      >
                        李四
                      </div>
                      <div
                        className="flex items-center px-2 text-3xs text-zinc-900"
                        style={{ backgroundColor: `#${theme.zebraFill.substring(2)}` }}
                      >
                        人事部
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
