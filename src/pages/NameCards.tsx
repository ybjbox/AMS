import React, { useState, useMemo, useEffect } from 'react';
import { useUserStore } from '../store/users';
import { useDepartments } from '../store/departments';
import { IdCard, Users, Printer, Settings2, X, CheckSquare, Square, Plus, Minus, ChevronRight, Upload, FileDown, ChevronDown, FileText } from 'lucide-react';
import { BaseModal } from '../components/ui/BaseModal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';

interface PrintSettings {
  paperSize: 'A4' | 'A5' | 'custom';
  paperOrientation: 'portrait' | 'landscape';
  paperWidth: number; // mm
  paperHeight: number; // mm
  cardWidth: number; // mm
  cardHeight: number; // mm
  copiesPerName: number;
  fontFamily: string;
  fontSize: number; // px
  isBold: boolean;
  fontColor: string;
  backgroundColor: string;
  showCompanyName: boolean;
  companyName: string;
  companyNameFontSize: number; // px
  showDepartment: boolean;
  showRole: boolean;
  departmentFontSize: number; // px
  roleFontSize: number; // px
  textAlign: 'left' | 'center' | 'right';
  layout: 'horizontal' | 'vertical'; // Horizontal or vertical text
  isDoubleSided: boolean; // Double-sided tent card
}

