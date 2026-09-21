export const MANUAL_EXECUTION_RECIPE_SCHEMA = 'construction-manual-execution-recipe/1';
export const MANUAL_KLING_PROMPT_MAX_CHARS = 1400;

function compact(value, maxChars) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  const chars = Array.from(text);
  if (chars.length <= maxChars) return text;
  const sliced = chars.slice(0, Math.max(1, maxChars - 1)).join('');
  const clean = sliced.replace(/\s+\S*$/, '').trimEnd();
  return (clean || sliced.trimEnd()) + '…';
}

function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
}

function compactList(values, maxItems = 6, itemChars = 42) {
  const rows = unique(values)
    .map(value => compact(value, itemChars))
    .filter(Boolean);
  if (!rows.length) return '';
  const shown = rows.slice(0, maxItems);
  const extra = rows.length - shown.length;
  return shown.join(', ') + (extra > 0 ? ' +' + extra + ' more' : '');
}

function count(value) {
  return Array.from(String(value ?? '')).length;
}

const RECIPES = {
  preparacao: {
    actionType: 'REMOVE',
    verb: 'clear',
    targetLabel: 'bounded site-preparation patch',
    tools: ['shovel'],
    actorAction:
      'Worker grips the existing shovel with both hands and works one bounded section of the site.',
    actionSequence: [
      'Push the shovel blade into shallow topsoil.',
      'Scrape and cut surface grass, roots and loose vegetation.',
      'Lift small amounts of loosened soil and organic debris with the shovel.',
      'Place removed material immediately beside the cleared patch so removal remains physically traceable.',
      'Repeat visible shovel strokes on the same bounded patch; each stroke must enlarge the prepared area.',
    ],
    visibleTransformation:
      'Surface vegetation is progressively replaced by one contiguous patch of exposed, disturbed brown soil; the change persists after every shovel stroke.',
    forbidden:
      'Do not dig foundation trenches, place foundation material, grade the whole site, or start any later construction operation.',
  },
  fundacao: {
    actionType: 'EXCAVATE',
    verb: 'excavate',
    targetLabel: 'current foundation point or trench section',
    tools: ['shovel', 'hand tamper'],
    actorAction:
      'Worker uses the shovel to excavate only the active foundation section and handles removed soil visibly.',
    actionSequence: [
      'Drive the shovel into the marked foundation section.',
      'Lift soil out in repeated visible loads and place spoil beside the excavation.',
      'Shape the excavation edges gradually instead of making a trench appear instantly.',
      'Use the hand tamper only after enough soil has been visibly removed from that same section.',
    ],
    visibleTransformation:
      'One bounded excavation becomes visibly deeper/clearer while spoil accumulates consistently beside it.',
    forbidden:
      'Do not create floor framing, pillars, walls or other later components.',
  },
  base: {
    actionType: 'ASSEMBLE',
    verb: 'assemble',
    targetLabel: 'current base and floor section',
    tools: ['mallet', 'hammer'],
    actorAction:
      'Worker carries, aligns and fixes only the current base/floor pieces by hand with visible tool contact.',
    actionSequence: [
      'Carry one visible piece from the material supply to the active section.',
      'Place and align it against the existing structure.',
      'Strike or fasten it visibly with the mallet/hammer.',
      'Repeat only within the bounded section until the target fraction is reached.',
    ],
    visibleTransformation:
      'The bounded base/floor section grows piece by piece; every new piece remains visible and attached.',
    forbidden:
      'Do not erect pillars, walls or roof elements early.',
  },
  pilares: {
    actionType: 'INSTALL',
    verb: 'raise',
    targetLabel: 'current pillar set',
    tools: ['level', 'hammer'],
    actorAction:
      'Worker physically lifts one pillar at a time, positions it, checks plumb and fixes it before moving to the next.',
    actionSequence: [
      'Carry/lift one pillar from its visible source.',
      'Set its base in the prepared position.',
      'Hold and align it vertically.',
      'Check alignment with the level and fasten it visibly.',
    ],
    visibleTransformation:
      'Pillars appear only by continuous lifting, positioning and fastening; installed pillars remain fixed.',
    forbidden:
      'Do not add walls or roof framing before their later operations.',
  },
  paredes: {
    actionType: 'ASSEMBLE',
    verb: 'close',
    targetLabel: 'current wall section',
    tools: ['hammer'],
    actorAction:
      'Worker carries and fixes wall pieces sequentially onto the existing structure.',
    actionSequence: [
      'Carry one wall board/panel from the visible material source.',
      'Position it against the existing frame.',
      'Align and fasten it with visible hammer/tool contact.',
      'Continue only along the bounded wall section.',
    ],
    visibleTransformation:
      'The wall closes progressively board/panel by board/panel, with completed portions remaining fixed.',
    forbidden:
      'Do not build roof covering or later access elements.',
  },
  vigas: {
    actionType: 'ASSEMBLE',
    verb: 'fit',
    targetLabel: 'current roof-structure beam section',
    tools: ['hand saw', 'hammer'],
    actorAction:
      'Worker measures/carries a beam, positions it on the existing supports and fixes it visibly.',
    actionSequence: [
      'Handle one visible beam at a time.',
      'Measure or trim only if required, with visible tool use.',
      'Lift the beam onto the existing supports.',
      'Align and fasten it before handling the next beam.',
    ],
    visibleTransformation:
      'Roof structure grows beam by beam with no floating or instantly appearing members.',
    forbidden:
      'Do not apply roof covering before the roof-structure operation is complete.',
  },
  cobertura: {
    actionType: 'INSTALL',
    verb: 'cover',
    targetLabel: 'current roof-covering section',
    tools: ['hammer'],
    actorAction:
      'Worker carries one covering unit at a time onto the existing roof structure and fixes it visibly.',
    actionSequence: [
      'Take one visible covering unit from the material source.',
      'Place it onto the prepared roof structure.',
      'Align overlap/position.',
      'Fasten it visibly and repeat only in the bounded section.',
    ],
    visibleTransformation:
      'Roof covering expands progressively across the existing roof structure while unfinished sections remain exposed.',
    forbidden:
      'Do not install later access/finish elements prematurely.',
  },
  acesso: {
    actionType: 'INSTALL',
    verb: 'install',
    targetLabel: 'main access element',
    tools: ['level', 'hammer'],
    actorAction:
      'Worker carries, aligns, fits and tests the access element with visible hand/tool contact.',
    actionSequence: [
      'Bring the access element from its visible source.',
      'Position it in the prepared opening/attachment point.',
      'Align it with the level.',
      'Fasten it visibly and test movement/fit without modifying unrelated construction.',
    ],
    visibleTransformation:
      'The access element moves from loose material to visibly aligned and fixed installation.',
    forbidden:
      'Do not invent additional finishes or unrelated components.',
  },
  apoios: {
    actionType: 'EXCAVATE',
    verb: 'prepare',
    targetLabel: 'current structural support',
    tools: ['shovel', 'hand tamper'],
    actorAction:
      'Worker excavates and consolidates one support location at a time with visible shovel/tamper use.',
    actionSequence: [
      'Excavate the marked support location with repeated shovel loads.',
      'Place removed soil beside the hole.',
      'Shape and compact only that support location.',
    ],
    visibleTransformation:
      'One support location becomes visibly prepared while the remaining support locations stay unfinished.',
    forbidden:
      'Do not install longitudinal beams before supports are ready.',
  },
  tabuleiro: {
    actionType: 'ASSEMBLE',
    verb: 'assemble',
    targetLabel: 'current deck module section',
    tools: ['hammer'],
    actorAction:
      'Worker carries, positions and fixes deck modules sequentially onto the completed beams.',
    actionSequence: [
      'Carry one module from the visible supply.',
      'Position it on the beams.',
      'Align and fasten it visibly.',
    ],
    visibleTransformation:
      'The deck surface grows module by module with unfinished beam area still visible.',
    forbidden:
      'Do not install guard rails early.',
  },
  guarda_corpo: {
    actionType: 'INSTALL',
    verb: 'install',
    targetLabel: 'current guard-rail section',
    tools: ['hammer', 'level'],
    actorAction:
      'Worker positions posts and rails sequentially and visibly fastens each piece.',
    actionSequence: [
      'Carry one post/rail from the visible supply.',
      'Position and align it.',
      'Fasten it visibly before adding the next member.',
    ],
    visibleTransformation:
      'The guard rail grows one fixed member at a time along the completed deck.',
    forbidden:
      'Do not alter completed deck/support geometry.',
  },
  escavacao: {
    actionType: 'EXCAVATE',
    verb: 'excavate',
    targetLabel: 'current excavation sector',
    tools: ['shovel'],
    actorAction:
      'Worker repeatedly excavates the bounded sector with the shovel and places removed soil in a visible spoil area.',
    actionSequence: [
      'Drive shovel into the active sector.',
      'Lift soil in visible loads.',
      'Deposit each load in the same spoil area.',
      'Deepen/expand only the bounded sector.',
    ],
    visibleTransformation:
      'The active sector visibly loses soil while a consistent spoil pile grows nearby.',
    forbidden:
      'Do not regularize the base or build containment early.',
  },
  contencao: {
    actionType: 'ASSEMBLE',
    verb: 'build',
    targetLabel: 'current containment section',
    tools: ['mallet'],
    actorAction:
      'Worker carries and seats containment material one unit at a time with visible hand/tool contact.',
    actionSequence: [
      'Carry one containment unit/material load from the visible supply.',
      'Place it against the prepared edge.',
      'Align/seat it with the mallet and continue only in the bounded section.',
    ],
    visibleTransformation:
      'Containment grows sequentially along the prepared edge; completed units remain fixed.',
    forbidden:
      'Do not apply final finish before containment is ready.',
  },
  acabamento: {
    actionType: 'APPLY',
    verb: 'apply',
    targetLabel: 'current finish section',
    tools: ['trowel'],
    actorAction:
      'Worker takes finish material from a visible source and spreads it with the trowel over one bounded section.',
    actionSequence: [
      'Load the trowel from the visible material source.',
      'Spread material over the active section with repeated strokes.',
      'Smooth only the applied portion and stop at the target.',
    ],
    visibleTransformation:
      'Finished surface grows visibly stroke by stroke while the remaining surface stays unfinished.',
    forbidden:
      'Do not modify unrelated construction.',
  },
  travamento: {
    actionType: 'FASTEN',
    verb: 'brace',
    targetLabel: 'current bracing section',
    tools: ['hammer'],
    actorAction:
      'Worker carries, positions and fastens one brace at a time between existing structural members.',
    actionSequence: [
      'Carry one brace from the visible supply.',
      'Position it between existing members.',
      'Align and fasten it visibly.',
    ],
    visibleTransformation:
      'Bracing appears only through continuous placement and fastening, one member at a time.',
    forbidden:
      'Do not install the upper platform early.',
  },
  plataforma: {
    actionType: 'ASSEMBLE',
    verb: 'assemble',
    targetLabel: 'upper platform section',
    tools: ['hammer'],
    actorAction:
      'Worker carries, aligns and fastens upper-platform pieces sequentially onto the completed structure.',
    actionSequence: [
      'Carry one platform piece from the visible supply.',
      'Position it on the existing supports.',
      'Align and fasten it visibly.',
    ],
    visibleTransformation:
      'Upper platform grows piece by piece while unfinished areas remain open.',
    forbidden:
      'Do not install access before the platform operation permits it.',
  },
};

