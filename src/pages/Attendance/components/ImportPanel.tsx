import React, { useState } from 'react';
import PunchImportDialog from './PunchImportDialog';

/**
 * 打卡记录的导入向导宿主。
 *
 * 原来这段逻辑在 Filter.tsx 里：一个占满一屏的说明 + 虚线上传框，与筛选、
 * 分析按钮混在一个组件里，于是组件名和职责都对不上。拆开之后：
 *  - 空数据时从表格的 EmptyState 进（行动召唤，不占地方）
 *  - 有数据时从页头的「导入打卡记录」进
 * 两个入口共用同一个对话框实例，不会各开一份状态。
 */
export interface ImportDialogHostProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
  onGoAnalyze: () => void;
}

export function ImportDialogHost({ isOpen, onOpenChange, onImported, onGoAnalyze }: ImportDialogHostProps) {
  const [importFile, setImportFile] = useState<File | null>(null);

  return (
    <PunchImportDialog
      isOpen={isOpen}
      initialFile={importFile}
      onClose={() => {
        onOpenChange(false);
        setImportFile(null);
      }}
      onImported={onImported}
      onGoAnalyze={onGoAnalyze}
    />
  );
}