import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { User } from '@/types';
import { savedItemApi, savedItemError, type SavedItem } from '@/services/savedItemApi';
import type { Table, TableCapacity } from './useSeatingArrange';
import { applyPlan, serializePlan, type SeatingPlanPayload, type SeatingPlanState } from '../lib/plan';

const KIND = 'seating-plan' as const;

export function useSeatingPlans(input: {
  users: User[];
  tableCapacities: TableCapacity[];
  tables: Table[];
  skippedNumbers: string;
  onApply: (state: SeatingPlanState) => void;
}) {
  const { users, tableCapacities, tables, skippedNumbers, onApply } = input;

  const [plans, setPlans] = useState<SavedItem<SeatingPlanPayload>[]>([]);
  const [listing, setListing] = useState(false);
  const [saving, setSaving] = useState(false);
  /** 最近一次「与服务端一致」的快照签名；用于判断有没有未保存的改动 */
  const [savedSignature, setSavedSignature] = useState<string | null>(null);

  const signature = useMemo(
    () => JSON.stringify(serializePlan({ tableCapacities, tables, skippedNumbers })),
    [tableCapacities, tables, skippedNumbers]
  );
  const hasWork = tables.length > 0 || tableCapacities.length > 1;

  const refresh = useCallback(async () => {
    setListing(true);
    try {
      setPlans(await savedItemApi.list<SeatingPlanPayload>(KIND));
    } catch (e) {
      toast.error(savedItemError(e, '方案列表加载失败'));
    } finally {
      setListing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** 空台上工时把最近一次保存的方案当作「可恢复」项列出来 */
  const restorable = hasWork ? null : plans[0] ?? null;

  const save = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) {
        toast.warning('给方案起个名字');
        return false;
      }
      setSaving(true);
      try {
        const saved = await savedItemApi.save<SeatingPlanPayload>(
          KIND,
          trimmed,
          JSON.parse(signature) as SeatingPlanPayload
        );
        setSavedSignature(signature);
        setPlans((prev) => [saved, ...prev.filter((p) => p.name !== trimmed)]);
        toast.success(`方案「${trimmed}」已保存`);
        return true;
      } catch (e) {
        toast.error(savedItemError(e, '方案保存失败'));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [signature]
  );

  const remove = useCallback(async (id: string) => {
    try {
      await savedItemApi.remove(id);
      setPlans((prev) => prev.filter((p) => p.id !== id));
      toast.success('方案已删除');
    } catch (e) {
      toast.error(savedItemError(e, '删除失败'));
    }
  }, []);

  const restore = useCallback(
    (item: SavedItem<SeatingPlanPayload>) => {
      const result = applyPlan(item.payload, users);
      onApply({
        tableCapacities: result.tableCapacities,
        tables: result.tables,
        skippedNumbers: result.skippedNumbers,
      });
      setSavedSignature(JSON.stringify(serializePlan(result)));
      if (result.missing.length) {
        toast.warning(`有 ${result.missing.length} 人已不在员工档案中，对应座位已移除：${result.missing.join('、')}`);
      } else {
        toast.success(`已载入方案「${item.name}」`);
      }
    },
    [users, onApply]
  );

  return {
    plans,
    listing,
    saving,
    restorable,
    /** 当前画布与服务端最近一次保存点不一致 */
    isDirty: hasWork && savedSignature !== null && signature !== savedSignature,
    /** 还没保存过任何版本时，只要有排座结果就提示未保存 */
    neverSaved: hasWork && savedSignature === null,
    refresh,
    save,
    remove,
    restore,
  };
}