export function buildManualExecutionRecipe({
  operationType,
  operationName,
  physicalAction,
  startStagePercentage,
  targetStagePercentage,
} = {}) {
  const key = String(operationType || '').trim();
  const template = RECIPES[key] ?? {
    actionType: 'OTHER',
    verb: 'execute',
    targetLabel: String(operationName || key || 'current work area'),
    tools: ['appropriate hand tool'],
    actorAction:
      'Worker visibly handles the required tool and performs the physical operation continuously in one bounded work area.',
    actionSequence: [
      compact(physicalAction || 'Perform only the current physical action.', 180),
      'Every visible worker/tool movement must cause a persistent physical change in the same bounded work area.',
    ],
    visibleTransformation:
      'The target changes progressively and persistently on screen; worker motion without a visible physical result is not sufficient.',
    forbidden:
      'Do not begin any future operation.',
  };

  const start = Number.isFinite(Number(startStagePercentage))
    ? Number(startStagePercentage)
    : null;
  const target = Number.isFinite(Number(targetStagePercentage))
    ? Number(targetStagePercentage)
    : null;
  const terminalEvidence = start !== null && target !== null
    ? 'Final frame must visibly prove cumulative progress from ' + start + '% to about ' + target +
      '% for this operation. The changed area/component must remain visible and the remaining work must stay clearly unfinished.'
    : 'Final frame must visibly prove the requested partial physical result and leave later work unfinished.';

  return {
    schema: MANUAL_EXECUTION_RECIPE_SCHEMA,
    operationType: key || null,
    operationName: String(operationName || '').trim() || null,
    tools: [...template.tools],
    actorAction: template.actorAction,
    actionSequence: [...template.actionSequence],
    visibleTransformation: template.visibleTransformation,
    terminalEvidence,
    forbidden: template.forbidden,
    physicalActionIRProjection: {
      primaryAction: {
        type: template.actionType,
        verb: template.verb,
        description: compact(physicalAction || template.actorAction, 220),
      },
      target: {
        id: key || 'current-operation',
        label: template.targetLabel,
        elements: [],
      },
      tools: [...template.tools],
      expectedEffects: {
        constructionProgress: {
          before: start,
          after: target,
        },
        visibleTransformation: template.visibleTransformation,
      },
      evidence: [terminalEvidence],
    },
  };
}

