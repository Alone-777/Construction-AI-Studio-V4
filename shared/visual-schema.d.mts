export type VisualClassification = 'FACT' | 'HYPOTHESIS' | 'UNKNOWN';

export interface VisualClaim<T> {
  value: T | null;
  classification: VisualClassification;
  confidence: number;
  evidence: string;
}

export interface VisualClaims {
  constructionType: VisualClaim<string>;
  environment: VisualClaim<string>;
  terrain: VisualClaim<string>;
  watercourse: VisualClaim<string>;
  vegetation: VisualClaim<string[]>;
  visibleComponents: VisualClaim<string[]>;
  apparentMaterials: VisualClaim<string[]>;
  structure: VisualClaim<string>;
  foundation: VisualClaim<string>;
  floor: VisualClaim<string>;
  walls: VisualClaim<string>;
  roof: VisualClaim<string>;
  openings: VisualClaim<string[]>;
  externalAreas: VisualClaim<string[]>;
  paths: VisualClaim<string[]>;
  drainage: VisualClaim<string>;
  spatialRelations: VisualClaim<string[]>;
  naturalElements: VisualClaim<string[]>;
  preservationElements: VisualClaim<string[]>;
  apparentCompletion: VisualClaim<number>;
}

export interface NormalizedVisualAnalysis {
  schemaVersion: '1.0.0';
  providerId: string;
  summary: string;
  claims: VisualClaims;
  uncertainties: string[];
  technicalUnknowns: string[];
}

export class VisualSchemaValidationError extends Error {
  readonly issues: string[];
  constructor(issues: string[]);
}

export const VISUAL_SCHEMA_VERSION: '1.0.0';
export const VISUAL_CLASSIFICATIONS: readonly VisualClassification[];
export const VISUAL_CLAIM_FIELDS: readonly (keyof VisualClaims)[];
export const ALLOWED_IMAGE_MIME_TYPES: readonly ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_BYTES: number;
export function validateAndNormalizeVisualAnalysis(raw: unknown, providerId: string): NormalizedVisualAnalysis;
export function validateImageMetadata(mimeType: string, size: number): void;
