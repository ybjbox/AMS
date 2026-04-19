export interface PrintSettings {
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

export const VERTICAL_CHAR_STYLE: React.CSSProperties = { writingMode: 'vertical-rl', textOrientation: 'upright' };
export const CARD_PADDING_STYLE: React.CSSProperties = { padding: '10px' };

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
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
};
