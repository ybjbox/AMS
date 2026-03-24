/**
 * @param {import('exceljs').Worksheet} worksheet
 * @param {any[]} data - 过滤后的员工数据
 * @param {any} config - 导出配置 (title, columns, etc.)
 */
export default async function applyTemplate(worksheet, data, config) {
  const { title, columns } = config;
  
  // 1. 设置列宽
  worksheet.columns = columns.map(col => ({
    header: col.header,
    key: col.key,
    width: 20
  }));

  // 2. 添加大标题
  const titleRow = worksheet.insertRow(1, [title]);
  worksheet.mergeCells(1, 1, 1, columns.length);
  titleRow.height = 45;
  const titleCell = titleRow.getCell(1);
  titleCell.font = { size: 22, bold: true, color: { argb: 'FFFFFFFF' }, name: 'Microsoft YaHei' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

  // 3. 设置表头样式 (第2行)
  const headerRow = worksheet.getRow(2);
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      bottom: { style: 'medium', color: { argb: 'FF000000' } }
    };
  });

  // 4. 填充数据并应用自定义逻辑
  data.forEach((item, index) => {
    const row = worksheet.addRow(item);
    
    // 逻辑：如果是人事部，背景设为浅绿色
    if (item.department === '人事部') {
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };
      });
    }
    
    // 逻辑：如果是离职状态，文字设为红色斜体
    if (item.status === '离职' || item.status === 'inactive') {
      row.getCell('name').font = { color: { argb: 'FFFF0000' }, italic: true };
    }

    // 通用单元格边框
    row.eachCell(cell => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
  });
}
