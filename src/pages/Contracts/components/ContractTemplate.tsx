import React from 'react';
import DOMPurify from 'dompurify';
import { User } from '@/types';
import { useContractStore } from '@/store/useContractStore';

const CONTRACT_STYLE: React.CSSProperties = { fontFamily: 'SimSun, "Songti SC", serif' };

export const ContractTemplate = ({ user }: { user: User }) => {
  const template = useContractStore((state) => state.template);

  if (!user) return null;

  const signDate = user.contractSignDate ? new Date(user.contractSignDate) : null;
  const expiryDate = user.contractExpiry ? new Date(user.contractExpiry) : null;

  const replacements: Record<string, string> = {
    '{name}': user.name || '',
    '{idCard}': user.idCard || '__________________',
    '{phone}': user.phone || '__________________',
    '{department}': user.department || '',
    '{role}': user.role || '员工',
    '{contractYears}': String(user.contractYears || 3),
    '{signYear}': signDate ? String(signDate.getFullYear()) : '____',
    '{signMonth}': signDate ? String(signDate.getMonth() + 1) : '__',
    '{signDay}': signDate ? String(signDate.getDate()) : '__',
    '{expiryYear}': expiryDate ? String(expiryDate.getFullYear()) : '____',
    '{expiryMonth}': expiryDate ? String(expiryDate.getMonth() + 1) : '__',
    '{expiryDay}': expiryDate ? String(expiryDate.getDate()) : '__',
  };

  let processed = template;
  for (const [key, value] of Object.entries(replacements)) {
    processed = processed.replace(new RegExp(key, 'g'), value);
  }

  const sanitizedHTML = DOMPurify.sanitize(processed, {
    ALLOWED_TAGS: ['h1','h2','h3','h4','p','div','span','br','table','thead','tbody','tr','td','th','strong','em','u','ol','ul','li','hr'],
    ALLOWED_ATTR: ['style','class','colspan','rowspan']
  });

  return (
    <div
      id="contract-print-area"
      className="bg-white dark:bg-zinc-800 max-w-3xl mx-auto p-12 shadow-sm border border-zinc-200 dark:border-zinc-700 min-h-[1056px] text-black"
      style={CONTRACT_STYLE}
      dangerouslySetInnerHTML={{ __html: sanitizedHTML }}
    />
  );
};
