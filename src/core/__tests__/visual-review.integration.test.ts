import { describe, expect, it } from 'vitest';
import { validateAndNormalizeVisualAnalysis } from '../../../shared/visual-schema.mjs';
import {
  compileVisualReviewToBlueprint,
  createProjectFromVisualReview,
} from '../blueprints/visual-blueprint';
import {
  confirmVisualClaim,
  createVisualReviewSession,
  editVisualClaim,
  removeVisualClaim,
  toNormalizedReviewedAnalysis,
} from '../review/visual-review';
import {
  assertSanitizedVisualRegressionFixture,
  createSanitizedVisualRegressionFixture,
} from '../evaluation/visual-regression';
import { updateVisualEvaluationDecision } from '../evaluation/visual-evaluation';
import { auditProjectStage } from '../fiscals/fiscal-runner';
import { makeRawVisualAnalysis } from './visual-analysis-fixture';
import { approvedDeckVisualFixture } from './fixtures/approved-deck.visual.fixture';
import { parseProjectArchive } from '../../db/project-archive';

const reference = {
  imageData: 'data:image/png;base64,fixture-not-persisted-in-regression',
  mimeType: 'image/png',
  imageName: 'deck-real.png',
  imageSize: 1240,
  providerModel: 'model-from-server',
  evaluationCategory: 'deck_plataforma' as const,
};

function session(construction = 'deck') {
  const analysis = validateAndNormalizeVisualAnalysis(makeRawVisualAnalysis(construction, 'clareira'), 'gemini');
  return createVisualReviewSession(analysis, '2026-08-21T12:00:00.000Z');
}

