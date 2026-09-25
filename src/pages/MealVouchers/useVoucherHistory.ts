import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { savedItemApi, savedItemError } from '@/services/savedItemApi';
import { toPrintRecord, type VoucherPrintRecord, type VoucherSpec } from './voucher';

/**
 * 餐券打印台账：每次点打印落一行到 saved-items（服务端按账号隔离），
 * 用来回答两个问题 —— 这批号段打过没有、下一批该从几号接着印。
 *
 * 浏览器不会告诉我们打印对话框有没有被取消，所以"点了打印"就记一笔，
 * 记错了可以在列表里删掉那一行（删的是台账，不动券面设置）。
 */
const KIND = 'meal-voucher-print';

const toRecord = (row: { id: string; payload: unknown }): VoucherPrintRecord => ({
  ...(row.payload as Omit<VoucherPrintRecord, 'id'>),
  id: row.id,
});

export function useVoucherHistory() {
  const [records, setRecords] = useState<VoucherPrintRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const rows = await savedItemApi.list<VoucherPrintRecord>(KIND);
      setRecords(rows.map(toRecord).sort((a, b) => String(b.at).localeCompare(String(a.at))));
    } catch (e) {
      toast.error(savedItemError(e, '打印记录读取失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** 落一笔台账；失败返回 false，由调用方如实提示（不能假装记上了） */
  const record = useCallback(async (spec: VoucherSpec): Promise<boolean> => {
    const payload = toPrintRecord(spec, new Date());
    try {
      const saved = await savedItemApi.save<typeof payload>(KIND, payload.at, payload);
      setRecords((prev) => [toRecord(saved), ...prev]);
      return true;
    } catch (e) {
      toast.error(savedItemError(e, '本批号段未能记入打印台账'));
      return false;
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    try {
      await savedItemApi.remove(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      toast.error(savedItemError(e, '打印记录删除失败'));
    }
  }, []);

  return { records, loading, reload, record, remove };
}
