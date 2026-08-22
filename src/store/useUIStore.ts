import { create } from 'zustand';

interface UIState {
  /* ─── Tela atual ─── */
  currentScreen: 'home' | 'project' | 'setup';
  
  /* ─── Painéis ─── */
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  leftPanelTab: 'project' | 'dna' | 'libraries';
  centerTab: 'spatial' | 'graph' | 'storyboard' | 'timeline';
  centerWorkspaceTab: 'map' | 'dependencies' | 'scenes' | 'stages';
  rightPanelTab: 'inspector' | 'fiscal' | 'prompts' | 'debug';

  /* ─── Mobile ─── */
  mobileTab: 'spatial' | 'timeline' | 'inspector' | 'prompts';

  /* ─── Seleção ─── */
  selectedSceneId: string | null;
  selectedStagePercentage: number | null;
  selectedZoneId: string | null;
  selectedComponentId: string | null;
  
  /* ─── Debug ─── */
  debugMode: boolean;
  
  /* ─── Viewport ─── */
  canvasZoom: number;
  canvasPanX: number;
  canvasPanY: number;

  /* ─── Ações ─── */
  setScreen: (screen: UIState['currentScreen']) => void;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  setLeftPanelTab: (tab: UIState['leftPanelTab']) => void;
  setCenterTab: (tab: UIState['centerTab']) => void;
  setCenterWorkspaceTab: (tab: UIState['centerWorkspaceTab']) => void;
  setRightPanelTab: (tab: UIState['rightPanelTab']) => void;
  setMobileTab: (tab: UIState['mobileTab']) => void;
  selectScene: (id: string | null) => void;
  selectStage: (percentage: number | null) => void;
  selectZone: (id: string | null) => void;
  selectComponent: (id: string | null) => void;
  toggleDebugMode: () => void;
  setCanvasZoom: (zoom: number) => void;
  setCanvasPan: (x: number, y: number) => void;
}

export const useUIStore = create<UIState>((set) => ({
  currentScreen: 'home',
  leftPanelOpen: true,
  rightPanelOpen: true,
  leftPanelTab: 'project',
  centerTab: 'spatial',
  centerWorkspaceTab: 'map',
  rightPanelTab: 'inspector',
  mobileTab: 'spatial',
  selectedSceneId: null,
  selectedStagePercentage: null,
  selectedZoneId: null,
  selectedComponentId: null,
  debugMode: false,
  canvasZoom: 1,
  canvasPanX: 0,
  canvasPanY: 0,

  setScreen: (screen) => set({ currentScreen: screen }),
  toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setLeftPanelTab: (tab) => set({ leftPanelTab: tab }),
  setCenterTab: (tab) => set({ centerTab: tab }),
  setCenterWorkspaceTab: (tab) => set({ centerWorkspaceTab: tab }),
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
  setMobileTab: (tab) => set({ mobileTab: tab }),
  selectScene: (id) => set({ selectedSceneId: id }),
  selectStage: (percentage) => set({ selectedStagePercentage: percentage }),
  selectZone: (id) => set({ selectedZoneId: id }),
  selectComponent: (id) => set({ selectedComponentId: id }),
  toggleDebugMode: () => set((s) => ({ debugMode: !s.debugMode })),
  setCanvasZoom: (zoom) => set({ canvasZoom: Math.max(0.1, Math.min(5, zoom)) }),
  setCanvasPan: (x, y) => set({ canvasPanX: x, canvasPanY: y }),
}));
