import { useServerPrefs } from '@/hooks/useServerPrefs';

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

/**
 * 座次卡打印参数：存在服务端（每个账号一份），刷新与换设备都不丢。
 * 首帧先渲染默认值，服务端值回来后覆盖 —— 期间用户改了参数也不会被回覆盖
 * （见 useServerPrefs：未 ready 前不回写）。
 */
export function usePrintSettings() {
  const { value: printSettings, setValue: setPrintSettings } = useServerPrefs<PrintSettings>(
    'seating-prefs',
    defaultPrintSettings
  );

  return {
    printSettings,
    setPrintSettings,
  };
}
