export const MANUAL_PHYSICAL_EXECUTION_PLAN_V2_SCHEMA =
  'construction-physical-execution-plan/2';
export const MANUAL_PROVIDER_NEUTRAL_PROMPT_V2_SCHEMA =
  'construction-provider-neutral-prompt/2';
export const ADOBE_FIREFLY_MANUAL_V2_PROMPT_MAX_CHARS = 1800;

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function clip(value, maxChars) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  const chars = Array.from(text);
  if (chars.length <= maxChars) return text;
  const sliced = chars.slice(0, Math.max(1, maxChars - 1)).join('');
  const clean = sliced.replace(/\s+\S*$/, '').trimEnd();
  return (clean || sliced.trimEnd()) + '…';
}

function count(value) {
  return Array.from(String(value ?? '')).length;
}

function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
}

function sourceRevision(job) {
  const source = job?.source ?? {};
  const token =
    source.keyframeId ??
    source.previousJobId ??
    job?.sourcePath ??
    job?.initialReferencePath ??
    job?.id ??
    'unknown';
  return 'manual-source:' + String(token);
}

function inferNodeKind(step) {
  const text = normalize(step);
  if (/inspect|check|verify|confer|medir|measure|test/.test(text)) return 'INSPECT';
  if (/fasten|fix|attach|prender|fixar|travar|amarrar|brace/.test(text)) return 'FASTEN';
  if (/cut|cortar|trim|serrar|saw/.test(text)) return 'CUT';
  if (/scrape|raspar|grass|roots|vegetation|vegetacao|grama|raizes/.test(text)) return 'SCRAPE';
  if (/dig|excavat|escav|drive.*soil|shovel.*soil|cavar/.test(text)) return 'DIG';
  if (/lift|elevar|erguer|levantar/.test(text)) return 'LIFT';
  if (/carry|bring|move|transport|carregar|levar|mover/.test(text)) return 'MOVE_MATERIAL';
  if (/place|deposit|set|assentar|depositar|colocar|encaixar/.test(text)) return 'PLACE';
  if (/position|align|posicionar|alinhar|aprumar/.test(text)) return 'POSITION';
  if (/compact|tamp|press|smooth|espalhar|spread|apply|aplicar/.test(text)) return 'APPLY_FORCE';
  return 'APPLY_FORCE';
}

function contactModeFor(kind) {
  if (kind === 'CUT') return 'CUT';
  if (kind === 'SCRAPE') return 'SCRAPE';
  if (kind === 'DIG') return 'DIG';
  if (kind === 'FASTEN') return 'FASTEN';
  if (kind === 'PLACE' || kind === 'POSITION' || kind === 'MOVE_MATERIAL') return 'PLACE';
  if (kind === 'LIFT') return 'GRIP';
  return 'PRESS';
}

function effectForOperation(job, recipe, nodeId) {
  const operationType = normalize(job?.operationType);
  const targetId =
    recipe?.physicalActionIRProjection?.target?.id ||
    job?.operationType ||
    job?.id ||
    'current-operation';
  const zoneId = 'manual-job-zone';

  if (['preparacao', 'escavacao', 'fundacao', 'apoios'].includes(operationType)) {
    return {
      type: 'SURFACE_REMOVED',
      materialId: operationType === 'preparacao'
        ? 'site-surface-material'
        : 'soil',
      zoneId,
      destinationZoneId: zoneId + ':spoil',
      compatibilityEvidence: nodeId,
    };
  }

  if ([
    'base', 'pilares', 'paredes', 'vigas', 'cobertura', 'acesso',
    'tabuleiro', 'guarda_corpo', 'contencao', 'travamento', 'plataforma',
  ].includes(operationType)) {
    return {
      type: 'COMPONENT_ATTACHED',
      componentId: targetId,
      targetEntityId: targetId,
      sourceZoneId: 'visible-material-supply',
      zoneId,
      compatibilityEvidence: nodeId,
    };
  }

  return {
    type: 'STATE_CHANGED',
    entityId: targetId,
    property: 'manual-operation-visible-result',
    to: String(recipe?.visibleTransformation || job?.physicalAction || 'changed'),
    zoneId,
    compatibilityEvidence: nodeId,
  };
}

function buildEdges(nodes) {
  const edges = [];
  for (let index = 1; index < nodes.length; index += 1) {
    edges.push({
      from: nodes[index - 1].id,
      to: nodes[index].id,
      relation: 'SEQUENCE',
    });
  }
  return edges;
}

