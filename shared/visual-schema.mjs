export const VISUAL_SCHEMA_VERSION = '1.0.0';
export const VISUAL_CLASSIFICATIONS = Object.freeze(['FACT', 'HYPOTHESIS', 'UNKNOWN']);
export const ALLOWED_IMAGE_MIME_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export const VISUAL_CLAIM_FIELDS = Object.freeze([
  'constructionType', 'environment', 'terrain', 'watercourse', 'vegetation',
  'visibleComponents', 'apparentMaterials', 'structure', 'foundation', 'floor',
  'walls', 'roof', 'openings', 'externalAreas', 'paths', 'drainage',
  'spatialRelations', 'naturalElements', 'preservationElements', 'apparentCompletion',
]);

const ARRAY_CLAIM_FIELDS = new Set([
  'vegetation', 'visibleComponents', 'apparentMaterials', 'openings', 'externalAreas',
  'paths', 'spatialRelations', 'naturalElements', 'preservationElements',
]);

const FORBIDDEN_TECHNICAL_KEYS = /(^|_)(exact.*dimension|dimension.*exact|weight|resistance|capacity|depth|load|soil.*composition|structural.*capacity|bearing.*capacity|peso|resistencia|capacidade|profundidade|carga|composicao.*solo)($|_)/i;
const EXACT_MEASUREMENT = /\b\d+(?:[.,]\d+)?\s*(?:mm|cm|m|m²|m2|m3|kg|t|ton|kn|kpa|mpa|psi)\b/i;

export class VisualSchemaValidationError extends Error {
  constructor(issues) {
    super(`Análise visual inválida: ${issues.join(' | ')}`);
    this.name = 'VisualSchemaValidationError';
    this.issues = [...issues];
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertNoForbiddenTechnicalClaims(value, path, issues) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenTechnicalClaims(item, `${path}[${index}]`, issues));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_TECHNICAL_KEYS.test(key)) issues.push(`${path}.${key} contém propriedade técnica não visual.`);
    assertNoForbiddenTechnicalClaims(nested, `${path}.${key}`, issues);
  }
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim().slice(0, 1000) : '';
}

function cleanStringArray(value, field, issues) {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    issues.push(`${field}.value deve ser uma lista de textos.`);
    return [];
  }
  return [...new Set(value.map(cleanString).filter(Boolean))].slice(0, 50);
}

function normalizeClaim(rawClaim, field, issues) {
  if (!isRecord(rawClaim)) {
    issues.push(`${field} deve ser um claim estruturado.`);
    return { value: null, classification: 'UNKNOWN', confidence: 0, evidence: 'Não informado pelo provider.' };
  }
  const classification = VISUAL_CLASSIFICATIONS.includes(rawClaim.classification)
    ? rawClaim.classification
    : 'UNKNOWN';
  if (!VISUAL_CLASSIFICATIONS.includes(rawClaim.classification)) {
    issues.push(`${field}.classification deve ser FACT, HYPOTHESIS ou UNKNOWN.`);
  }
  const confidence = Number(rawClaim.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    issues.push(`${field}.confidence deve estar entre 0 e 1.`);
  }
  const evidence = cleanString(rawClaim.evidence);
  if (classification !== 'UNKNOWN' && !evidence) {
    issues.push(`${field}.evidence é obrigatório para ${classification}.`);
  }

  let value = rawClaim.value;
  if (classification === 'UNKNOWN') {
    value = null;
  } else if (field === 'apparentCompletion') {
    value = Number(value);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      issues.push(`${field}.value deve estar entre 0 e 100.`);
      value = null;
    }
  } else if (ARRAY_CLAIM_FIELDS.has(field)) {
    value = cleanStringArray(value, field, issues);
  } else {
    value = cleanString(value);
    if (!value) issues.push(`${field}.value deve ser texto não vazio.`);
  }

  const textValues = Array.isArray(value) ? value : [value, evidence];
  if (textValues.some(item => typeof item === 'string' && EXACT_MEASUREMENT.test(item))) {
    issues.push(`${field} contém medida técnica exata não verificável pela imagem.`);
  }

  return {
    value,
    classification,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    evidence: evidence || 'Não verificável visualmente.',
  };
}

export function validateAndNormalizeVisualAnalysis(raw, providerId) {
  const issues = [];
  if (!isRecord(raw)) throw new VisualSchemaValidationError(['Resposta do provider não é um objeto JSON.']);
  assertNoForbiddenTechnicalClaims(raw, 'analysis', issues);
  const summary = cleanString(raw.summary);
  if (!summary) issues.push('summary é obrigatório.');
  if (!isRecord(raw.claims)) issues.push('claims é obrigatório.');

  const claims = {};
  for (const field of VISUAL_CLAIM_FIELDS) {
    claims[field] = normalizeClaim(isRecord(raw.claims) ? raw.claims[field] : undefined, field, issues);
  }
  const uncertainties = Array.isArray(raw.uncertainties)
    ? raw.uncertainties.map(cleanString).filter(Boolean).slice(0, 50)
    : [];
  const technicalUnknowns = Array.isArray(raw.technicalUnknowns)
    ? raw.technicalUnknowns.map(cleanString).filter(Boolean).slice(0, 50)
    : [];

  if (issues.length > 0) throw new VisualSchemaValidationError(issues);
  return {
    schemaVersion: VISUAL_SCHEMA_VERSION,
    providerId: cleanString(providerId) || 'unknown-provider',
    summary,
    claims,
    uncertainties,
    technicalUnknowns: [...new Set([
      ...technicalUnknowns,
      'Dimensões exatas não verificadas visualmente.',
      'Capacidade, carga e resistência estrutural não verificadas visualmente.',
      'Profundidade e composição do solo não verificadas visualmente.',
    ])],
  };
}

export function validateImageMetadata(mimeType, size) {
  const issues = [];
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(mimeType)) {
    issues.push(`Tipo de imagem não permitido: ${mimeType || 'desconhecido'}.`);
  }
  if (!Number.isFinite(size) || size <= 0) issues.push('A imagem está vazia.');
  if (size > MAX_IMAGE_BYTES) issues.push(`A imagem excede o limite de ${MAX_IMAGE_BYTES} bytes.`);
  if (issues.length > 0) throw new VisualSchemaValidationError(issues);
}
