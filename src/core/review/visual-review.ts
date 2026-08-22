import {
  validateAndNormalizeVisualAnalysis,
  type NormalizedVisualAnalysis,
  type VisualClaim,
  type VisualClaims,
  type VisualClassification,
} from '../../../shared/visual-schema.mjs';

export type VisualClaimField = keyof VisualClaims;
export type VisualClaimOrigin = 'PROVIDER' | 'USER_EDITED' | 'USER_CONFIRMED';

type ClaimValue<TClaim> = TClaim extends VisualClaim<infer TValue> ? TValue : never;

export interface ReviewedVisualClaim<T> extends VisualClaim<T> {
  originalValue: T | null;
  originalClassification: VisualClassification;
  originalConfidence: number;
  originalEvidence: string;
  origin: VisualClaimOrigin;
  editedByUser: boolean;
  humanConfirmed: boolean;
  removed: boolean;
  changedAt?: string;
  confirmedAt?: string;
}

export type ReviewedVisualClaims = {
  [TField in keyof VisualClaims]: ReviewedVisualClaim<ClaimValue<VisualClaims[TField]>>;
};

export interface ReviewedVisualInterpretation {
  schemaVersion: NormalizedVisualAnalysis['schemaVersion'];
  providerId: string;
  summary: string;
  claims: ReviewedVisualClaims;
  uncertainties: string[];
  technicalUnknowns: string[];
  reviewStartedAt: string;
  updatedAt: string;
}

export interface VisualReviewSession {
  /** Resposta validada e imutável recebida do provider. */
  providerOriginal: NormalizedVisualAnalysis;
  /** Cópia de trabalho com rastreabilidade por claim. */
  reviewedInterpretation: ReviewedVisualInterpretation;
}

export interface VisualClaimEdit<T> {
  value?: T | null;
  classification?: VisualClassification;
  evidence?: string;
}

const ARRAY_FIELDS = new Set<VisualClaimField>([
  'vegetation', 'visibleComponents', 'apparentMaterials', 'openings', 'externalAreas',
  'paths', 'spatialRelations', 'naturalElements', 'preservationElements',
]);

function cloneValue<T>(value: T): T {
  return Array.isArray(value) ? [...value] as T : value;
}

function cloneAnalysis(analysis: NormalizedVisualAnalysis): NormalizedVisualAnalysis {
  return {
    ...analysis,
    claims: Object.fromEntries(Object.entries(analysis.claims).map(([field, claim]) => [field, {
      ...claim,
      value: cloneValue(claim.value),
    }])) as unknown as VisualClaims,
    uncertainties: [...analysis.uncertainties],
    technicalUnknowns: [...analysis.technicalUnknowns],
  };
}

function currentClaim<T>(claim: ReviewedVisualClaim<T>): VisualClaim<T> {
  if (claim.removed) {
    return {
      value: null,
      classification: 'UNKNOWN',
      confidence: 0,
      evidence: 'Claim removido explicitamente durante a revisão humana.',
    };
  }
  return {
    value: cloneValue(claim.value),
    classification: claim.classification,
    confidence: claim.confidence,
    evidence: claim.evidence,
  };
}

function reviewedClaimsToRaw(claims: ReviewedVisualClaims): VisualClaims {
  return Object.fromEntries(Object.entries(claims).map(([field, claim]) => [
    field,
    currentClaim(claim as ReviewedVisualClaim<unknown>),
  ])) as unknown as VisualClaims;
}

function withReviewedClaim<TField extends VisualClaimField>(
  session: VisualReviewSession,
  field: TField,
  claim: ReviewedVisualClaims[TField],
  at: string,
): VisualReviewSession {
  return {
    providerOriginal: session.providerOriginal,
    reviewedInterpretation: {
      ...session.reviewedInterpretation,
      claims: { ...session.reviewedInterpretation.claims, [field]: claim },
      updatedAt: at,
    },
  };
}

export function createVisualReviewSession(
  analysis: NormalizedVisualAnalysis,
  at = new Date().toISOString(),
): VisualReviewSession {
  const providerOriginal = cloneAnalysis(analysis);
  const claims = Object.fromEntries(Object.entries(providerOriginal.claims).map(([field, claim]) => [field, {
    ...claim,
    value: cloneValue(claim.value),
    originalValue: cloneValue(claim.value),
    originalClassification: claim.classification,
    originalConfidence: claim.confidence,
    originalEvidence: claim.evidence,
    origin: 'PROVIDER',
    editedByUser: false,
    humanConfirmed: false,
    removed: false,
  }])) as unknown as ReviewedVisualClaims;

  return {
    providerOriginal,
    reviewedInterpretation: {
      schemaVersion: providerOriginal.schemaVersion,
      providerId: providerOriginal.providerId,
      summary: providerOriginal.summary,
      claims,
      uncertainties: [...providerOriginal.uncertainties],
      technicalUnknowns: [...providerOriginal.technicalUnknowns],
      reviewStartedAt: at,
      updatedAt: at,
    },
  };
}

