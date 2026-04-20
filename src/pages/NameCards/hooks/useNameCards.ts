import { useState, useMemo, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useEmployeeStore } from '../../../store/useEmployeeStore';
import { User } from '../../../types';
import { PrintSettings, DEFAULT_PRINT_SETTINGS } from '../constants';

export function useNameCards() {
  const users = useEmployeeStore((state) => state.users);
  const fetchUsers = useEmployeeStore((state) => state.fetchUsers);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const [isUploadMenuOpen, setIsUploadMenuOpen] = useState(false);
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

  const [printSettings, setPrintSettings] = useState<PrintSettings>(DEFAULT_PRINT_SETTINGS);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.upload-dropdown')) {
        setIsUploadMenuOpen(false);
      }
    };

    if (isUploadMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isUploadMenuOpen]);

  useEffect(() => {
    if (!uploadedUsers && activeUsers.length > 0 && selectedUserIds.size === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedUserIds(new Set(activeUsers.map((u) => u.id)));
    }
  }, [activeUsers, uploadedUsers, selectedUserIds.size]);

  const handleDownloadTemplate = useCallback(() => {
    toast.info('请求后端下载模板 (Mock)');
  }, []);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setTimeout(() => {
      const newUsers = [
        { id: `uploaded-${Date.now()}-1`, name: '张三', department: '技术部', role: '前端工程师', status: '在职' },
        { id: `uploaded-${Date.now()}-2`, name: '李四', department: '市场部', role: '市场总监', status: '在职' },
      ] as User[];
      setUploadedUsers(newUsers);
      setSelectedUserIds(new Set(newUsers.map((u) => u.id)));
      toast.success('成功从后端获取到名单 (Mock)');
    }, 500);

    e.target.value = '';
  }, []);

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

  const handlePrint = useCallback(() => {
    window.print();
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

  const handlePaperSizeChange = useCallback((size: 'A4' | 'A5' | 'custom') => {
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
  }, []);

  const handlePaperOrientationChange = useCallback((orientation: 'portrait' | 'landscape') => {
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
  }, []);

  return {
    users,
    activeUsers,
    uploadedUsers,
    setUploadedUsers,
    isUploadMenuOpen,
    setIsUploadMenuOpen,
    isManualInputOpen,
    setIsManualInputOpen,
    manualInputText,
    setManualInputText,
    handleDownloadTemplate,
    handleFileUpload,
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
