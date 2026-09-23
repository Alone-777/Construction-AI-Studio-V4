import { describe, expect, it } from 'vitest';

import {
  buildViralExecutionRecipe,
  compileViralTimelapsePrompt,
  normalizeVideoStyle,
} from './viral-timelapse.mjs';

describe('viral-timelapse', () => {
  it('defaults safely and recognizes the two production styles', () => {
    expect(normalizeVideoStyle('VIRAL_TIMELAPSE')).toBe('VIRAL_TIMELAPSE');
    expect(normalizeVideoStyle('physical_realism')).toBe('PHYSICAL_REALISM');
    expect(normalizeVideoStyle('unknown')).toBe('PHYSICAL_REALISM');
  });

  it('compiles a compact macro transformation prompt for Kling', () => {
    const result = compileViralTimelapsePrompt({
      operationType: 'fundacao',
      operationName: 'Execução das fundações',
      physicalAction: 'escavar e assentar progressivamente as fundações',
      environment: 'floresta',
      completedOperations: ['Marcação da implantação', 'Limpeza seletiva da área marcada'],
      forbiddenFutureElements: ['Montagem da base e piso', 'Elevação dos pilares'],
    });

    expect(result.productionMode).toBe('VIRAL_TIMELAPSE');
    expect(result.characterCount).toBeLessThanOrEqual(1800);
    expect(result.prompt).toContain('[ADOBE FIREFLY VIRAL TIMELAPSE]');
    expect(result.prompt).toContain('MACRO TRANSFORMATION:');
    expect(result.prompt).toContain('END STATE:');
    expect(result.prompt).toContain('Minor continuity drift');
    expect(result.prompt).not.toContain('Advance only 0%');
  });

  it('keeps retry fixes explicit without returning to micro-physical instructions', () => {
    const result = compileViralTimelapsePrompt({
      operationType: 'paredes',
      operationName: 'Fechamento das paredes',
      physicalAction: 'montar paredes',
      retryCorrections: [{
        code: 'PROJECT_DESIGN_DRIFT',
        correction: 'Keep the same cabin footprint and window openings.',
      }],
    });

    expect(result.prompt).toContain('RETRY FIXES:');
    expect(result.prompt).toContain('PROJECT_DESIGN_DRIFT');
    expect(result.prompt).toContain('Keep the same cabin footprint');
    expect(result.prompt).not.toContain('grip the');
  });

  it('projects a compatibility execution recipe around macro progress', () => {
    const recipe = buildViralExecutionRecipe({
      operationType: 'cobertura',
      operationName: 'Aplicação da cobertura',
      physicalAction: 'fixar a cobertura',
    });

    expect(recipe.schema).toBe('construction-manual-execution-recipe/1');
    expect(recipe.tools).toEqual(['construction tools']);
    expect(recipe.actionSequence.length).toBeGreaterThanOrEqual(2);
    expect(recipe.visibleTransformation).toMatch(/macro construction transformation/i);
    expect(recipe.terminalEvidence).toContain('END STATE:');
  });
});
