import React, { useState } from 'react';
import { Download, Loader2, Save, Trash2 } from 'lucide-react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Input } from '@/components/ui/input';
import type { SavedItem } from '@/services/savedItemApi';
import type { SeatingPlanPayload } from '../lib/plan';

interface PlansModalProps {
  isOpen: boolean;
  onClose: () => void;
  plans: SavedItem<SeatingPlanPayload>[];
  listing: boolean;
  saving: boolean;
  onSave: (name: string) => Promise<boolean>;
  onRestore: (plan: SavedItem<SeatingPlanPayload>) => void;
  onRemove: (id: string) => void;
}

/** 座位方案的保存 / 载入面板：一个账号一套，按最近更新排序 */
export function PlansModal({
  isOpen,
  onClose,
  plans,
  listing,
  saving,
  onSave,
  onRestore,
  onRemove,
}: PlansModalProps) {
  const [name, setName] = useState('');

  const submit = async () => {
    if (await onSave(name)) {
      setName('');
      onClose();
    }
  };

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="座位方案" size="lg">
      <div className="space-y-5">
        <div>
          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300" htmlFor="plan-name">
            把当前排座保存为方案
          </label>
          <div className="flex gap-2 mt-1">
            <Input
              id="plan-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="如：年会第一轮 / 婚宴主桌方案"
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving}
              className="btn-primary flex items-center px-3 shrink-0 disabled:opacity-70"
            >
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              保存
            </button>
          </div>
          <p className="mt-1.5 text-xs text-zinc-400">同名会覆盖；方案只存工号，载入时按最新员工档案还原。</p>
        </div>

        <div>
          <h4 className="text-sm font-medium text-zinc-900 dark:text-white mb-2">已保存的方案</h4>
          {listing ? (
            <p className="text-sm text-zinc-400 flex items-center">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              正在读取…
            </p>
          ) : plans.length === 0 ? (
            <p className="text-sm text-zinc-400">还没有保存过方案。</p>
          ) : (
            <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {plans.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{p.name}</p>
                    <p className="text-xs text-zinc-400">
                      {p.payload?.tables?.length ?? 0} 桌 ·
                      {(p.payload?.tables ?? []).reduce((n, t) => n + (t.memberIds?.length ?? 0), 0)} 人 · {p.updatedAt}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onRestore(p)}
                      className="btn-secondary flex items-center px-2.5 py-1.5 text-xs"
                      title="载入并替换当前排座"
                    >
                      <Download className="w-3.5 h-3.5 sm:mr-1" />
                      <span className="hidden sm:inline">载入</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(p.id)}
                      aria-label={`删除方案 ${p.name}`}
                      title="删除方案"
                      className="p-1.5 rounded-md text-zinc-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </BaseModal>
  );
}
