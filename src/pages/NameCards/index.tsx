import React from 'react';
import { useBodyOverflow } from '../../hooks/useBodyOverflow';
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
    <div className="flex-1 min-h-0 flex flex-col bg-zinc-50 dark:bg-zinc-900 print:bg-white print:h-auto overflow-hidden rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800">
      <NameCardToolbar
        uploadedUsers={state.uploadedUsers}
        setUploadedUsers={state.setUploadedUsers}
        isUploadMenuOpen={state.isUploadMenuOpen}
        setIsUploadMenuOpen={state.setIsUploadMenuOpen}
        setIsManualInputOpen={state.setIsManualInputOpen}
        handleDownloadTemplate={state.handleDownloadTemplate}
        handleFileUpload={state.handleFileUpload}
        setIsParticipantModalOpen={state.setIsParticipantModalOpen}
        selectedUserIds={state.selectedUserIds}
        handlePrint={state.handlePrint}
      />
      <div className="flex-1 overflow-hidden flex print:hidden">
        <NameCardEditor
          printSettings={state.printSettings}
          setPrintSettings={state.setPrintSettings}
          handlePaperSizeChange={state.handlePaperSizeChange}
          handlePaperOrientationChange={state.handlePaperOrientationChange}
        />
        <NameCardPreview
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
  );
}
