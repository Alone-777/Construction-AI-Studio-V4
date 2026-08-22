import type { EnvironmentPreset, Project } from '../types';
import {
  compileDescriptionToBlueprint,
  type DescriptionBlueprintResult,
  type ProjectDescriptionInput,
} from './description-blueprint';
import { createProjectFromBlueprint, type BlueprintOperation } from '../engines/project-orchestrator';
import type {
  VisualAnalysisRequest,
  VisualAnalysisResult,
  VisualProvider,
} from '../providers/visual-provider';
import type {
  NormalizedVisualAnalysis,
  VisualClaim,
  VisualClaims,
} from '../../../shared/visual-schema.mjs';
import {
  createVisualReviewSession,
  toNormalizedReviewedAnalysis,
  type ReviewedVisualClaims,
  type VisualReviewSession,
} from '../review/visual-review';
import {
  createVisualEvaluationRecord,
  type VisualEvaluationCategory,
} from '../evaluation/visual-evaluation';

export interface VisualReconstructionRequest extends VisualAnalysisRequest {
  name?: string;
  imageName?: string;
  imageSize?: number;
  environment?: EnvironmentPreset;
  construction?: string;
  providerModel?: string;
  evaluationCategory?: VisualEvaluationCategory;
}

export interface VisualBlueprintResult extends DescriptionBlueprintResult {
  operationEvidence: Record<string, NonNullable<BlueprintOperation['visualBasis']>>;
}

const ENVIRONMENTS = new Set<EnvironmentPreset>([
  'floresta_tropical', 'floresta_temperada', 'floresta_umida', 'pinheiros', 'clareira',
  'montanha', 'margem_rio', 'riacho', 'vale', 'area_rochosa', 'terreno_plano',
  'terreno_inclinado', 'personalizado',
]);

function claimValue<T>(claim: VisualClaim<T>): T | undefined {
  return claim.classification === 'UNKNOWN' || claim.value === null ? undefined : claim.value;
}

function environmentFromClaim(claim: VisualClaim<string>): EnvironmentPreset | undefined {
  const value = claimValue(claim);
  if (!value) return undefined;
  const normalized = value.toLowerCase().replace(/\s+/g, '_') as EnvironmentPreset;
  return ENVIRONMENTS.has(normalized) ? normalized : undefined;
}

function claimNarrative(analysis: NormalizedVisualAnalysis): string {
  return Object.entries(analysis.claims)
    .filter(([, claim]) => claim.classification !== 'UNKNOWN' && claim.value !== null)
    .map(([field, claim]) => `${field} (${claim.classification}): ${Array.isArray(claim.value) ? claim.value.join(', ') : claim.value}`)
    .join('. ');
}

export function interpretVisualAnalysis(
  analysis: VisualAnalysisResult,
  request: VisualReconstructionRequest,
): ProjectDescriptionInput {
  if (!analysis.summary.trim()) throw new Error('A interpretação visual não possui resumo verificável.');
  const materials = claimValue(analysis.claims.apparentMaterials) ?? [];
  const construction = request.construction || claimValue(analysis.claims.constructionType);
  return {
    description: [analysis.summary, claimNarrative(analysis), request.userContext].filter(Boolean).join('. '),
    name: request.name,
    environment: request.environment ?? environmentFromClaim(analysis.claims.environment),
    construction,
    materials,
  };
}

function sourceClaimForOperation(
  operation: BlueprintOperation,
  claims: VisualClaims,
): { field: keyof VisualClaims; claim: VisualClaim<unknown> } {
  const type = operation.type.toLowerCase();
  if (/sapata|funda[cç][aã]o|apoio|ancoragem/.test(type)) return { field: 'foundation', claim: claims.foundation };
  if (/piso|base|tabuleiro|plataforma/.test(type)) return { field: 'floor', claim: claims.floor };
  if (/parede|fechamento|conten[cç][aã]o/.test(type)) return { field: 'walls', claim: claims.walls };
  if (/cobertura|telhado/.test(type)) return { field: 'roof', claim: claims.roof };
  if (/porta|janela|acesso/.test(type)) return { field: 'openings', claim: claims.openings };
  if (/limpeza|escava[cç][aã]o|prepara[cç][aã]o/.test(type)) return { field: 'terrain', claim: claims.terrain };
  return { field: 'structure', claim: claims.structure };
}

function defaultEvaluationCategory(construction: string): VisualEvaluationCategory {
  const normalized = construction.toLowerCase();
  if (/ponte/.test(normalized)) return 'ponte';
  if (/abrigo/.test(normalized)) return 'abrigo';
  if (/deck|plataforma/.test(normalized)) return 'deck_plataforma';
  return 'cabana';
}

