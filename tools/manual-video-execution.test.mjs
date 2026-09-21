import { describe, expect, it } from 'vitest';

import {
  MANUAL_KLING_PROMPT_MAX_CHARS,
  buildManualExecutionRecipe,
  compileManualKlingPrompt,
  validateManualExecutionRecipe,
} from './manual-video-execution.mjs';

describe('manual video execution recipes', () => {
  it('turns site preparation into explicit shovel choreography and persistent terrain evidence', () => {
    const recipe = buildManualExecutionRecipe({
      operationType: 'preparacao',
      operationName: 'Preparação seletiva do local',
      physicalAction: 'delimitar a implantação e remover somente obstáculos autorizados',
      startStagePercentage: 0,
      targetStagePercentage: 25,
    });

    expect(validateManualExecutionRecipe(recipe)).toEqual({ ok: true, errors: [] });
    expect(recipe.tools).toEqual(['shovel']);
    expect(recipe.actorAction).toMatch(/shovel/i);
    expect(recipe.actionSequence.join(' ')).toMatch(/shovel blade/i);
    expect(recipe.actionSequence.join(' ')).toMatch(/scrape and cut surface grass/i);
    expect(recipe.visibleTransformation).toMatch(/exposed, disturbed brown soil/i);
    expect(recipe.terminalEvidence).toMatch(/25%/);
    expect(recipe.physicalActionIRProjection.primaryAction.type).toBe('REMOVE');
    expect(recipe.physicalActionIRProjection.expectedEffects.constructionProgress).toEqual({
      before: 0,
      after: 25,
    });
  });

  it('compiles the recipe into a Kling prompt that cannot be mistaken for worker pantomime', () => {
    const recipe = buildManualExecutionRecipe({
      operationType: 'preparacao',
      operationName: 'Preparação seletiva do local',
      physicalAction: 'delimitar a implantação e remover somente obstáculos autorizados',
      startStagePercentage: 0,
      targetStagePercentage: 25,
    });
    const result = compileManualKlingPrompt({
      operationName: 'Preparação seletiva do local',
      physicalAction: 'delimitar a implantação e remover somente obstáculos autorizados',
      executionRecipe: recipe,
      startStagePercentage: 0,
      targetStagePercentage: 25,
      durationSeconds: 15,
      aspectRatio: '16:9',
      model: 'KLING_3_0',
      environment: 'floresta',
      forbiddenFutureElements: [
        'Execução das fundações',
        'Montagem da base e piso',
        'Elevação dos pilares',
        'Fechamento das paredes',
        'Estrutura da cobertura',
        'Aplicação da cobertura',
        'Instalação do acesso principal',
      ],
    });

    expect(result.characterCount).toBeLessThanOrEqual(MANUAL_KLING_PROMPT_MAX_CHARS);
    expect(result.prompt).toMatch(/using shovel/i);
    expect(result.prompt).toMatch(/Push the shovel blade/i);
    expect(result.prompt).toMatch(/exposed, disturbed brown soil/i);
    expect(result.prompt).toMatch(/No pantomime/i);
    expect(result.prompt).toMatch(/0%→25%/);
    expect(result.prompt).toMatch(/visibly incomplete/i);
    expect(result.prompt).not.toMatch(/foundation trenches.*appear/i);
  });

  it('rejects recipes that omit the physical execution evidence', () => {
    expect(validateManualExecutionRecipe({
      schema: 'construction-manual-execution-recipe/1',
      tools: [],
      actorAction: '',
      actionSequence: [],
      visibleTransformation: '',
      terminalEvidence: '',
    })).toEqual({
      ok: false,
      errors: [
        'EXECUTION_TOOL_MISSING',
        'EXECUTION_ACTOR_ACTION_MISSING',
        'EXECUTION_SEQUENCE_TOO_THIN',
        'EXECUTION_VISIBLE_TRANSFORMATION_MISSING',
        'EXECUTION_TERMINAL_EVIDENCE_MISSING',
      ],
    });
  });
});
