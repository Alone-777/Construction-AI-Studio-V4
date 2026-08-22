import { VISUAL_CLASSIFICATIONS } from '../shared/visual-schema.mjs';

export function visualDiagnosticsEnabled(env = process.env) {
  return String(env.VISUAL_DIAGNOSTICS || '').toLowerCase() === 'true';
}

export function createSafeVisualDiagnostic(input) {
  const claims = input.analysis?.claims && typeof input.analysis.claims === 'object'
    ? Object.values(input.analysis.claims)
    : [];
  const count = classification => claims.filter(claim => claim?.classification === classification).length;
  return {
    provider: String(input.provider || 'unknown').slice(0, 100),
    model: String(input.model || 'not-reported').slice(0, 200),
    durationMs: Math.max(0, Math.round(Number(input.durationMs) || 0)),
    internalHttpStatus: Number(input.internalHttpStatus) || 0,
    totalClaims: claims.length,
    factClaims: count(VISUAL_CLASSIFICATIONS[0]),
    hypothesisClaims: count(VISUAL_CLASSIFICATIONS[1]),
    unknownClaims: count(VISUAL_CLASSIFICATIONS[2]),
    schemaValidation: input.analysis ? 'valid' : input.schemaValidation || 'not-run',
    parsingErrors: input.errorCode === 'INVALID_PROVIDER_RESPONSE' ? 1 : 0,
    normalizationErrors: input.errorCode === 'SCHEMA_INCOMPATIBLE' ? 1 : 0,
    errorCode: input.errorCode ? String(input.errorCode).slice(0, 100) : undefined,
  };
}

export function recordSafeVisualDiagnostic(input, options = {}) {
  const enabled = options.enabled ?? visualDiagnosticsEnabled(options.env);
  if (!enabled) return undefined;
  const diagnostic = createSafeVisualDiagnostic(input);
  const logger = options.logger ?? console.info;
  logger(`[visual-diagnostic] ${JSON.stringify(diagnostic)}`);
  return diagnostic;
}

