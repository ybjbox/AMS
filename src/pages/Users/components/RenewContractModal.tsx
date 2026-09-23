import React, { useCallback, useEffect, useState } from 'react';
import { FileSignature, History } from 'lucide-react';
import { toast } from 'sonner';
import { BaseModal } from '@/components/ui/BaseModal';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { User } from '@/types';
import { renewContract, fetchContractRenewals, type ContractRenewal } from '@/services/userApi';

interface RenewContractModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onRenewed: () => void;
}

function errText(e: unknown, fallback: string): string {
  return (e as { error?: string })?.error || fallback;
}

/** 按签订日期 + 年限推算到期日 */
function addYears(dateStr: string, years: number): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

/** 合同续签（HR 发起）：填写新期限 → 更新台账 + 写入续签历史 */
export default function RenewContractModal({ isOpen, onClose, user, onRenewed }: RenewContractModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<ContractRenewal[]>([]);
  const [form, setForm] = useState({
    contractYears: 3,
    contractSignDate: new Date().toISOString().slice(0, 10),
    contractExpiry: '',
  });

  // 打开时：默认签订日=今天，默认到期=今天+3年；加载历史
  useEffect(() => {
    if (!isOpen || !user) return;
    const signDate = new Date().toISOString().slice(0, 10);
    setForm({
      contractYears: 3,
      contractSignDate: signDate,
      contractExpiry: addYears(signDate, 3),
    });
    setHistory([]);
    fetchContractRenewals(user.id)
      .then(setHistory)
      .catch(() => {
        /* 历史加载失败静默（不阻断续签） */
      });
  }, [isOpen, user]);

  const handleYearsChange = useCallback(
    (years: number) => {
      setForm((f) => ({
        ...f,
        contractYears: years,
        contractExpiry: addYears(f.contractSignDate, years) || f.contractExpiry,
      }));
    },
    []
  );

  const handleSignDateChange = useCallback(
    (signDate: string) => {
      setForm((f) => ({
        ...f,
        contractSignDate: signDate,
        contractExpiry: addYears(signDate, f.contractYears) || f.contractExpiry,
      }));
    },
    []
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user) return;
      setSubmitting(true);
      try {
        await renewContract(user.id, {
          contractYears: form.contractYears,
          contractSignDate: form.contractSignDate,
          contractExpiry: form.contractExpiry,
        });
        toast.success('合同续签成功，台账已更新');
        onRenewed();
        onClose();
      } catch (err) {
        toast.error(errText(err, '续签失败'));
      } finally {
        setSubmitting(false);
      }
    },
    [user, form, onRenewed, onClose]
  );

  if (!user) return null;

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title={`合同续签 · ${user.name}`} size="lg">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="rounded-lg bg-zinc-50 dark:bg-zinc-900 p-3 text-xs text-zinc-600 dark:text-zinc-300">
          当前合同到期：<span className="font-medium tabular-nums">{user.contractExpiry || '未填写'}</span>
          {user.contractYears ? `（${user.contractYears} 年）` : ''}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block col-span-2 sm:col-span-1">
            <span className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">续签年限 <span className="text-red-500" aria-hidden="true">*</span></span>
            <Select
              value={form.contractYears}
              onValueChange={(val) => {
                if (val !== null) handleYearsChange(val);
              }}
              items={[1, 2, 3, 4, 5].map((y) => ({ value: y, label: `${y} 年` }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择年限" />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5].map((y) => (
                  <SelectItem key={y} value={y}>
                    {y} 年
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="block col-span-2 sm:col-span-1">
            <span className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">签订日期 <span className="text-red-500" aria-hidden="true">*</span></span>
            <Input
              type="date"
              required
              value={form.contractSignDate}
              onChange={(e) => handleSignDateChange(e.target.value)}
            />
          </label>
          <label className="block col-span-2">
            <span className="block text-xs text-zinc-600 dark:text-zinc-400 mb-1">到期日期 <span className="text-red-500" aria-hidden="true">*</span>（按年限自动推算，可微调）</span>
            <Input
              type="date"
              required
              min={form.contractSignDate || undefined}
              value={form.contractExpiry}
              onChange={(e) => setForm({ ...form, contractExpiry: e.target.value })}
            />
          </label>
        </div>

        {/* 续签历史 */}
        {history.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" aria-hidden="true" /> 续签记录（{history.length}）
            </h4>
            <ul className="space-y-1.5 max-h-[140px] overflow-auto">
              {history.map((h) => (
                <li key={h.id} className="text-xs text-zinc-600 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-900 rounded-md px-3 py-2 tabular-nums">
                  <span className="text-muted-foreground">{h.createdAt.slice(0, 10)}</span>
                  {' '}
                  {h.prevExpiry || '（无）'} → <span className="font-medium">{h.contractExpiry}</span>
                  {' '}· {h.contractYears} 年 · {h.renewedBy}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary">
            取消
          </button>
          <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-60">
            <FileSignature className="w-4 h-4 mr-1.5" aria-hidden="true" />
            {submitting ? '提交中…' : '确认续签'}
          </button>
        </div>
      </form>
    </BaseModal>
  );
}
