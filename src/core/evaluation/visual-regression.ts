import type { NormalizedVisualAnalysis } from '../../../shared/visual-schema.mjs';
import type { ConstructionBlueprint } from '../engines/project-orchestrator';
import type { VisualReviewSession } from '../review/visual-review';
import { toNormalizedReviewedAnalysis, visualReviewCorrections } from '../review/visual-review';

export interface SanitizedVisualRegressionFixture {
  version: '1.0';
  providerOriginal: NormalizedVisualAnalysis;
  review: ReturnType<typeof visualReviewCorrections>;
  reviewedInterpretation: NormalizedVisualAnalysis;
  expectedBlueprint: {
    id: string;
    componentIds: string[];
    operationIds: string[];
    zoneIds: string[];
    operationSources: Array<{
      id: string;
      sourceField: string;
      sourceClassification: string;
      sourceOrigin: string;
      humanConfirmed: boolean;
    }>;
  };
}

function cloneAnalysis(analysis: NormalizedVisualAnalysis): NormalizedVisualAnalysis {
  return JSON.parse(JSON.stringify(analysis)) as NormalizedVisualAnalysis;
}

/** Produz somente dados determinísticos do pipeline; imagem, base64 e credenciais nunca entram na fixture. */
export function createSanitizedVisualRegressionFixture(
  session: VisualReviewSession,
  blueprint: ConstructionBlueprint,
): SanitizedVisualRegressionFixture {
  return {
    version: '1.0',
    providerOriginal: cloneAnalysis(session.providerOriginal),
    review: visualReviewCorrections(session),
    reviewedInterpretation: cloneAnalysis(toNormalizedReviewedAnalysis(session)),
    expectedBlueprint: {
      id: blueprint.id,
      componentIds: blueprint.components.map(component => component.id),
      operationIds: blueprint.operations.map(operation => operation.id),
      zoneIds: blueprint.map.zones.map(zone => zone.id),
      operationSources: blueprint.operations.map(operation => ({
        id: operation.id,
        sourceField: operation.visualBasis?.sourceField ?? '',
        sourceClassification: operation.visualBasis?.sourceClassification ?? '',
        sourceOrigin: operation.visualBasis?.sourceOrigin ?? 'PROVIDER',
        humanConfirmed: operation.visualBasis?.humanConfirmed ?? false,
      })),
    },
  };
}

export function assertSanitizedVisualRegressionFixture(fixture: SanitizedVisualRegressionFixture): void {
  const serialized = JSON.stringify(fixture);
  const forbidden = [
    /api[_-]?key/i,
    /authorization/i,
    /bearer\s+[a-z0-9._-]+/i,
    /data:image\//i,
    /base64/i,
  ];
  if (forbidden.some(pattern => pattern.test(serialized))) {
    throw new Error('Fixture visual contém imagem ou dado potencialmente sensível.');
  }
}

