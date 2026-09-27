import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { User } from '@/types';

export function useContractPrint(setSelectedUser: (user: User) => void) {
  const [isDoubleSided, setIsDoubleSided] = useState(true);

  const handlePrint = useCallback(() => {
    const printArea = document.getElementById('contract-print-area');
    if (!printArea) {
      // 此前是裸 return：点「打印」可以什么都不发生（2026-09-26 审查 M2）。
      // 口径与排座一致：说清缺什么、下一步做什么。
      toast.error('还没有生成合同正文，请先选择员工并生成预览');
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:none';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      toast.error('浏览器未能创建打印文档，请重试；若持续失败，可改用浏览器的「打印 → 另存为 PDF」');
      return;
    }

    doc.open();
    doc.write(`<!DOCTYPE html><html><head><style>
      body { margin:0; padding:0; font-family: SimSun,"Songti SC",serif; }
      @page { size:A4; margin:0; }
      ${isDoubleSided ? '.page { page-break-after: always; }' : ''}
    </style></head><body>${printArea.outerHTML}</body></html>`);
    doc.close();

    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) document.body.removeChild(iframe);
      }, 1000);
    };
  }, [isDoubleSided]);

  const handleDirectPrint = useCallback(
    (user: User) => {
      setSelectedUser(user);
      setTimeout(() => {
        handlePrint();
      }, 100);
    },
    [handlePrint, setSelectedUser]
  );

  return {
    handlePrint,
    handleDirectPrint,
    isDoubleSided,
    setIsDoubleSided,
  };
}
