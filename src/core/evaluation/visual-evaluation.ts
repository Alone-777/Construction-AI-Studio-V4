import type { NormalizedVisualAnalysis } from '../../../shared/visual-schema.mjs';
import type { ConstructionBlueprint } from '../engines/project-orchestrator';
import type { Project } from '../types/project';
import type { VisualReviewSession } from '../review/visual-review';
import { toNormalizedReviewedAnalysis, visualReviewCorrections } from '../review/visual-review';

export type VisualEvaluationCategory = 'cabana' | 'ponte' | 'abrigo' | 'deck_plataforma';
export type VisualEvaluationDecision = 'pending' | 'approved' | 'rejected';

export interface VisualEvaluationRecord {
  id: string;
  category: VisualEvaluationCategory;
  image: { name: string; mimeType: string; size: number };
  provider: { id: string; model?: string };
  providerOriginal: NormalizedVisualAnalysis;
  corrections: ReturnType<typeof visualReviewCorrections>;
  finalInterpretation: NormalizedVisualAnalysis;
  blueprint: ConstructionBlueprint;
  operations: Project['operations'];
  fiscal: {
    stageCount: number;
    approvedStages: number;
    errors: number;
    warnings: number;
    approved: boolean;
  };
  observations: string;
  decision: VisualEvaluationDecision;
  createdAt: string;
  updatedAt: string;
}

export function createVisualEvaluationRecord(input: {
  category: VisualEvaluationCategory;
  model?: string;
  image: { name: string; mimeType: string; size: number };
  session: VisualReviewSession;
  blueprint: ConstructionBlueprint;
  project: Project;
  at?: string;
}): VisualEvaluationRecord {
  const at = input.at ?? new Date().toISOString();
  const stages = input.project.scenes.flatMap(scene => scene.stages);
  const errors = stages.flatMap(stage => stage.validations.errors);
  return {
    id: `visual-evaluation-${input.project.id}`,
    category: input.category,
    image: { ...input.image },
    provider: { id: input.session.providerOriginal.providerId, model: input.model },
    providerOriginal: input.session.providerOriginal,
    corrections: visualReviewCorrections(input.session),
    finalInterpretation: toNormalizedReviewedAnalysis(input.session),
    blueprint: input.blueprint,
    operations: input.project.operations,
    fiscal: {
      stageCount: stages.length,
      approvedStages: stages.filter(stage => stage.validations.approved).length,
      errors: errors.filter(error => error.severity === 'ERROR').length,
      warnings: errors.filter(error => error.severity !== 'ERROR').length,
      approved: stages.every(stage => stage.validations.approved),
    },
    observations: '',
    decision: 'pending',
    createdAt: at,
    updatedAt: at,
  };
}

export function updateVisualEvaluationDecision(
  evaluation: VisualEvaluationRecord,
  updates: { observations?: string; decision?: VisualEvaluationDecision },
  at = new Date().toISOString(),
): VisualEvaluationRecord {
  return {
    ...evaluation,
    observations: updates.observations === undefined
      ? evaluation.observations
      : updates.observations.trim().slice(0, 4000),
    decision: updates.decision ?? evaluation.decision,
    updatedAt: at,
  };
}

