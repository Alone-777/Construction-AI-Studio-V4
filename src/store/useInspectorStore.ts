import { create } from 'zustand';
import type { ValidationError, ValidationResult, QualityScore, JumpRisk, Suggestion } from '../core/types';

interface InspectorState {
  /* ─── Validação da cena selecionada ─── */
  currentValidation: ValidationResult | null;
  currentErrors: ValidationError[];
  currentWarnings: ValidationError[];
  qualityScore: QualityScore | null;
  jumpRisk: JumpRisk;

  /* ─── Sugestões ─── */
  suggestions: Suggestion[];

  /* ─── Ações ─── */
  setValidation: (result: ValidationResult) => void;
  setErrors: (errors: ValidationError[]) => void;
  setWarnings: (warnings: ValidationError[]) => void;
  setQualityScore: (score: QualityScore) => void;
  setJumpRisk: (risk: JumpRisk) => void;
  setSuggestions: (suggestions: Suggestion[]) => void;
  clearAll: () => void;
}

export const useInspectorStore = create<InspectorState>((set) => ({
  currentValidation: null,
  currentErrors: [],
  currentWarnings: [],
  qualityScore: null,
  jumpRisk: 'LOW',
  suggestions: [],

  setValidation: (result) => set({ currentValidation: result }),
  setErrors: (errors) => set({ currentErrors: errors }),
  setWarnings: (warnings) => set({ currentWarnings: warnings }),
  setQualityScore: (score) => set({ qualityScore: score }),
  setJumpRisk: (risk) => set({ jumpRisk: risk }),
  setSuggestions: (suggestions) => set({ suggestions }),
  clearAll: () => set({
    currentValidation: null,
    currentErrors: [],
    currentWarnings: [],
    qualityScore: null,
    jumpRisk: 'LOW',
    suggestions: [],
  }),
}));
