import type { CanonicalImagePromptSpec } from '../image-prompts/canonical-image-prompt-spec';
import type {
  ImageAssetRef,
  ImageGenerationRequest,
  ImageMetadataValue,
  ImageProviderKind,
} from '../image-generation';
import type { VisualReferenceTemporalPosition } from '../visual-reference';

export interface ExpectedVisualFacts {
  readonly requiredElements: readonly string[];
  readonly forbiddenFutureElements: readonly string[];
  readonly expectedCharacter: {
    readonly characterId: string;
    readonly visualIdentityId: string;
    readonly name: string;
  };
  readonly expectedClothing: string;
  readonly expectedEnvironment: {
    readonly preset: CanonicalImagePromptSpec['environment']['preset'];
    readonly climate: string;
    readonly light: string;
    readonly timeOfDay: CanonicalImagePromptSpec['environment']['timeOfDay'];
    readonly weather: CanonicalImagePromptSpec['environment']['weather'];
    readonly permanentObjects: readonly string[];
  };
  readonly expectedConstructionState: {
    readonly progress: number;
    readonly targetId: string;
    readonly targetState: CanonicalImagePromptSpec['currentConstruction']['targetState'];
    readonly expectedTargetStatus: CanonicalImagePromptSpec['primaryAction']['expectedTargetStatus'];
    readonly presentComponents: readonly string[];
    readonly completedComponents: readonly string[];
    readonly partialComponents: readonly string[];
  };
  readonly expectedMaterials: readonly string[];
  readonly expectedTools: readonly string[];
  readonly continuityConstraints: readonly string[];
}

export interface VisualValidationPreviousReference {
  readonly recordId: string;
  readonly requestId: string;
  readonly projectId: string;
  readonly sceneId: string;
  readonly stageId: string;
  readonly asset: ImageAssetRef;
  readonly temporalPosition: VisualReferenceTemporalPosition;
}

export interface VisualValidationRequest {
  readonly validationId: string;
  readonly projectId: string;
  readonly sceneId: string;
  readonly stageId: string;
  readonly operationId: string;
  readonly requestId: string;
  readonly snapshotId: string;
  readonly canonicalSpecId: string;
  readonly candidateAsset: ImageAssetRef;
  readonly previousOfficialReference?: VisualValidationPreviousReference;
  readonly temporalAuthority: ImageGenerationRequest['temporalAuthority'];
  readonly snapshotKind: ImageGenerationRequest['snapshotKind'];
  readonly stageOutcome: ImageGenerationRequest['metadata']['stageOutcome'];
  readonly temporalPoint: ImageGenerationRequest['metadata']['temporalPoint'];
  readonly worldStateSource: ImageGenerationRequest['metadata']['worldStateSource'];
  readonly temporalPosition?: ImageGenerationRequest['metadata']['temporalPosition'];
  readonly expected: ExpectedVisualFacts;
  readonly metadata?: Readonly<Record<string, ImageMetadataValue>>;
}

export type VisualEvidenceCoverage = 'SUFFICIENT' | 'PARTIAL' | 'INSUFFICIENT';
export type VisualConsistencyObservation =
  | 'MATCH'
  | 'MINOR_DIVERGENCE'
  | 'MAJOR_DIVERGENCE'
  | 'UNKNOWN';
export type PreviousOfficialContinuityObservation =
  | VisualConsistencyObservation
  | 'NOT_APPLICABLE';

export interface VisualTemporalAnomaly {
  readonly code: 'FUTURE_ELEMENT' | 'CONSTRUCTION_AHEAD' | 'TEMPORAL_INCONSISTENCY';
  readonly message: string;
  readonly element?: string;
}

export interface VisualObservation {
  readonly coverage: VisualEvidenceCoverage;
  readonly detectedElements: readonly string[];
  readonly missingElements: readonly string[];
  readonly unexpectedElements: readonly string[];
  readonly characterConsistency: VisualConsistencyObservation;
  readonly clothingConsistency: VisualConsistencyObservation;
  readonly environmentConsistency: VisualConsistencyObservation;
  readonly constructionConsistency: VisualConsistencyObservation;
  readonly materialConsistency: VisualConsistencyObservation;
  readonly geometryConsistency: VisualConsistencyObservation;
  readonly previousOfficialContinuity: PreviousOfficialContinuityObservation;
  readonly temporalAnomalies: readonly VisualTemporalAnomaly[];
  readonly notes: readonly string[];
  readonly confidence?: number;
}

export interface VisualValidationEvidence extends VisualObservation {
  readonly evidenceId: string;
  readonly validationId: string;
  readonly requestId: string;
  readonly assetId: string;
  readonly source: {
    readonly providerId: string;
    readonly providerKind: ImageProviderKind;
  };
  readonly observedAt: number;
}

export interface VisualObservationProvider {
  readonly id: string;
  readonly kind: ImageProviderKind;
  observe(request: VisualValidationRequest): Promise<VisualValidationEvidence>;
}

export type VisualValidationVerdict = 'PASS' | 'WARN' | 'FAIL';
export type VisualValidationFindingSeverity = 'WARN' | 'FAIL';
export type VisualValidationFindingCode =
  | 'EVIDENCE_VALIDATION_MISMATCH'
  | 'EVIDENCE_REQUEST_MISMATCH'
  | 'EVIDENCE_ASSET_MISMATCH'
  | 'INSUFFICIENT_EVIDENCE'
  | 'FUTURE_ELEMENT_LEAK'
  | 'REQUIRED_ELEMENT_MISSING'
  | 'TEMPORAL_ANOMALY'
  | 'UNEXPECTED_ELEMENT'
  | 'CHARACTER_CONTINUITY'
  | 'CLOTHING_CONTINUITY'
  | 'ENVIRONMENT_CONTINUITY'
  | 'CONSTRUCTION_CONTINUITY'
  | 'MATERIAL_CONTINUITY'
  | 'GEOMETRY_CONTINUITY'
  | 'PREVIOUS_OFFICIAL_CONTINUITY';

export interface VisualValidationFinding {
  readonly code: VisualValidationFindingCode;
  readonly severity: VisualValidationFindingSeverity;
  readonly message: string;
  readonly element?: string;
}

interface VisualValidationResultBase {
  readonly validationId: string;
  readonly requestId: string;
  readonly assetId: string;
  readonly projectId: string;
  readonly sceneId: string;
  readonly stageId: string;
  readonly operationId: string;
  readonly snapshotId: string;
  readonly canonicalSpecId: string;
  readonly temporalAuthority: ImageGenerationRequest['temporalAuthority'];
  readonly snapshotKind: ImageGenerationRequest['snapshotKind'];
  readonly stageOutcome: ImageGenerationRequest['metadata']['stageOutcome'];
  readonly temporalPoint: ImageGenerationRequest['metadata']['temporalPoint'];
  readonly findings: readonly VisualValidationFinding[];
  readonly checkedRules: readonly string[];
  readonly evidenceSource: VisualValidationEvidence['source'];
  readonly validatedAt: number;
}

export type VisualValidationResult = VisualValidationResultBase & (
  | { readonly verdict: 'PASS' }
  | { readonly verdict: 'WARN' }
  | { readonly verdict: 'FAIL' }
);

export interface VisualApprovalEligibility {
  readonly eligible: boolean;
  readonly requiresAcknowledgement: boolean;
  readonly reason:
    | 'PASS'
    | 'WARN_ACKNOWLEDGEMENT_REQUIRED'
    | 'WARN_ACKNOWLEDGED'
    | 'FAIL'
    | 'TEMPORAL_INELIGIBLE';
}
