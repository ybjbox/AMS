import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { User } from '@/types';
import { DEFAULT_ROSTER_COLUMNS, DEFAULT_ADDRESS_BOOK_COLUMNS, ExportTheme, ExportScript } from '../constants';

export function useExport(users: User[]) {
  const [isExporting, setIsExporting] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isAddressBookModalOpen, setIsAddressBookModalOpen] = useState(false);
  const [themes, setThemes] = useState<Record<string, ExportTheme>>({});
  const [scripts, setScripts] = useState<ExportScript[]>([]);

  const [exportConfig, setExportConfig] = useState(() => {
    const savedTitle = localStorage.getItem('rosterExportTitle');
    return {
      title: savedTitle || '员工信息表',
      includeResigned: true,
      themeId: 'default',
      mode: 'theme' as 'theme' | 'script',
      templateName: '',
      paperSize: 'A4',
      orientation: 'landscape',
      isDoubleSided: true,
      columns: DEFAULT_ROSTER_COLUMNS,
    };
  });

  const [addressBookConfig, setAddressBookConfig] = useState(() => {
    const savedTitle = localStorage.getItem('addressBookExportTitle');
    return {
      title: savedTitle || '公司通讯录',
      includeResigned: false,
      paperSize: 'A4',
      orientation: 'portrait',
      isDoubleSided: true,
      isTwoColumn: false,
      mergeDepartments: false,
      columns: DEFAULT_ADDRESS_BOOK_COLUMNS,
    };
  });

  useEffect(() => {
    localStorage.setItem('rosterExportTitle', exportConfig.title);
  }, [exportConfig.title]);

  useEffect(() => {
    localStorage.setItem('addressBookExportTitle', addressBookConfig.title);
  }, [addressBookConfig.title]);

  const addressBookPrintRef = useRef<HTMLDivElement>(null);
  const rosterPrintRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isExportModalOpen) {
      setTimeout(() => {
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
      }, 500);

      setTimeout(() => {
        const mockScripts = [
          { id: '1', name: 'default_template', code: '// 默认导出模板' },
          { id: '2', name: 'custom_template', code: '// 自定义导出模板' },
        ];
        setScripts(mockScripts);
        if (mockScripts.length > 0 && !exportConfig.templateName) {
          setExportConfig((prev) => ({ ...prev, templateName: mockScripts[0].name }));
        }
      }, 500);
    }
  }, [isExportModalOpen, exportConfig.templateName]);

  const processedAddressBookUsers = useMemo(() => {
    let processed = users.filter((u) => (addressBookConfig.includeResigned ? true : u.status !== '离职'));
    if (addressBookConfig.mergeDepartments) {
      processed = [...processed].sort((a, b) => (a.department || '').localeCompare(b.department || ''));
    }
    return processed;
  }, [users, addressBookConfig.includeResigned, addressBookConfig.mergeDepartments]);

  const calculateRowSpans = useCallback((usersList: User[], config: typeof addressBookConfig) => {
    if (!config.mergeDepartments) return usersList.map((u) => ({ ...u, _deptSpan: 1 }));

    const result: (User & { _deptSpan?: number; _deptCount?: number })[] = [];
    let currentDept: string | null = null;
    let currentSpanIndex = -1;
    let deptCount = 0;

    for (let i = 0; i < usersList.length; i++) {
      const user = usersList[i];
      if (user.department !== currentDept) {
        currentDept = user.department;
        currentSpanIndex = i;
        deptCount = 1;
        result.push({ ...user, _deptSpan: 1, _deptCount: 1 });
      } else {
        deptCount++;
        result[currentSpanIndex]._deptSpan = deptCount;
        result[currentSpanIndex]._deptCount = deptCount;
        result.push({ ...user, _deptSpan: 0 });
      }
    }
    return result;
  }, []);

  const { leftUsers, rightUsers } = useMemo(() => {
    if (addressBookConfig.isTwoColumn) {
      const mid = Math.ceil(processedAddressBookUsers.length / 2);
      return {
        leftUsers: calculateRowSpans(processedAddressBookUsers.slice(0, mid), addressBookConfig),
        rightUsers: calculateRowSpans(processedAddressBookUsers.slice(mid), addressBookConfig),
      };
    } else {
      return {
        leftUsers: calculateRowSpans(processedAddressBookUsers, addressBookConfig),
        rightUsers: [],
      };
    }
  }, [processedAddressBookUsers, addressBookConfig, calculateRowSpans]);

  const { previewLeft, previewRight } = useMemo(() => {
    const previewUsers = processedAddressBookUsers.slice(0, 20);
    if (addressBookConfig.isTwoColumn) {
      const mid = Math.ceil(previewUsers.length / 2);
      return {
        previewLeft: calculateRowSpans(previewUsers.slice(0, mid), addressBookConfig),
        previewRight: calculateRowSpans(previewUsers.slice(mid), addressBookConfig),
      };
    } else {
      return {
        previewLeft: calculateRowSpans(previewUsers, addressBookConfig),
        previewRight: [],
      };
    }
  }, [processedAddressBookUsers, addressBookConfig, calculateRowSpans]);

  const handleExport = useCallback(async (filteredUsersLength: number) => {
    setIsExporting(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      toast.success(`成功导出 ${filteredUsersLength} 条员工数据 (Mock)`);
      setIsExportModalOpen(false);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('导出失败，请重试');
    } finally {
      setIsExporting(false);
    }
  }, []);

  const handlePrintRoster = useCallback(() => {
    if (!rosterPrintRef.current) return;
    const printContent = rosterPrintRef.current.innerHTML;
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    const printDocument = iframe.contentWindow?.document;
    if (printDocument) {
      printDocument.write(`
        <html>
          <head>
            <title>${exportConfig.title}</title>
            <style>
              @page { size: ${exportConfig.paperSize} ${exportConfig.orientation}; margin: 10mm; }
              ${exportConfig.isDoubleSided ? `@page :left { margin-left: 15mm; margin-right: 10mm; } @page :right { margin-left: 10mm; margin-right: 15mm; }` : ''}
              body { font-family: 'SimSun', 'Songti SC', serif; font-size: 10pt; color: #000; }
              table { width: 100%; border-collapse: collapse; font-size: 9pt; }
              th, td { border: 1px solid #000; padding: 4px 6px; text-align: left; word-break: break-all; }
              th { background-color: #f0f0f0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-weight: bold; }
              h1 { text-align: center; font-size: 16pt; margin-bottom: 10px; font-weight: bold; }
            </style>
          </head>
          <body>${printContent}</body>
        </html>
      `);
      printDocument.close();
      iframe.contentWindow?.focus();
      setTimeout(() => {
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
          setIsExportModalOpen(false);
        }, 1000);
      }, 250);
    }
  }, [exportConfig]);

  const handlePrintAddressBook = useCallback(() => {
    if (!addressBookPrintRef.current) return;
    const printContent = addressBookPrintRef.current.innerHTML;
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    const printDocument = iframe.contentWindow?.document;
    if (printDocument) {
      printDocument.write(`
        <html>
          <head>
            <title>${addressBookConfig.title}</title>
            <style>
              @page { size: ${addressBookConfig.paperSize} ${addressBookConfig.orientation}; margin: 10mm; }
              ${addressBookConfig.isDoubleSided ? `@page :left { margin-left: 15mm; margin-right: 10mm; } @page :right { margin-left: 10mm; margin-right: 15mm; }` : ''}
              body { font-family: 'SimSun', 'Songti SC', serif; font-size: 10pt; color: #000; }
              table { width: 100%; border-collapse: collapse; font-size: 9pt; }
              th, td { border: 1px solid #000; padding: 4px 6px; text-align: left; word-break: break-all; }
              th { background-color: #f0f0f0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-weight: bold; }
              h1 { text-align: center; font-size: 16pt; margin-bottom: 10px; font-weight: bold; }
            </style>
          </head>
          <body>${printContent}</body>
        </html>
      `);
      printDocument.close();
      iframe.contentWindow?.focus();
      setTimeout(() => {
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
          setIsAddressBookModalOpen(false);
        }, 1000);
      }, 250);
    }
  }, [addressBookConfig]);

  return {
    isExporting,
    isExportModalOpen,
    setIsExportModalOpen,
    isAddressBookModalOpen,
    setIsAddressBookModalOpen,
    themes,
    scripts,
    exportConfig,
    setExportConfig,
    addressBookConfig,
    setAddressBookConfig,
    addressBookPrintRef,
    rosterPrintRef,
    processedAddressBookUsers,
    leftUsers,
    rightUsers,
    previewLeft,
    previewRight,
    handleExport,
    handlePrintRoster,
    handlePrintAddressBook,
  };
}
