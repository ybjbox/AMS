import React, { useCallback } from 'react';
import { IdCard } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { PrintSettings, VERTICAL_CHAR_STYLE, CARD_PADDING_STYLE } from '../constants';
import { User } from '@/types';

interface NameCardPreviewProps {
  printSettings: PrintSettings;
  pages: User[][];
  cardsToPrint: User[];
  cols: number;
  rows: number;
  actualCardHeight: number;
}

export default function NameCardPreview({
  printSettings,
  pages,
  cols,
  rows,
  actualCardHeight,
}: NameCardPreviewProps) {
  const renderJustifiedName = useCallback(
    (name: string, fontSize: number, isVertical: boolean = false) => {
      if (printSettings.textAlign === 'center' && name.length <= 4) {
        if (isVertical) {
          return (
            <div className="flex flex-col justify-between items-center mx-auto" style={{ height: `${fontSize * 4}px` }}>
              {name.split('').map((char, i) => (
                <span key={i} style={VERTICAL_CHAR_STYLE}>
                  {char}
                </span>
              ))}
            </div>
          );
        }
        return (
          <div className="flex justify-between mx-auto" style={{ width: `${fontSize * 4}px` }}>
            {name.split('').map((char, i) => (
              <span key={i}>{char}</span>
            ))}
          </div>
        );
      }

      return (
        <div
          style={{
            writingMode: isVertical ? 'vertical-rl' : 'horizontal-tb',
            textOrientation: isVertical ? 'upright' : 'mixed',
            textAlign: printSettings.textAlign,
          }}
        >
          {name}
        </div>
      );
    },
    [printSettings.textAlign]
  );

  const renderCardContent = useCallback(
    (user: User, isFlipped: boolean = false) => {
      const isVertical = printSettings.layout === 'vertical';

      return (
        <div
          className={`flex justify-center items-center w-full h-full ${isFlipped ? 'rotate-180' : ''} ${isVertical ? 'flex-row-reverse space-x-reverse space-x-6' : 'flex-col space-y-2'}`}
          style={CARD_PADDING_STYLE}
        >
          {printSettings.showCompanyName && (
            <div
              className={`font-semibold ${isVertical ? 'h-full flex items-center' : 'w-full text-center'}`}
              style={{
                fontSize: `${printSettings.companyNameFontSize}px`,
                writingMode: isVertical ? 'vertical-rl' : 'horizontal-tb',
                textOrientation: isVertical ? 'upright' : 'mixed',
                letterSpacing: isVertical ? '0.2em' : 'normal',
                color: printSettings.fontColor,
              }}
            >
              {printSettings.companyName}
            </div>
          )}
          <div
            className={`flex ${isVertical ? 'items-center' : 'justify-center'} w-full`}
            style={{
              fontSize: `${printSettings.fontSize}px`,
              fontWeight: printSettings.isBold ? 'bold' : 'normal',
              height: isVertical ? '100%' : 'auto',
            }}
          >
            {renderJustifiedName(user.name, printSettings.fontSize, isVertical)}
          </div>
          {(printSettings.showDepartment || printSettings.showRole) && (
            <div
              className={`flex ${isVertical ? 'flex-row-reverse space-x-reverse space-x-3 h-full items-center' : 'flex-col space-y-1 w-full text-center'}`}
            >
              {printSettings.showDepartment && (
                <div
                  style={{
                    fontSize: `${printSettings.departmentFontSize}px`,
                    writingMode: isVertical ? 'vertical-rl' : 'horizontal-tb',
                    textOrientation: isVertical ? 'upright' : 'mixed',
                  }}
                >
                   {user.department}
                </div>
              )}
              {printSettings.showRole && (
                <div
                  style={{
                    fontSize: `${printSettings.roleFontSize}px`,
                    writingMode: isVertical ? 'vertical-rl' : 'horizontal-tb',
                    textOrientation: isVertical ? 'upright' : 'mixed',
                  }}
                >
                  {user.role}
                </div>
              )}
            </div>
          )}
        </div>
      );
    },
    [printSettings, renderJustifiedName]
  );

  const renderCropMarks = useCallback(() => {
    const startX = (printSettings.paperWidth - cols * printSettings.cardWidth) / 2;
    const startY = (printSettings.paperHeight - rows * actualCardHeight) / 2;

    const marks = [];

    // Top & Bottom marks
    for (let i = 0; i <= cols; i++) {
      const x = startX + i * printSettings.cardWidth;
      if (x >= 0 && x <= printSettings.paperWidth) {
        marks.push(
          <div
            key={`top-${i}`}
            className="absolute top-0 bg-zinc-400 z-10 print:bg-black"
            style={{ left: `${x}mm`, width: '1px', height: '5mm' }}
          />
        );
        marks.push(
          <div
            key={`bottom-${i}`}
            className="absolute bottom-0 bg-zinc-400 z-10 print:bg-black"
            style={{ left: `${x}mm`, width: '1px', height: '5mm' }}
          />
        );
      }
    }

    // Left & Right marks
    for (let i = 0; i <= rows; i++) {
      const y = startY + i * actualCardHeight;
      if (y >= 0 && y <= printSettings.paperHeight) {
        marks.push(
          <div
            key={`left-${i}`}
            className="absolute left-0 bg-zinc-400 z-10 print:bg-black"
            style={{ top: `${y}mm`, width: '5mm', height: '1px' }}
          />
        );
        marks.push(
          <div
            key={`right-${i}`}
            className="absolute right-0 bg-zinc-400 z-10 print:bg-black"
            style={{ top: `${y}mm`, width: '5mm', height: '1px' }}
          />
        );
      }
    }

    return marks;
  }, [printSettings.paperWidth, printSettings.paperHeight, printSettings.cardWidth, cols, rows, actualCardHeight]);

  return (
    <>
      <div className="flex-1 bg-zinc-100 dark:bg-zinc-900 overflow-auto p-8 flex flex-col items-center space-y-8 min-h-0 relative print:hidden">
        <div className="sticky top-0 self-start text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider z-10 bg-white/90 dark:bg-zinc-800/90 backdrop-blur py-1.5 px-3 rounded-br-lg shadow-sm -mt-8 -ml-8 mb-4">
          打印预览 ({pages.length}页)
        </div>

        {pages.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center">
            <EmptyState title="暂无预览" description="请选择人员以预览台卡" icon={IdCard} />
          </div>
        ) : (
          <div className="flex flex-col gap-8 items-center w-full pt-2">
            {pages.map((pageCards, pageIdx) => (
              <div key={`page-${pageIdx}`} className="flex flex-col items-center">
                <div className="text-sm text-zinc-500 dark:text-zinc-400 mb-2">
                  预览纸张: {printSettings.paperSize} ({printSettings.paperWidth}x{printSettings.paperHeight}mm) - 第{' '}
                  {pageIdx + 1} 页
                </div>
                <div
                  style={{
                    width: `${printSettings.paperWidth * 0.5}mm`,
                    height: `${printSettings.paperHeight * 0.5}mm`,
                  }}
                  className="flex-shrink-0 relative"
                >
                  <div
                    className="absolute top-0 left-0 bg-white dark:bg-zinc-800 shadow-lg origin-top-left transition-all duration-300"
                    style={{
                      width: `${printSettings.paperWidth}mm`,
                      height: `${printSettings.paperHeight}mm`,
                      boxSizing: 'border-box',
                      transform: 'scale(0.5)',
                    }}
                  >
                    {renderCropMarks()}

                    <div
                      className="absolute"
                      style={{
                        left: `${(printSettings.paperWidth - cols * printSettings.cardWidth) / 2}mm`,
                        top: `${(printSettings.paperHeight - rows * actualCardHeight) / 2}mm`,
                        width: `${cols * printSettings.cardWidth}mm`,
                        height: `${rows * actualCardHeight}mm`,
                        display: 'grid',
                        gridTemplateColumns: `repeat(${cols}, ${printSettings.cardWidth}mm)`,
                        gridTemplateRows: `repeat(${rows}, ${actualCardHeight}mm)`,
                      }}
                    >
                      {pageCards.map((user, idx) => (
                        <div
                          key={`${user.id}-${idx}`}
                          className="border border-zinc-200 dark:border-zinc-700 border-dashed flex flex-col justify-center overflow-hidden relative print:border-none"
                          style={{
                            backgroundColor: printSettings.backgroundColor,
                            color: printSettings.fontColor,
                            fontFamily: printSettings.fontFamily,
                            textAlign: printSettings.textAlign,
                          }}
                        >
                          {printSettings.isDoubleSided ? (
                            <>
                              <div className="flex-1 border-b border-zinc-200 dark:border-zinc-700 border-dashed flex items-center justify-center">
                                {renderCardContent(user, true)}
                              </div>
                              <div className="flex-1 flex items-center justify-center">
                                {renderCardContent(user, false)}
                              </div>
                            </>
                          ) : (
                            renderCardContent(user, false)
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @media print {
          @page {
            size: ${printSettings.paperWidth}mm ${printSettings.paperHeight}mm;
            margin: 0;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:bg-white dark:bg-zinc-800 {
            background-color: white !important;
          }
          .print\\:h-auto {
            height: auto !important;
          }
        }
      `}</style>

      {/* Actual Printable Area */}
      <div className="hidden print:block w-full bg-white dark:bg-zinc-800">
        {pages.map((pageCards, pageIdx) => (
          <div
            key={`print-page-${pageIdx}`}
            className="relative bg-white dark:bg-zinc-800"
            style={{
              width: `${printSettings.paperWidth}mm`,
              height: `${printSettings.paperHeight}mm`,
              pageBreakAfter: 'always',
              boxSizing: 'border-box',
            }}
          >
            {renderCropMarks()}

            <div
              className="absolute"
              style={{
                left: `${(printSettings.paperWidth - cols * printSettings.cardWidth) / 2}mm`,
                top: `${(printSettings.paperHeight - rows * actualCardHeight) / 2}mm`,
                width: `${cols * printSettings.cardWidth}mm`,
                height: `${rows * actualCardHeight}mm`,
                display: 'grid',
                gridTemplateColumns: `repeat(${cols}, ${printSettings.cardWidth}mm)`,
                gridTemplateRows: `repeat(${rows}, ${actualCardHeight}mm)`,
              }}
            >
              {pageCards.map((user, idx) => (
                <div
                  key={`print-${user.id}-${idx}`}
                  className="flex flex-col justify-center overflow-hidden relative"
                  style={{
                    backgroundColor: printSettings.backgroundColor,
                    color: printSettings.fontColor,
                    fontFamily: printSettings.fontFamily,
                    textAlign: printSettings.textAlign,
                  }}
                >
                  {printSettings.isDoubleSided ? (
                    <>
                      <div className="flex-1 border-b border-zinc-200 dark:border-zinc-700 border-dashed flex items-center justify-center">
                        {renderCardContent(user, true)}
                      </div>
                      <div className="flex-1 flex items-center justify-center">{renderCardContent(user, false)}</div>
                    </>
                  ) : (
                    renderCardContent(user, false)
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
