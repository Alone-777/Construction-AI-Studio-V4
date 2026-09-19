import type {
  ConstructionBrainBundle,
  ConstructionBrainGenerationSegment,
  ConstructionBrainSceneArtifact,
  FireflyBridgeModelId,
  FireflyExecutionJob,
  FireflyExecutionPlan,
  FireflyExecutionPlanValidationResult,
} from './types';
import { CONSTRUCTION_BRAIN_SCHEMA_VERSION } from './types';

function sanitizeSlotPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

const KLING_PROMPT_MAX_CHARACTERS = 1400;

function operationAction(bundle: ConstructionBrainBundle, scene: ConstructionBrainSceneArtifact): string {
  const operation = bundle.constructionMap.operations.find(item => item.id === scene.operationId);
  switch (operation?.type) {
    case 'limpeza':
      return 'selectively clear vegetation only inside the building footprint';
    case 'sapata':
      return 'excavate and set the stone footings by hand';
    case 'piso':
      return 'fit and secure the timber base and floor structure';
    case 'pilar':
      return 'position, plumb and secure the timber posts';
    case 'parede':
      return 'assemble the timber wall sections on the existing frame';
    case 'viga':
      return 'cut, lift and fit the roof beams';
    case 'cobertura':
      return 'tie and fasten the thatch panels to the roof frame';
    case 'porta':
      return 'align, fit and test the main door';
    default:
      return 'perform the current construction operation with visible manual labor';
  }
}

function milestoneSentence(segment: ConstructionBrainGenerationSegment): string {
  const intermediate = segment.startStagePercentage === 0 && segment.targetStagePercentage === 50
    ? 25
    : segment.startStagePercentage === 50 && segment.targetStagePercentage === 100
      ? 75
      : Math.round((segment.startStagePercentage + segment.targetStagePercentage) / 2);

  return `Mid-clip, visibly pass the ${intermediate}% milestone; end at ${segment.targetStagePercentage}% in ${segment.targetState.activeZone}.`;
}

function futureSentence(segment: ConstructionBrainGenerationSegment): string {
  if (segment.forbiddenFutureElements.length === 0) return '';
  return `Do not show future elements: ${segment.forbiddenFutureElements.join(', ')}.`;
}

function segmentPrompt(
  bundle: ConstructionBrainBundle,
  scene: ConstructionBrainSceneArtifact,
  segment: ConstructionBrainGenerationSegment,
  model: FireflyBridgeModelId,
): string {
  return [
    'Realistic 16:9 construction timelapse, documentary smartphone look, physically plausible motion.',
    `Source frame = exact ${segment.startStagePercentage}% state of this operation at global progress ${segment.startState.constructionProgress}%.`,
    `Continuously ${operationAction(bundle, scene)} until ${segment.targetStagePercentage}% / global ${segment.targetState.constructionProgress}%.`,
    milestoneSentence(segment),
    'Show every required physical action on screen; do not skip hidden work between milestones.',
    'Keep the same worker, clothing, terrain, creek, camera framing and all completed construction.',
    'Materials, tools and debris persist and move only through visible handling.',
    futureSentence(segment),
    'No magical construction, teleportation, morphing, disappearing objects or camera jump.',
    model === 'VEO_FAST'
      ? 'Use one clear continuous image-to-video action within 8 seconds.'
      : 'Use continuous image-to-video motion within 15 seconds.',
  ].filter(Boolean).join(' ');
}
function negativeConstraints(segment: ConstructionBrainGenerationSegment): string[] {
  return [
    'no magical appearance of construction elements',
    'no disappearing completed components',
    'no worker identity change',
    'no worker teleportation',
    'no tool teleportation',
    'no material teleportation',
    'no residue disappearance without explicit removal',
    'no terrain geometry change unless explicitly authorized',
    'no camera jump',
    ...segment.forbiddenFutureElements.map(element => `no premature ${element}`),
  ];
}

function segmentContinuityLocks(
  scene: ConstructionBrainSceneArtifact,
  segment: ConstructionBrainGenerationSegment,
) {
  return {
    preserveWorkerIdentity: segment.targetState.worker.characterId,
    preserveExistingComponents: [...segment.targetState.existingComponents],
    preservePermanentObjects: [...segment.targetState.permanentObjects],
    preserveZones: [...scene.preservedZones],
    preserveTerrain: true,
    forbiddenFutureElements: [...segment.forbiddenFutureElements],
  };
}

function segmentChecklist(
  segment: ConstructionBrainGenerationSegment,
  isLast: boolean,
): string[] {
  return [
    `Worker identity remains ${segment.targetState.worker.characterId}.`,
    'Terrain geometry and permanent objects remain unchanged unless explicitly authorized.',
    'All components completed before this target stage remain present.',
    'Materials, tools and residues remain physically accounted for.',
    `The clip ends at the canonical ${segment.targetStagePercentage}% stage for this operation.`,
    `Global construction progress at the target is ${segment.targetState.constructionProgress}%.`,
    ...segment.forbiddenFutureElements.map(
      element => `Future element remains absent: ${element}.`,
    ),
    ...segment.executionEvidence.map(
      evidence => `Visible evidence is present: ${evidence}`,
    ),
    ...(isLast
      ? ['The terminal frame matches the scene EXIT state.']
      : ['The terminal frame is a valid continuation source for the next segment.']),
  ];
}