export function validateManualExecutionRecipe(recipe) {
  const errors = [];
  if (!recipe || typeof recipe !== 'object') {
    return { ok: false, errors: ['EXECUTION_RECIPE_MISSING'] };
  }
  if (recipe.schema !== MANUAL_EXECUTION_RECIPE_SCHEMA) {
    errors.push('EXECUTION_RECIPE_SCHEMA_INVALID');
  }
  if (!Array.isArray(recipe.tools) || !recipe.tools.some(item => String(item || '').trim())) {
    errors.push('EXECUTION_TOOL_MISSING');
  }
  if (!String(recipe.actorAction || '').trim()) errors.push('EXECUTION_ACTOR_ACTION_MISSING');
  if (!Array.isArray(recipe.actionSequence) || recipe.actionSequence.length < 2) {
    errors.push('EXECUTION_SEQUENCE_TOO_THIN');
  }
  if (!String(recipe.visibleTransformation || '').trim()) {
    errors.push('EXECUTION_VISIBLE_TRANSFORMATION_MISSING');
  }
  if (!String(recipe.terminalEvidence || '').trim()) {
    errors.push('EXECUTION_TERMINAL_EVIDENCE_MISSING');
  }
  return { ok: errors.length === 0, errors };
}

export function renderExecutionDirective(recipe, maxChars = 650) {
  const validation = validateManualExecutionRecipe(recipe);
  if (!validation.ok) {
    throw new Error('Invalid manual execution recipe: ' + validation.errors.join(', '));
  }

  const sequence = recipe.actionSequence
    .slice(0, 5)
    .map((step, index) => String(index + 1) + ') ' + compact(step, 120))
    .join(' ');

  const text = [
    'PHYSICAL EXECUTION:',
    compact(recipe.actorAction, 170),
    sequence,
    'VISIBLE CHANGE:',
    compact(recipe.visibleTransformation, 180),
    'END EVIDENCE:',
    compact(recipe.terminalEvidence, 180),
  ].join(' ');

  return compact(text, maxChars);
}

