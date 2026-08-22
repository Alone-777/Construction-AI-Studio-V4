import { describe, expect, it } from 'vitest';
import { validateAndNormalizeVisualAnalysis } from '../../../shared/visual-schema.mjs';
import {
  compileVisualAnalysisToBlueprint,
  createProjectFromVisualAnalysis,
} from '../blueprints/visual-blueprint';
import { makeRawVisualAnalysis } from './visual-analysis-fixture';
import { parseProjectArchive } from '../../db/project-archive';

const reference = {
  imageData: 'data:image/png;base64,iVBORw0KGgo=',
  mimeType: 'image/png',
  imageName: 'referencia.png',
  imageSize: 12,
};

describe('Interpretação visual → blueprint → projeto', () => {
  it.each([
    ['cabana', 'riacho'],
    ['ponte', 'margem_rio'],
    ['abrigo', 'clareira'],
    ['plataforma', 'floresta_tropical'],
  ])('usa o mesmo compilador para %s em %s', (construction, environment) => {
    const analysis = validateAndNormalizeVisualAnalysis(makeRawVisualAnalysis(construction, environment), 'test');
    const compiled = compileVisualAnalysisToBlueprint(analysis, reference);
    expect(compiled.config.construction).toBe(construction);
    expect(compiled.blueprint.operations.length).toBeGreaterThan(3);
    expect(compiled.blueprint.operations.every(operation => operation.visualBasis)).toBe(true);
    expect(compiled.blueprint.id).not.toContain('cabana_do_riacho');
  });

  it('marca trabalho oculto como hipótese sem converter UNKNOWN em fato', () => {
    const analysis = validateAndNormalizeVisualAnalysis(makeRawVisualAnalysis('cabana', 'clareira'), 'test');
    const compiled = compileVisualAnalysisToBlueprint(analysis, reference);
    const foundation = compiled.blueprint.operations.find(operation => /fund/i.test(operation.name));
    expect(foundation?.visualBasis?.sourceClassification).toBe('UNKNOWN');
    expect(foundation?.visualBasis?.classification).toBe('HYPOTHESIS');
    expect(foundation?.visualBasis?.evidence).toContain('não é verificável');
  });

  it('preserva imagem, análise e origem de cada operação no projeto', () => {
    const analysis = validateAndNormalizeVisualAnalysis(makeRawVisualAnalysis('ponte', 'margem_rio'), 'gemini');
    const project = createProjectFromVisualAnalysis(analysis, { ...reference, name: 'Ponte Reconstruída' });
    expect(project.visualReconstruction?.referenceImage.dataUrl).toBe(reference.imageData);
    expect(project.visualReconstruction?.analysis).toEqual(analysis);
    expect(Object.keys(project.visualReconstruction?.operationEvidence ?? {})).toHaveLength(project.operations.length);
    expect(project.operations.every(operation => operation.visualBasis)).toBe(true);
    const imported = parseProjectArchive(
      JSON.stringify({ version: '4.0.0', project }),
      (() => { let id = 0; return () => `visual-import-${id += 1}`; })(),
    ).project;
    expect(imported.visualReconstruction?.referenceImage.dataUrl).toBe(reference.imageData);
    expect(imported.visualReconstruction?.analysis.providerId).toBe('gemini');
  });

  it('mantém continuidade, progressão, Fiscal e prompts do orquestrador comum', () => {
    const analysis = validateAndNormalizeVisualAnalysis(makeRawVisualAnalysis('abrigo', 'clareira'), 'gemini');
    const project = createProjectFromVisualAnalysis(analysis, reference);
    const stages = project.scenes.flatMap(scene => scene.stages);
    for (const scene of project.scenes) {
      expect(scene.stages.map(stage => stage.percentage)).toEqual([0, 25, 50, 75, 100]);
    }
    for (let index = 1; index < stages.length; index += 1) {
      expect(stages[index].worldStateBefore).toEqual(stages[index - 1].worldStateAfter);
    }
    expect(stages.every(stage => stage.validations.approved)).toBe(true);
    expect(stages.some(stage => stage.validations.checks?.some(check => check.ruleId === 'visual-source-fiscal' && check.status === 'WARNING'))).toBe(true);
    expect(stages.filter(stage => stage.percentage > 0).every(stage => stage.prompts?.nanoBanana && stage.prompts?.kling)).toBe(true);
  });
});
