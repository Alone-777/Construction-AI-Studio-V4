import { create } from 'zustand';
import type {
  Project, ProjectDNA, ProjectConfig, SpatialMap, DependencyGraph,
  Scene, Operation, StoryboardEntry, ConstructionComponent, DependencyEdge,
} from '../core/types';
import {
  createProjectFromDescription as orchestrateDescription,
  type ProjectDescriptionInput,
} from '../core/blueprints/description-blueprint';
import { createCabanaDoRiachoProject } from '../core/demo/cabana-do-riacho';
import { autoSaveProject } from '../db/repository';
import {
  updateVisualEvaluationDecision,
  type VisualEvaluationDecision,
} from '../core/evaluation/visual-evaluation';

interface ProjectState {
  /* ─── Projeto ativo ─── */
  project: Project | null;
  isDirty: boolean;

  /* ─── Ações de projeto ─── */
  createProject: (config: ProjectConfig) => void;
  createProjectFromDescription: (input: ProjectDescriptionInput) => void;
  createDemoProject: () => void;
  loadProject: (project: Project) => void;
  closeProject: () => void;
  updateProjectName: (name: string) => void;
  updateVisualEvaluation: (updates: { observations?: string; decision?: VisualEvaluationDecision }) => void;

  /* ─── DNA ─── */
  updateDNA: (updates: Partial<ProjectDNA>) => void;

  /* ─── Spatial Map ─── */
  updateSpatialMap: (map: SpatialMap) => void;

  /* ─── Dependency Graph ─── */
  updateDependencyGraph: (graph: DependencyGraph) => void;
  addComponent: (component: ConstructionComponent) => void;
  addDependencyEdge: (edge: DependencyEdge) => void;

  /* ─── Operações ─── */
  addOperation: (operation: Operation) => void;
  updateOperation: (id: string, updates: Partial<Operation>) => void;
  removeOperation: (id: string) => void;

  /* ─── Cenas ─── */
  addScene: (scene: Scene) => void;
  updateScene: (id: string, updates: Partial<Scene>) => void;
  removeScene: (id: string) => void;
  lockScene: (id: string) => void;
  unlockScene: (id: string) => void;

  /* ─── Storyboard ─── */
  updateStoryboardEntry: (sceneId: string, updates: Partial<StoryboardEntry>) => void;

  /* ─── Persistência ─── */
  triggerAutoSave: () => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: null,
  isDirty: false,

  createProject: async (config) => {
    const project = await orchestrateDescription({
      description: `${config.construction} em ${config.environment}, forma ${config.approximateForm}, materiais ${config.materials.join(', ')}`,
      name: config.name,
      environment: config.environment,
      construction: config.construction,
      approximateForm: config.approximateForm,
      materials: config.materials,
      workerCount: config.workerCount,
      totalDuration: config.totalDuration,
      sceneDuration: config.sceneDuration,
      detailLevel: config.detailLevel,
      visualStyle: config.visualStyle,
    });
    set({ project, isDirty: true });
  },

  createProjectFromDescription: (input) => {
    set({ project: orchestrateDescription(input), isDirty: true });
  },

  createDemoProject: () => {
    set({ project: createCabanaDoRiachoProject(), isDirty: true });
  },

  loadProject: (project) => set({ project, isDirty: false }),
  
  closeProject: () => set({ project: null, isDirty: false }),

  updateProjectName: (name) => set((s) => {
    if (!s.project) return s;
    return { project: { ...s.project, name, updatedAt: Date.now() }, isDirty: true };
  }),

  updateVisualEvaluation: (updates) => set((s) => {
    const evaluation = s.project?.visualReconstruction?.evaluation;
    if (!s.project || !s.project.visualReconstruction || !evaluation) return s;
    return {
      project: {
        ...s.project,
        visualReconstruction: {
          ...s.project.visualReconstruction,
          evaluation: updateVisualEvaluationDecision(evaluation, updates),
        },
        updatedAt: Date.now(),
      },
      isDirty: true,
    };
  }),

  updateDNA: (updates) => set((s) => {
    if (!s.project) return s;
    return {
      project: {
        ...s.project,
        dna: { ...s.project.dna, ...updates },
        updatedAt: Date.now(),
      },
      isDirty: true,
    };
  }),

  updateSpatialMap: (map) => set((s) => {
    if (!s.project) return s;
    return { project: { ...s.project, spatialMap: map, updatedAt: Date.now() }, isDirty: true };
  }),

  updateDependencyGraph: (graph) => set((s) => {
    if (!s.project) return s;
    return { project: { ...s.project, dependencyGraph: graph, updatedAt: Date.now() }, isDirty: true };
  }),

