export const VIDEO_STYLES = Object.freeze([
  'PHYSICAL_REALISM',
  'VIRAL_TIMELAPSE',
]);

const VIDEO_STYLE_SET = new Set(VIDEO_STYLES);

function compact(value, maxChars) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  const chars = Array.from(text);
  if (chars.length <= maxChars) return text;
  const sliced = chars.slice(0, Math.max(1, maxChars - 1)).join('');
  const clean = sliced.replace(/\s+\S*$/, '').trimEnd();
  return (clean || sliced.trimEnd()) + '…';
}

function compactList(values, maxItems = 5, itemChars = 42) {
  const items = [...new Set((Array.isArray(values) ? values : [])
    .map((value) => compact(value, itemChars))
    .filter(Boolean))];
  const shown = items.slice(0, maxItems);
  const extra = items.length - shown.length;
  return shown.join(', ') + (extra > 0 ? ' +' + extra + ' more' : '');
}

export function normalizeVideoStyle(value, fallback = 'PHYSICAL_REALISM') {
  const normalized = String(value || '').trim().toUpperCase();
  if (VIDEO_STYLE_SET.has(normalized)) return normalized;
  return VIDEO_STYLE_SET.has(fallback) ? fallback : 'PHYSICAL_REALISM';
}

export function isViralTimelapseStyle(value) {
  return normalizeVideoStyle(value) === 'VIRAL_TIMELAPSE';
}

function operationGuidance(operationType, operationName, physicalAction) {
  const key = String(operationType || '').trim().toLowerCase();
  const fallback = compact(
    physicalAction || ('Complete the visible construction milestone: ' + operationName),
    260,
  );
  const table = {
    marcacao:
      'Rapidly establish the full visible building footprint. Stakes and guide lines may appear progressively through fast worker activity; finish with a clear readable layout.',
    limpeza:
      'Rapidly clear only the intended building footprint. Vegetation, brush and loose obstacles recede progressively while the surrounding site remains recognizable.',
    fundacao:
      'Rapidly progress from prepared ground to a clearly established foundation/support state. Excavation, footings or supports should appear in a readable construction sequence.',
    apoios:
      'Rapidly establish the structural supports in their final visible locations while the site and alignment remain coherent.',
    base:
      'Rapidly assemble the base and floor system so the footprint becomes a strong readable platform by the end of the clip.',
    pilares:
      'Rapidly raise the main vertical structure. Posts or columns appear progressively in coherent positions and remain aligned with the existing base.',
    paredes:
      'Rapidly close the wall structure around the existing frame while preserving coherent openings and the established building footprint.',
    vigas:
      'Rapidly assemble the roof framing or upper structural beams from the existing supports to a clearly complete structural skeleton.',
    cobertura:
      'Rapidly spread and secure the roof covering across the existing roof structure until the building reads as weather-protected.',
    acesso:
      'Rapidly install the main access and visible finishing elements for this stage, ending on a clean readable exterior state.',
    acabamento:
      'Rapidly apply the current visible finish across the prepared surfaces, ending on a coherent completed finish for this stage.',
    escavacao:
      'Rapidly transform the marked area through visible excavation, ending with a clearly readable excavated volume.',
    contencao:
      'Rapidly build the visible containment or retaining structure in progressive sections until the intended shape is clearly established.',
    plataforma:
      'Rapidly assemble the platform structure from supports to a clearly usable completed platform.',
    tabuleiro:
      'Rapidly fill the structural span with the deck or walking surface until the current operation reads as complete.',
    guarda_corpo:
      'Rapidly install the visible guard structure around the completed edge, keeping the underlying platform unchanged.',
    travamento:
      'Rapidly add the structural bracing and locking members until the frame visibly reads as stable and complete for this stage.',
  };
  return table[key] || fallback;
}

function terminalGuidance(operationType, operationName) {
  const key = String(operationType || '').trim().toLowerCase();
  const table = {
    marcacao: 'the full footprint is clearly marked and readable',
    limpeza: 'the intended footprint is visibly cleared while the surrounding site remains recognizable',
    fundacao: 'the foundation/support system is clearly established',
    apoios: 'the structural supports are clearly established and aligned',
    base: 'the base and floor platform are clearly established',
    pilares: 'the primary vertical structure is clearly standing',
    paredes: 'the wall stage is clearly established with coherent openings',
    vigas: 'the roof/upper structural frame is clearly established',
    cobertura: 'the roof covering is visibly complete for this stage',
    acesso: 'the main access is visibly installed and the exterior state reads as finished for this stage',
    acabamento: 'the current finish is visibly complete and coherent',
    escavacao: 'the intended excavated volume is clearly readable',
    contencao: 'the containment structure is clearly established',
    plataforma: 'the platform is visibly complete for this stage',
    tabuleiro: 'the deck or walking surface is visibly complete',
    guarda_corpo: 'the guard structure is visibly complete',
    travamento: 'the structural bracing is visibly complete',
  };
  return table[key] || (String(operationName || 'the current milestone') + ' is visibly complete');
}

