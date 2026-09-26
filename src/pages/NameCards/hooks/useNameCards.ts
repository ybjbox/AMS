import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { printReactTree } from '@/utils/printWindow';
import { useServerPrefs } from '@/hooks/useServerPrefs';
import { useEmployeeStore } from '@/store/useEmployeeStore';
import { User } from '@/types';
import { PrintSettings, DEFAULT_PRINT_SETTINGS } from '../constants';

export function useNameCards() {
  const users = useEmployeeStore((state) => state.users);
  const fetchUsers = useEmployeeStore((state) => state.fetchUsers);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const [isManualInputOpen, setIsManualInputOpen] = useState(false);
  const [manualInputText, setManualInputText] = useState('');
  const [uploadedUsers, setUploadedUsers] = useState<User[] | null>(null);

  const activeUsers = useMemo(() => {
    if (uploadedUsers) return uploadedUsers;
    return users.filter((u) => u.status !== '离职');
  }, [users, uploadedUsers]);

  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [isParticipantModalOpen, setIsParticipantModalOpen] = useState(false);
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());

  // 台卡打印参数存服务端（每账号一份），刷新与换设备都不丢
  const { value: printSettings, setValue: setPrintSettings } = useServerPrefs<PrintSettings>(
    'namecards-prefs',
    DEFAULT_PRINT_SETTINGS
  );

  // 与排座同一处修：判据不能是 size === 0，否则「逐个取消到最后一个」会立刻把
  // 整张名册重新全选，而台卡是要出纸的。只在名单本身变化时播种一次。
  const rosterKey = useMemo(() => activeUsers.map((u) => u.id).join('|'), [activeUsers]);
  const seededRosterKey = useRef<string | null>(null);
  useEffect(() => {
    if (uploadedUsers || !activeUsers.length || seededRosterKey.current === rosterKey) return;
    seededRosterKey.current = rosterKey;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedUserIds(new Set(activeUsers.map((u) => u.id)));
  }, [activeUsers, uploadedUsers, rosterKey]);

  const handleManualInputSubmit = useCallback(() => {
    if (!manualInputText.trim()) {
      toast.warning('请输入名单');
      return;
    }

    const lines = manualInputText.split('\n').filter((line) => line.trim());
    const newUsers = lines.map((line, index) => {
      const parts = line.split(/[\s,]+/).filter(Boolean);
      return {
        id: `manual-${Date.now()}-${index}`,
        name: parts[0] || '未知姓名',
        department: parts[1] || '',
        role: parts[2] || '',
        status: '在职',
      } as User;
    });

    setUploadedUsers(newUsers);
    setSelectedUserIds(new Set(newUsers.map((u) => u.id)));
    setIsManualInputOpen(false);
    setManualInputText('');
  }, [manualInputText]);

  const groupedUsers = useMemo(() => {
    const groups: Record<string, User[]> = {};
    activeUsers.forEach((u) => {
      if (!groups[u.department]) groups[u.department] = [];
      groups[u.department].push(u);
    });
    return groups;
  }, [activeUsers]);

  const toggleUserSelection = useCallback((id: string) => {
    setSelectedUserIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  }, []);

  const toggleDepartmentSelection = useCallback(
    (dept: string, isSelected: boolean) => {
      setSelectedUserIds((prev) => {
        const newSet = new Set(prev);
        groupedUsers[dept].forEach((u) => {
          if (isSelected) newSet.add(u.id);
          else newSet.delete(u.id);
        });
        return newSet;
      });
    },
    [groupedUsers]
  );

  const toggleAllDeptsExpand = useCallback(() => {
    setExpandedDepts((prev) => {
      if (prev.size === Object.keys(groupedUsers).length) {
        return new Set();
      } else {
        return new Set(Object.keys(groupedUsers));
      }
    });
  }, [groupedUsers]);

  /** 打印区子树（屏上隐藏、只在打印媒体下出现），搬进独立文档才能真正印出来 */
  const printAreaRef = useRef<HTMLDivElement>(null);

  const handlePrint = useCallback(() => {
    if (printReactTree(printAreaRef.current) === false) {
      toast.error('还没有可打印的台卡，请先选择人员或粘贴名单');
    }
  }, []);

  const selectedUsers = useMemo(() => {
    return activeUsers.filter((u) => selectedUserIds.has(u.id));
  }, [activeUsers, selectedUserIds]);

  const cardsToPrint = useMemo(() => {
    const cards = [];
    for (const user of selectedUsers) {
      for (let i = 0; i < printSettings.copiesPerName; i++) {
        cards.push(user);
      }
    }
    return cards;
  }, [selectedUsers, printSettings.copiesPerName]);

  // 参数写回服务端由 useServerPrefs 防抖处理，这里不再包 useCallback
  const handlePaperSizeChange = (size: 'A4' | 'A5' | 'custom') => {
    setPrintSettings((prev) => {
      let width = prev.paperWidth;
      let height = prev.paperHeight;
      if (size === 'A4') {
        width = prev.paperOrientation === 'portrait' ? 210 : 297;
        height = prev.paperOrientation === 'portrait' ? 297 : 210;
      } else if (size === 'A5') {
        width = prev.paperOrientation === 'portrait' ? 148 : 210;
        height = prev.paperOrientation === 'portrait' ? 210 : 148;
      }
      return { ...prev, paperSize: size, paperWidth: width, paperHeight: height };
    });
  };

  const handlePaperOrientationChange = (orientation: 'portrait' | 'landscape') => {
    setPrintSettings((prev) => {
      let width = prev.paperWidth;
      let height = prev.paperHeight;
      if (prev.paperSize === 'A4') {
        width = orientation === 'portrait' ? 210 : 297;
        height = orientation === 'portrait' ? 297 : 210;
      } else if (prev.paperSize === 'A5') {
        width = orientation === 'portrait' ? 148 : 210;
        height = orientation === 'portrait' ? 210 : 148;
      } else {
        if (prev.paperOrientation !== orientation) {
          width = prev.paperHeight;
          height = prev.paperWidth;
        }
      }
      return { ...prev, paperOrientation: orientation, paperWidth: width, paperHeight: height };
    });
  };

  return {
    printAreaRef,
    users,
    activeUsers,
    uploadedUsers,
    setUploadedUsers,
    isManualInputOpen,
    setIsManualInputOpen,
    manualInputText,
    setManualInputText,
    handleManualInputSubmit,
    selectedUserIds,
    setSelectedUserIds,
    isParticipantModalOpen,
    setIsParticipantModalOpen,
    expandedDepts,
    setExpandedDepts,
    groupedUsers,
    toggleUserSelection,
    toggleDepartmentSelection,
    toggleAllDeptsExpand,
    printSettings,
    setPrintSettings,
    handlePrint,
    selectedUsers,
    cardsToPrint,
    handlePaperSizeChange,
    handlePaperOrientationChange
  };
}