export function compileManualKlingPrompt({
  operationName,
  physicalAction,
  executionRecipe,
  startStagePercentage,
  targetStagePercentage,
  durationSeconds = 15,
  aspectRatio = '16:9',
  model = 'KLING_3_0',
  environment,
  completedOperations = [],
  forbiddenFutureElements = [],
  maxChars = MANUAL_KLING_PROMPT_MAX_CHARS,
} = {}) {
  const validation = validateManualExecutionRecipe(executionRecipe);
  if (!validation.ok) {
    throw new Error('Cannot compile Kling prompt without physical execution detail: ' + validation.errors.join(', '));
  }

  const start = Number(startStagePercentage);
  const target = Number(targetStagePercentage);
  const incomplete = Number.isFinite(target) && target < 100;
  const future = compactList(forbiddenFutureElements, 6, 36);
  const completed = compactList(completedOperations, 4, 32);
  const tools = compactList(executionRecipe.tools, 4, 28);

  const parts = [
    '[ANIMATION JOB] ' + durationSeconds + 's ' + aspectRatio + ' ' + model +
      ' image-to-video. Source frame is temporal truth.',
    'Operation: ' + compact(operationName, 90) + '.',
    'Worker must physically execute this on screen using ' + tools + '.',
    renderExecutionDirective(executionRecipe, 610),
    Number.isFinite(start) && Number.isFinite(target)
      ? 'Advance only ' + start + '%→' + target + '%. Final frame must be exactly ' + target +
        '%' + (incomplete ? ' and visibly incomplete.' : '.')
      : 'Advance only the explicit Job target.',
    'Preserve camera, terrain/vegetation, worker identity/clothing and all unchanged objects.',
    'No pantomime: worker/tool movement without persistent physical change is a failure.',
    'No magic, morphing, teleportation, hidden progress, disappearing work, camera jump or unexplained material movement.',
  ];

  if (completed) parts.push('Completed work stays unchanged: ' + completed + '.');
  if (future) parts.push('Do not start future elements: ' + future + '.');
  if (environment) parts.push('Environment identity: ' + compact(environment, 50) + '.');
  parts.push('Stop at target. Final frame stable for next Job.');

  let prompt = parts.join(' ');
  if (count(prompt) > maxChars) {
    const tighter = [
      '[ANIMATION JOB] ' + durationSeconds + 's ' + aspectRatio + ' ' + model +
        '. Source frame is temporal truth.',
      'Operation: ' + compact(operationName, 72) + '.',
      'Worker must physically execute this on screen using ' + tools + '.',
      compact(executionRecipe.actorAction, 145),
      'STEPS: ' + executionRecipe.actionSequence.slice(0, 4)
        .map(step => compact(step, 90)).join(' Then '),
      'VISIBLE CHANGE: ' + compact(executionRecipe.visibleTransformation, 155),
      'END EVIDENCE: ' + compact(executionRecipe.terminalEvidence, 150),
      Number.isFinite(start) && Number.isFinite(target)
        ? 'Advance only ' + start + '%→' + target + '%. End exactly ' + target +
          '%' + (incomplete ? ', visibly incomplete.' : '.')
        : 'Advance only current target.',
      'No pantomime, magic, morphing, teleportation, hidden progress or camera jump.',
      future ? 'No future: ' + compactList(forbiddenFutureElements, 4, 28) + '.' : '',
      'Preserve camera, terrain, worker identity. Final frame stable.',
    ].filter(Boolean);
    prompt = tighter.join(' ');
  }

  if (count(prompt) > maxChars) {
    throw new Error(
      'Unable to compile physical Kling prompt within ' + maxChars +
      ' characters without dropping execution evidence.',
    );
  }

  return {
    prompt,
    characterCount: count(prompt),
    maxChars,
    withinLimit: true,
  };
}
