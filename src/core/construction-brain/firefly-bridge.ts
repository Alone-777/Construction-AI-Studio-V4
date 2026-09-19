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

function segmentFallbackPrompt(
  scene: ConstructionBrainSceneArtifact,
  segment: ConstructionBrainGenerationSegment,
): string {
  const actions = segment.actionRequirements.length > 0
    ? segment.actionRequirements.join('; ')
    : scene.actionRequirements.join('; ') ||
      'continue the visible construction action already established in the source image';
  const evidence = segment.executionEvidence.length > 0
    ? segment.executionEvidence.join('; ')
    : 'show a physically plausible visible result with continuity from the source image';

  return [
    'Realistic construction timelapse, documentary smartphone realism, physically plausible motion.',
    `Continue only until the construction reaches the canonical ${segment.targetStagePercentage}% stage for this operation.`,
    `Scene action: ${actions}.`,
    `Required visible result at the end of this clip: ${evidence}.`,
    `Target global construction progress: ${segment.targetState.constructionProgress}%.`,
    'Keep the same worker identity, terrain geometry, camera orientation, materials, tools, residues and already-built components.',
    'Show visible physical labor and material handling; no magical construction.',
  ].join(' ');
}

function providerPrompt(
  scene: ConstructionBrainSceneArtifact,
  segment: ConstructionBrainGenerationSegment,
  model: FireflyBridgeModelId,
): string {
  if (model === 'KLING' && segment.prompt.kling?.trim()) {
    return segment.prompt.kling.trim();
  }

  const base = segmentFallbackPrompt(scene, segment);
  if (model === 'VEO_FAST') {
    return [
      base,
      'Use concise continuous image-to-video motion suitable for an 8-second shot.',
      'Prioritize one clear physical action and preserve exact visual continuity from the source frame.',
    ].join(' ');
  }

  return [
    base,
    'Use continuous image-to-video motion suitable for a shot up to 15 seconds.',
  ].join(' ');
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
  scene: ConstructionBrainSceneArtifact,
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
      ? [
          'The terminal frame matches the scene EXIT state.',
          ...scene.keyframes.exit.requiredVisibleEvidence.map(
            evidence => `Scene EXIT evidence is present: ${evidence}`,
          ),
        ]
      : ['The terminal frame is a valid continuation source for the next segment.']),
  ];
}

export function buildFireflyExecutionPlan(
  bundle: ConstructionBrainBundle,
): FireflyExecutionPlan {
  const jobs: FireflyExecutionJob[] = [];

  for (const scene of bundle.scenes.scenes) {
    let previousJobId: string | undefined;

    scene.generationSegments.forEach((segment, index) => {
      const isLast = index === scene.generationSegments.length - 1;
      const jobId = `firefly:${scene.id}:${segment.id}`;
      const source = previousJobId
        ? {
            kind: 'PREVIOUS_SEGMENT_LAST_FRAME' as const,
            previousJobId,
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
        prompt: providerPrompt(scene, segment, segment.provider),
        negativeConstraints: negativeConstraints(segment),
        continuityLocks: segmentContinuityLocks(scene, segment),
        acceptanceChecklist: segmentChecklist(scene, segment, isLast),
        output: {
          videoSlot: `outputs/${scenePart}/${segmentPart}.mp4`,
          lastFrameSlot: `outputs/${scenePart}/${segmentPart}.last-frame.png`,
        },
        status: 'READY',
      });

      previousJobId = jobId;
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

      if (index === 0) {
        if (job.source.kind !== 'KEYFRAME' ||
            job.source.keyframeId !== scene.keyframes.entry.id) {
          issues.push({
            severity: 'ERROR',
            code: 'FIREFLY_INVALID_FIRST_SOURCE',
            message: `First Firefly job for ${scene.id} must start from the scene ENTRY keyframe.`,
            sceneId: scene.id,
          });
        }
      } else {
        const previous = sceneJobs[index - 1];
        if (job.source.kind !== 'PREVIOUS_SEGMENT_LAST_FRAME' ||
            job.source.previousJobId !== previous.id) {
          issues.push({
            severity: 'ERROR',
            code: 'FIREFLY_BROKEN_SEGMENT_CHAIN',
            message: `Firefly job ${job.id} must start from the last frame of ${previous.id}.`,
            sceneId: scene.id,
          });
        }

        if (job.targetStagePercentage <= previous.targetStagePercentage) {
          issues.push({
            severity: 'ERROR',
            code: 'FIREFLY_STAGE_REGRESSION',
            message: `Firefly job ${job.id} does not advance beyond the previous target stage.`,
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

  for (const job of plan.jobs) {
    if (!scenesById.has(job.sceneId)) {
      issues.push({
        severity: 'ERROR',
        code: 'FIREFLY_UNKNOWN_SCENE',
        message: `Firefly job ${job.id} references unknown scene ${job.sceneId}.`,
        sceneId: job.sceneId,
      });
    }

    if (job.source.kind === 'PREVIOUS_SEGMENT_LAST_FRAME' &&
        !jobsById.has(job.source.previousJobId)) {
      issues.push({
        severity: 'ERROR',
        code: 'FIREFLY_UNKNOWN_PREVIOUS_JOB',
        message: `Firefly job ${job.id} references missing previous job ${job.source.previousJobId}.`,
        sceneId: job.sceneId,
      });
    }
  }

  return {
    valid: !issues.some(issue => issue.severity === 'ERROR'),
    issues,
  };
}
