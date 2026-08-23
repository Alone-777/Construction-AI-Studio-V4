import { ConstructionStateSnapshot } from '../types/construction-state';
import { Operation } from '../types/scene';
import { WorldState } from '../types/world-state';
import { SimulationEvent, SimulationResult } from '../types/construction-simulation';
import { createConstructionSnapshot } from '../state/createConstructionSnapshot';
import { createTimelineFrame } from '../timeline/createTimelineFrame';
import { ConstructionTimelineFrame } from '../types/construction-timeline';
import { Scene } from '../types/scene';
import {
  consumeMaterials,
  checkAvailability,
} from './materialTracker';

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function createEvent(
  operationId: string,
  type: SimulationEvent['type'],
  payload: Record<string, unknown>
): SimulationEvent {
  return {
    id: generateId('evt'),
    operationId,
    timestamp: new Date(),
    type,
    payload,
  };
}

function getRequiredMaterialsForOperation(operation: Operation): Record<string, number> {
  const materials: Record<string, number> = {};

  // Use visualBasis.materials if available
  if (operation.visualBasis?.materials) {
    for (const material of operation.visualBasis.materials) {
      materials[material] = (materials[material] || 0) + 1;
    }
    return materials;
  }

  // Fallback: map common elements to materials
  if (operation.elements) {
    for (const element of operation.elements) {
      // Map elements to typical construction materials
      const elementMaterials: Record<string, string[]> = {
        'foundation': ['stone', 'wood'],
        'walls': ['wood', 'straw'],
        'roof': ['stone', 'wood'],
        'floor': ['wood'],
        'door': ['wood'],
        'window': ['wood'],
      };

      const mappedMaterials = elementMaterials[element] || [element];
      for (const material of mappedMaterials) {
        materials[material] = (materials[material] || 0) + 1;
      }
    }
  }
  return materials;
}

function getElementsForOperation(operation: Operation): string[] {
  return operation.elements || [];
}

function getToolsForOperation(operation: Operation): string[] {
  // Use visualBasis.tools if available
  if (operation.visualBasis?.tools) {
    return operation.visualBasis.tools;
  }
  // Fallback: map elements to typical tools
  if (operation.elements) {
    const elementTools: Record<string, string[]> = {
      'foundation': ['hammer', 'level', 'shovel'],
      'walls': ['hammer', 'saw', 'level'],
      'roof': ['hammer', 'saw', 'ladder'],
      'floor': ['hammer', 'saw'],
      'door': ['hammer', 'saw'],
      'window': ['hammer', 'saw'],
    };
    const tools = new Set<string>();
    for (const element of operation.elements) {
      const mappedTools = elementTools[element] || [];
      mappedTools.forEach(t => tools.add(t));
    }
    return Array.from(tools);
  }
  return [];
}

function updateElementState(
  state: ConstructionStateSnapshot,
  operation: Operation,
  action: 'START' | 'PROGRESS' | 'COMPLETE'
): ConstructionStateSnapshot {
  const elements = getElementsForOperation(operation);
  const completed = [...state.completedElements];
  const active = [...state.activeElements];
  const pending = [...state.pendingElements];

  for (const element of elements) {
    if (action === 'START') {
      if (pending.includes(element) && !active.includes(element)) {
        active.push(element);
        pending.splice(pending.indexOf(element), 1);
      }
    } else if (action === 'PROGRESS') {
      if (active.includes(element)) {
        // Already active, just continue
      } else if (pending.includes(element)) {
        active.push(element);
        pending.splice(pending.indexOf(element), 1);
      }
    } else if (action === 'COMPLETE') {
      if (active.includes(element)) {
        active.splice(active.indexOf(element), 1);
      }
      if (pending.includes(element)) {
        pending.splice(pending.indexOf(element), 1);
      }
      if (!completed.includes(element)) {
        completed.push(element);
      }
    }
  }

  return {
    ...state,
    completedElements: completed,
    activeElements: active,
    pendingElements: pending,
    progress: calculateProgress(completed.length, active.length, pending.length),
  };
}

function calculateProgress(completed: number, active: number, pending: number): number {
  const total = completed + active + pending;
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}

function updateMaterialState(
  state: ConstructionStateSnapshot,
  consumedMaterials: Record<string, number>
): ConstructionStateSnapshot {
  const available = [...state.materialState.available];
  const consumed = [...state.materialState.consumed];
  const remaining = [...state.materialState.remaining];

  for (const [materialId, quantity] of Object.entries(consumedMaterials)) {
    if (!consumed.includes(materialId)) {
      consumed.push(materialId);
    }
    if (available.includes(materialId)) {
      available.splice(available.indexOf(materialId), 1);
    }
    if (!remaining.includes(materialId)) {
      remaining.push(materialId);
    }
  }

  return {
    ...state,
    materialState: { available, consumed, remaining },
  };
}

function updateWorkerState(
  state: ConstructionStateSnapshot,
  operation: Operation,
  action: string
): ConstructionStateSnapshot {
  const elements = getElementsForOperation(operation);
  const tools = getToolsForOperation(operation);

  return {
    ...state,
    workerState: {
      position: operation.zones?.[0] || 'site',
      action: `${action} ${operation.name}`,
      tools,
    },
  };
}

export class ConstructionSimulationEngine {
  private timelineFrames: ConstructionTimelineFrame[] = [];
  private currentFrame: ConstructionTimelineFrame | null = null;

  constructor(initialState?: ConstructionStateSnapshot, initialFrame?: ConstructionTimelineFrame) {
    if (initialState) {
      this.currentFrame = initialFrame || null;
    }
  }

  setTimelineFrames(frames: ConstructionTimelineFrame[]): void {
    this.timelineFrames = frames;
  }