function compileReviewedAnalysisToBlueprint(
  analysis: NormalizedVisualAnalysis,
  reviewedClaims: ReviewedVisualClaims,
  request: VisualReconstructionRequest,
): VisualBlueprintResult {
  const compiled = compileDescriptionToBlueprint(interpretVisualAnalysis(analysis, request));
  const operationEvidence: Record<string, NonNullable<BlueprintOperation['visualBasis']>> = {};
  const operations = compiled.blueprint.operations.map(operation => {
    const source = sourceClaimForOperation(operation, analysis.claims);
    const provenance = reviewedClaims[source.field];
    const basis: NonNullable<BlueprintOperation['visualBasis']> = {
      classification: source.claim.classification === 'FACT' ? 'FACT' : 'HYPOTHESIS',
      sourceClassification: source.claim.classification,
      sourceField: source.field,
      evidence: source.claim.classification === 'UNKNOWN'
        ? `O elemento não é verificável na interpretação revisada; ${operation.name} foi incluída apenas como hipótese construtiva necessária.`
        : source.claim.evidence,
      sourceOrigin: provenance.origin,
      editedByUser: provenance.editedByUser,
      humanConfirmed: provenance.humanConfirmed,
      sourceChangedAt: provenance.changedAt,
    };
    operationEvidence[operation.id] = basis;
    return { ...operation, visualBasis: basis };
  });
  return {
    ...compiled,
    blueprint: { ...compiled.blueprint, operations },
    interpretation: [
      ...compiled.interpretation,
      `Claims FACT: ${Object.values(analysis.claims).filter(claim => claim.classification === 'FACT').length}`,
      `Claims HYPOTHESIS: ${Object.values(analysis.claims).filter(claim => claim.classification === 'HYPOTHESIS').length}`,
      `Claims UNKNOWN: ${Object.values(analysis.claims).filter(claim => claim.classification === 'UNKNOWN').length}`,
      `Claims editados pelo usuário: ${Object.values(reviewedClaims).filter(claim => claim.editedByUser).length}`,
      `Claims confirmados pelo usuário: ${Object.values(reviewedClaims).filter(claim => claim.humanConfirmed).length}`,
    ],
    assumptions: [...compiled.assumptions, ...analysis.uncertainties, ...analysis.technicalUnknowns],
    operationEvidence,
  };
}

export function compileVisualReviewToBlueprint(
  session: VisualReviewSession,
  request: VisualReconstructionRequest,
): VisualBlueprintResult {
  return compileReviewedAnalysisToBlueprint(
    toNormalizedReviewedAnalysis(session),
    session.reviewedInterpretation.claims,
    request,
  );
}

export function compileVisualAnalysisToBlueprint(
  analysis: NormalizedVisualAnalysis,
  request: VisualReconstructionRequest,
): VisualBlueprintResult {
  return compileVisualReviewToBlueprint(createVisualReviewSession(analysis), request);
}

export function createProjectFromVisualReview(
  session: VisualReviewSession,
  request: VisualReconstructionRequest,
): Project {
  const analysis = toNormalizedReviewedAnalysis(session);
  const compiled = compileVisualReviewToBlueprint(session, request);
  const project = createProjectFromBlueprint(compiled.config, compiled.blueprint);
  const visualProject: Project = {
    ...project,
    planning: {
      source: 'visual',
      sourceDescription: analysis.summary,
      blueprintId: compiled.blueprint.id,
      providerId: session.providerOriginal.providerId,
      interpretation: compiled.interpretation,
      assumptions: compiled.assumptions,
    },
    visualReconstruction: {
      referenceImage: {
        name: request.imageName || 'imagem-original',
        mimeType: request.mimeType,
        size: request.imageSize ?? 0,
        dataUrl: request.imageData,
      },
      analysis,
      providerOriginal: session.providerOriginal,
      reviewedInterpretation: session.reviewedInterpretation,
      operationEvidence: compiled.operationEvidence,
      providerModel: request.providerModel,
    },
  };
  visualProject.visualReconstruction!.evaluation = createVisualEvaluationRecord({
    category: request.evaluationCategory ?? defaultEvaluationCategory(compiled.config.construction),
    model: request.providerModel,
    image: {
      name: request.imageName || 'imagem-original',
      mimeType: request.mimeType,
      size: request.imageSize ?? 0,
    },
    session,
    blueprint: compiled.blueprint,
    project: visualProject,
  });
  return visualProject;
}

export function createProjectFromVisualAnalysis(
  analysis: NormalizedVisualAnalysis,
  request: VisualReconstructionRequest,
): Project {
  return createProjectFromVisualReview(createVisualReviewSession(analysis), request);
}

/** Pipeline image → provider → schema → blueprint genérico → orquestrador. */
export async function createProjectFromVisualProvider(
  provider: VisualProvider,
  request: VisualReconstructionRequest,
): Promise<Project> {
  if (!provider.descriptor.configured) {
    throw new Error(`Provider visual '${provider.descriptor.id}' não está configurado.`);
  }
  const analysis = await provider.analyze(request);
  return createProjectFromVisualAnalysis(analysis, {
    ...request,
    providerModel: request.providerModel ?? provider.descriptor.model,
  });
}
