import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConstructionDecisionEngine, createDecisionEngine } from '../ConstructionDecisionEngine';
import type { DecisionContext, OperationDependency } from '../ConstructionDecision';

describe('ConstructionDecisionEngine', () => {
  let engine: ConstructionDecisionEngine;

  beforeEach(() => {
    engine = createDecisionEngine();
  });

  const createBaseContext = (overrides: Partial<DecisionContext> = {}): DecisionContext => ({
    constructionState: {
      completedElements: [],
      activeElements: [],
      pendingElements: [],
      materialState: {
        available: ['wood', 'stone'],
        consumed: [],
        remaining: ['wood', 'stone'],
      },
      workerState: {
        position: 'site',
        action: 'idle',
        tools: ['hammer', 'saw'],
      },
    },
    availableOperations: [
      {
        id: 'op-1',
        name: 'Lay Foundation',
        elements: ['foundation'],
        zones: ['zone-1'],
        visualBasis: {
          materials: ['wood', 'stone'],
          tools: ['hammer'],
        },
      },
      {
        id: 'op-2',
        name: 'Build Walls',
        elements: ['walls'],
        zones: ['zone-1'],
        visualBasis: {
          materials: ['wood'],
          tools: ['saw'],
        },
      },
      {
        id: 'op-3',
        name: 'Install Roof',
        elements: ['roof'],
        zones: ['zone-1'],
        visualBasis: {
          materials: ['stone'],
          tools: ['hammer'],
        },
      },
    ],
    inventory: {
      materials: { wood: 100, stone: 50 },
      tools: ['hammer', 'saw'],
    },
    dependencies: [
      { operationId: 'op-2', dependsOn: ['op-1'] },
      { operationId: 'op-3', dependsOn: ['op-2'] },
    ],
    ...overrides,
  });

  describe('decide', () => {
    it('should choose the next available operation when all conditions met', () => {
      const context = createBaseContext();
      const decision = engine.decide(context);

      expect(decision.action).toBe('EXECUTE_OPERATION');
      expect(decision.operationId).toBe('op-1');
      expect(decision.confidence).toBe(0.95);
      expect(decision.reason).toContain('Lay Foundation');
    });

    it('should block when materials are insufficient', () => {
      const context = createBaseContext({
        inventory: {
          materials: { wood: 0, stone: 50 },
          tools: ['hammer', 'saw'],
        },
      });
      const decision = engine.decide(context);

      expect(decision.action).toBe('REQUEST_MATERIAL');
      expect(decision.operationId).toBe('op-1');
      expect(decision.confidence).toBe(0.9);
      expect(decision.reason).toContain('wood');
    });

    it('should respect operation dependencies', () => {
      const context = createBaseContext({
        constructionState: {
          completedElements: ['foundation'],
          activeElements: [],
          pendingElements: ['walls', 'roof'],
          materialState: {
            available: ['wood', 'stone'],
            consumed: ['wood', 'stone'],
            remaining: ['wood', 'stone'],
          },
          workerState: {
            position: 'site',
            action: 'idle',
            tools: ['hammer', 'saw'],
          },
        },
      });
      const decision = engine.decide(context);

      expect(decision.action).toBe('EXECUTE_OPERATION');
      expect(decision.operationId).toBe('op-2');
      expect(decision.reason).toContain('Build Walls');
    });

    it('should skip operations with unmet dependencies', () => {
      const context = createBaseContext({
        constructionState: {
          completedElements: [],
          activeElements: [],
          pendingElements: ['walls', 'roof'],
          materialState: {
            available: ['wood', 'stone'],
            consumed: [],
            remaining: ['wood', 'stone'],
          },
          workerState: {
            position: 'site',
            action: 'idle',
            tools: ['hammer', 'saw'],
          },
        },
      });
      const decision = engine.decide(context);

      // op-2 depends on op-1, so it should skip to op-1
      expect(decision.action).toBe('EXECUTE_OPERATION');
      expect(decision.operationId).toBe('op-1');
    });

    it('should return WAIT when no operations available', () => {
      const context = createBaseContext({
        availableOperations: [],
      });
      const decision = engine.decide(context);

      expect(decision.action).toBe('WAIT');
      expect(decision.operationId).toBeUndefined();
      expect(decision.confidence).toBe(0.5);
      expect(decision.reason).toContain('Nenhuma operação disponível');
    });

    it('should return WAIT when all operations completed', () => {
      const context = createBaseContext({
        constructionState: {
          completedElements: ['foundation', 'walls', 'roof'],
          activeElements: [],
          pendingElements: [],
          materialState: {
            available: [],
            consumed: ['wood', 'stone'],
            remaining: [],
          },
          workerState: {
            position: 'site',
            action: 'idle',
            tools: ['hammer', 'saw'],
          },
        },
      });
      const decision = engine.decide(context);

      expect(decision.action).toBe('WAIT');
      expect(decision.confidence).toBe(0.5);
    });

    it('should block when tools are missing', () => {
      const context = createBaseContext({
        inventory: {
          materials: { wood: 100, stone: 50 },
          tools: ['saw'], // missing hammer
        },
      });
      const decision = engine.decide(context);

      expect(decision.action).toBe('BLOCKED');
      expect(decision.operationId).toBe('op-1');
      expect(decision.confidence).toBe(0.8);
      expect(decision.reason).toContain('hammer');
    });

    it('should skip completed operations based on elements', () => {
      const context = createBaseContext({
        constructionState: {
          completedElements: ['foundation'],
          activeElements: [],
          pendingElements: ['walls', 'roof'],
          materialState: {
            available: ['wood', 'stone'],
            consumed: ['wood', 'stone'],
            remaining: ['wood', 'stone'],
          },
          workerState: {
            position: 'site',
            action: 'idle',
            tools: ['hammer', 'saw'],
          },
        },
      });
      const decision = engine.decide(context);

      // op-1 has element 'foundation' which is completed, so should skip to op-2
      expect(decision.action).toBe('EXECUTE_OPERATION');
      expect(decision.operationId).toBe('op-2');
    });

    it('should handle missing visualBasis gracefully', () => {
      const context = createBaseContext({
        availableOperations: [
          {
            id: 'op-4',
            name: 'Custom Operation',
            elements: ['custom'],
            zones: ['zone-1'],
            // no visualBasis
          },
        ],
      });
      const decision = engine.decide(context);

      expect(decision.action).toBe('EXECUTE_OPERATION');
      expect(decision.operationId).toBe('op-4');
    });

    it('should check materials for each operation in order', () => {
      const context = createBaseContext({
        inventory: {
          materials: { wood: 0, stone: 50 },
          tools: ['hammer', 'saw'],
        },
      });
      const decision = engine.decide(context);

      // op-1 needs wood, which is 0, should request material for op-1
      expect(decision.action).toBe('REQUEST_MATERIAL');
      expect(decision.operationId).toBe('op-1');
    });

    it('should handle multiple missing materials', () => {
      const context = createBaseContext({
        inventory: {
          materials: { wood: 0, stone: 0 },
          tools: ['hammer', 'saw'],
        },
      });
      const decision = engine.decide(context);

      expect(decision.action).toBe('REQUEST_MATERIAL');
      expect(decision.reason).toContain('wood');
      expect(decision.reason).toContain('stone');
    });

    it('should handle missing tools for multiple operations', () => {
      const context = createBaseContext({
        inventory: {
          materials: { wood: 100, stone: 50 },
          tools: [], // no tools at all
        },
      });
      const decision = engine.decide(context);

      expect(decision.action).toBe('BLOCKED');
      expect(decision.operationId).toBe('op-1');
      expect(decision.reason).toContain('hammer');
    });
  });
});