export function buildManualPhysicalExecutionPlanV2({
  job,
  executionRecipe,
} = {}) {
  if (!job || typeof job !== 'object') {
    throw new Error('job is required for manual PhysicalExecutionPlan V2.');
  }
  if (!executionRecipe || typeof executionRecipe !== 'object') {
    throw new Error('executionRecipe is required for manual PhysicalExecutionPlan V2.');
  }

  const tools = unique(executionRecipe.tools);
  const primaryTool = tools[0] ?? null;
  const actorId = 'manual-worker';
  const zoneId = 'manual-job-zone';
  const targetId =
    executionRecipe?.physicalActionIRProjection?.target?.id ||
    job.operationType ||
    job.id ||
    'current-operation';
  const start = Number(job.startStagePercentage);
  const target = Number(job.targetStagePercentage);
  const planId = 'manual-v2:' + String(job.id || targetId);
  const contactEvidenceId = planId + ':evidence:trajectory';
  const terminalEvidenceId = planId + ':evidence:terminal';

  const nodes = [];
  if (primaryTool) {
    nodes.push({
      id: planId + ':acquire',
      kind: 'ACQUIRE_TOOL',
      instruction: 'Take control of the visible ' + primaryTool + ' before construction changes.',
      actorId,
      toolId: primaryTool,
      sourceEntityIds: [],
      targetEntityIds: [],
      zoneId,
      effects: [],
      preconditions: [],
      postconditions: [{ type: 'TOOL_HELD', toolId: primaryTool }],
      evidenceIds: [],
    });
    nodes.push({
      id: planId + ':grip',
      kind: 'GRIP',
      instruction: clip(executionRecipe.actorAction, 180),
      actorId,
      toolId: primaryTool,
      sourceEntityIds: [],
      targetEntityIds: [targetId],
      zoneId,
      contact: {
        id: planId + ':grip-contact',
        mode: 'GRIP',
        required: true,
        zoneId,
        targetEntityId: targetId,
      },
      effects: [],
      preconditions: [{ type: 'TOOL_HELD', toolId: primaryTool }],
      postconditions: [],
      evidenceIds: [],
    });
  }

  nodes.push({
    id: planId + ':position',
    kind: 'POSITION',
    instruction: 'Position the worker, active tool and target inside one bounded current work zone.',
    actorId,
    ...(primaryTool ? { toolId: primaryTool } : {}),
    sourceEntityIds: [],
    targetEntityIds: [targetId],
    zoneId,
    effects: [],
    preconditions: primaryTool ? [{ type: 'TOOL_HELD', toolId: primaryTool }] : [],
    postconditions: [],
    evidenceIds: [],
  });

  nodes.push({
    id: planId + ':contact',
    kind: 'CONTACT',
    instruction: 'Establish visible tool-to-target contact before any physical transformation.',
    actorId,
    ...(primaryTool ? { toolId: primaryTool } : {}),
    sourceEntityIds: [],
    targetEntityIds: [targetId],
    zoneId,
    contact: {
      id: planId + ':target-contact',
      mode: contactModeFor(inferNodeKind(executionRecipe.actionSequence?.[0])),
      required: true,
      zoneId,
      targetEntityId: targetId,
    },
    effects: [],
    preconditions: primaryTool ? [{ type: 'TOOL_HELD', toolId: primaryTool }] : [],
    postconditions: [{ type: 'CONTACT_ESTABLISHED', contactId: planId + ':target-contact' }],
    evidenceIds: [contactEvidenceId],
  });

  const steps = Array.isArray(executionRecipe.actionSequence)
    ? executionRecipe.actionSequence
    : [];
  const actionNodeIds = [];
  for (let index = 0; index < steps.length; index += 1) {
    const kind = inferNodeKind(steps[index]);
    const id = planId + ':action:' + String(index + 1).padStart(2, '0');
    actionNodeIds.push(id);
    nodes.push({
      id,
      kind,
      instruction: clip(steps[index], 220),
      actorId,
      ...(primaryTool ? { toolId: primaryTool } : {}),
      sourceEntityIds: [],
      targetEntityIds: [targetId],
      zoneId,
      contact: {
        id: id + ':contact',
        mode: contactModeFor(kind),
        required: true,
        zoneId,
        targetEntityId: targetId,
      },
      motion: {
        mode:
          kind === 'SCRAPE' ? 'SCRAPE'
          : kind === 'CUT' ? 'CUT'
          : kind === 'LIFT' ? 'LIFT'
          : kind === 'MOVE_MATERIAL' ? 'CARRY'
          : kind === 'PLACE' ? 'PLACE'
          : kind === 'DIG' ? 'PUSH'
          : kind === 'FASTEN' ? 'STRIKE'
          : 'PRESS',
        boundedZoneId: zoneId,
      },
      effects: [],
      preconditions: [{ type: 'CONTACT_ESTABLISHED', contactId: planId + ':target-contact' }],
      postconditions: [],
      evidenceIds: [contactEvidenceId],
    });
  }

  const changingNode =
    nodes.findLast?.(node =>
      actionNodeIds.includes(node.id) &&
      !['INSPECT', 'POSITION'].includes(node.kind),
    ) ||
    [...nodes].reverse().find(node =>
      actionNodeIds.includes(node.id) &&
      !['INSPECT', 'POSITION'].includes(node.kind),
    );
  if (changingNode) {
    changingNode.effects.push(effectForOperation(job, executionRecipe, changingNode.id));
    if (Number.isFinite(start) && Number.isFinite(target)) {
      changingNode.effects.push({
        type: 'CANONICAL_PROGRESS_ADVANCED',
        targetId,
        fromPercentage: start,
        toPercentage: target,
      });
      changingNode.postconditions.push({
        type: 'CANONICAL_PROGRESS_AT',
        targetId,
        percentage: target,
      });
    }
    changingNode.evidenceIds = unique([
      ...changingNode.evidenceIds,
      terminalEvidenceId,
    ]);
  }

  nodes.push({
    id: planId + ':inspect',
    kind: 'INSPECT',
    instruction:
      'Hold the result visibly. Show the changed portion, the unchanged remainder, and the persistent physical transformation.',
    actorId,
    ...(primaryTool ? { toolId: primaryTool } : {}),
    sourceEntityIds: [],
    targetEntityIds: [targetId],
    zoneId,
    effects: [],
    preconditions: [],
    postconditions: [],
    evidenceIds: [terminalEvidenceId],
  });

  nodes.push({
    id: planId + ':stop',
    kind: 'STOP',
    instruction:
      'Stop construction exactly at the canonical target and do not begin any future operation.',
    actorId,
    sourceEntityIds: [],
    targetEntityIds: [targetId],
    zoneId,
    effects: [],
    preconditions: Number.isFinite(target)
      ? [{ type: 'CANONICAL_PROGRESS_AT', targetId, percentage: target }]
      : [],
    postconditions: [],
    evidenceIds: [terminalEvidenceId],
  });

  const limitations = [
    'MANUAL_WORKSPACE_HAS_NO_TYPED_WORLDSTATE',
    'MANUAL_WORKSPACE_HAS_NO_PHYSICAL_GEOMETRY',
    'PHYSICAL_PROGRESS_METRIC_NOT_AVAILABLE',
    'ACTOR_AND_ZONE_IDS_ARE_COMPATIBILITY_IDS',
  ];
  if (!primaryTool) limitations.push('PRIMARY_TOOL_UNKNOWN');

  return {
    schemaVersion: MANUAL_PHYSICAL_EXECUTION_PLAN_V2_SCHEMA,
    planId,
    officialBefore: {
      revision: sourceRevision(job),
      timestamp: 0,
      snapshotFingerprint: 'manual-workspace-unavailable',
    },
    intent: {
      schemaVersion: 'construction-intent/2',
      operationId: String(job.operationType || job.id || 'manual-operation'),
      targetEntityId: targetId,
      methodId: 'execution-recipe:' + String(job.operationType || 'manual'),
      authorizedZoneId: zoneId,
      officialRevision: sourceRevision(job),
      canonicalProgress: {
        beforePercentage: Number.isFinite(start) ? start : 0,
        targetPercentage: Number.isFinite(target) ? target : 0,
        tolerancePercentage: 0,
      },
      temporalConstraints: {
        preserveComponentIds: unique(job?.continuityLocks?.preserveCompletedOperations),
        forbiddenFutureComponentIds: unique(job?.continuityLocks?.forbiddenFutureElements),
        preserveZoneIds: [],
        allowedMaterialSourceZoneIds: ['visible-material-supply', zoneId],
        allowedMaterialDestinationZoneIds: [zoneId, zoneId + ':spoil'],
      },
    },
    nodes,
    edges: buildEdges(nodes),
    evidence: [
      {
        id: contactEvidenceId,
        entityIds: unique([targetId, primaryTool]),
        relation: 'VISIBLE_TOOL_TARGET_CONTACT',
        metric: 'causal-contact',
        expected: { contactVisible: true },
        tolerance: 0,
        visibleIn: 'TRAJECTORY',
        mustPersist: false,
      },
      {
        id: terminalEvidenceId,
        entityIds: [targetId],
        relation: 'PERSISTENT_PARTIAL_RESULT',
        metric: 'canonical-stage',
        expected: {
          beforePercentage: Number.isFinite(start) ? start : 0,
          targetPercentage: Number.isFinite(target) ? target : 0,
          remainingWorkVisible: Number.isFinite(target) ? target < 100 : true,
          description: String(executionRecipe.terminalEvidence || ''),
        },
        tolerance: 0,
        visibleIn: 'TERMINAL_FRAME',
        mustPersist: true,
      },
    ],
    constraints: {
      stopAtTarget: true,
      requirePersistentEffects: true,
      maxSubactions: Math.max(8, nodes.length),
    },
    metadata: {
      source: 'EXECUTION_RECIPE',
      confidence: primaryTool && steps.length >= 2 ? 'MEDIUM' : 'LOW',
      limitations,
    },
  };
}

