import { useState, useCallback } from 'react';
import { User } from '@/types';

export function useContractPrint(setSelectedUser: (user: User) => void) {
  const [isDoubleSided, setIsDoubleSided] = useState(true);

  const handlePrint = useCallback(() => {
    const printArea = document.getElementById('contract-print-area');
    if (!printArea) return;

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:none';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
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
