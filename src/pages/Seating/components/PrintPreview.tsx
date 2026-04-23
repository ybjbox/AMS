import React from 'react';
import { PrintSettings } from '../hooks/usePrintSettings';
import { Table } from '../hooks/useSeatingArrange';

import { User } from '@/types';

interface PrintPreviewProps {
  tables: Table[];
  printSettings: PrintSettings;
  getTableDepartments: (members: User[]) => string;
  renderJustifiedName: (name: string, fontSize: number) => React.ReactNode;
}

export function PrintPreview({ tables, printSettings, getTableDepartments, renderJustifiedName }: PrintPreviewProps) {
  return (
    <div
      id="printable-area"
      className="hidden print:flex print:flex-wrap print:gap-[10mm] print:justify-center print:items-start print:p-[10mm] print:w-full print:bg-white dark:bg-zinc-800"
    >
      {tables.map((table) => (
        <div
          key={table.number}
          className="relative flex flex-col bg-white dark:bg-zinc-800 box-border break-inside-avoid"
          style={{
            width: `${printSettings.cardWidth}mm`,
            minHeight: `${printSettings.cardHeight}mm`,
            border: printSettings.cardStyle === 'style1' ? `4px double ${printSettings.themeColor}` : 'none',
            borderRadius: printSettings.cardStyle === 'style1' ? '20px' : '0',
            padding: '20px',
          }}
        >
          {printSettings.cardStyle === 'style1' ? (
            <>
              <div className="text-center border-b-2 pb-3 mb-3" style={{ borderColor: printSettings.themeColor }}>
                <div
                  className="mb-1"
                  style={{
                    color: printSettings.themeColor,
                    fontFamily: printSettings.titleFontFamily,
                    fontSize: `${printSettings.titleFontSize}px`,
                    letterSpacing: '4px',
                  }}
                >
                  {printSettings.cardTitle}
                </div>
                <div
                  className="font-black"
                  style={{
                    color: printSettings.themeColor,
                    fontSize: `${printSettings.numberFontSize}px`,
                    fontFamily: printSettings.numberFontFamily,
                  }}
                >
                  {table.number}号桌
                </div>
              </div>

              {printSettings.showMembers ? (
                <div
                  className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1"
                  style={{ fontFamily: printSettings.contentFontFamily }}
                >
                  {table.members.map((m, idx) => (
                    <div key={m.id} className="flex items-center p-2 bg-zinc-50 rounded-lg">
                      {printSettings.showIndex && (
                        <div
                          className="font-bold text-zinc-400 mr-3 flex-shrink-0 text-right"
                          style={{
                            fontSize: `${printSettings.contentFontSize * 1.2}px`,
                            width: '1.5em',
                          }}
                        >
                          {idx + 1}
                        </div>
                      )}
                      <div className="flex-1 overflow-hidden" style={{ textAlign: printSettings.textAlign as React.CSSProperties['textAlign'] }}>
                        <div
                          className="font-bold text-zinc-900 dark:text-zinc-200 whitespace-nowrap overflow-hidden text-ellipsis"
                          style={{ fontSize: `${printSettings.contentFontSize * 1.2}px` }}
                        >
                          {m.name}
                        </div>
                        {(printSettings.showDepartment || printSettings.showRole) && (
                          <div
                            className="text-zinc-500 mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis"
                            style={{ fontSize: `${printSettings.contentFontSize}px` }}
                          >
                            {printSettings.showDepartment ? m.department : ''}
                            {printSettings.showDepartment && printSettings.showRole ? ' · ' : ''}
                            {printSettings.showRole ? m.role : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex-1"></div>
              )}

              <div
                className="mt-3 text-center text-[10px] text-zinc-400"
                style={{ fontFamily: printSettings.footerFontFamily }}
              >
                {printSettings.footerText}
              </div>
            </>
          ) : (
            <div className="flex flex-col h-full" style={{ color: printSettings.themeColor }}>
              <div className="text-center mb-8">
                <div className="flex items-baseline justify-center gap-2 mb-4">
                  <span
                    className="font-black"
                    style={{
                      fontSize: `${printSettings.numberFontSize}px`,
                      fontFamily: printSettings.numberFontFamily,
                    }}
                  >
                    {table.number} 号桌
                  </span>
                  <span
                    className="font-medium"
                    style={{ fontSize: `${printSettings.titleFontSize}px`, fontFamily: printSettings.titleFontFamily }}
                  >
                    ({table.members.length}人)
                  </span>
                </div>
                <div
                  className="font-medium"
                  style={{
                    fontSize: `${printSettings.titleFontSize * 0.8}px`,
                    fontFamily: printSettings.titleFontFamily,
                  }}
                >
                  ({getTableDepartments(table.members)})
                </div>
              </div>

              <div
                className="flex-1 flex flex-col items-center justify-start gap-4"
                style={{ fontFamily: printSettings.contentFontFamily }}
              >
                {table.members.map((m) => (
                  <div
                    key={m.id}
                    className="font-bold whitespace-nowrap"
                    style={{ fontSize: `${printSettings.contentFontSize * 1.5}px` }}
                  >
                    {renderJustifiedName(m.name, printSettings.contentFontSize * 1.5)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
