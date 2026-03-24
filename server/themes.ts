export const EXCEL_THEMES = {
  default: {
    id: 'default',
    name: '经典蓝',
    titleFill: 'FFF1F5F9', // Slate-100
    headerFill: 'FF2563EB', // Blue-600
    headerFontColor: 'FFFFFFFF',
    zebraFill: 'FFF8FAFC', // Slate-50
  },
  elegant: {
    id: 'elegant',
    name: '商务黑',
    titleFill: 'FFF1F5F9',
    headerFill: 'FF1E293B', // Slate-800
    headerFontColor: 'FFFFFFFF',
    zebraFill: 'FFF8FAFC',
  },
  vibrant: {
    id: 'vibrant',
    name: '活力绿',
    titleFill: 'FFF0FDF4', // Green-50
    headerFill: 'FF059669', // Emerald-600
    headerFontColor: 'FFFFFFFF',
    zebraFill: 'FFF7FEE7', // Lime-50
  },
  luxury: {
    id: 'luxury',
    name: '尊享金',
    titleFill: 'FFFFFAF0', // FloralWhite
    headerFill: 'FFB45309', // Amber-700
    headerFontColor: 'FFFFFFFF',
    zebraFill: 'FFFFFBEB', // Amber-50
  }
};

export type ThemeId = keyof typeof EXCEL_THEMES;