  addComponent: (component) => set((s) => {
    if (!s.project) return s;
    const graph = { ...s.project.dependencyGraph };
    graph.nodes = [...graph.nodes, component];
    return { project: { ...s.project, dependencyGraph: graph, updatedAt: Date.now() }, isDirty: true };
  }),

  addDependencyEdge: (edge) => set((s) => {
    if (!s.project) return s;
    const graph = { ...s.project.dependencyGraph };
    graph.edges = [...graph.edges, edge];
    return { project: { ...s.project, dependencyGraph: graph, updatedAt: Date.now() }, isDirty: true };
  }),

  addOperation: (operation) => set((s) => {
    if (!s.project) return s;
    return {
      project: {
        ...s.project,
        operations: [...s.project.operations, operation],
        updatedAt: Date.now(),
      },
      isDirty: true,
    };
  }),

  updateOperation: (id, updates) => set((s) => {
    if (!s.project) return s;
    return {
      project: {
        ...s.project,
        operations: s.project.operations.map(op =>
          op.id === id ? { ...op, ...updates } : op
        ),
        updatedAt: Date.now(),
      },
      isDirty: true,
    };
  }),

  removeOperation: (id) => set((s) => {
    if (!s.project) return s;
    return {
      project: {
        ...s.project,
        operations: s.project.operations.filter(op => op.id !== id),
        updatedAt: Date.now(),
      },
      isDirty: true,
    };
  }),

  addScene: (scene) => set((s) => {
    if (!s.project) return s;
    const storyEntry: StoryboardEntry = {
      sceneId: scene.id,
      description: `Cena ${scene.number}`,
      locked: false,
      imageAttached: false,
    };
    return {
      project: {
        ...s.project,
        scenes: [...s.project.scenes, scene],
        storyboard: [...s.project.storyboard, storyEntry],
        updatedAt: Date.now(),
      },
      isDirty: true,
    };
  }),

  updateScene: (id, updates) => set((s) => {
    if (!s.project) return s;
    const scene = s.project.scenes.find(sc => sc.id === id);
    if (scene?.status === 'locked' && !updates.status) return s;
    return {
      project: {
        ...s.project,
        scenes: s.project.scenes.map(sc =>
          sc.id === id ? { ...sc, ...updates } : sc
        ),
        updatedAt: Date.now(),
      },
      isDirty: true,
    };
  }),

  removeScene: (id) => set((s) => {
    if (!s.project) return s;
    const scene = s.project.scenes.find(sc => sc.id === id);
    if (scene?.status === 'locked') return s;
    return {
      project: {
        ...s.project,
        scenes: s.project.scenes.filter(sc => sc.id !== id),
        storyboard: s.project.storyboard.filter(sb => sb.sceneId !== id),
        updatedAt: Date.now(),
      },
      isDirty: true,
    };
  }),

  lockScene: (id) => set((s) => {
    if (!s.project) return s;
    return {
      project: {
        ...s.project,
        scenes: s.project.scenes.map(sc =>
          sc.id === id ? { ...sc, status: 'locked' as const } : sc
        ),
        storyboard: s.project.storyboard.map(sb =>
          sb.sceneId === id ? { ...sb, locked: true } : sb
        ),
        updatedAt: Date.now(),
      },
      isDirty: true,
    };
  }),

  unlockScene: (id) => set((s) => {
    if (!s.project) return s;
    return {
      project: {
        ...s.project,
        scenes: s.project.scenes.map(sc =>
          sc.id === id ? { ...sc, status: 'validated' as const } : sc
        ),
        storyboard: s.project.storyboard.map(sb =>
          sb.sceneId === id ? { ...sb, locked: false } : sb
        ),
        updatedAt: Date.now(),
      },
      isDirty: true,
    };
  }),

  updateStoryboardEntry: (sceneId, updates) => set((s) => {
    if (!s.project) return s;
    return {
      project: {
        ...s.project,
        storyboard: s.project.storyboard.map(sb =>
          sb.sceneId === sceneId ? { ...sb, ...updates } : sb
        ),
        updatedAt: Date.now(),
      },
      isDirty: true,
    };
  }),

  triggerAutoSave: () => {
    const { project } = get();
    if (project) {
      autoSaveProject(project);
      set({ isDirty: false });
    }
  },
}));

// Toda mutação que troca a referência do projeto participa do autosave. Loads
// usam isDirty=false e, portanto, não regravam o registro sem necessidade.
useProjectStore.subscribe((state, previousState) => {
  if (state.project && state.project !== previousState.project && state.isDirty) {
    autoSaveProject(state.project);
    useProjectStore.setState({ isDirty: false });
  }
});