  setCurrentFrame(frame: ConstructionTimelineFrame | null): void {
    this.currentFrame = frame;
  }

  getCurrentState(): ConstructionStateSnapshot | null {
    return this.currentFrame?.state ?? null;
  }

  simulateOperation(
    operation: Operation,
    currentState: ConstructionStateSnapshot,
    worldState: WorldState
  ): SimulationResult {
    const events: SimulationEvent[] = [];

    // 1. START event
    events.push(createEvent(operation.id, 'START', {
      operationName: operation.name,
      zones: operation.zones,
      elements: getElementsForOperation(operation),
    }));

    // 2. Validate tools
    const tools = getToolsForOperation(operation);
    const toolEvents = tools.map(tool =>
      createEvent(operation.id, 'PROGRESS', {
        type: 'TOOL_VALIDATION',
        tool,
        available: true, // Simplified - would check actual tool inventory
      })
    );
    events.push(...toolEvents);

    // 3. Check material availability
    const requiredMaterials = getRequiredMaterialsForOperation(operation);
    const availability = checkAvailability(worldState.materials, requiredMaterials);
    const missingMaterials = availability.filter(a => !a.available);

    if (missingMaterials.length > 0) {
      // Material shortage - fail
      events.push(createEvent(operation.id, 'MATERIAL_USED', {
        success: false,
        missing: missingMaterials.map(m => `${m.materialId}: ${m.currentQuantity}/${m.requiredQuantity}`),
      }));

      return {
        success: false,
        state: currentState,
        events,
        timelineFrameId: this.currentFrame?.id || '',
      };
    }

    // 4. Consume materials
    const consumeResult = consumeMaterials(worldState.materials, requiredMaterials);
    if (!consumeResult.success) {
      events.push(createEvent(operation.id, 'MATERIAL_USED', {
        success: false,
        error: consumeResult.error,
      }));

      return {
        success: false,
        state: currentState,
        events,
        timelineFrameId: this.currentFrame?.id || '',
      };
    }

    events.push(createEvent(operation.id, 'MATERIAL_USED', {
      success: true,
      consumed: requiredMaterials,
    }));

    // 5. Create elements (START -> PROGRESS)
    let newState = updateElementState(currentState, operation, 'START');
    events.push(createEvent(operation.id, 'ELEMENT_CREATED', {
      elements: getElementsForOperation(operation),
      status: 'active',
    }));

    // 6. Update progress (simulate stages)
    newState = updateElementState(newState, operation, 'PROGRESS');
    events.push(createEvent(operation.id, 'PROGRESS', {
      progress: newState.progress,
      stage: 'in_progress',
    }));

    // 7. Complete elements
    newState = updateElementState(newState, operation, 'COMPLETE');
    events.push(createEvent(operation.id, 'ELEMENT_COMPLETED', {
      elements: getElementsForOperation(operation),
      status: 'completed',
    }));

    // 8. Update material state
    newState = updateMaterialState(newState, requiredMaterials);

    // 9. Update worker state
    newState = updateWorkerState(newState, operation, 'Executando');

    // 10. Create new timeline frame
    const previousFrame = this.currentFrame;
    const mockScene: Scene = {
      id: operation.id,
      number: 0,
      timecodeStart: 0,
      timecodeEnd: 0,
      duration: 0,
      operationId: operation.id,
      stages: [],
      camera: 'cameraA',
      activeZones: operation.zones || [],
      characterId: '',
      status: 'draft',
      riskLevel: 'LOW',
      microTimeline: [],
    };
    const newFrame = createTimelineFrame(
      mockScene,
      newState,
      previousFrame ?? undefined
    );
    newFrame.id = `frame_${operation.id}_${Date.now()}`;
    newFrame.sceneId = operation.id;

    if (previousFrame) {
      previousFrame.nextFrameId = newFrame.id;
    }
    newFrame.previousFrameId = previousFrame?.id;

    this.currentFrame = newFrame;
    this.timelineFrames.push(newFrame);

    return {
      success: true,
      state: newState,
      events,
      timelineFrameId: newFrame.id,
    };
  }

  simulateOperations(
    operations: Operation[],
    initialState: ConstructionStateSnapshot,
    worldState: WorldState
  ): SimulationResult[] {
    const results: SimulationResult[] = [];
    let currentState = initialState;

    for (const operation of operations) {
      const result = this.simulateOperation(operation, currentState, worldState);
      results.push(result);
      currentState = result.state;
    }

    return results;
  }

  getTimelineFrames(): ConstructionTimelineFrame[] {
    return [...this.timelineFrames];
  }

  getCurrentFrame(): ConstructionTimelineFrame | null {
    return this.currentFrame;
  }

  advanceTimeline(): ConstructionStateSnapshot | null {
    if (!this.currentFrame?.nextFrameId) return null;

    const nextFrame = this.timelineFrames.find(f => f.id === this.currentFrame!.nextFrameId);
    if (nextFrame) {
      this.currentFrame = nextFrame;
      return nextFrame.state;
    }
    return null;
  }

  rewindTimeline(): ConstructionStateSnapshot | null {
    if (!this.currentFrame?.previousFrameId) return null;

    const prevFrame = this.timelineFrames.find(f => f.id === this.currentFrame!.previousFrameId);
    if (prevFrame) {
      this.currentFrame = prevFrame;
      return prevFrame.state;
    }
    return null;
  }
}

export function createSimulationEngine(
  initialState?: ConstructionStateSnapshot,
  initialFrame?: ConstructionTimelineFrame
): ConstructionSimulationEngine {
  return new ConstructionSimulationEngine(initialState, initialFrame);
}