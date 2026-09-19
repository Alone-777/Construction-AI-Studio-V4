export const FISCAL_VISUAL_SCHEMA_VERSION = '1.0.0';
export const FISCAL_VISUAL_CONTRACT = 'construction-fiscal-v1';
export const FISCAL_CONTINUITY_VALUES = Object.freeze([
  'MATCH', 'MINOR_DIVERGENCE', 'MAJOR_DIVERGENCE', 'UNKNOWN',
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim().slice(0, 1200) : '';
}

function normalizeBaseClaim(raw, field, issues) {
  if (!isRecord(raw)) {
    issues.push(field + ' deve ser um claim estruturado.');
    return { classification: 'UNKNOWN', confidence: 0, evidence: 'Não informado.' };
  }
  const classification = ['FACT', 'HYPOTHESIS', 'UNKNOWN'].includes(raw.classification)
    ? raw.classification : 'UNKNOWN';
  if (!['FACT', 'HYPOTHESIS', 'UNKNOWN'].includes(raw.classification)) {
    issues.push(field + '.classification inválida.');
  }
  const confidence = Number(raw.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    issues.push(field + '.confidence deve estar entre 0 e 1.');
  }
  const evidence = cleanString(raw.evidence);
  if (classification !== 'UNKNOWN' && !evidence) {
    issues.push(field + '.evidence é obrigatório.');
  }
  return {
    classification,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    evidence: evidence || 'Não verificável visualmente.',
  };
}

function normalizeCompletion(raw, issues) {
  const base = normalizeBaseClaim(raw, 'apparentCompletion', issues);
  if (base.classification === 'UNKNOWN') return { ...base, value: null };
  const value = Number(raw?.value);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    issues.push('apparentCompletion.value deve estar entre 0 e 100.');
    return { ...base, value: null };
  }
  return { ...base, value };
}

function normalizeStringArrayClaim(raw, field, issues) {
  const base = normalizeBaseClaim(raw, field, issues);
  if (base.classification === 'UNKNOWN') return { ...base, value: null };
  if (!Array.isArray(raw?.value) || raw.value.some(item => typeof item !== 'string')) {
    issues.push(field + '.value deve ser uma lista de textos.');
    return { ...base, value: [] };
  }
  const value = [...new Set(raw.value.map(cleanString).filter(Boolean))].slice(0, 50);
  return { ...base, value };
}

function normalizeContinuityClaim(raw, field, issues) {
  const base = normalizeBaseClaim(raw, field, issues);
  if (base.classification === 'UNKNOWN') return { ...base, value: null };
  if (!FISCAL_CONTINUITY_VALUES.includes(raw?.value) || raw.value === 'UNKNOWN') {
    issues.push(field + '.value deve ser MATCH, MINOR_DIVERGENCE ou MAJOR_DIVERGENCE.');
    return { ...base, value: null };
  }
  return { ...base, value: raw.value };
}

export class FiscalVisualSchemaValidationError extends Error {
  constructor(issues) {
    super('Análise fiscal visual inválida: ' + issues.join(' | '));
    this.name = 'FiscalVisualSchemaValidationError';
    this.issues = [...issues];
  }
}

export function validateAndNormalizeFiscalVisualAnalysis(raw, providerId) {
  const issues = [];
  if (!isRecord(raw)) throw new FiscalVisualSchemaValidationError(['Resposta não é um objeto JSON.']);
  const summary = cleanString(raw.summary);
  if (!summary) issues.push('summary é obrigatório.');

  const result = {
    schemaVersion: FISCAL_VISUAL_SCHEMA_VERSION,
    contract: FISCAL_VISUAL_CONTRACT,
    providerId: cleanString(providerId) || 'unknown-provider',
    summary,
    apparentCompletion: normalizeCompletion(raw.apparentCompletion, issues),
    visibleCanonicalFutureElements: normalizeStringArrayClaim(raw.visibleCanonicalFutureElements, 'visibleCanonicalFutureElements', issues),
    missingVisibleEvidence: normalizeStringArrayClaim(raw.missingVisibleEvidence, 'missingVisibleEvidence', issues),
    workerContinuity: normalizeContinuityClaim(raw.workerContinuity, 'workerContinuity', issues),
    environmentContinuity: normalizeContinuityClaim(raw.environmentContinuity, 'environmentContinuity', issues),
    geometryContinuity: normalizeContinuityClaim(raw.geometryContinuity, 'geometryContinuity', issues),
    sourceContinuity: normalizeContinuityClaim(raw.sourceContinuity, 'sourceContinuity', issues),
    uncertainties: Array.isArray(raw.uncertainties)
      ? raw.uncertainties.map(cleanString).filter(Boolean).slice(0, 50)
      : [],
  };

  if (issues.length) throw new FiscalVisualSchemaValidationError(issues);
  return result;
}
