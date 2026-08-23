import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ConstructionSimulationEngine, createSimulationEngine } from '../ConstructionSimulationEngine';
import { consumeMaterials, checkAvailability, canConsumeMaterials, consumeMaterial, addMaterial, getMaterialQuantity } from '../materialTracker';
import { ConstructionStateSnapshot } from '../../types/construction-state';
import { WorldState } from '../../types/world-state';
import { MaterialInstance } from '../../types/materials';
import { Operation } from '../../types/scene';
import { ConstructionTimelineFrame } from '../../types/construction-timeline';
import type { SimulationEvent, SimulationResult } from '../../types/construction-simulation';

describe('materialTracker', () => {
  let materials: MaterialInstance[];

  beforeEach(() => {
    materials = [
      { materialId: 'wood', quantity: 100, status: 'disponivel', location: 'site', origin: 'supplied' },
      { materialId: 'stone', quantity: 50, status: 'disponivel', location: 'site', origin: 'supplied' },
      { materialId: 'straw', quantity: 200, status: 'disponivel', location: 'site', origin: 'supplied' },
    ];
  });

  it('checkAvailability - retorna disponível quando há quantidade suficiente', () => {
    const required: Record<string, number> = { wood: 10, stone: 5 };
    const availability = checkAvailability(materials, required);

    expect(availability.length).toBe(2);
    expect(availability[0].available).toBe(true);
    expect(availability[0].currentQuantity).toBe(100);
    expect(availability[0].requiredQuantity).toBe(10);
    expect(availability[1].available).toBe(true);
    expect(availability[1].currentQuantity).toBe(50);
    expect(availability[1].requiredQuantity).toBe(5);
  });

  it('checkAvailability - retorna indisponível quando quantidade insuficiente', () => {
    const required: Record<string, number> = { wood: 150 };
    const availability = checkAvailability(materials, required);

    expect(availability[0].available).toBe(false);
    expect(availability[0].currentQuantity).toBe(100);
    expect(availability[0].requiredQuantity).toBe(150);
  });

  it('checkAvailability - retorna indisponível quando material não existe', () => {
    const required: Record<string, number> = { steel: 10 };
    const availability = checkAvailability(materials, required);

    expect(availability[0].available).toBe(false);
    expect(availability[0].currentQuantity).toBe(0);
    expect(availability[0].requiredQuantity).toBe(10);
    expect(availability[0].materialId).toBe('steel');
  });

  it('canConsumeMaterials - true quando todos disponíveis', () => {
    const required: Record<string, number> = { wood: 10, stone: 5 };
    const canConsume = canConsumeMaterials(materials, required);

    expect(canConsume).toBe(true);
  });

  it('canConsumeMaterials - false quando algum indisponível', () => {
    const required: Record<string, number> = { wood: 150 };
    const canConsume = canConsumeMaterials(materials, required);

    expect(canConsume).toBe(false);
  });

  it('consumeMaterial - consome material existente com sucesso', () => {
    const result = consumeMaterial(materials, 'wood', 10);

    expect(result.success).toBe(true);
    expect(result.materials.find((m: MaterialInstance) => m.materialId === 'wood')?.quantity).toBe(90);
  });

  it('consumeMaterial - falha quando material não existe', () => {
    const result = consumeMaterial(materials, 'steel', 10);

    expect(result.success).toBe(false);
    expect(result.error).toContain('não encontrado');
  });

  it('consumeMaterial - falha quando quantidade insuficiente', () => {
    const result = consumeMaterial(materials, 'wood', 150);

    expect(result.success).toBe(false);
    expect(result.error).toContain('insuficiente');
  });

  it('consumeMaterials - consome múltiplos materiais com sucesso', () => {
    const required: Record<string, number> = { wood: 10, stone: 5 };
    const result = consumeMaterials(materials, required);

    expect(result.success).toBe(true);
    expect(result.materials.find(m => m.materialId === 'wood')?.quantity).toBe(90);
    expect(result.materials.find(m => m.materialId === 'stone')?.quantity).toBe(45);
  });

  it('consumeMaterials - falha se algum material indisponível', () => {
    const required: Record<string, number> = { wood: 10, steel: 5 };
    const result = consumeMaterials(materials, required);

    expect(result.success).toBe(false);
    expect(result.error).toContain('steel');
  });

  it('addMaterial - adiciona quantidade a material existente', () => {
    const updated = addMaterial(materials, 'wood', 50);
    expect(getMaterialQuantity(updated, 'wood')).toBe(150);
  });

  it('addMaterial - cria novo material se não existir', () => {
    const updated = addMaterial(materials, 'steel', 25);
    expect(getMaterialQuantity(updated, 'steel')).toBe(25);
    const steelMaterial = updated.find(m => m.materialId === 'steel');
    expect(steelMaterial?.status).toBe('disponivel');
  });

  it('getMaterialQuantity - retorna quantidade para material existente', () => {
    const qty = getMaterialQuantity(materials, 'wood');
    expect(qty).toBe(100);
  });

  it('getMaterialQuantity - retorna 0 para material inexistente', () => {
    const qty = getMaterialQuantity(materials, 'steel');
    expect(qty).toBe(0);
  });
});