export function buildViralExecutionRecipe({
  operationType,
  operationName,
  physicalAction,
} = {}) {
  const guidance = operationGuidance(operationType, operationName, physicalAction);
  const terminal = terminalGuidance(operationType, operationName);
  return {
    schema: 'construction-manual-execution-recipe/1',
    operationType: String(operationType || '').trim() || null,
    operationName: String(operationName || '').trim() || null,
    tools: ['construction tools'],
    actorAction:
      'Workers perform fast purposeful construction timelapse activity that visibly advances the current milestone.',
    actionSequence: [
      guidance,
      'Keep visible progress moving throughout the clip instead of spending the full shot on one tiny hand-level action.',
      'End only after the current milestone is visually clear and stable enough to become the next source frame.',
    ],
    visibleTransformation:
      'The scene should show a strong macro construction transformation from the current source state to the completed current milestone.',
    terminalEvidence:
      'END STATE: ' + terminal + '; the frame is stable, readable and significantly more advanced than the source.',
    forbidden:
      'Do not redesign the project, regress completed work, relocate the site, or begin an unrelated later construction stage.',
    physicalActionIRProjection: {
      primaryAction: {
        type: 'OTHER',
        verb: 'accelerate',
        description: compact(physicalAction || guidance, 240),
      },
      target: {
        id: String(operationType || 'current-operation'),
        label: String(operationName || 'current construction milestone'),
        elements: [],
      },
      tools: ['construction tools'],
      expectedEffects: {
        constructionProgress: { before: 0, after: 100 },
        visibleTransformation:
          'Strong macro construction progress with stable site and building identity.',
      },
      evidence: ['END STATE: ' + terminal + '.'],
    },
  };
}

export function compileViralTimelapsePrompt({
  operationType,
  operationName,
  physicalAction,
  environment,
  completedOperations = [],
  forbiddenFutureElements = [],
  retryCorrections = [],
  durationSeconds = 15,
  aspectRatio = '16:9',
  model = 'KLING_3_0',
  maxChars = 1800,
} = {}) {
  const completed = compactList(completedOperations, 5, 36);
  const future = compactList(forbiddenFutureElements, 5, 40);
  const guidance = operationGuidance(operationType, operationName, physicalAction);
  const terminal = terminalGuidance(operationType, operationName);
  const fixes = (Array.isArray(retryCorrections) ? retryCorrections : [])
    .map((item) => ({
      code: compact(item?.code, 48),
      correction: compact(item?.correction, 180),
    }))
    .filter((item) => item.code && item.correction)
    .slice(0, 8);

  const parts = [
    '[ADOBE FIREFLY VIRAL TIMELAPSE] ' + durationSeconds + 's ' + aspectRatio + ' ' +
      model + ' image-to-video. Source frame is temporal truth.',
    'Create a fast, satisfying accelerated construction timelapse.',
    'Operation: ' + compact(operationName, 100) + '.',
    'MACRO TRANSFORMATION: ' + compact(guidance, 340),
    'Show rapid purposeful worker activity and obvious visible progress every few seconds. Prefer a readable sequence of major construction changes over slow hand-level realism.',
    'Preserve the camera viewpoint, site, terrain, building footprint, scale, major design and all completed structural work.',
    'Minor continuity drift in loose tools, debris, temporary materials or background workers is acceptable if the main construction identity stays coherent.',
    'Avoid obvious full-building popping, total-scene teleportation, project redesign, regression of completed work, or a camera jump.',
    completed ? 'Completed work stays recognizable: ' + completed + '.' : '',
    future ? 'Do not begin unrelated later stages: ' + future + '.' : '',
    environment ? 'Environment identity: ' + compact(environment, 70) + '.' : '',
    'END STATE: ' + compact(terminal, 220) +
      '. Hold a stable, clean, clearly more advanced final frame for the next Job source.',
    fixes.length
      ? 'RETRY FIXES: ' + fixes.map((item) => item.code + ': ' + item.correction).join(' | ')
      : '',
  ].filter(Boolean);

  let prompt = parts.join(' ');
  if (Array.from(prompt).length > maxChars) {
    prompt = [
      '[ADOBE FIREFLY VIRAL TIMELAPSE] ' + durationSeconds + 's ' + aspectRatio + ' ' +
        model + '. Source frame is temporal truth.',
      'Fast satisfying construction timelapse. Operation: ' + compact(operationName, 80) + '.',
      'MACRO TRANSFORMATION: ' + compact(guidance, 260),
      'Rapid purposeful workers; show obvious visible progress throughout the clip.',
      'Preserve camera, site, footprint, scale, major design and completed structure.',
      'Minor drift in loose tools, debris and background workers is acceptable.',
      'No full-building pop, total-scene teleport, redesign, regression or camera jump.',
      future ? 'No later stages: ' + compactList(forbiddenFutureElements, 4, 28) + '.' : '',
      'END STATE: ' + compact(terminal, 160) + '. Stable final frame for next Job.',
      fixes.length
        ? 'RETRY FIXES: ' + fixes.map((item) => item.code + ': ' + compact(item.correction, 120)).join(' | ')
        : '',
    ].filter(Boolean).join(' ');
  }

  if (Array.from(prompt).length > maxChars) {
    throw new Error(
      'Unable to compile viral timelapse prompt within ' + maxChars + ' characters.',
    );
  }

  return {
    prompt,
    characterCount: Array.from(prompt).length,
    maxChars,
    productionMode: 'VIRAL_TIMELAPSE',
  };
}