export function validateManualPhysicalExecutionPlanV2(plan) {
  const errors = [];
  if (!plan || typeof plan !== 'object') {
    return { ok: false, errors: ['PHYSICAL_EXECUTION_V2_MISSING'] };
  }
  if (plan.schemaVersion !== MANUAL_PHYSICAL_EXECUTION_PLAN_V2_SCHEMA) {
    errors.push('PHYSICAL_EXECUTION_V2_SCHEMA_INVALID');
  }
  if (plan.metadata?.source !== 'EXECUTION_RECIPE') {
    errors.push('PHYSICAL_EXECUTION_V2_SOURCE_INVALID');
  }
  if (!plan.intent?.operationId || !plan.intent?.targetEntityId) {
    errors.push('PHYSICAL_EXECUTION_V2_INTENT_MISSING');
  }

  const nodes = Array.isArray(plan.nodes) ? plan.nodes : [];
  const nodeIds = new Set(nodes.map(node => node?.id).filter(Boolean));
  if (nodes.length < 5) errors.push('PHYSICAL_EXECUTION_V2_TOO_THIN');

  const edges = Array.isArray(plan.edges) ? plan.edges : [];
  for (const edge of edges) {
    if (!nodeIds.has(edge?.from) || !nodeIds.has(edge?.to)) {
      errors.push('PHYSICAL_EXECUTION_V2_EDGE_NODE_MISSING');
      break;
    }
  }

  const evidenceIds = new Set(
    (Array.isArray(plan.evidence) ? plan.evidence : [])
      .map(item => item?.id)
      .filter(Boolean),
  );
  if (![...evidenceIds].length) errors.push('PHYSICAL_EXECUTION_V2_EVIDENCE_MISSING');

  const contactIndex = nodes.findIndex(node => node?.kind === 'CONTACT');
  const effectNodes = nodes
    .map((node, index) => ({ node, index }))
    .filter(item => Array.isArray(item.node?.effects) && item.node.effects.some(effect =>
      effect?.type !== 'CANONICAL_PROGRESS_ADVANCED'
    ));
  if (effectNodes.length === 0) errors.push('PHYSICAL_EXECUTION_V2_EFFECT_MISSING');
  if (effectNodes.some(item => contactIndex < 0 || item.index <= contactIndex)) {
    errors.push('PHYSICAL_EXECUTION_V2_EFFECT_BEFORE_CONTACT');
  }
  if (effectNodes.some(item =>
    !Array.isArray(item.node?.evidenceIds) ||
    !item.node.evidenceIds.some(id => evidenceIds.has(id))
  )) {
    errors.push('PHYSICAL_EXECUTION_V2_EFFECT_WITHOUT_EVIDENCE');
  }

  const progressEffects = nodes.flatMap(node =>
    (Array.isArray(node?.effects) ? node.effects : [])
      .filter(effect => effect?.type === 'CANONICAL_PROGRESS_ADVANCED')
  );
  const expectedStart = Number(plan.intent?.canonicalProgress?.beforePercentage);
  const expectedTarget = Number(plan.intent?.canonicalProgress?.targetPercentage);
  if (!Number.isFinite(expectedStart) || !Number.isFinite(expectedTarget) || expectedTarget <= expectedStart) {
    errors.push('PHYSICAL_EXECUTION_V2_PROGRESS_INVALID');
  } else if (
    progressEffects.length !== 1 ||
    Number(progressEffects[0]?.fromPercentage) !== expectedStart ||
    Number(progressEffects[0]?.toPercentage) !== expectedTarget
  ) {
    errors.push('PHYSICAL_EXECUTION_V2_PROGRESS_EFFECT_MISMATCH');
  }

  const terminalEvidence = (Array.isArray(plan.evidence) ? plan.evidence : [])
    .some(item => item?.visibleIn === 'TERMINAL_FRAME' && item?.mustPersist === true);
  if (!terminalEvidence) errors.push('PHYSICAL_EXECUTION_V2_TERMINAL_EVIDENCE_MISSING');

  const stopNode = nodes.find(node => node?.kind === 'STOP');
  if (!stopNode) errors.push('PHYSICAL_EXECUTION_V2_STOP_MISSING');

  return {
    ok: errors.length === 0,
    errors: unique(errors),
    nodeCount: nodes.length,
    edgeCount: edges.length,
    confidence: plan.metadata?.confidence ?? null,
    limitations: Array.isArray(plan.metadata?.limitations)
      ? [...plan.metadata.limitations]
      : [],
  };
}

