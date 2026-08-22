const stringClaim = {
  type: 'object',
  additionalProperties: false,
  properties: {
    value: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    classification: { type: 'string', enum: ['FACT', 'HYPOTHESIS', 'UNKNOWN'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    evidence: { type: 'string' },
  },
  required: ['value', 'classification', 'confidence', 'evidence'],
};

const arrayClaim = {
  ...stringClaim,
  properties: {
    ...stringClaim.properties,
    value: { anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }] },
  },
};

const completionClaim = {
  ...stringClaim,
  properties: {
    ...stringClaim.properties,
    value: { anyOf: [{ type: 'number', minimum: 0, maximum: 100 }, { type: 'null' }] },
  },
};

export const VISUAL_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    claims: {
      type: 'object',
      additionalProperties: false,
      properties: {
        constructionType: stringClaim,
        environment: stringClaim,
        terrain: stringClaim,
        watercourse: stringClaim,
        vegetation: arrayClaim,
        visibleComponents: arrayClaim,
        apparentMaterials: arrayClaim,
        structure: stringClaim,
        foundation: stringClaim,
        floor: stringClaim,
        walls: stringClaim,
        roof: stringClaim,
        openings: arrayClaim,
        externalAreas: arrayClaim,
        paths: arrayClaim,
        drainage: stringClaim,
        spatialRelations: arrayClaim,
        naturalElements: arrayClaim,
        preservationElements: arrayClaim,
        apparentCompletion: completionClaim,
      },
      required: [
        'constructionType', 'environment', 'terrain', 'watercourse', 'vegetation',
        'visibleComponents', 'apparentMaterials', 'structure', 'foundation', 'floor',
        'walls', 'roof', 'openings', 'externalAreas', 'paths', 'drainage',
        'spatialRelations', 'naturalElements', 'preservationElements', 'apparentCompletion',
      ],
    },
    uncertainties: { type: 'array', items: { type: 'string' } },
    technicalUnknowns: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'claims', 'uncertainties', 'technicalUnknowns'],
};

export const VISUAL_ANALYSIS_PROMPT = `You are the visual interpretation layer of Construction AI Studio V4.
Analyze only what the supplied construction image visually justifies. Return JSON matching the supplied schema.

Classification rules:
- FACT: directly visible in the pixels. Evidence must say what is visible and where.
- HYPOTHESIS: plausible interpretation but not directly confirmed. Evidence must explain why it is only an inference.
- UNKNOWN: cannot be verified visually. Set value to null, confidence to 0, and explain the limitation.

Never invent exact dimensions, weight, resistance, structural capacity, depth, load, soil composition, hidden foundations, hidden drainage, or other technical properties. A final image does not prove its construction sequence. Hidden or prerequisite work may only be HYPOTHESIS or UNKNOWN.

Identify when justified: probable construction type, environment, terrain, watercourse, vegetation, visible components, apparent materials, structure, visible foundation, floor, walls, roof, openings, external areas, paths, visible drainage, spatial relations, important natural elements, preservation elements, and apparent completion.

Write concise Brazilian Portuguese values and evidence. Do not wrap the JSON in Markdown.`;
