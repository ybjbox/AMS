import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { defaultTemplate } from '../config/defaultContractTemplate';

interface ContractStore {
  template: string;
  setTemplate: (template: string) => void;
  resetTemplate: () => void;
}

export const useContractStore = create<ContractStore>()(
  persist(
    (set) => ({
      template: defaultTemplate,
      setTemplate: (template) => set({ template }),
      resetTemplate: () => set({ template: defaultTemplate }),
    }),
    {
      name: 'contract-storage',
    }
  )
);
