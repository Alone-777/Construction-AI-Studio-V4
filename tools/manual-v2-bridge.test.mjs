import { describe, expect, it } from 'vitest';

import {
  compileManualVideoProjectV2,
  executionRecipeFromV2Segment,
} from './manual-v2-bridge.mjs';

describe('manual-v2-bridge', () => {
  it('compiles manual video segments from the native Physical Execution V2 core', async () => {
    const result = await compileManualVideoProjectV2({
      description: 'Cabana rústica de madeira em uma floresta',
      name: 'Cabana V2 Bridge',
      toolOverrides: {
        marcacao: 'rope',
      },
      retryCorrectionsBySegment: {
        'marcacao:0-50': [
          {
            code: 'TOOL_ACTION_NOT_EXECUTED',
            correction: 'Install the four existing corner stakes clearly and keep the rope coiled for the next milestone.',
          },
        ],
      },
    });

    expect(result.schema).toBe('construction-manual-v2-bridge/1');
    expect(result.platform).toBe('ADOBE_FIREFLY');
    expect(result.model).toBe('KLING_3_0');
    expect(result.promptMaxChars).toBe(1800);
    expect(result.operations.length).toBe(9);
    expect(result.segments.length).toBe(34);

    const first = result.segments.find(segment =>
      segment.operationType === 'marcacao' &&
      segment.startStagePercentage === 0 &&
      segment.targetStagePercentage === 50
    );
    expect(first).toBeDefined();
    expect(first.promptSource).toBe('PHYSICAL_EXECUTION_V2');
    expect(first.physicalExecutionPlanV2.schemaVersion).toBe(
      'construction-physical-execution-plan/2',
    );
    expect(first.physicalSimulationV2.validation.ok).toBe(true);
    expect(first.physicalSimulationV2.commitAvailable).toBe(false);
    expect(first.providerNeutralPromptV2.schemaVersion).toBe(
      'construction-provider-neutral-prompt/2',
    );
    expect(first.prompt).toContain('[ADOBE FIREFLY VIDEO JOB]');
    expect(first.prompt).toContain('PHYSICAL EXECUTION:');
    expect(first.prompt).toContain('four existing corner stakes');
    expect(first.prompt).toContain('rope coiled and unused');
    expect(first.prompt).not.toContain('0%→50%');
    expect(first.prompt).not.toContain('TOOL_ACTION_NOT_EXECUTED');
    expect(first.retryPrompt).toContain('TOOL_ACTION_NOT_EXECUTED');
    expect(first.retryPrompt).not.toBe(first.prompt);
    expect(first.providerNeutralPromptV2.retryCorrections).toEqual([]);
    expect(first.logisticsShadow.mode).toBe('SHADOW');
    expect(first.logisticsShadow.generationAuthorized).toBe(false);
    expect(first.logisticsShadow.preflight.status).not.toBe('READY');
    expect(first.logisticsShadow.preview.prompt).toBeNull();
    expect(first.logisticsShadow.sourcePreparation.phase).toBe('INITIAL_SOURCE');
    expect(first.logisticsShadow.sourcePreparation.phase).toBe('INITIAL_SOURCE');
    expect(result.segments.slice(1).every(segment =>
      segment.logisticsShadow.sourcePreparation.phase === 'CONTINUATION'
      && segment.logisticsShadow.sourcePreparation.candidateImageInstruction === null
    )).toBe(true);
    expect(result.segments.every(segment => segment.physicalSimulationV2.commitAvailable === false)).toBe(true);
    expect(first.retryProviderNeutralPromptV2.retryCorrections).toHaveLength(1);
    expect(Array.from(first.prompt).length).toBeLessThanOrEqual(1800);
    expect(Array.from(first.retryPrompt).length).toBeLessThanOrEqual(1800);

    const recipe = executionRecipeFromV2Segment(first);
    expect(recipe.schema).toBe('construction-manual-execution-recipe/1');
    expect(recipe.tools).toEqual(['appropriate hand tool']);
    expect(recipe.actionSequence.length).toBeGreaterThanOrEqual(2);
    expect(recipe.terminalEvidence).toBeTruthy();
  }, 30000);

  it('uses existing workerCount without creating another crew authority', async () => {
    const result = await compileManualVideoProjectV2({ description: 'Cabana de madeira', workerCount: 3 });
    expect(result.config.workerCount).toBe(3);
    expect(result.segments.every(segment => segment.physicalExecutionPlanV2.equipmentLogisticsPlan.configuredWorkers === 3)).toBe(true);
    expect(result.segments.every(segment => segment.logisticsShadow.preflight.status !== 'READY')).toBe(true);
  }, 30000);
});


describe('viral timelapse bridge', () => {
  it('collapses a cabin into one macro video Job per construction operation', async () => {
    const result = await compileManualVideoProjectV2({
      description: 'Cabana rústica de madeira em uma floresta',
      name: 'Cabana Viral',
      videoStyle: 'VIRAL_TIMELAPSE',
    });

    expect(result.videoStyle).toBe('VIRAL_TIMELAPSE');
    expect(result.config.videoStyle).toBe('VIRAL_TIMELAPSE');
    expect(result.operations.length).toBe(9);
    expect(result.segments.length).toBe(9);
    expect(result.segments.every(segment =>
      segment.startStagePercentage === 0 &&
      segment.targetStagePercentage === 100
    )).toBe(true);
    expect(result.segments.every(segment =>
      segment.promptSource === 'VIRAL_TIMELAPSE' &&
      segment.productionMode === 'VIRAL_TIMELAPSE'
    )).toBe(true);
    expect(result.segments.every(segment =>
      segment.physicalExecutionPlanV2 === null &&
      segment.physicalSimulationV2 === null &&
      segment.providerNeutralPromptV2 === null
    )).toBe(true);
    expect(result.segments.every(segment =>
      segment.executionRecipe?.schema === 'construction-manual-execution-recipe/1'
    )).toBe(true);
    expect(result.segments.every(segment =>
      Array.from(segment.prompt).length <= 1800
    )).toBe(true);

    const first = result.segments[0];
    expect(first.operationType).toBe('marcacao');
    expect(first.prompt).toContain('[ADOBE FIREFLY VIRAL TIMELAPSE]');
    expect(first.prompt).toContain('MACRO TRANSFORMATION:');
    expect(first.prompt).toContain('END STATE:');
    expect(first.prompt).toMatch(/fast.*construction timelapse/i);
    expect(first.prompt).not.toContain('Advance only 0%');
  }, 30000);
});
