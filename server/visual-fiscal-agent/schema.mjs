const CONTINUITY_VALUES = new Set([
  'MATCH',
  'MINOR_DIVERGENCE',
  'MAJOR_DIVERGENCE',
  'UNKNOWN',
]);

const CAUSALITY_VALUES = new Set(['VALID', 'QUESTIONABLE', 'INVALID', 'UNKNOWN']);
const FAILURE_CODE_RE = /^[A-Z0-9_]{2,64}$/;

export const VISUAL_FISCAL_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    observedStagePercentage: {
      anyOf: [
        { type: 'number', minimum: 0, maximum: 100 },
        { type: 'null' },
      ],
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    continuity: {
      type: 'object',
      additionalProperties: false,
      properties: {
        source: { type: 'string', enum: [...CONTINUITY_VALUES] },
        worker: { type: 'string', enum: [...CONTINUITY_VALUES] },
        environment: { type: 'string', enum: [...CONTINUITY_VALUES] },
        geometry: { type: 'string', enum: [...CONTINUITY_VALUES] },
      },
      required: ['source', 'worker', 'environment', 'geometry'],
    },
    futureElementsVisible: { type: 'array', items: { type: 'string' } },
    missingEvidence: { type: 'array', items: { type: 'string' } },
    terminalFrameValid: { anyOf: [{ type: 'boolean' }, { type: 'null' }] },
    physicalCausality: { type: 'string', enum: [...CAUSALITY_VALUES] },
    failures: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          code: { type: 'string' },
          message: { type: 'string' },
          correction: { type: 'string' },
        },
        required: ['code', 'message', 'correction'],
      },
    },
    uncertainties: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'summary',
    'observedStagePercentage',
    'confidence',
    'continuity',
    'futureElementsVisible',
    'missingEvidence',
    'terminalFrameValid',
    'physicalCausality',
    'failures',
    'uncertainties',
  ],
};

function cleanString(value, max = 1600) {
  return String(value ?? '').trim().slice(0, max);
}

function uniqueStrings(value, maxItems = 20, maxLength = 400) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => cleanString(item, maxLength)).filter(Boolean))]
    .slice(0, maxItems);
}

function continuityValue(value) {
  const normalized = String(value ?? '').trim().toUpperCase();
  return CONTINUITY_VALUES.has(normalized) ? normalized : 'UNKNOWN';
}

function normalizeFailures(value) {
  if (!Array.isArray(value)) return [];
  const normalized = [];
  for (const item of value.slice(0, 10)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const code = cleanString(item.code, 64).toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const message = cleanString(item.message, 1200);
    const correction = cleanString(item.correction, 1600);
    if (!FAILURE_CODE_RE.test(code) || !message || !correction) continue;
    normalized.push({ code, message, correction });
  }
  return normalized;
}

export class VisualFiscalSchemaError extends Error {
  constructor(message) {
    super(message);
    this.name = 'VisualFiscalSchemaError';
    this.code = 'INVALID_PROVIDER_RESPONSE';
  }
}

export function normalizeVisualFiscalAnalysis(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new VisualFiscalSchemaError('Visual fiscal response must be a JSON object.');
  }

  const observed = raw.observedStagePercentage;
  const observedStagePercentage = observed === null
    ? null
    : Number.isFinite(Number(observed))
      ? Math.max(0, Math.min(100, Number(observed)))
      : null;
  const confidence = Number(raw.confidence);
  const continuity = raw.continuity && typeof raw.continuity === 'object'
    ? raw.continuity
    : {};
  const physicalCausality = String(raw.physicalCausality ?? '').trim().toUpperCase();

  const normalized = {
    summary: cleanString(raw.summary, 2000),
    observedStagePercentage,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    continuity: {
      source: continuityValue(continuity.source),
      worker: continuityValue(continuity.worker),
      environment: continuityValue(continuity.environment),
      geometry: continuityValue(continuity.geometry),
    },
    futureElementsVisible: uniqueStrings(raw.futureElementsVisible),
    missingEvidence: uniqueStrings(raw.missingEvidence),
    terminalFrameValid: typeof raw.terminalFrameValid === 'boolean'
      ? raw.terminalFrameValid
      : null,
    physicalCausality: CAUSALITY_VALUES.has(physicalCausality)
      ? physicalCausality
      : 'UNKNOWN',
    failures: normalizeFailures(raw.failures),
    uncertainties: uniqueStrings(raw.uncertainties),
  };

  if (!normalized.summary) {
    throw new VisualFiscalSchemaError('Visual fiscal response is missing summary.');
  }
  return normalized;
}

export function parseVisualFiscalJson(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new VisualFiscalSchemaError('Visual fiscal provider returned no JSON text.');
  }
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    return normalizeVisualFiscalAnalysis(JSON.parse(cleaned));
  } catch (error) {
    if (error instanceof VisualFiscalSchemaError) throw error;
    throw new VisualFiscalSchemaError('Visual fiscal provider returned invalid JSON.');
  }
}
