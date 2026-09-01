import {
  cloneImageGenerationRequest,
  type ImageGenerationRequest,
  type ImageGenerationResult,
} from '../image-generation';
import type { ImageGenerationService } from '../image-generation/service';
import { enrichImageGenerationRequestWithOfficialReference } from './enrich-request';
import type { VisualReferenceMemory } from './memory';
import { selectBestOfficialReference } from './selector';
import type { VisualReferenceRecord } from './types';

export interface VisualContinuityImageGeneration {
  readonly baseRequest: ImageGenerationRequest;
  readonly finalRequest: ImageGenerationRequest;
  readonly selectedReference: VisualReferenceRecord | null;
  readonly generationResult: ImageGenerationResult;
}

export interface VisualContinuityImageService {
  generate(request: ImageGenerationRequest): Promise<VisualContinuityImageGeneration>;
}

export interface CreateVisualContinuityImageServiceInput {
  readonly imageGenerationService: ImageGenerationService;
  readonly visualReferenceMemory: VisualReferenceMemory;
}

/**
 * Composes temporal visual continuity without becoming an authority or mutating memory.
 * GENERATE remains GENERATE; EDIT keeps its existing references and validation semantics.
 */
export function createVisualContinuityImageService(
  input: CreateVisualContinuityImageServiceInput,
): VisualContinuityImageService {
  return {
    async generate(request): Promise<VisualContinuityImageGeneration> {
      const baseRequest = cloneImageGenerationRequest(request);
      const selectedReference =
        selectBestOfficialReference(input.visualReferenceMemory, baseRequest) ?? null;
      const finalRequest = enrichImageGenerationRequestWithOfficialReference(
        baseRequest,
        selectedReference ?? undefined,
      );
      const generationResult = await input.imageGenerationService.generate(finalRequest);

      return {
        baseRequest,
        finalRequest,
        selectedReference,
        generationResult,
      };
    },
  };
}
