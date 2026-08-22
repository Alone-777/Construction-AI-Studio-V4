import { create } from 'zustand';
import type {
  PromptPlatform, GeneratedPrompt, NanoBananaPrompt, KlingPrompt, PromptConfig,
} from '../core/types';

interface PromptState {
  /* ─── Configuração ─── */
  config: PromptConfig;

  /* ─── Prompts gerados ─── */
  nanoBananaPrompt: NanoBananaPrompt | null;
  klingPrompt: KlingPrompt | null;
  generatedPrompts: GeneratedPrompt[];

  /* ─── Edição manual ─── */
  editedText: string;
  isEditing: boolean;

  /* ─── Ações ─── */
  setConfig: (config: Partial<PromptConfig>) => void;
  setNanoBananaPrompt: (prompt: NanoBananaPrompt) => void;
  setKlingPrompt: (prompt: KlingPrompt) => void;
  addGeneratedPrompt: (prompt: GeneratedPrompt) => void;
  clearPrompts: () => void;
  startEditing: (text: string) => void;
  updateEditedText: (text: string) => void;
  stopEditing: () => void;
  copyToClipboard: (text: string) => void;
}

export const usePromptStore = create<PromptState>((set) => ({
  config: {
    platform: 'kling',
    maxCharacters: 1400,
    autoOptimize: false,
  },
  nanoBananaPrompt: null,
  klingPrompt: null,
  generatedPrompts: [],
  editedText: '',
  isEditing: false,

  setConfig: (updates) => set((s) => ({
    config: { ...s.config, ...updates },
  })),

  setNanoBananaPrompt: (prompt) => set({ nanoBananaPrompt: prompt }),
  setKlingPrompt: (prompt) => set({ klingPrompt: prompt }),

  addGeneratedPrompt: (prompt) => set((s) => ({
    generatedPrompts: [...s.generatedPrompts, prompt],
  })),

  clearPrompts: () => set({
    nanoBananaPrompt: null,
    klingPrompt: null,
    generatedPrompts: [],
    editedText: '',
    isEditing: false,
  }),

  startEditing: (text) => set({ editedText: text, isEditing: true }),
  updateEditedText: (text) => set({ editedText: text }),
  stopEditing: () => set({ isEditing: false }),

  copyToClipboard: (text) => {
    navigator.clipboard.writeText(text).catch(console.error);
  },
}));
