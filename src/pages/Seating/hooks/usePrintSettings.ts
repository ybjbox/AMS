import { useState } from 'react';

export interface PrintSettings {
  cardStyle: string;
  cardTitle: string;
  footerText: string;
  themeColor: string;
  cardWidth: number;
  cardHeight: number;
  titleFontSize: number;
  numberFontSize: number;
  contentFontSize: number;
  titleFontFamily: string;
  numberFontFamily: string;
  contentFontFamily: string;
  footerFontFamily: string;
  textAlign: string;
  showMembers: boolean;
  showIndex: boolean;
  showDepartment: boolean;
  showRole: boolean;
}

export const defaultPrintSettings: PrintSettings = {
  cardStyle: 'style1',
  cardTitle: '聚会席位安排',
  footerText: '排名不分先后',
  themeColor: '#000000',
  cardWidth: 210,
  cardHeight: 297,
  titleFontSize: 24,
  numberFontSize: 48,
  contentFontSize: 30,
  titleFontFamily: '"Noto Serif SC", "SimSun", serif',
  numberFontFamily: '"Microsoft YaHei", "SimHei", sans-serif',
  contentFontFamily: '"Microsoft YaHei", "SimHei", sans-serif',
  footerFontFamily: '"Microsoft YaHei", "SimHei", sans-serif',
  textAlign: 'center',
  showMembers: true,
  showIndex: true,
  showDepartment: true,
  showRole: true,
};

export function usePrintSettings() {
  const [printSettings, setPrintSettings] = useState<PrintSettings>(defaultPrintSettings);

  return {
    printSettings,
    setPrintSettings,
  };
}