describe('Revisão humana rastreável da interpretação visual', () => {
  it('edita valor, classificação e descrição sem alterar a resposta original', () => {
    const original = session();
    const reviewed = editVisualClaim(original, 'foundation', {
      value: 'apoios parcialmente visíveis',
      classification: 'HYPOTHESIS',
      evidence: 'Correção humana baseada na região inferior da imagem.',
    }, '2026-08-21T12:01:00.000Z');
    const claim = reviewed.reviewedInterpretation.claims.foundation;
    expect(claim.value).toBe('apoios parcialmente visíveis');
    expect(claim.classification).toBe('HYPOTHESIS');
    expect(claim.origin).toBe('USER_EDITED');
    expect(claim.changedAt).toBe('2026-08-21T12:01:00.000Z');
    expect(reviewed.providerOriginal.claims.foundation.value).toBeNull();
    expect(reviewed.providerOriginal).toEqual(original.providerOriginal);
  });

  it('confirma claim do provider sem fabricar confiança nova', () => {
    const reviewed = confirmVisualClaim(session(), 'floor', '2026-08-21T12:02:00.000Z');
    const claim = reviewed.reviewedInterpretation.claims.floor;
    expect(claim.origin).toBe('USER_CONFIRMED');
    expect(claim.humanConfirmed).toBe(true);
    expect(claim.originalConfidence).toBe(reviewed.providerOriginal.claims.floor.confidence);
    expect(claim.confidence).toBe(claim.originalConfidence);
  });

  it('remove claim da interpretação efetiva, mas preserva seu original', () => {
    const reviewed = removeVisualClaim(session(), 'apparentCompletion', '2026-08-21T12:03:00.000Z');
    const effective = toNormalizedReviewedAnalysis(reviewed);
    expect(reviewed.reviewedInterpretation.claims.apparentCompletion.removed).toBe(true);
    expect(reviewed.reviewedInterpretation.claims.apparentCompletion.originalValue).toBe(100);
    expect(effective.claims.apparentCompletion).toMatchObject({ value: null, classification: 'UNKNOWN' });
  });

  it('regenera blueprint localmente a partir da revisão, sem repetir provider', () => {
    const firstSession = session('deck');
    const first = compileVisualReviewToBlueprint(firstSession, reference);
    const secondSession = editVisualClaim(firstSession, 'constructionType', {
      value: 'ponte',
      classification: 'FACT',
      evidence: 'O usuário corrigiu a tipologia observada.',
    });
    const second = compileVisualReviewToBlueprint(secondSession, reference);
    expect(second.config.construction).toBe('ponte');
    expect(second.blueprint.id).not.toBe(first.blueprint.id);
    expect(second.blueprint.operations.every(operation => operation.visualBasis)).toBe(true);
  });

  it('propaga edição e confirmação humana até a origem das operações', () => {
    let reviewed = editVisualClaim(session('cabana'), 'foundation', {
      value: 'apoios corrigidos pelo usuário',
      classification: 'HYPOTHESIS',
      evidence: 'Apoios parcialmente oclusos.',
    });
    reviewed = confirmVisualClaim(reviewed, 'foundation');
    const compiled = compileVisualReviewToBlueprint(reviewed, reference);
    const operation = compiled.blueprint.operations.find(item => item.visualBasis?.sourceField === 'foundation');
    expect(operation?.visualBasis).toMatchObject({
      sourceOrigin: 'USER_CONFIRMED',
      editedByUser: true,
      humanConfirmed: true,
      sourceClassification: 'HYPOTHESIS',
    });
  });

  it('Fiscal explica UNKNOWN inferido e muda o diagnóstico após confirmação humana', () => {
    const inferredProject = createProjectFromVisualReview(session('cabana'), reference);
    const inferredOperation = inferredProject.operations.find(item => item.visualBasis?.sourceField === 'foundation');
    const inferredScene = inferredProject.scenes.find(item => item.operationId === inferredOperation?.id)!;
    const inferredReport = auditProjectStage(inferredProject, inferredScene, inferredScene.stages[1]);
    expect(inferredReport.warnings.some(item => item.code === 'V-SRC02' && item.message.includes('não é visível'))).toBe(true);

    let reviewed = editVisualClaim(session('cabana'), 'foundation', {
      value: 'apoios confirmados em vistoria humana',
      classification: 'FACT',
      evidence: 'O revisor confirmou os apoios a partir do material de campo.',
    });
    reviewed = confirmVisualClaim(reviewed, 'foundation');
    const confirmedProject = createProjectFromVisualReview(reviewed, reference);
    const confirmedOperation = confirmedProject.operations.find(item => item.visualBasis?.sourceField === 'foundation');
    const confirmedScene = confirmedProject.scenes.find(item => item.operationId === confirmedOperation?.id)!;
    const confirmedReport = auditProjectStage(confirmedProject, confirmedScene, confirmedScene.stages[1]);
    expect(confirmedReport.warnings.some(item => item.code === 'V-SRC04' && item.message.includes('confirmada pelo usuário'))).toBe(true);
    expect(confirmedReport.warnings.some(item => item.code === 'V-SRC02')).toBe(false);
  });

  it('cria registro supervisionado com imagem por metadados, pipeline e Fiscal', () => {
    const reviewed = confirmVisualClaim(session(), 'floor');
    const project = createProjectFromVisualReview(reviewed, reference);
    const evaluation = project.visualReconstruction?.evaluation;
    expect(evaluation).toMatchObject({
      category: 'deck_plataforma',
      provider: { id: 'gemini', model: 'model-from-server' },
      image: { name: 'deck-real.png', mimeType: 'image/png', size: 1240 },
      decision: 'pending',
    });
    expect(evaluation?.corrections.some(item => item.field === 'floor' && item.humanConfirmed)).toBe(true);
    expect(evaluation?.fiscal.stageCount).toBe(project.scenes.length * 5);
    expect(JSON.stringify(evaluation)).not.toContain(reference.imageData);
  });

  it('registra aprovação/reprovação e observações sem alterar os artefatos avaliados', () => {
    const project = createProjectFromVisualReview(session(), reference);
    const evaluation = project.visualReconstruction!.evaluation!;
    const decided = updateVisualEvaluationDecision(evaluation, {
      decision: 'approved',
      observations: 'Caso revisado por especialista.',
    }, '2026-08-21T12:10:00.000Z');
    expect(decided).toMatchObject({ decision: 'approved', observations: 'Caso revisado por especialista.' });
    expect(decided.blueprint).toEqual(evaluation.blueprint);
    expect(decided.updatedAt).toBe('2026-08-21T12:10:00.000Z');
  });

  it('gera fixture sanitizada e bloqueia imagem ou credencial', () => {
    const reviewed = confirmVisualClaim(session(), 'floor');
    const compiled = compileVisualReviewToBlueprint(reviewed, reference);
    const fixture = createSanitizedVisualRegressionFixture(reviewed, compiled.blueprint);
    expect(() => assertSanitizedVisualRegressionFixture(fixture)).not.toThrow();
    expect(JSON.stringify(fixture)).not.toMatch(/data:image|base64|api[_-]?key/i);
    expect(() => assertSanitizedVisualRegressionFixture({
      ...fixture,
      expectedBlueprint: { ...fixture.expectedBlueprint, id: 'data:image/png;base64,segredo' },
    })).toThrow(/sensível/);
  });

  it('mantém o caso aprovado comprometido como regressão determinística', () => {
    expect(approvedDeckVisualFixture.version).toBe('1.0');
    expect(approvedDeckVisualFixture.review.some(item => item.field === 'foundation' && item.humanConfirmed)).toBe(true);
    expect(approvedDeckVisualFixture.expectedBlueprint.operationIds.length).toBeGreaterThan(3);
    expect(approvedDeckVisualFixture.expectedBlueprint.operationSources.some(source => source.sourceOrigin === 'USER_CONFIRMED')).toBe(true);
    expect(() => assertSanitizedVisualRegressionFixture(approvedDeckVisualFixture)).not.toThrow();
  });

  it('persiste e reabre original, revisão, proveniência e avaliação supervisionada', () => {
    let reviewed = editVisualClaim(session(), 'foundation', {
      value: 'apoios revisados',
      classification: 'FACT',
      evidence: 'Confirmação de campo registrada pelo revisor.',
    }, '2026-08-21T12:20:00.000Z');
    reviewed = confirmVisualClaim(reviewed, 'foundation', '2026-08-21T12:21:00.000Z');
    const project = createProjectFromVisualReview(reviewed, reference);
    const imported = parseProjectArchive(
      JSON.stringify({ version: '4.0.0', project }),
      () => 'visual-review-imported',
    ).project;
    expect(imported.visualReconstruction?.providerOriginal?.claims.foundation.value).toBeNull();
    expect(imported.visualReconstruction?.reviewedInterpretation?.claims.foundation).toMatchObject({
      value: 'apoios revisados', origin: 'USER_CONFIRMED', humanConfirmed: true,
    });
    expect(imported.visualReconstruction?.operationEvidence).toEqual(project.visualReconstruction?.operationEvidence);
    expect(imported.visualReconstruction?.evaluation?.category).toBe('deck_plataforma');
    expect(imported.visualReconstruction?.referenceImage.dataUrl).toBe(reference.imageData);
  });
});
