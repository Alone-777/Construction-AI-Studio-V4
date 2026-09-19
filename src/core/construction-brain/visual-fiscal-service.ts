import type { VisualProvider } from '../providers/visual-provider';
import type { FireflyExecutionJob } from './types';
import {
  assessConstructionJob,
  type ConstructionFiscalAssessment,
  type ConstructionLearningMemory,
} from './fiscal-learning';
import {
  buildConstructionFiscalVisualContext,
  deriveConstructionFiscalObservation,
} from './visual-fiscal-observer';

export interface ReviewConstructionVideoInput {
  job: FireflyExecutionJob;
  operationType: string;
  contactSheetImageData: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  provider: VisualProvider;
  learningMemory?: ConstructionLearningMemory;
  progressTolerance?: number;
}

export type ConstructionVideoReviewResult =
  | {
      status: 'ASSESSED';
      providerId: string;
      assessment: ConstructionFiscalAssessment;
    }
  | {
      status: 'REOBSERVE';
      providerId: string;
      blockers: string[];
    };

export async function reviewConstructionVideo(
  input: ReviewConstructionVideoInput,
): Promise<ConstructionVideoReviewResult> {
  const userContext = buildConstructionFiscalVisualContext(
    input.job,
    input.operationType,
  );

  const analysis = await input.provider.analyze({
    imageData: input.contactSheetImageData,
    mimeType: input.mimeType,
    userContext,
  });

  const observed = deriveConstructionFiscalObservation(input.job, analysis);
  if (!observed.readyForFiscal || !observed.observation) {
    return {
      status: 'REOBSERVE',
      providerId: input.provider.descriptor.id,
      blockers: [...observed.blockers],
    };
  }

  return {
    status: 'ASSESSED',
    providerId: input.provider.descriptor.id,
    assessment: assessConstructionJob(
      input.job,
      observed.observation,
      {
        operationType: input.operationType,
        progressTolerance: input.progressTolerance,
        memory: input.learningMemory,
      },
    ),
  };
}