export function compileManualProviderNeutralPromptArtifactV2(
  plan,
  retryCorrections = [],
) {
  const validation = validateManualPhysicalExecutionPlanV2(plan);
  if (!validation.ok) {
    throw new Error(
      'Cannot compile provider-neutral artifact from invalid manual V2 plan: ' +
      validation.errors.join(', '),
    );
  }

  return {
    schemaVersion: MANUAL_PROVIDER_NEUTRAL_PROMPT_V2_SCHEMA,
    sourcePlanId: plan.planId,
    officialBeforeRevision: plan.officialBefore.revision,
    authorizedWorkZoneId: plan.intent.authorizedZoneId,
    executionBeats: plan.nodes.map(node => ({
      id: node.id,
      kind: node.kind,
      instruction: String(node.instruction || ''),
      ...(node.toolId ? { toolId: node.toolId } : {}),
      zoneId: node.zoneId,
    })),
    transformationEffects: plan.nodes.flatMap(node =>
      Array.isArray(node.effects) ? node.effects : []
    ),
    evidence: Array.isArray(plan.evidence) ? [...plan.evidence] : [],
    canonicalProgress: { ...plan.intent.canonicalProgress },
    forbiddenFutureComponentIds: unique(
      plan.intent?.temporalConstraints?.forbiddenFutureComponentIds,
    ),
    retryCorrections: (Array.isArray(retryCorrections) ? retryCorrections : [])
      .map(item => ({
        code: String(item?.code || '').trim(),
        correction: String(item?.correction || '').trim(),
      }))
      .filter(item => item.code && item.correction),
    compatibility: {
      source: plan.metadata?.source ?? null,
      confidence: plan.metadata?.confidence ?? null,
      limitations: Array.isArray(plan.metadata?.limitations)
        ? [...plan.metadata.limitations]
        : [],
    },
  };
}

