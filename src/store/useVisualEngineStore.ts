import { create } from 'zustand';
import type { VisualSceneState, VisualElement, CameraConfig, LensConfig, LightingConfig, SceneMetadata, SceneAction } from '../core/visual/VisualSceneState';

interface VisualEngineState {
  /* ─── Estado Visual ─── */
  visualSceneState: VisualSceneState | null;
  isGenerating: boolean;
  generationProgress: number; // 0-1
  generationError: string | null;
  lastGeneratedPrompt: string | null;

  /* ─── Cache de frames renderizados ─── */
  frameCache: Map<number, string>; // frameIndex -> base64 image
  maxCacheSize: number;

  /* ─── Ações ─── */
  setVisualSceneState: (state: VisualSceneState) => void;
  updateVisualSceneState: (partial: Partial<VisualSceneState>) => void;
  setGenerating: (isGenerating: boolean) => void;
  setGenerationProgress: (progress: number) => void;
  setGenerationError: (error: string | null) => void;
  setLastGeneratedPrompt: (prompt: string | null) => void;
  addFrameToCache: (frameIndex: number, imageData: string) => void;
  getFrameFromCache: (frameIndex: number) => string | undefined;
  clearFrameCache: () => void;
  reset: () => void;

  /* ─── Novas ações para Scene Composer ─── */
  updateSceneMetadata: (metadata: Partial<SceneMetadata>) => void;
  addVisualElement: (element: VisualElement) => void;
  removeVisualElement: (elementId: string) => void;
  updateVisualElement: (elementId: string, updates: Partial<VisualElement>) => void;
  updateCameraConfig: (config: Partial<CameraConfig>) => void;
  updateLens: (lens: Partial<LensConfig>) => void;
  updateLighting: (lighting: Partial<LightingConfig>) => void;
  updateAction: (action: Partial<SceneAction>) => void;
}

const DEFAULT_STATE: VisualSceneState = {
  scene: {
    title: '',
    description: '',
    locationType: '',
    timeOfDay: 'day',
    weather: 'clear'
  },
  cameraConfig: {
    position: { x: 0, y: 0 },
    target: { x: 0, y: 0 },
    up: { x: 0, y: -1 },
    fov: 60,
    aspectRatio: 16 / 9,
    near: 0.1,
    far: 1000,
    movement: 'FIXA'
  },
  lens: {
    focalLength: 35,
    aperture: 'f/2.8',
    focusDistance: 10,
    depthOfField: false
  },
  lighting: {
    type: 'natural',
    keyLight: {
      direction: { x: 1, y: -1 },
      intensity: 1,
      color: '#ffffff',
      temperature: 5600
    },
    fillLight: {
      direction: { x: -1, y: -0.5 },
      intensity: 0.3,
      color: '#ffffff'
    },
    ambientLight: {
      intensity: 0.2,
      color: '#ffffff'
    },
    shadows: true,
    shadowSoftness: 0.5
  },
  elements: [],
  action: {
    type: 'idle',
    description: '',
    startTime: 0,
    duration: 0
  },
  environment: {
    terrain: { type: '', slope: '', vegetation: '', soil: '' },
    climate: '',
    light: '',
    timeOfDay: 'day',
    weather: 'clear'
  },
  construction: {
    type: '',
    progress: 0,
    status: '',
    existingComponents: [],
    partialComponents: [],
    futureComponents: [],
    components: []
  },
  materials: {
    materials: [],
    consumedMaterials: [],
    residues: [],
    tools: []
  },
  camera: {
    current: {
      id: 'A',
      relativePosition: { x: 0, y: 0 },
      orientation: 0,
      conceptualHeight: 'media',
      framing: 'medium',
      allowedMovement: 'FIXA',
      visibleZones: [],
      partiallyVisibleZones: [],
      hiddenZones: []
    }
  },
  character: {
    state: {
      characterId: '',
      currentZone: '',
      orientation: 'frente',
      carriedObjects: [],
      movementRequired: false
    },
    position: { x: 0, y: 0 },
    isMoving: false
  },
  renderStatus: {
    isRendering: false,
    progress: 0,
    currentFrame: 0,
    totalFrames: 0,
    errors: [],
    lastRenderTime: 0
  },
  activeZone: '',
  timestamp: Date.now()
};

