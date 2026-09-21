import React from 'react';
import { useBodyOverflow } from '@/hooks/useBodyOverflow';
import { useNameCards } from './hooks/useNameCards';
import NameCardToolbar from './components/NameCardToolbar';
import NameCardEditor from './components/NameCardEditor';
import NameCardPreview from './components/NameCardPreview';
import NameCardModals from './components/NameCardModals';

export default function NameCards() {
  const state = useNameCards();

  useBodyOverflow(state.isManualInputOpen || state.isParticipantModalOpen);

  const actualCardHeight = state.printSettings.isDoubleSided
    ? state.printSettings.cardHeight * 2
    : state.printSettings.cardHeight;
  const cols = Math.max(1, Math.floor(state.printSettings.paperWidth / state.printSettings.cardWidth));
  const rows = Math.max(1, Math.floor(state.printSettings.paperHeight / actualCardHeight));
  const cardsPerPage = cols * rows;

  const pages = [];
  for (let i = 0; i < state.cardsToPrint.length; i += cardsPerPage) {
    pages.push(state.cardsToPrint.slice(i, i + cardsPerPage));
  }

  return (
    <div className="px-4 pt-4 pb-24 sm:px-6 sm:pt-6 lg:px-8 lg:pt-8 print:p-0 print:h-auto flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 flex flex-col card-base overflow-hidden print:border-0 print:shadow-none print:bg-white">
        <NameCardToolbar
          uploadedUsers={state.uploadedUsers}
          setUploadedUsers={state.setUploadedUsers}
          setIsManualInputOpen={state.setIsManualInputOpen}
          setIsParticipantModalOpen={state.setIsParticipantModalOpen}
          selectedUserIds={state.selectedUserIds}
          handlePrint={state.handlePrint}
        />
        <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden flex flex-col md:flex-row print:hidden">
          <NameCardEditor
            printSettings={state.printSettings}
            setPrintSettings={state.setPrintSettings}
            handlePaperSizeChange={state.handlePaperSizeChange}
            handlePaperOrientationChange={state.handlePaperOrientationChange}
          />
          <NameCardPreview
            containerRef={state.printAreaRef}
            printSettings={state.printSettings}
            pages={pages}
            cardsToPrint={state.cardsToPrint}
            cols={cols}
            rows={rows}
            actualCardHeight={actualCardHeight}
          />
        </div>
        <NameCardModals
          isParticipantModalOpen={state.isParticipantModalOpen}
          setIsParticipantModalOpen={state.setIsParticipantModalOpen}
          expandedDepts={state.expandedDepts}
          toggleAllDeptsExpand={state.toggleAllDeptsExpand}
          groupedUsers={state.groupedUsers}
          selectedUserIds={state.selectedUserIds}
          toggleDepartmentSelection={state.toggleDepartmentSelection}
          setExpandedDepts={state.setExpandedDepts}
          toggleUserSelection={state.toggleUserSelection}
          isManualInputOpen={state.isManualInputOpen}
          setIsManualInputOpen={state.setIsManualInputOpen}
          manualInputText={state.manualInputText}
          setManualInputText={state.setManualInputText}
          handleManualInputSubmit={state.handleManualInputSubmit}
        />
      </div>
    </div>
  );
}