export function buildFireflyExecutionPlan(
  bundle: ConstructionBrainBundle,
): FireflyExecutionPlan {
  const jobs: FireflyExecutionJob[] = [];
  let previousGlobalJobId: string | undefined;

  for (const scene of bundle.scenes.scenes) {
    scene.generationSegments.forEach((segment, index) => {
      const isLast = index === scene.generationSegments.length - 1;
      const jobId = `firefly:${scene.id}:${segment.id}`;
      const source = previousGlobalJobId
        ? {
            kind: 'PREVIOUS_JOB_LAST_FRAME' as const,
            previousJobId: previousGlobalJobId,
          }
        : {
            kind: 'KEYFRAME' as const,
            keyframeId: scene.keyframes.entry.id,
          };

      const scenePart = sanitizeSlotPart(scene.id);
      const segmentPart = sanitizeSlotPart(segment.id);

      jobs.push({
        id: jobId,
        projectId: bundle.project.projectId,
        sceneId: scene.id,
        sceneNumber: scene.number,
        segmentId: segment.id,
        segmentIndex: index + 1,
        startStagePercentage: segment.startStagePercentage,
        targetStagePercentage: segment.targetStagePercentage,
        model: segment.provider,
        durationSeconds: segment.durationSeconds,
        aspectRatio: '16:9',
        resolution: {
          width: bundle.project.master.width,
          height: bundle.project.master.height,
        },
        source,
        terminalRequirement: isLast ? 'SCENE_EXIT' : 'INTERMEDIATE_CONTINUATION',
        entryKeyframeId: scene.keyframes.entry.id,
        exitKeyframeId: scene.keyframes.exit.id,
        prompt: segmentPrompt(bundle, scene, segment, segment.provider),
        negativeConstraints: negativeConstraints(segment),
        continuityLocks: segmentContinuityLocks(scene, segment),
        acceptanceChecklist: segmentChecklist(segment, isLast),
        output: {
          videoSlot: `outputs/${scenePart}/${segmentPart}.mp4`,
          lastFrameSlot: `outputs/${scenePart}/${segmentPart}.last-frame.png`,
        },
        status: 'READY',
      });

      previousGlobalJobId = jobId;
    });
  }

  return {
    schemaVersion: CONSTRUCTION_BRAIN_SCHEMA_VERSION,
    projectId: bundle.project.projectId,
    jobs,
  };
}

export function serializeFireflyExecutionPlan(
  plan: FireflyExecutionPlan,
  indentation = 2,
): string {
  return JSON.stringify(plan, null, indentation);
}

