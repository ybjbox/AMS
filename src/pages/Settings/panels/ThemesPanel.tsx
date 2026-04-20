import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Save, RotateCcw, Palette } from 'lucide-react';

interface Theme {
  id: string;
  name: string;
  titleFill: string;
  headerFill: string;
  headerFontColor: string;
  zebraFill: string;
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
      // Mock backend processing
      await new Promise((resolve) => setTimeout(resolve, 500));
      setThemes({
        theme_1: {
          id: 'theme_1',
          name: '默认主题',
          titleFill: 'FFF1F5F9',
          headerFill: 'FF2563EB',
          headerFontColor: 'FFFFFFFF',
          zebraFill: 'FFF8FAFC',
        },
      });
    } catch (error) {
      console.error('Failed to fetch themes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Mock backend processing
      await new Promise((resolve) => setTimeout(resolve, 500));
      setEditingId(null);
      toast.success('保存成功 (Mock)');
    } catch (error) {
      console.error('Failed to save themes:', error);
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
    if (id === 'default') {
      toast.warning('默认主题无法删除');
      return;
    }
    const newThemes = { ...themes };
    delete newThemes[id];
    setThemes(newThemes);
    handleSave(newThemes);
  };

  if (loading) return <div className="flex items-center justify-center h-full text-zinc-400">加载中...</div>;

  return (
    <div className="h-full overflow-y-auto p-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-medium text-zinc-900 dark:text-white">导出主题管理</h2>
          <p className="text-sm text-zinc-500 mt-1">自定义 Excel 导出的配色方案，包括标题、表头及隔行变色</p>
        </div>
        <button
          onClick={handleAddTheme}
          className="flex items-center px-4 py-2 bg-gradient-to-b from-blue-600 to-blue-700 shadow-inner text-white rounded-lg hover:from-blue-500 hover:to-blue-600 active:scale-95 transition-transform text-sm font-medium shadow-sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          新增主题
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {Object.values(themes).map((theme: Theme) => (
          <div
            key={theme.id}
            className={`bg-white dark:bg-zinc-800 rounded-xl border transition-all overflow-hidden ${
              editingId === theme.id ? 'border-blue-400 ring-4 ring-blue-600/5' : 'border-zinc-200 dark:border-zinc-700 shadow-sm'
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
                    className="px-2 py-1 bg-transparent border border-blue-300 rounded text-sm font-semibold outline-none focus:outline-none focus:ring-4 focus:ring-blue-600/20 text-zinc-900 dark:text-white transition-all duration-200"
                  />
                ) : (
                  <h3 className="font-semibold text-zinc-900 dark:text-white">{theme.name}</h3>
                )}
                {(theme.id === 'default' || theme.id === 'theme_1') && (
                  <span className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 rounded-full font-bold">默认</span>
                )}
              </div>

              <div className="flex items-center space-x-2">
                {editingId === theme.id ? (
                  <>
                    <button
                      onClick={() => handleSave()}
                      disabled={saving}
                      className="p-2 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors"
                      title="保存"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(null);
                        fetchThemes();
                      }}
                      className="p-2 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
                      title="取消"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setEditingId(theme.id)}
                      className="p-2 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
                      title="编辑"
                    >
                      <Palette className="w-4 h-4" />
                    </button>
                    {theme.id !== 'default' && theme.id !== 'theme_1' && (
                      <button
                        onClick={() => handleDeleteTheme(theme.id)}
                        className="p-2 text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Title Fill */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">大标题背景色</label>
                  <div className="flex items-center space-x-3">
                    <input
                      type="color"
                      value={`#${theme.titleFill.substring(2)}`}
                      disabled={editingId !== theme.id}
                      onChange={(e) =>
                        handleUpdateTheme(theme.id, 'titleFill', `FF${e.target.value.substring(1).toUpperCase()}`)
                      }
                      className="w-10 h-10 rounded-lg border-0 p-0 cursor-pointer disabled:cursor-not-allowed bg-transparent"
                    />
                    <span className="text-sm font-mono text-zinc-600 dark:text-zinc-400">#{theme.titleFill.substring(2)}</span>
                  </div>
                </div>

                {/* Header Fill */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">表头背景色</label>
                  <div className="flex items-center space-x-3">
                    <input
                      type="color"
                      value={`#${theme.headerFill.substring(2)}`}
                      disabled={editingId !== theme.id}
                      onChange={(e) =>
                        handleUpdateTheme(theme.id, 'headerFill', `FF${e.target.value.substring(1).toUpperCase()}`)
                      }
                      className="w-10 h-10 rounded-lg border-0 p-0 cursor-pointer disabled:cursor-not-allowed bg-transparent"
                    />
                    <span className="text-sm font-mono text-zinc-600 dark:text-zinc-400">#{theme.headerFill.substring(2)}</span>
                  </div>
                </div>

                {/* Header Font Color */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">表头文字颜色</label>
                  <div className="flex items-center space-x-3">
                    <input
                      type="color"
                      value={`#${theme.headerFontColor.substring(2)}`}
                      disabled={editingId !== theme.id}
                      onChange={(e) =>
                        handleUpdateTheme(theme.id, 'headerFontColor', `FF${e.target.value.substring(1).toUpperCase()}`)
                      }
                      className="w-10 h-10 rounded-lg border-0 p-0 cursor-pointer disabled:cursor-not-allowed bg-transparent"
                    />
                    <span className="text-sm font-mono text-zinc-600 dark:text-zinc-400">#{theme.headerFontColor.substring(2)}</span>
                  </div>
                </div>

                {/* Zebra Fill */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">隔行变色填充</label>
                  <div className="flex items-center space-x-3">
                    <input
                      type="color"
                      value={`#${theme.zebraFill.substring(2)}`}
                      disabled={editingId !== theme.id}
                      onChange={(e) =>
                        handleUpdateTheme(theme.id, 'zebraFill', `FF${e.target.value.substring(1).toUpperCase()}`)
                      }
                      className="w-10 h-10 rounded-lg border-0 p-0 cursor-pointer disabled:cursor-not-allowed bg-transparent"
                    />
                    <span className="text-sm font-mono text-zinc-600 dark:text-zinc-400">#{theme.zebraFill.substring(2)}</span>
                  </div>
                </div>
              </div>

              {/* Preview Area */}
              <div className="mt-8">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3 block">效果预览</label>
                <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden shadow-sm">
                  <div
                    className="h-10 flex items-center justify-center text-sm font-bold text-zinc-900 dark:text-zinc-200"
                    style={{ backgroundColor: `#${theme.titleFill.substring(2)}` }}
                  >
                    员工信息表预览
                  </div>
                  <div className="h-8 grid grid-cols-3 gap-px bg-zinc-200 dark:bg-zinc-700">
                    <div
                      className="flex items-center justify-center text-[10px] font-bold"
                      style={{
                        backgroundColor: `#${theme.headerFill.substring(2)}`,
                        color: `#${theme.headerFontColor.substring(2)}`,
                      }}
                    >
                      工号
                    </div>
                    <div
                      className="flex items-center justify-center text-[10px] font-bold"
                      style={{
                        backgroundColor: `#${theme.headerFill.substring(2)}`,
                        color: `#${theme.headerFontColor.substring(2)}`,
                      }}
                    >
                      姓名
                    </div>
                    <div
                      className="flex items-center justify-center text-[10px] font-bold"
                      style={{
                        backgroundColor: `#${theme.headerFill.substring(2)}`,
                        color: `#${theme.headerFontColor.substring(2)}`,
                      }}
                    >
                      部门
                    </div>
                  </div>
                  <div className="h-6 grid grid-cols-3 gap-px bg-zinc-200 dark:bg-zinc-700">
                    <div className="bg-white dark:bg-zinc-900 flex items-center px-2 text-[10px]">001</div>
                    <div className="bg-white dark:bg-zinc-900 flex items-center px-2 text-[10px]">张三</div>
                    <div className="bg-white dark:bg-zinc-900 flex items-center px-2 text-[10px]">技术部</div>
                  </div>
                  <div className="h-6 grid grid-cols-3 gap-px bg-zinc-200 dark:bg-zinc-700">
                    <div
                      className="flex items-center px-2 text-[10px] text-zinc-900 dark:text-zinc-200"
                      style={{ backgroundColor: `#${theme.zebraFill.substring(2)}` }}
                    >
                      002
                    </div>
                    <div
                      className="flex items-center px-2 text-[10px] text-zinc-900 dark:text-zinc-200"
                      style={{ backgroundColor: `#${theme.zebraFill.substring(2)}` }}
                    >
                      李四
                    </div>
                    <div
                      className="flex items-center px-2 text-[10px] text-zinc-900 dark:text-zinc-200"
                      style={{ backgroundColor: `#${theme.zebraFill.substring(2)}` }}
                    >
                      人事部
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