export const useVisualEngineStore = create<VisualEngineState>((set, get) => ({
  visualSceneState: null,
  isGenerating: false,
  generationProgress: 0,
  generationError: null,
  lastGeneratedPrompt: null,
  frameCache: new Map(),
  maxCacheSize: 100,

  setVisualSceneState: (state) => set({ visualSceneState: state }),

  updateVisualSceneState: (partial) => set((prev) => ({
    visualSceneState: prev.visualSceneState ? { ...prev.visualSceneState, ...partial } : null
  })),

  setGenerating: (isGenerating) => set({ isGenerating }),

  setGenerationProgress: (progress) => set({ generationProgress: Math.max(0, Math.min(1, progress)) }),

  setGenerationError: (error) => set({ generationError: error }),

  setLastGeneratedPrompt: (prompt) => set({ lastGeneratedPrompt: prompt }),

  addFrameToCache: (frameIndex, imageData) => set((prev) => {
    const newCache = new Map(prev.frameCache);
    newCache.set(frameIndex, imageData);

    // LRU: remove oldest if over max size
    if (newCache.size > prev.maxCacheSize) {
      const firstKey = newCache.keys().next().value;
      if (firstKey !== undefined) {
        newCache.delete(firstKey);
      }
    }

    return { frameCache: newCache };
  }),

  getFrameFromCache: (frameIndex) => get().frameCache.get(frameIndex),

  clearFrameCache: () => set({ frameCache: new Map() }),

  reset: () => set({
    visualSceneState: null,
    isGenerating: false,
    generationProgress: 0,
    generationError: null,
    lastGeneratedPrompt: null,
    frameCache: new Map()
  }),

  updateSceneMetadata: (metadata) => set((prev) => {
    if (!prev.visualSceneState) return prev;
    return {
      visualSceneState: {
        ...prev.visualSceneState,
        scene: { ...prev.visualSceneState.scene, ...metadata }
      }
    };
  }),

  addVisualElement: (element) => set((prev) => {
    if (!prev.visualSceneState) return prev;
    return {
      visualSceneState: {
        ...prev.visualSceneState,
        elements: [...prev.visualSceneState.elements, element]
      }
    };
  }),

  removeVisualElement: (elementId) => set((prev) => {
    if (!prev.visualSceneState) return prev;
    return {
      visualSceneState: {
        ...prev.visualSceneState,
        elements: prev.visualSceneState.elements.filter(e => e.id !== elementId)
      }
    };
  }),

  updateVisualElement: (elementId, updates) => set((prev) => {
    if (!prev.visualSceneState) return prev;
    return {
      visualSceneState: {
        ...prev.visualSceneState,
        elements: prev.visualSceneState.elements.map(e =>
          e.id === elementId ? { ...e, ...updates } : e
        )
      }
    };
  }),

  updateCameraConfig: (config) => set((prev) => {
    if (!prev.visualSceneState) return prev;
    return {
      visualSceneState: {
        ...prev.visualSceneState,
        cameraConfig: { ...prev.visualSceneState.cameraConfig, ...config }
      }
    };
  }),

  updateLens: (lens) => set((prev) => {
    if (!prev.visualSceneState) return prev;
    return {
      visualSceneState: {
        ...prev.visualSceneState,
        lens: { ...prev.visualSceneState.lens, ...lens }
      }
    };
  }),

  updateLighting: (lighting) => set((prev) => {
    if (!prev.visualSceneState) return prev;
    return {
      visualSceneState: {
        ...prev.visualSceneState,
        lighting: { ...prev.visualSceneState.lighting, ...lighting }
      }
    };
  }),

  updateAction: (action) => set((prev) => {
    if (!prev.visualSceneState) return prev;
    return {
      visualSceneState: {
        ...prev.visualSceneState,
        action: { ...prev.visualSceneState.action, ...action }
      }
    };
  }),
}));