export default function NameCards() {
  const { users, fetchUsers } = useUserStore();
  const { departments } = useDepartments();

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const [isUploadMenuOpen, setIsUploadMenuOpen] = useState(false);
  const [isManualInputOpen, setIsManualInputOpen] = useState(false);
  const [manualInputText, setManualInputText] = useState('');
  const [uploadedUsers, setUploadedUsers] = useState<any[] | null>(null);

  const activeUsers = useMemo(() => {
    if (uploadedUsers) return uploadedUsers;
    return users.filter(u => u.status !== '离职');
  }, [users, uploadedUsers]);

  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [isParticipantModalOpen, setIsParticipantModalOpen] = useState(false);
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());

  const [printSettings, setPrintSettings] = useState<PrintSettings>({
    paperSize: 'A4',
    paperOrientation: 'landscape',
    paperWidth: 297,
    paperHeight: 210,
    cardWidth: 195,
    cardHeight: 86,
    copiesPerName: 1,
    fontFamily: '"KaiTi", "STKaiti", serif',
    fontSize: 160,
    isBold: true,
    fontColor: '#000000',
    backgroundColor: '#ffffff',
    showCompanyName: false,
    companyName: '您的公司名称',
    companyNameFontSize: 16,
    showDepartment: false,
    showRole: false,
    departmentFontSize: 14,
    roleFontSize: 14,
    textAlign: 'center',
    layout: 'horizontal',
    isDoubleSided: false,
  });

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
    if (isManualInputOpen || isParticipantModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isManualInputOpen, isParticipantModalOpen]);

  useEffect(() => {
    if (!uploadedUsers) {
      setSelectedUserIds(new Set(activeUsers.map(u => u.id)));
    }
  }, [activeUsers, uploadedUsers]);

  const handleDownloadTemplate = () => {
    alert('请求后端下载模板 (Mock)');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Mock backend processing
    setTimeout(() => {
      const newUsers = [
        { id: `uploaded-${Date.now()}-1`, name: '张三', department: '技术部', role: '前端工程师', status: '在职' },
        { id: `uploaded-${Date.now()}-2`, name: '李四', department: '市场部', role: '市场总监', status: '在职' },
      ];
      setUploadedUsers(newUsers);
      setSelectedUserIds(new Set(newUsers.map(u => u.id)));
      alert('成功从后端获取到名单 (Mock)');
    }, 500);
    
    // Reset file input
    e.target.value = '';
  };

  const handleManualInputSubmit = () => {
    if (!manualInputText.trim()) {
      alert('请输入名单');
      return;
    }

    const lines = manualInputText.split('\n').filter(line => line.trim());
    const newUsers = lines.map((line, index) => {
      // Simple parsing: split by space, comma, or tab
      const parts = line.split(/[\s,]+/).filter(Boolean);
      return {
        id: `manual-${Date.now()}-${index}`,
        name: parts[0] || '未知姓名',
        department: parts[1] || '',
        role: parts[2] || '',
        status: '在职'
      };
    });

    setUploadedUsers(newUsers);
    setSelectedUserIds(new Set(newUsers.map(u => u.id)));
    setIsManualInputOpen(false);
    setManualInputText('');
  };

  const groupedUsers = useMemo(() => {
    const groups: Record<string, any[]> = {};
    activeUsers.forEach(u => {
      if (!groups[u.department]) groups[u.department] = [];
      groups[u.department].push(u);
    });
    return groups;
  }, [activeUsers]);

  const toggleUserSelection = (id: string) => {
    const newSet = new Set(selectedUserIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedUserIds(newSet);
  };

  const toggleDepartmentSelection = (dept: string, isSelected: boolean) => {
    const newSet = new Set(selectedUserIds);
    groupedUsers[dept].forEach(u => {
      if (isSelected) newSet.add(u.id);
      else newSet.delete(u.id);
    });
    setSelectedUserIds(newSet);
  };

  const toggleDeptExpand = (dept: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSet = new Set(expandedDepts);
    if (newSet.has(dept)) newSet.delete(dept);
    else newSet.add(dept);
    setExpandedDepts(newSet);
  };

  const toggleAllDeptsExpand = () => {
    if (expandedDepts.size === Object.keys(groupedUsers).length) {
      setExpandedDepts(new Set());
    } else {
      setExpandedDepts(new Set(Object.keys(groupedUsers)));
    }
  };

  const renderJustifiedName = (name: string, fontSize: number, isVertical: boolean = false) => {
    if (printSettings.textAlign === 'center' && name.length <= 4) {
      if (isVertical) {
        return (
          <div 
            className="flex flex-col justify-between items-center mx-auto" 
            style={{ height: `${fontSize * 4}px` }}
          >
            {name.split('').map((char, i) => (
              <span key={i} style={{ writingMode: 'vertical-rl', textOrientation: 'upright' }}>{char}</span>
            ))}
          </div>
        );
      }
      return (
        <div 
          className="flex justify-between mx-auto" 
          style={{ width: `${fontSize * 4}px` }}
        >
          {name.split('').map((char, i) => (
            <span key={i}>{char}</span>
          ))}
        </div>
      );
    }
    
    return (
      <div 
        style={{ 
          writingMode: isVertical ? 'vertical-rl' : 'horizontal-tb', 
          textOrientation: isVertical ? 'upright' : 'mixed',
          textAlign: printSettings.textAlign as any
        }}
      >
        {name}
      </div>
    );
  };

  const handlePrint = () => {
    window.print();
  };

  const renderCardContent = (user: any, isFlipped: boolean = false) => {
    const isVertical = printSettings.layout === 'vertical';
    
    return (
      <div 
        className={`flex justify-center items-center w-full h-full ${isFlipped ? 'rotate-180' : ''} ${isVertical ? 'flex-row-reverse space-x-reverse space-x-6' : 'flex-col space-y-2'}`}
        style={{ padding: '10px' }}
      >
        {printSettings.showCompanyName && (
          <div 
            className={`font-semibold ${isVertical ? 'h-full flex items-center' : 'w-full text-center'}`}
            style={{ 
              fontSize: `${printSettings.companyNameFontSize}px`,
              writingMode: isVertical ? 'vertical-rl' : 'horizontal-tb',
              textOrientation: isVertical ? 'upright' : 'mixed',
              letterSpacing: isVertical ? '0.2em' : 'normal',
              color: printSettings.fontColor,
            }}
          >
            {printSettings.companyName}
          </div>
        )}
        <div 
          className={`flex ${isVertical ? 'items-center' : 'justify-center'} w-full`}
          style={{ 
            fontSize: `${printSettings.fontSize}px`,
            fontWeight: printSettings.isBold ? 'bold' : 'normal',
            height: isVertical ? '100%' : 'auto',
          }}
        >
          {renderJustifiedName(user.name, printSettings.fontSize, isVertical)}
        </div>
        {(printSettings.showDepartment || printSettings.showRole) && (
          <div className={`flex ${isVertical ? 'flex-row-reverse space-x-reverse space-x-3 h-full items-center' : 'flex-col space-y-1 w-full text-center'}`}>
            {printSettings.showDepartment && (
              <div style={{ 
                fontSize: `${printSettings.departmentFontSize}px`,
                writingMode: isVertical ? 'vertical-rl' : 'horizontal-tb',
                textOrientation: isVertical ? 'upright' : 'mixed',
              }}>
                {user.department}
              </div>
            )}
            {printSettings.showRole && (
              <div style={{ 
                fontSize: `${printSettings.roleFontSize}px`,
                writingMode: isVertical ? 'vertical-rl' : 'horizontal-tb',
                textOrientation: isVertical ? 'upright' : 'mixed',
              }}>
                {user.role}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const selectedUsers = useMemo(() => {
    return activeUsers.filter(u => selectedUserIds.has(u.id));
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

  const handlePaperSizeChange = (size: 'A4' | 'A5' | 'custom') => {
    let width = printSettings.paperWidth;
    let height = printSettings.paperHeight;
    if (size === 'A4') {
      width = printSettings.paperOrientation === 'portrait' ? 210 : 297;
      height = printSettings.paperOrientation === 'portrait' ? 297 : 210;
    } else if (size === 'A5') {
      width = printSettings.paperOrientation === 'portrait' ? 148 : 210;
      height = printSettings.paperOrientation === 'portrait' ? 210 : 148;
    }
    setPrintSettings(prev => ({ ...prev, paperSize: size, paperWidth: width, paperHeight: height }));
  };

  const handlePaperOrientationChange = (orientation: 'portrait' | 'landscape') => {
    setPrintSettings(prev => {
      let width = prev.paperWidth;
      let height = prev.paperHeight;
      if (prev.paperSize === 'A4') {
        width = orientation === 'portrait' ? 210 : 297;
        height = orientation === 'portrait' ? 297 : 210;
      } else if (prev.paperSize === 'A5') {
        width = orientation === 'portrait' ? 148 : 210;
        height = orientation === 'portrait' ? 210 : 148;
      } else {
        // For custom, just swap width and height if orientation changes
        if (prev.paperOrientation !== orientation) {
          width = prev.paperHeight;
          height = prev.paperWidth;
        }
      }
      return { ...prev, paperOrientation: orientation, paperWidth: width, paperHeight: height };
    });
  };

  const actualCardHeight = printSettings.isDoubleSided ? printSettings.cardHeight * 2 : printSettings.cardHeight;
  const cols = Math.max(1, Math.floor(printSettings.paperWidth / printSettings.cardWidth));
  const rows = Math.max(1, Math.floor(printSettings.paperHeight / actualCardHeight));
  const cardsPerPage = cols * rows;

  const pages = [];
  for (let i = 0; i < cardsToPrint.length; i += cardsPerPage) {
    pages.push(cardsToPrint.slice(i, i + cardsPerPage));
  }

  const renderCropMarks = () => {
    const startX = (printSettings.paperWidth - cols * printSettings.cardWidth) / 2;
    const startY = (printSettings.paperHeight - rows * actualCardHeight) / 2;

    const marks = [];

    // Top & Bottom marks
    for (let i = 0; i <= cols; i++) {
      const x = startX + i * printSettings.cardWidth;
      if (x >= 0 && x <= printSettings.paperWidth) {
        marks.push(<div key={`top-${i}`} className="absolute top-0 bg-slate-400 z-10 print:bg-black" style={{ left: `${x}mm`, width: '1px', height: '5mm' }} />);
        marks.push(<div key={`bottom-${i}`} className="absolute bottom-0 bg-slate-400 z-10 print:bg-black" style={{ left: `${x}mm`, width: '1px', height: '5mm' }} />);
      }
    }

    // Left & Right marks
    for (let i = 0; i <= rows; i++) {
      const y = startY + i * actualCardHeight;
      if (y >= 0 && y <= printSettings.paperHeight) {
        marks.push(<div key={`left-${i}`} className="absolute left-0 bg-slate-400 z-10 print:bg-black" style={{ top: `${y}mm`, width: '5mm', height: '1px' }} />);
        marks.push(<div key={`right-${i}`} className="absolute right-0 bg-slate-400 z-10 print:bg-black" style={{ top: `${y}mm`, width: '5mm', height: '1px' }} />);
      }
    }

    return marks;
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-slate-50 dark:bg-slate-900 print:bg-white print:h-auto overflow-hidden rounded-xl shadow-sm border border-slate-200 dark:border-slate-800">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between shrink-0 print:hidden">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <IdCard className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">会议台卡制作</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">自定义台卡尺寸、样式并打印</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {uploadedUsers && (
            <button
              onClick={() => setUploadedUsers(null)}
              className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-amber-600 dark:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
              title="清除上传的名单，恢复系统人员"
            >
              <X className="h-4 w-4 mr-2" />
              清除名单
            </button>
          )}
          <div className="relative upload-dropdown">
            <button
              onClick={() => setIsUploadMenuOpen(!isUploadMenuOpen)}
              className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <Upload className="h-4 w-4 mr-2" />
              导入名单
              <ChevronDown className="h-4 w-4 ml-1" />
            </button>
            {isUploadMenuOpen && (
              <div className="absolute right-0 mt-1 w-36 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1 z-50">
                <button
                  onClick={() => {
                    handleDownloadTemplate();
                    setIsUploadMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center"
                >
                  <FileDown className="w-4 h-4 mr-2" />
                  下载模板
                </button>
                <button
                  onClick={() => {
                    setIsManualInputOpen(true);
                    setIsUploadMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  手动输入
                </button>
                <label className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center cursor-pointer mb-0">
                  <Upload className="w-4 h-4 mr-2" />
                  上传文件
                  <input 
                    type="file" 
                    accept=".xlsx,.xls,.csv" 
                    className="hidden" 
                    onChange={(e) => {
                      handleFileUpload(e);
                      setIsUploadMenuOpen(false);
                    }} 
                  />
                </label>
              </div>
            )}
          </div>
          <button
            onClick={() => setIsParticipantModalOpen(true)}
            className="flex items-center px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <Users className="h-4 w-4 mr-2" />
            选择人员 ({selectedUserIds.size})
          </button>
          <button
            onClick={handlePrint}
            disabled={selectedUserIds.size === 0}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Printer className="h-4 w-4 mr-2" />
            打印台卡
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex print:hidden">
        {/* Settings Sidebar */}
        <div className="w-80 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 overflow-y-auto p-6 space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-4 flex items-center">
              <Settings2 className="h-4 w-4 mr-2" />
              打印设置
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">纸张尺寸</label>
                <Select value={printSettings.paperSize} onValueChange={(val) => handlePaperSizeChange(val as any)}>
                  <SelectTrigger className="w-full bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600">
                    <SelectValue placeholder="选择尺寸" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A4">A4 (210x297mm)</SelectItem>
                    <SelectItem value="A5">A5 (148x210mm)</SelectItem>
                    <SelectItem value="custom">自定义</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">纸张方向</label>
                <Select value={printSettings.paperOrientation} onValueChange={(val) => handlePaperOrientationChange(val as any)}>
                  <SelectTrigger className="w-full bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600">
                    <SelectValue placeholder="选择方向" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="portrait">纵向</SelectItem>
                    <SelectItem value="landscape">横向</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {printSettings.paperSize === 'custom' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">纸张宽 (cm)</label>
                    <input 
                      type="number" 
                      step="0.1"
                      value={printSettings.paperWidth / 10}
                      onChange={(e) => setPrintSettings(prev => ({ ...prev, paperWidth: Math.round(parseFloat(e.target.value) * 10) || 210 }))}
                      className="block w-full border border-slate-300 dark:border-slate-600 rounded-md shadow-sm py-1.5 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">纸张高 (cm)</label>
                    <input 
                      type="number" 
                      step="0.1"
                      value={printSettings.paperHeight / 10}
                      onChange={(e) => setPrintSettings(prev => ({ ...prev, paperHeight: Math.round(parseFloat(e.target.value) * 10) || 297 }))}
                      className="block w-full border border-slate-300 dark:border-slate-600 rounded-md shadow-sm py-1.5 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white" 
                    />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">台卡宽 (cm)</label>
                  <input 
                    type="number" 
                    step="0.1"
                    value={printSettings.cardWidth / 10}
                    onChange={(e) => setPrintSettings(prev => ({ ...prev, cardWidth: Math.round(parseFloat(e.target.value) * 10) || 90 }))}
                    className="block w-full border border-slate-300 dark:border-slate-600 rounded-md shadow-sm py-1.5 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">台卡高 (cm)</label>
                  <input 
                    type="number" 
                    step="0.1"
                    value={printSettings.cardHeight / 10}
                    onChange={(e) => setPrintSettings(prev => ({ ...prev, cardHeight: Math.round(parseFloat(e.target.value) * 10) || 54 }))}
                    className="block w-full border border-slate-300 dark:border-slate-600 rounded-md shadow-sm py-1.5 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white" 
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={printSettings.isDoubleSided}
                    onChange={(e) => setPrintSettings(prev => ({ ...prev, isDoubleSided: e.target.checked }))}
                    className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 bg-white dark:bg-slate-700"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">双面帐篷式折叠 (高度翻倍)</span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">每人打印份数</label>
                <div className="flex items-center border border-slate-300 dark:border-slate-600 rounded-md overflow-hidden">
                  <button 
                    onClick={() => setPrintSettings(prev => ({ ...prev, copiesPerName: Math.max(1, prev.copiesPerName - 1) }))}
                    className="px-3 py-2 bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 transition-colors"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <input 
                    type="number" 
                    value={printSettings.copiesPerName}
                    onChange={(e) => setPrintSettings(prev => ({ ...prev, copiesPerName: Math.max(1, parseInt(e.target.value) || 1) }))}
                    className="flex-1 w-full text-center border-none py-2 focus:ring-0 sm:text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white" 
                  />
                  <button 
                    onClick={() => setPrintSettings(prev => ({ ...prev, copiesPerName: prev.copiesPerName + 1 }))}
                    className="px-3 py-2 bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-4">样式设置</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">字体</label>
                <div className="flex items-center space-x-2">
                  <Select value={printSettings.fontFamily} onValueChange={(val) => setPrintSettings(prev => ({ ...prev, fontFamily: val }))}>
                    <SelectTrigger className="w-full bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600">
                      <SelectValue placeholder="选择字体" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='"Microsoft YaHei", "SimHei", sans-serif'>微软雅黑 / 黑体</SelectItem>
                      <SelectItem value='"Noto Serif SC", "SimSun", serif'>思源宋体 / 宋体</SelectItem>
                      <SelectItem value='"KaiTi", "STKaiti", serif'>楷体</SelectItem>
                      <SelectItem value='"FangSong", "STFangsong", serif'>仿宋</SelectItem>
                    </SelectContent>
                  </Select>
                  <label className="flex items-center space-x-2 cursor-pointer whitespace-nowrap">
                    <input 
                      type="checkbox" 
                      checked={printSettings.isBold}
                      onChange={(e) => setPrintSettings(prev => ({ ...prev, isBold: e.target.checked }))}
                      className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 bg-white dark:bg-slate-700"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">加粗</span>
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">排版方向</label>
                  <Select value={printSettings.layout} onValueChange={(val) => setPrintSettings(prev => ({ ...prev, layout: val as any }))}>
                    <SelectTrigger className="w-full bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600">
                      <SelectValue placeholder="选择排版方向" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="horizontal">横排</SelectItem>
                      <SelectItem value="vertical">竖排</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">对齐方式</label>
                  <Select value={printSettings.textAlign} onValueChange={(val) => setPrintSettings(prev => ({ ...prev, textAlign: val as any }))}>
                    <SelectTrigger className="w-full bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600">
                      <SelectValue placeholder="选择对齐方式" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">居左/靠上</SelectItem>
                      <SelectItem value="center">居中</SelectItem>
                      <SelectItem value="right">居右/靠下</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">姓名大小 (px)</label>
                  <input 
                    type="number" 
                    value={printSettings.fontSize}
                    onChange={(e) => setPrintSettings(prev => ({ ...prev, fontSize: parseInt(e.target.value) || 32 }))}
                    className="block w-full border border-slate-300 dark:border-slate-600 rounded-md shadow-sm py-1.5 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">字体颜色</label>
                  <div className="flex items-center space-x-2">
                    <input 
                      type="color" 
                      value={printSettings.fontColor}
                      onChange={(e) => setPrintSettings(prev => ({ ...prev, fontColor: e.target.value }))}
                      className="h-8 w-12 rounded border border-slate-300 dark:border-slate-600 cursor-pointer p-0.5 bg-white dark:bg-slate-700" 
                    />
                    <span className="text-xs text-slate-500 uppercase">{printSettings.fontColor}</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">背景颜色</label>
                  <div className="flex items-center space-x-2">
                    <input 
                      type="color" 
                      value={printSettings.backgroundColor}
                      onChange={(e) => setPrintSettings(prev => ({ ...prev, backgroundColor: e.target.value }))}
                      className="h-8 w-12 rounded border border-slate-300 dark:border-slate-600 cursor-pointer p-0.5 bg-white dark:bg-slate-700" 
                    />
                    <span className="text-xs text-slate-500 dark:text-slate-400 uppercase">{printSettings.backgroundColor}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={printSettings.showDepartment}
                    onChange={(e) => setPrintSettings(prev => ({ ...prev, showDepartment: e.target.checked }))}
                    className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 bg-white dark:bg-slate-700"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">显示部门</span>
                </label>
                {printSettings.showDepartment && (
                  <div className="pl-6">
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">部门字号 (px)</label>
                    <input 
                      type="number" 
                      value={printSettings.departmentFontSize}
                      onChange={(e) => setPrintSettings(prev => ({ ...prev, departmentFontSize: parseInt(e.target.value) || 14 }))}
                      className="block w-full border border-slate-300 dark:border-slate-600 rounded-md shadow-sm py-1.5 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white" 
                    />
                  </div>
                )}
                
                <label className="flex items-center space-x-2 cursor-pointer mt-2">
                  <input 
                    type="checkbox" 
                    checked={printSettings.showRole}
                    onChange={(e) => setPrintSettings(prev => ({ ...prev, showRole: e.target.checked }))}
                    className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 bg-white dark:bg-slate-700"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">显示职位</span>
                </label>
                {printSettings.showRole && (
                  <div className="pl-6">
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">职位字号 (px)</label>
                    <input 
                      type="number" 
                      value={printSettings.roleFontSize}
                      onChange={(e) => setPrintSettings(prev => ({ ...prev, roleFontSize: parseInt(e.target.value) || 14 }))}
                      className="block w-full border border-slate-300 dark:border-slate-600 rounded-md shadow-sm py-1.5 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white" 
                    />
                  </div>
                )}

                <label className="flex items-center space-x-2 cursor-pointer mt-2">
                  <input 
                    type="checkbox" 
                    checked={printSettings.showCompanyName}
                    onChange={(e) => setPrintSettings(prev => ({ ...prev, showCompanyName: e.target.checked }))}
                    className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 bg-white dark:bg-slate-700"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">显示公司名称</span>
                </label>
                {printSettings.showCompanyName && (
                  <div className="pl-6 space-y-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">公司名称</label>
                      <input 
                        type="text" 
                        value={printSettings.companyName}
                        onChange={(e) => setPrintSettings(prev => ({ ...prev, companyName: e.target.value }))}
                        className="block w-full border border-slate-300 dark:border-slate-600 rounded-md shadow-sm py-1.5 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">公司名称字号 (px)</label>
                      <input 
                        type="number" 
                        value={printSettings.companyNameFontSize}
                        onChange={(e) => setPrintSettings(prev => ({ ...prev, companyNameFontSize: parseInt(e.target.value) || 16 }))}
                        className="block w-full border border-slate-300 dark:border-slate-600 rounded-md shadow-sm py-1.5 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-white" 
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Preview Area */}
        <div className="flex-1 bg-slate-100 dark:bg-slate-900 overflow-auto p-8 flex flex-col items-center space-y-8 min-h-0 relative">
          <div className="sticky top-0 self-start text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider z-10 bg-white/90 dark:bg-slate-800/90 backdrop-blur py-1.5 px-3 rounded-br-lg shadow-sm -mt-8 -ml-8 mb-4">打印预览 ({pages.length}页)</div>
          
          {pages.length === 0 ? (
            <div className="w-full h-full flex items-center justify-center text-slate-400 dark:text-slate-500">
              请选择人员以预览台卡
            </div>
          ) : (
            <div className="flex flex-col gap-8 items-center w-full pt-2">
              {pages.map((pageCards, pageIdx) => (
                <div key={`page-${pageIdx}`} className="flex flex-col items-center">
                  <div className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                    预览纸张: {printSettings.paperSize} ({printSettings.paperWidth}x{printSettings.paperHeight}mm) - 第 {pageIdx + 1} 页
                  </div>
                  <div 
                    style={{ 
                      width: `${printSettings.paperWidth * 0.5}mm`, 
                      height: `${printSettings.paperHeight * 0.5}mm` 
                    }}
                    className="flex-shrink-0 relative"
                  >
                    <div 
                      className="absolute top-0 left-0 bg-white dark:bg-slate-800 shadow-lg origin-top-left transition-all duration-300"
                      style={{ 
                        width: `${printSettings.paperWidth}mm`, 
                        height: `${printSettings.paperHeight}mm`,
                        boxSizing: 'border-box',
                        transform: 'scale(0.5)'
                      }}
                    >
                      {renderCropMarks()}

                      <div 
                        className="absolute"
                        style={{
                          left: `${(printSettings.paperWidth - cols * printSettings.cardWidth) / 2}mm`,
                          top: `${(printSettings.paperHeight - rows * actualCardHeight) / 2}mm`,
                          width: `${cols * printSettings.cardWidth}mm`,
                          height: `${rows * actualCardHeight}mm`,
                          display: 'grid',
                          gridTemplateColumns: `repeat(${cols}, ${printSettings.cardWidth}mm)`,
                          gridTemplateRows: `repeat(${rows}, ${actualCardHeight}mm)`,
                        }}
                      >
                        {pageCards.map((user, idx) => (
                          <div 
                            key={`${user.id}-${idx}`}
                            className="border border-slate-200 dark:border-slate-700 border-dashed flex flex-col justify-center overflow-hidden relative print:border-none"
                            style={{ 
                              backgroundColor: printSettings.backgroundColor,
                              color: printSettings.fontColor,
                              fontFamily: printSettings.fontFamily,
                              textAlign: printSettings.textAlign as any,
                            }}
                          >
                            {printSettings.isDoubleSided ? (
                              <>
                                <div className="flex-1 border-b border-slate-200 dark:border-slate-700 border-dashed flex items-center justify-center">
                                  {renderCardContent(user, true)}
                                </div>
                                <div className="flex-1 flex items-center justify-center">
                                  {renderCardContent(user, false)}
                                </div>
                              </>
                            ) : (
                              renderCardContent(user, false)
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Participant Selection Modal */}
      <BaseModal
        isOpen={isParticipantModalOpen}
        onClose={() => setIsParticipantModalOpen(false)}
        title={
          <div className="flex items-center space-x-4">
            <span className="text-lg leading-6 font-medium text-slate-900 dark:text-white">选择参与人员</span>
            <button 
              onClick={toggleAllDeptsExpand}
              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
            >
              {expandedDepts.size === Object.keys(groupedUsers).length ? '全部收起' : '全部展开'}
            </button>
          </div>
        }
        size="2xl"
        bodyClassName="p-4 sm:p-6 max-h-[60vh] overflow-y-auto"
        footer={
          <button type="button" onClick={() => setIsParticipantModalOpen(false)} className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 active:scale-95 transition-transform sm:ml-3 sm:w-auto sm:text-sm">完成</button>
        }
      >
        <div className="space-y-4 pr-2">
          {Object.entries(groupedUsers).map(([dept, deptUsers]: [string, any[]]) => {
            const allSelected = deptUsers.every(u => selectedUserIds.has(u.id));
            const someSelected = deptUsers.some(u => selectedUserIds.has(u.id)) && !allSelected;
            const isExpanded = expandedDepts.has(dept);
            return (
              <div key={dept} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                <div 
                  className="bg-slate-50 dark:bg-slate-800/50 px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
                  onClick={() => toggleDepartmentSelection(dept, !allSelected)}
                >
                  <div className="flex items-center">
                    {allSelected ? (
                      <CheckSquare className="w-5 h-5 text-blue-600 dark:text-blue-500 mr-3" />
                    ) : someSelected ? (
                      <div className="w-5 h-5 bg-blue-600 dark:bg-blue-500 rounded flex items-center justify-center mr-3">
                        <div className="w-3 h-0.5 bg-white"></div>
                      </div>
                    ) : (
                      <Square className="w-5 h-5 text-slate-400 dark:text-slate-500 mr-3" />
                    )}
                    <span className="font-medium text-slate-800 dark:text-slate-200">{dept}</span>
                    <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">({deptUsers.filter(u => selectedUserIds.has(u.id)).length}/{deptUsers.length})</span>
                  </div>
                  <button 
                    onClick={(e) => toggleDeptExpand(dept, e)}
                    className="p-1 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    <ChevronRight className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  </button>
                </div>
                {isExpanded && (
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
                    {deptUsers.map(u => (
                      <label key={u.id} className="flex items-center space-x-2 cursor-pointer group">
                        <input 
                          type="checkbox" 
                          checked={selectedUserIds.has(u.id)}
                          onChange={() => toggleUserSelection(u.id)}
                          className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 bg-white dark:bg-slate-700"
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white">{u.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </BaseModal>

      {/* Manual Input Modal */}
      <BaseModal
        isOpen={isManualInputOpen}
        onClose={() => setIsManualInputOpen(false)}
        title="手动输入名单"
        size="2xl"
        footer={
          <>
            <button 
              type="button" 
              onClick={() => setIsManualInputOpen(false)} 
              className="mt-3 w-full inline-flex justify-center rounded-md border border-slate-300 dark:border-slate-600 shadow-sm px-4 py-2 bg-white dark:bg-slate-700 text-base font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
            >
              取消
            </button>
            <button 
              type="button" 
              onClick={handleManualInputSubmit} 
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 active:scale-95 transition-transform sm:ml-3 sm:w-auto sm:text-sm"
            >
              确认导入
            </button>
          </>
        }
      >
        <div className="sm:flex sm:items-start">
          <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900/30 sm:mx-0 sm:h-10 sm:w-10">
            <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" aria-hidden="true" />
          </div>
          <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
            <div className="mt-2">
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                请输入人员名单，每行一个。支持使用空格或逗号分隔姓名、部门和职务。例如：<br/>
                <span className="font-mono bg-slate-100 dark:bg-slate-700 px-1 rounded">张三 技术部 工程师</span>
              </p>
              <textarea
                rows={10}
                className="w-full border border-slate-300 dark:border-slate-600 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500 sm:text-sm font-mono bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                placeholder="张三 技术部 工程师&#10;李四 市场部 总监"
                value={manualInputText}
                onChange={(e) => setManualInputText(e.target.value)}
              />
            </div>
          </div>
        </div>
      </BaseModal>

      {/* Print Styles */}
      <style>{`
        @media print {
          @page {
            size: ${printSettings.paperWidth}mm ${printSettings.paperHeight}mm;
            margin: 0;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:bg-white {
            background-color: white !important;
          }
          .print\\:h-auto {
            height: auto !important;
          }
        }
      `}</style>

      {/* Actual Printable Area (Hidden on screen, shown on print) */}
      <div className="hidden print:block w-full bg-white">
        {pages.map((pageCards, pageIdx) => (
          <div 
            key={`print-page-${pageIdx}`}
            className="relative bg-white"
            style={{ 
              width: `${printSettings.paperWidth}mm`, 
              height: `${printSettings.paperHeight}mm`,
              pageBreakAfter: 'always',
              boxSizing: 'border-box'
            }}
          >
            {renderCropMarks()}

            <div 
              className="absolute"
              style={{
                left: `${(printSettings.paperWidth - cols * printSettings.cardWidth) / 2}mm`,
                top: `${(printSettings.paperHeight - rows * actualCardHeight) / 2}mm`,
                width: `${cols * printSettings.cardWidth}mm`,
                height: `${rows * actualCardHeight}mm`,
                display: 'grid',
                gridTemplateColumns: `repeat(${cols}, ${printSettings.cardWidth}mm)`,
                gridTemplateRows: `repeat(${rows}, ${actualCardHeight}mm)`,
              }}
            >
              {pageCards.map((user, idx) => (
                <div 
                  key={`print-${user.id}-${idx}`}
                  className="flex flex-col justify-center overflow-hidden relative"
                  style={{ 
                    backgroundColor: printSettings.backgroundColor,
                    color: printSettings.fontColor,
                    fontFamily: printSettings.fontFamily,
                    textAlign: printSettings.textAlign as any,
                  }}
                >
                  {printSettings.isDoubleSided ? (
                    <>
                      <div className="flex-1 border-b border-slate-200 border-dashed flex items-center justify-center">
                        {renderCardContent(user, true)}
                      </div>
                      <div className="flex-1 flex items-center justify-center">
                        {renderCardContent(user, false)}
                      </div>
                    </>
                  ) : (
                    renderCardContent(user, false)
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
