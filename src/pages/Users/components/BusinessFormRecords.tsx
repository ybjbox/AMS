import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Loader2 } from 'lucide-react';
import { Permission } from '@/components/Permission';
import { Button } from '@/components/ui/button';
import { User } from '@/types';
import { formatDateTime } from '@/utils/dateUtils';
import { listBusinessFormRecords, type BusinessFormRecord } from '@/services/businessFormApi';

/**
 * 员工档案「业务单据」区块：列出归档到该员工的业务单，并提供为本员工生成的入口。
 * 归档动作在业务单页完成（那里有 A4 预览与打印/下载），这里只做留痕回看。
 */
export function BusinessFormRecords({ employee }: { employee: User }) {
  const navigate = useNavigate();
  const [records, setRecords] = useState<BusinessFormRecord[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // 弹窗每次打开都重新挂载本组件，无需在 effect 里重置状态
    let cancelled = false;
    listBusinessFormRecords(employee.id)
      .then((rows) => {
        if (!cancelled) setRecords(rows);
      })
      .catch(() => {
        if (!cancelled) {
          setRecords([]);
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [employee.id]);

  return (
    <Permission code="forms:view">
      <div className="mt-6">
        <h4 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">业务单据</h4>
        <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-4 space-y-3">
          {records === null ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              加载中…
            </p>
          ) : failed ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">业务单据读取失败，请稍后重试</p>
          ) : records.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">尚无归档的业务单据</p>
          ) : (
            <ul className="space-y-2 max-h-44 overflow-auto pr-1">
              {records.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-zinc-900 dark:text-white">
                      {r.kindLabel}
                      <span className="ml-2 text-zinc-500 dark:text-zinc-400">{r.date}</span>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">
                      {r.body}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {r.amount > 0 && (
                      <div className="text-sm font-medium text-zinc-900 dark:text-white tabular-nums">
                        ¥{r.amount.toFixed(2)}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {formatDateTime(r.createdAt)}
                    </div>
                    {r.operator && (
                      <div className="text-xs text-muted-foreground">{r.operator} 归档</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => navigate(`/business-forms?employeeId=${encodeURIComponent(employee.id)}`)}
          >
            <ClipboardList className="w-3.5 h-3.5" aria-hidden="true" />
            生成业务单
          </Button>
        </div>
      </div>
    </Permission>
  );
}
