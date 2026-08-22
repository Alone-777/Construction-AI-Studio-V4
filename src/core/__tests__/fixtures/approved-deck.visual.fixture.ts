import { validateAndNormalizeVisualAnalysis } from '../../../../shared/visual-schema.mjs';
import { compileVisualReviewToBlueprint } from '../../blueprints/visual-blueprint';
import {
  confirmVisualClaim,
  createVisualReviewSession,
  editVisualClaim,
} from '../../review/visual-review';
import {
  assertSanitizedVisualRegressionFixture,
  createSanitizedVisualRegressionFixture,
} from '../../evaluation/visual-regression';
import { makeRawVisualAnalysis } from '../visual-analysis-fixture';

const fixedAt = '2026-08-21T12:00:00.000Z';
const original = validateAndNormalizeVisualAnalysis(
  makeRawVisualAnalysis('deck', 'clareira'),
  'supervised-fixture',
);
let review = createVisualReviewSession(original, fixedAt);
review = editVisualClaim(review, 'foundation', {
  value: 'apoios parcialmente observados junto ao terreno',
  classification: 'HYPOTHESIS',
  evidence: 'A base está parcialmente oclusa; a descrição foi corrigida durante a revisão.',
}, fixedAt);
review = confirmVisualClaim(review, 'foundation', fixedAt);
review = confirmVisualClaim(review, 'floor', fixedAt);

const compiled = compileVisualReviewToBlueprint(review, {
  imageData: '',
  mimeType: 'image/png',
  name: 'Fixture aprovada — deck',
});

/** Caso supervisionado aprovado, sem imagem, base64, credencial ou resposta HTTP remota. */
export const approvedDeckVisualFixture = createSanitizedVisualRegressionFixture(review, compiled.blueprint);
assertSanitizedVisualRegressionFixture(approvedDeckVisualFixture);