export function editVisualClaim<TField extends VisualClaimField>(
  session: VisualReviewSession,
  field: TField,
  edit: VisualClaimEdit<ClaimValue<VisualClaims[TField]>>,
  at = new Date().toISOString(),
): VisualReviewSession {
  const previous = session.reviewedInterpretation.claims[field];
  const candidate = {
    ...currentClaim(previous),
    ...edit,
  };
  const rawClaims = reviewedClaimsToRaw(session.reviewedInterpretation.claims);
  rawClaims[field] = candidate as VisualClaims[TField];
  const validated = validateAndNormalizeVisualAnalysis({
    summary: session.reviewedInterpretation.summary,
    claims: rawClaims,
    uncertainties: session.reviewedInterpretation.uncertainties,
    technicalUnknowns: session.reviewedInterpretation.technicalUnknowns,
  }, session.providerOriginal.providerId);
  const normalized = validated.claims[field] as VisualClaim<ClaimValue<VisualClaims[TField]>>;

  return withReviewedClaim(session, field, {
    ...previous,
    ...normalized,
    value: cloneValue(normalized.value),
    origin: 'USER_EDITED',
    editedByUser: true,
    humanConfirmed: false,
    removed: false,
    changedAt: at,
    confirmedAt: undefined,
  } as ReviewedVisualClaims[TField], at);
}

export function confirmVisualClaim<TField extends VisualClaimField>(
  session: VisualReviewSession,
  field: TField,
  at = new Date().toISOString(),
): VisualReviewSession {
  const previous = session.reviewedInterpretation.claims[field];
  if (previous.removed) throw new Error(`O claim ${String(field)} foi removido e não pode ser confirmado.`);
  return withReviewedClaim(session, field, {
    ...previous,
    origin: 'USER_CONFIRMED',
    humanConfirmed: true,
    confirmedAt: at,
  }, at);
}

export function removeVisualClaim<TField extends VisualClaimField>(
  session: VisualReviewSession,
  field: TField,
  at = new Date().toISOString(),
): VisualReviewSession {
  const previous = session.reviewedInterpretation.claims[field];
  return withReviewedClaim(session, field, {
    ...previous,
    value: null,
    classification: 'UNKNOWN',
    confidence: 0,
    evidence: 'Claim removido explicitamente durante a revisão humana.',
    origin: 'USER_EDITED',
    editedByUser: true,
    humanConfirmed: false,
    removed: true,
    changedAt: at,
    confirmedAt: undefined,
  } as ReviewedVisualClaims[TField], at);
}

export function restoreVisualClaim<TField extends VisualClaimField>(
  session: VisualReviewSession,
  field: TField,
  at = new Date().toISOString(),
): VisualReviewSession {
  const previous = session.reviewedInterpretation.claims[field];
  return withReviewedClaim(session, field, {
    ...previous,
    value: cloneValue(previous.originalValue),
    classification: previous.originalClassification,
    confidence: previous.originalConfidence,
    evidence: previous.originalEvidence,
    origin: 'PROVIDER',
    editedByUser: false,
    humanConfirmed: false,
    removed: false,
    changedAt: undefined,
    confirmedAt: undefined,
  }, at);
}

export function toNormalizedReviewedAnalysis(session: VisualReviewSession): NormalizedVisualAnalysis {
  return validateAndNormalizeVisualAnalysis({
    summary: session.reviewedInterpretation.summary,
    claims: reviewedClaimsToRaw(session.reviewedInterpretation.claims),
    uncertainties: session.reviewedInterpretation.uncertainties,
    technicalUnknowns: session.reviewedInterpretation.technicalUnknowns,
  }, session.providerOriginal.providerId);
}

export function formatVisualClaimValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return Array.isArray(value) ? value.join(', ') : String(value);
}

export function parseVisualClaimValue(field: VisualClaimField, value: string): string | string[] | number | null {
  const cleaned = value.trim();
  if (!cleaned) return null;
  if (field === 'apparentCompletion') {
    const number = Number(cleaned.replace(',', '.'));
    if (!Number.isFinite(number)) throw new Error('Conclusão aparente deve ser um número entre 0 e 100.');
    return number;
  }
  if (ARRAY_FIELDS.has(field)) return cleaned.split(',').map(item => item.trim()).filter(Boolean);
  return cleaned;
}

export function visualReviewCorrections(session: VisualReviewSession) {
  return Object.entries(session.reviewedInterpretation.claims)
    .filter(([, claim]) => claim.editedByUser || claim.humanConfirmed || claim.removed)
    .map(([field, claim]) => ({
      field: field as VisualClaimField,
      originalValue: cloneValue(claim.originalValue),
      currentValue: cloneValue(claim.value),
      originalClassification: claim.originalClassification,
      currentClassification: claim.classification,
      origin: claim.origin,
      editedByUser: claim.editedByUser,
      humanConfirmed: claim.humanConfirmed,
      removed: claim.removed,
      changedAt: claim.changedAt,
      confirmedAt: claim.confirmedAt,
    }));
}