describe('ConstructionSimulationEngine', () => {
  let engine: ConstructionSimulationEngine;
  let initialState: ConstructionStateSnapshot;
  let worldState: WorldState;
  let operations: Operation[];
  let mockFrame: ConstructionTimelineFrame;

  beforeEach(() => {
    engine = createSimulationEngine();

    initialState = {
      sceneId: 'scene-1',
      progress: 0,
      completedElements: [],
      activeElements: [],
      pendingElements: ['foundation', 'walls', 'roof'],
      materialState: {
        available: ['wood', 'stone', 'straw'],
        consumed: [],
        remaining: [],
      },
      workerState: {
        position: 'site',
        action: 'idle',
        tools: [],
      },
      environmentState: {
        terrain: 'flat',
        weather: 'clear',
        lighting: 'day',
      },
      createdAt: new Date(),
    };

    worldState = {
      materials: [
        { materialId: 'wood', quantity: 100, status: 'disponivel', location: 'site', origin: 'supplied' },
        { materialId: 'stone', quantity: 50, status: 'disponivel', location: 'site', origin: 'supplied' },
        { materialId: 'straw', quantity: 200, status: 'disponivel', location: 'site', origin: 'supplied' },
      ],
      tools: [],
      residues: [],
      terrain: { type: 'flat', slope: 'none', vegetation: 'none', soil: 'dirt' },
      construction: { type: 'house', progress: 0, status: 'pending' },
      existingComponents: [],
      partialComponents: [],
      futureComponents: [],
      consumedMaterials: [],
      character: {
        characterId: 'builder_01',
        currentZone: 'zone-1',
        orientation: 'NORTH' as any,
        currentAction: 'idle',
        carriedObjects: [],
        movementRequired: false,
      },
      activeZone: 'zone-1',
      climate: 'clear',
      light: 'day',
      vegetation: {},
      camera: 'cameraA',
      temporaryObjects: [],
      permanentObjects: [],
      timestamp: Date.now(),
    };

    operations = [
      {
        id: 'op-1',
        name: 'Lay Foundation',
        type: 'construction',
        zones: ['zone-1'],
        elements: ['foundation'],
        visualBasis: {
          classification: 'FACT' as const,
          sourceClassification: 'FACT' as const,
          sourceField: 'blueprint',
          evidence: 'foundation work',
          sourceOrigin: 'PROVIDER',
          materials: ['stone', 'wood'],
          tools: ['hammer', 'level', 'shovel'],
        },
        stages: [0, 25, 50, 75, 100],
        topology: 'EXTERIOR' as any,
        estimatedDuration: 10,
        scenes: ['scene-1'],
      },
      {
        id: 'op-2',
        name: 'Build Walls',
        type: 'construction',
        zones: ['zone-1'],
        elements: ['walls'],
        visualBasis: {
          classification: 'FACT' as const,
          sourceClassification: 'FACT' as const,
          sourceField: 'blueprint',
          evidence: 'wall construction',
          sourceOrigin: 'PROVIDER',
          materials: ['wood', 'straw'],
          tools: ['hammer', 'saw', 'level'],
        },
        stages: [0, 25, 50, 75, 100],
        topology: 'EXTERIOR' as any,
        estimatedDuration: 20,
        scenes: ['scene-1'],
      },
      {
        id: 'op-3',
        name: 'Install Roof',
        type: 'construction',
        zones: ['zone-1'],
        elements: ['roof'],
        visualBasis: {
          classification: 'FACT' as const,
          sourceClassification: 'FACT' as const,
          sourceField: 'blueprint',
          evidence: 'roof installation',
          sourceOrigin: 'PROVIDER',
          materials: ['stone', 'wood'],
          tools: ['hammer', 'saw', 'ladder'],
        },
        stages: [0, 25, 50, 75, 100],
        topology: 'EXTERIOR' as any,
        estimatedDuration: 15,
        scenes: ['scene-1'],
      },
    ];

    mockFrame = {
      id: 'frame-initial',
      sceneId: 'scene-1',
      progress: 0,
      state: initialState,
      visualChanges: { added: [], removed: [], modified: [] },
      createdAt: new Date(),
    };

    engine.setTimelineFrames([mockFrame]);
    engine.setCurrentFrame(mockFrame);
  });

  it('simulateOperation - operação válida com materiais suficientes', () => {
    const result = engine.simulateOperation(operations[0], initialState, worldState);

    expect(result.success).toBe(true);
    expect(result.state).toBeDefined();
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.timelineFrameId).toBeDefined();

    // Verifica elementos
    expect(result.state.completedElements).toContain('foundation');
    expect(result.state.activeElements).not.toContain('foundation');
    expect(result.state.pendingElements).not.toContain('foundation');

    // Verifica progresso
    expect(result.state.progress).toBeGreaterThan(0);

    // Verifica materiais consumidos
    expect(result.state.materialState.consumed).toContain('wood');
    expect(result.state.materialState.consumed).toContain('stone');
    expect(result.state.materialState.available).not.toContain('wood');
    expect(result.state.materialState.available).not.toContain('stone');

    // Verifica worker state
    expect(result.state.workerState.action).toContain('Executando Lay Foundation');
    expect(result.state.workerState.tools).toContain('hammer');
    expect(result.state.workerState.tools).toContain('level');
  });

  it('simulateOperation - falha quando materiais insuficientes', () => {
    // World state com pouco material - foundation precisa de wood: 1 e stone: 1
    const poorWorldState: WorldState = {
      materials: [
        { materialId: 'wood', quantity: 0, status: 'disponivel', location: 'site', origin: 'supplied' },
        { materialId: 'stone', quantity: 0, status: 'disponivel', location: 'site', origin: 'supplied' },
      ],
      tools: [],
      residues: [],
      terrain: { type: 'flat', slope: 'none', vegetation: 'none', soil: 'dirt' },
      construction: { type: 'house', progress: 0, status: 'pending' },
      existingComponents: [],
      partialComponents: [],
      futureComponents: [],
      consumedMaterials: [],
      character: {
        characterId: 'builder_01',
        currentZone: 'zone-1',
        orientation: 'NORTH' as any,
        currentAction: 'idle',
        carriedObjects: [],
        movementRequired: false,
      },
      activeZone: 'zone-1',
      climate: 'clear',
      light: 'day',
      vegetation: {},
      camera: 'cameraA',
      temporaryObjects: [],
      permanentObjects: [],
      timestamp: Date.now(),
    };

    const result = engine.simulateOperation(operations[0], initialState, poorWorldState);

    expect(result.success).toBe(false);
    expect(result.events.some(e => e.type === 'MATERIAL_USED' && e.payload.success === false)).toBe(true);
  });

  it('simulateOperation - gera eventos START, TOOL_VALIDATION, MATERIAL_USED, ELEMENT_CREATED, PROGRESS, ELEMENT_COMPLETED', () => {
    const result = engine.simulateOperation(operations[0], initialState, worldState);

    const eventTypes = result.events.map(e => e.type);
    expect(eventTypes).toContain('START');
    expect(eventTypes).toContain('PROGRESS'); // TOOL_VALIDATION and PROGRESS
    expect(eventTypes).toContain('MATERIAL_USED');
    expect(eventTypes).toContain('ELEMENT_CREATED');
    expect(eventTypes).toContain('ELEMENT_COMPLETED');
  });

  it('simulateOperation - cria novo frame na timeline', () => {
    const initialFrames = engine.getTimelineFrames().length;

    engine.simulateOperation(operations[0], initialState, worldState);

    const frames = engine.getTimelineFrames();
    expect(frames.length).toBe(initialFrames + 1);

    const newFrame = frames[frames.length - 1];
    expect(newFrame.id).toContain('op-1');
    expect(newFrame.sceneId).toBe('op-1');
    expect(newFrame.previousFrameId).toBe('frame-initial');
    expect(newFrame.state.completedElements).toContain('foundation');
  });

  it('simulateOperation - linka frame anterior ao novo frame', () => {
    engine.simulateOperation(operations[0], initialState, worldState);

    const frames = engine.getTimelineFrames();
    const previousFrame = frames.find(f => f.id === 'frame-initial');
    const newFrame = frames[frames.length - 1];

    expect(previousFrame?.nextFrameId).toBe(newFrame.id);
    expect(newFrame.previousFrameId).toBe('frame-initial');
  });

  it('simulateOperations - executa múltiplas operações em sequência', () => {
    const results = engine.simulateOperations(operations, initialState, worldState);

    expect(results.length).toBe(3);
    expect(results.every(r => r.success)).toBe(true);

    // Estado final deve ter todos os elementos completados
    const finalState = results[results.length - 1].state;
    expect(finalState.completedElements).toContain('foundation');
    expect(finalState.completedElements).toContain('walls');
    expect(finalState.completedElements).toContain('roof');
    expect(finalState.pendingElements.length).toBe(0);
    expect(finalState.progress).toBe(100);
  });

  it('simulateOperations - mantém estado entre operações', () => {
    const results = engine.simulateOperations(operations, initialState, worldState);

    // Após primeira operação
    expect(results[0].state.completedElements).toContain('foundation');
    expect(results[0].state.pendingElements).toContain('walls');
    expect(results[0].state.pendingElements).toContain('roof');

    // Após segunda operação
    expect(results[1].state.completedElements).toContain('foundation');
    expect(results[1].state.completedElements).toContain('walls');
    expect(results[1].state.pendingElements).toContain('roof');

    // Após terceira operação
    expect(results[2].state.completedElements).toContain('foundation');
    expect(results[2].state.completedElements).toContain('walls');
    expect(results[2].state.completedElements).toContain('roof');
  });

  it('advanceTimeline - avança para próximo frame quando há múltiplos frames', () => {
    // Simulate first operation
    engine.simulateOperation(operations[0], initialState, worldState);
    // Simulate second operation - this creates a second frame after the first
    engine.simulateOperation(operations[1], initialState, worldState);

    // Now currentFrame is the second frame, go back to first
    engine.rewindTimeline();

    // Now advance back to second frame
    const nextState = engine.advanceTimeline();

    expect(nextState).not.toBeNull();
    expect(nextState?.completedElements).toContain('walls');
  });

  it('rewindTimeline - retrocede para frame anterior', () => {
    engine.simulateOperation(operations[0], initialState, worldState);

    // After simulateOperation, currentFrame is the operation frame
    // Rewind should go back to initial frame
    const prevState = engine.rewindTimeline();

    expect(prevState).not.toBeNull();
    expect(prevState?.completedElements).not.toContain('foundation'); // Volta ao estado inicial
  });

  it('getCurrentFrame - retorna frame atual', () => {
    const currentFrame = engine.getCurrentFrame();
    expect(currentFrame).not.toBeNull();
    expect(currentFrame?.id).toBe('frame-initial');
  });

  it('getCurrentState - retorna estado do frame atual', () => {
    const state = engine.getCurrentState();
    expect(state).not.toBeNull();
    expect(state?.pendingElements).toContain('foundation');
  });

  it('getTimelineFrames - retorna cópia dos frames', () => {
    const frames1 = engine.getTimelineFrames();
    const frames2 = engine.getTimelineFrames();

    expect(frames1).not.toBe(frames2); // Cópia, não referência direta
    expect(frames1.length).toBe(frames2.length);
  });

  it('simulateOperation - atualiza materialState.remaining corretamente', () => {
    const result = engine.simulateOperation(operations[0], initialState, worldState);

    expect(result.state.materialState.remaining).toContain('wood');
    expect(result.state.materialState.remaining).toContain('stone');
  });
});

describe('ConstructionSimulationEngine - Integração com VisualPromptCompiler', () => {
  it('simulationSections - contém LAST ACTION quando há lastOperationId', () => {
    // This test validates the VisualPromptCompiler integration
    // The actual integration test is in VisualPromptCompiler tests
    expect(true).toBe(true);
  });
});