export function validateFireflyExecutionPlan(
  bundle: ConstructionBrainBundle,
  plan: FireflyExecutionPlan,
): FireflyExecutionPlanValidationResult {
  const issues: FireflyExecutionPlanValidationResult['issues'] = [];
  const scenesById = new Map(bundle.scenes.scenes.map(scene => [scene.id, scene]));
  const jobsById = new Map(plan.jobs.map(job => [job.id, job]));

  if (plan.projectId !== bundle.project.projectId) {
    issues.push({
      severity: 'ERROR',
      code: 'FIREFLY_PROJECT_MISMATCH',
      message: 'Firefly execution plan belongs to another project.',
    });
  }

  for (const scene of bundle.scenes.scenes) {
    const sceneJobs = plan.jobs
      .filter(job => job.sceneId === scene.id)
      .sort((a, b) => a.segmentIndex - b.segmentIndex);

    if (sceneJobs.length !== scene.generationSegments.length) {
      issues.push({
        severity: 'ERROR',
        code: 'FIREFLY_SEGMENT_COUNT_MISMATCH',
        message: `Scene ${scene.id} has ${scene.generationSegments.length} segments but ${sceneJobs.length} Firefly jobs.`,
        sceneId: scene.id,
      });
      continue;
    }

    sceneJobs.forEach((job, index) => {
      const segment = scene.generationSegments[index];
      const providerLimit = bundle.project.providers[job.model].maxGenerationSeconds;

      if (job.segmentId !== segment.id ||
          job.model !== segment.provider ||
          job.startStagePercentage !== segment.startStagePercentage ||
          job.targetStagePercentage !== segment.targetStagePercentage) {
        issues.push({
          severity: 'ERROR',
          code: 'FIREFLY_SEGMENT_BINDING_MISMATCH',
          message: `Firefly job ${job.id} does not match its canonical generation segment.`,
          sceneId: scene.id,
        });
      }

      if (job.durationSeconds !== segment.durationSeconds ||
          job.durationSeconds > providerLimit) {
        issues.push({
          severity: 'ERROR',
          code: 'FIREFLY_DURATION_LIMIT',
          message: `Firefly job ${job.id} has an invalid duration for ${job.model}.`,
          sceneId: scene.id,
        });
      }

      if (job.aspectRatio !== '16:9' ||
          job.resolution.width !== bundle.project.master.width ||
          job.resolution.height !== bundle.project.master.height) {
        issues.push({
          severity: 'ERROR',
          code: 'FIREFLY_MASTER_FORMAT_MISMATCH',
          message: `Firefly job ${job.id} does not use the 16:9 master format.`,
          sceneId: scene.id,
        });
      }

      if (!job.prompt.trim()) {
        issues.push({
          severity: 'ERROR',
          code: 'FIREFLY_EMPTY_PROMPT',
          message: `Firefly job ${job.id} has no video prompt.`,
          sceneId: scene.id,
        });
      }

      if (job.model === 'KLING' && job.prompt.length > KLING_PROMPT_MAX_CHARACTERS) {
        issues.push({
          severity: 'ERROR',
          code: 'FIREFLY_KLING_PROMPT_TOO_LONG',
          message: `Kling prompt for ${job.id} has ${job.prompt.length} characters; maximum is ${KLING_PROMPT_MAX_CHARACTERS}.`,
          sceneId: scene.id,
        });
      }

      for (const visible of [
        ...segment.targetState.existingComponents,
        ...segment.targetState.partialComponents,
      ]) {
        if (job.continuityLocks.forbiddenFutureElements.includes(visible)) {
          issues.push({
            severity: 'ERROR',
            code: 'FIREFLY_VISIBLE_ELEMENT_FORBIDDEN',
            message: `Firefly job ${job.id} forbids visible target element ${visible}.`,
            sceneId: scene.id,
          });
        }
      }

      if (index > 0) {
        const previous = sceneJobs[index - 1];
        if (job.startStagePercentage !== previous.targetStagePercentage ||
            job.targetStagePercentage <= previous.targetStagePercentage) {
          issues.push({
            severity: 'ERROR',
            code: 'FIREFLY_STAGE_REGRESSION',
            message: `Firefly job ${job.id} does not continue exactly from the previous target stage.`,
            sceneId: scene.id,
          });
        }
      }

      const isLast = index === sceneJobs.length - 1;
      const expectedTerminalRequirement = isLast
        ? 'SCENE_EXIT'
        : 'INTERMEDIATE_CONTINUATION';

      if (job.terminalRequirement !== expectedTerminalRequirement) {
        issues.push({
          severity: 'ERROR',
          code: 'FIREFLY_TERMINAL_REQUIREMENT_MISMATCH',
          message: `Firefly job ${job.id} has the wrong terminal requirement.`,
          sceneId: scene.id,
        });
      }

      if (isLast) {
        if (job.exitKeyframeId !== scene.keyframes.exit.id ||
            job.targetStagePercentage !== 100) {
          issues.push({
            severity: 'ERROR',
            code: 'FIREFLY_EXIT_KEYFRAME_MISMATCH',
            message: `Final Firefly job for ${scene.id} must target 100% and bind to the scene EXIT keyframe.`,
            sceneId: scene.id,
          });
        }
      }
    });
  }

  plan.jobs.forEach((job, index) => {
    if (!scenesById.has(job.sceneId)) {
      issues.push({
        severity: 'ERROR',
        code: 'FIREFLY_UNKNOWN_SCENE',
        message: `Firefly job ${job.id} references unknown scene ${job.sceneId}.`,
        sceneId: job.sceneId,
      });
    }

    if (index === 0) {
      if (job.source.kind !== 'KEYFRAME') {
        issues.push({
          severity: 'ERROR',
          code: 'FIREFLY_INVALID_INITIAL_SOURCE',
          message: `First Firefly job ${job.id} must start from the initial ENTRY keyframe.`,
          sceneId: job.sceneId,
        });
      }
      return;
    }

    const previous = plan.jobs[index - 1];
    if (job.source.kind !== 'PREVIOUS_JOB_LAST_FRAME' ||
        job.source.previousJobId !== previous.id) {
      issues.push({
        severity: 'ERROR',
        code: 'FIREFLY_BROKEN_GLOBAL_CHAIN',
        message: `Firefly job ${job.id} must start from the terminal frame of ${previous.id}.`,
        sceneId: job.sceneId,
      });
    }

    if (job.source.kind === 'PREVIOUS_JOB_LAST_FRAME' &&
        !jobsById.has(job.source.previousJobId)) {
      issues.push({
        severity: 'ERROR',
        code: 'FIREFLY_UNKNOWN_PREVIOUS_JOB',
        message: `Firefly job ${job.id} references missing previous job ${job.source.previousJobId}.`,
        sceneId: job.sceneId,
      });
    }
  });

  return {
    valid: !issues.some(issue => issue.severity === 'ERROR'),
    issues,
  };
}