function retryText(corrections, correctionChars) {
  if (!Array.isArray(corrections) || !corrections.length) return '';
  return 'RETRY FIXES: ' + corrections.map(item =>
    clip(item.code, 36) + ': ' + clip(item.correction, correctionChars)
  ).join(' | ');
}

function evidenceText(artifact, maxChars) {
  const terminal = artifact.evidence
    .filter(item => item?.visibleIn === 'TERMINAL_FRAME')
    .map(item => String(item?.relation || '') + ': ' +
      clip(item?.expected?.description || JSON.stringify(item?.expected || {}), 180))
    .join('; ');
  return clip(
    terminal || 'persistent partial result remains visible while later work stays unfinished',
    maxChars,
  );
}

function beatsText(artifact, maxItems, itemChars) {
  return artifact.executionBeats
    .filter(beat => !['ACQUIRE_TOOL', 'APPROACH'].includes(beat.kind))
    .slice(0, maxItems)
    .map((beat, index) =>
      String(index + 1) + ') ' + clip(beat.instruction, itemChars)
    )
    .join(' ');
}

export function compileManualAdobeFireflyPromptV2({
  artifact,
  model = 'KLING_3_0',
  durationSeconds = 15,
  aspectRatio = '16:9',
  maxChars = ADOBE_FIREFLY_MANUAL_V2_PROMPT_MAX_CHARS,
} = {}) {
  if (!artifact || artifact.schemaVersion !== MANUAL_PROVIDER_NEUTRAL_PROMPT_V2_SCHEMA) {
    throw new Error('Valid manual provider-neutral V2 artifact is required.');
  }

  const progress = artifact.canonicalProgress ?? {};
  const future = unique(artifact.forbiddenFutureComponentIds);
  const header =
    '[ADOBE FIREFLY VIDEO JOB] ' + durationSeconds + 's ' + aspectRatio + ' ' +
    model + ' image-to-video. Source frame is temporal truth.';
  const scope = artifact.authorizedWorkZoneId
    ? 'Work only in the current bounded construction zone.'
    : '';

  let prompt = [
    header,
    scope,
    'PHYSICAL EXECUTION: ' + beatsText(artifact, 8, 145),
    Number.isFinite(Number(progress.beforePercentage)) &&
    Number.isFinite(Number(progress.targetPercentage))
      ? 'Advance only ' + progress.beforePercentage + '%→' +
        progress.targetPercentage + '%. Stop exactly at ' +
        progress.targetPercentage + '%; never overshoot.'
      : 'Advance only the explicit Job target.',
    'VISIBLE CHANGE: every contact/work stroke must cause a persistent physical transformation on the same bounded target.',
    'END EVIDENCE: ' + evidenceText(artifact, 300) + '.',
    'Negative: no pantomime, no magic, no morphing, no teleportation, no hidden progress, no disappearing work, no camera jump, no unexplained material movement.',
    future.length
      ? 'Do not start future elements: ' + future.slice(0, 6).map(item => clip(item, 40)).join(', ') + '.'
      : '',
    'Preserve camera, terrain/environment, worker identity and every unchanged completed component. Final frame stable for the next Job.',
    retryText(artifact.retryCorrections, 190),
  ].filter(Boolean).join(' ');

  if (count(prompt) > maxChars) {
    prompt = [
      header,
      'PHYSICAL EXECUTION: ' + beatsText(artifact, 6, 105),
      Number.isFinite(Number(progress.targetPercentage))
        ? 'Only ' + progress.beforePercentage + '%→' +
          progress.targetPercentage + '%. Stop exactly there.'
        : 'Advance only the current target.',
      'VISIBLE CHANGE: tool contact must leave persistent physical change.',
      'END EVIDENCE: ' + evidenceText(artifact, 180) + '.',
      'Negative: no pantomime, no magic, no morphing, no teleportation, no hidden progress or camera jump.',
      'Preserve continuity and keep future work absent. Final frame stable.',
      retryText(artifact.retryCorrections, 115),
    ].filter(Boolean).join(' ');
  }

  if (count(prompt) > maxChars) {
    prompt = [
      header,
      'Execute visibly: ' + beatsText(artifact, 4, 78),
      Number.isFinite(Number(progress.targetPercentage))
        ? 'Only ' + progress.beforePercentage + '%→' +
          progress.targetPercentage + '%. Stop exactly there.'
        : 'Advance only the current target.',
      'Persistent visible change required. No pantomime, magic, morphing, teleportation or hidden progress.',
      retryText(artifact.retryCorrections, 70),
    ].filter(Boolean).join(' ');
  }

  if (count(prompt) > maxChars) {
    throw new Error(
      'Unable to compile manual Adobe Firefly V2 prompt within ' +
      maxChars + ' characters without dropping required causal/retry constraints.',
    );
  }

  for (const retry of artifact.retryCorrections) {
    if (!prompt.includes(clip(retry.code, 36))) {
      throw new Error(
        'Manual Adobe Firefly V2 prompt lost required retry correction: ' +
        retry.code,
      );
    }
  }

  return {
    platform: 'ADOBE_FIREFLY',
    model,
    prompt,
    characterCount: count(prompt),
    maxChars,
    sourcePlanId: artifact.sourcePlanId,
    sourceArtifactSchema: artifact.schemaVersion,
  };
}
