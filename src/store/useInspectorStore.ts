import { create } from 'zustand';
import type { ValidationError, ValidationResult, QualityScore, JumpRisk, Suggestion, Zone, ConstructionComponent } from '../core/types';

interface InspectorState {
  /* ─── Validação da cena selecionada ─── */
  currentValidation: ValidationResult | null;
  currentErrors: ValidationError[];
  currentWarnings: ValidationError[];
  qualityScore: QualityScore | null;
  jumpRisk: JumpRisk;

  /* ─── Seleção no workspace ─── */
  selectedZone: Zone | null;
  selectedComponent: ConstructionComponent | null;

  /* ─── Sugestões ─── */
  suggestions: Suggestion[];

  /* ─── Ações ─── */
  setValidation: (result: ValidationResult) => void;
  setErrors: (errors: ValidationError[]) => void;
  setWarnings: (warnings: ValidationError[]) => void;
  setQualityScore: (score: QualityScore) => void;
  setJumpRisk: (risk: JumpRisk) => void;
  setSuggestions: (suggestions: Suggestion[]) => void;
  setSelectedZone: (zone: Zone | null) => void;
  setSelectedComponent: (component: ConstructionComponent | null) => void;
  clearAll: () => void;
}

export const useInspectorStore = create<InspectorState>((set) => ({
  currentValidation: null,
  currentErrors: [],
  currentWarnings: [],
  qualityScore: null,
  jumpRisk: 'LOW',
  selectedZone: null,
  selectedComponent: null,
  suggestions: [],

  setValidation: (result) => set({ currentValidation: result }),
  setErrors: (errors) => set({ currentErrors: errors }),
  setWarnings: (warnings) => set({ currentWarnings: warnings }),
  setQualityScore: (score) => set({ qualityScore: score }),
  setJumpRisk: (risk) => set({ jumpRisk: risk }),
  setSuggestions: (suggestions) => set({ suggestions }),
  setSelectedZone: (zone) => set({ selectedZone: zone }),
  setSelectedComponent: (component) => set({ selectedComponent: component }),
  clearAll: () => set({
    currentValidation: null,
    currentErrors: [],
    currentWarnings: [],
    qualityScore: null,
    jumpRisk: 'LOW',
    selectedZone: null,
    selectedComponent: null,
    suggestions: [],
  }),
}));
