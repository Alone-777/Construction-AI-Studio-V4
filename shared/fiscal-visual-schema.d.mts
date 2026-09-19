export type FiscalVisualClassification = 'FACT' | 'HYPOTHESIS' | 'UNKNOWN';
export type FiscalContinuityValue = 'MATCH' | 'MINOR_DIVERGENCE' | 'MAJOR_DIVERGENCE';

export interface FiscalVisualClaim<T> {
  value: T | null;
  classification: FiscalVisualClassification;
  confidence: number;
  evidence: string;
}

export interface NormalizedFiscalVisualAnalysis {
  schemaVersion: '1.0.0';
  contract: 'construction-fiscal-v1';
  providerId: string;
  summary: string;
  apparentCompletion: FiscalVisualClaim<number>;
  visibleCanonicalFutureElements: FiscalVisualClaim<string[]>;
  missingVisibleEvidence: FiscalVisualClaim<string[]>;
  workerContinuity: FiscalVisualClaim<FiscalContinuityValue>;
  environmentContinuity: FiscalVisualClaim<FiscalContinuityValue>;
  geometryContinuity: FiscalVisualClaim<FiscalContinuityValue>;
  sourceContinuity: FiscalVisualClaim<FiscalContinuityValue>;
  uncertainties: string[];
}

export class FiscalVisualSchemaValidationError extends Error {
  readonly issues: string[];
  constructor(issues: string[]);
}

export const FISCAL_VISUAL_SCHEMA_VERSION: '1.0.0';
export const FISCAL_VISUAL_CONTRACT: 'construction-fiscal-v1';
export const FISCAL_CONTINUITY_VALUES: readonly ['MATCH','MINOR_DIVERGENCE','MAJOR_DIVERGENCE','UNKNOWN'];
export function validateAndNormalizeFiscalVisualAnalysis(raw: unknown, providerId: string): NormalizedFiscalVisualAnalysis;
