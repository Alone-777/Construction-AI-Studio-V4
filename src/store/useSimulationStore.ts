import { create } from 'zustand';
import type { WorldState, Transformation, TransformationLog } from '../core/types';
import { applyTransformation, snapshotState, diffStates } from '../core/engines/world-state';

interface SimulationState {
  /* ─── Estado do Mundo ─── */
  worldState: WorldState | null;
  worldStateHistory: WorldState[];
  transformationLog: TransformationLog;
  
  /* ─── Controles ─── */
  currentStep: number;
  isPlaying: boolean;
  playbackSpeed: number;

  /* ─── Ações ─── */
  setWorldState: (state: WorldState) => void;
  loadHistory: (states: WorldState[]) => void;
  applyTransform: (transformation: Transformation) => void;
  undo: () => void;
  redo: () => void;
  
  /* ─── Playback ─── */
  play: () => void;
  pause: () => void;
  stop: () => void;
  setStep: (step: number) => void;
  setSpeed: (speed: number) => void;
  
  /* ─── Queries ─── */
  getStateDiff: (stepA: number, stepB: number) => ReturnType<typeof diffStates> | null;
}

export const useSimulationStore = create<SimulationState>((set, get) => ({
  worldState: null,
  worldStateHistory: [],
  transformationLog: [],
  currentStep: 0,
  isPlaying: false,
  playbackSpeed: 1,

  setWorldState: (state) => {
    set({
      worldState: state,
      worldStateHistory: [snapshotState(state)],
      transformationLog: [],
      currentStep: 0,
    });
  },

  loadHistory: (states) => {
    const history = states.map(snapshotState);
    set({
      worldState: history[0] ?? null,
      worldStateHistory: history,
      transformationLog: [],
      currentStep: 0,
      isPlaying: false,
    });
  },

  applyTransform: (transformation) => {
    const { worldState, worldStateHistory, transformationLog, currentStep } = get();
    if (!worldState) return;

    const newState = applyTransformation(worldState, transformation);
    const newHistory = [
      ...worldStateHistory.slice(0, currentStep + 1),
      snapshotState(newState),
    ];

    set({
      worldState: newState,
      worldStateHistory: newHistory,
      transformationLog: [...transformationLog, transformation],
      currentStep: currentStep + 1,
    });
  },

  undo: () => {
    const { worldStateHistory, currentStep } = get();
    if (currentStep <= 0) return;
    const prevStep = currentStep - 1;
    set({
      worldState: snapshotState(worldStateHistory[prevStep]),
      currentStep: prevStep,
    });
  },

  redo: () => {
    const { worldStateHistory, currentStep } = get();
    if (currentStep >= worldStateHistory.length - 1) return;
    const nextStep = currentStep + 1;
    set({
      worldState: snapshotState(worldStateHistory[nextStep]),
      currentStep: nextStep,
    });
  },

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  stop: () => set({ isPlaying: false, currentStep: 0 }),
  setStep: (step) => {
    const { worldStateHistory } = get();
    const clampedStep = Math.max(0, Math.min(step, worldStateHistory.length - 1));
    if (worldStateHistory[clampedStep]) {
      set({
        currentStep: clampedStep,
        worldState: snapshotState(worldStateHistory[clampedStep]),
      });
    }
  },
  setSpeed: (speed) => set({ playbackSpeed: speed }),

  getStateDiff: (stepA, stepB) => {
    const { worldStateHistory } = get();
    const stateA = worldStateHistory[stepA];
    const stateB = worldStateHistory[stepB];
    if (!stateA || !stateB) return null;
    return diffStates(stateA, stateB);
  },
}));
