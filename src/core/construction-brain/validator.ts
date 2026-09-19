import type {
  ConstructionBrainBundle,
  ConstructionBrainValidationIssue,
  ConstructionBrainValidationResult,
} from './types';

function hasDependencyCycle(bundle: ConstructionBrainBundle): boolean {
  const nodes = bundle.constructionMap.components.map(component => component.id);
  const inDegree = new Map(nodes.map(id => [id, 0]));
  const adjacency = new Map(nodes.map(id => [id, [] as string[]]));

  for (const edge of bundle.constructionMap.edges) {
    if (!edge.required || !inDegree.has(edge.from) || !inDegree.has(edge.to)) continue;
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
    adjacency.get(edge.from)?.push(edge.to);
  }

  const queue = nodes.filter(id => (inDegree.get(id) ?? 0) === 0);
  let visited = 0;

  while (queue.length > 0) {
    const id = queue.shift()!;
    visited += 1;
    for (const next of adjacency.get(id) ?? []) {
      const degree = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, degree);
      if (degree === 0) queue.push(next);
    }
  }

  return visited !== nodes.length;
}

function containsAll(haystack: string[], needles: string[]): boolean {
  const values = new Set(haystack);
  return needles.every(value => values.has(value));
}

export function validateConstructionBrain(
  bundle: ConstructionBrainBundle,
): ConstructionBrainValidationResult {
  const issues: ConstructionBrainValidationIssue[] = [];
  const componentIds = new Set(bundle.constructionMap.components.map(component => component.id));

  if (bundle.project.master.aspectRatio !== '16:9') {
    issues.push({
      severity: 'ERROR',
      code: 'MASTER_ASPECT_RATIO',
      message: 'The Construction Brain master must be 16:9.',
    });
  }

  for (const component of bundle.constructionMap.components) {
    for (const dependency of component.dependencies) {
      if (!componentIds.has(dependency)) {
        issues.push({
          severity: 'ERROR',
          code: 'UNKNOWN_DEPENDENCY',
          message: `Component ${component.id} depends on missing component ${dependency}.`,
          componentId: component.id,
        });
      }
    }
  }

  if (hasDependencyCycle(bundle)) {
    issues.push({
      severity: 'ERROR',
      code: 'DEPENDENCY_CYCLE',
      message: 'The construction dependency graph contains a cycle.',
    });
  }

  for (let sceneIndex = 0; sceneIndex < bundle.scenes.scenes.length; sceneIndex += 1) {
    const scene = bundle.scenes.scenes[sceneIndex];

    if (scene.durationSeconds <= 0) {
      issues.push({
        severity: 'ERROR',
        code: 'INVALID_SCENE_DURATION',
        message: `Scene ${scene.id} has a non-positive duration.`,
        sceneId: scene.id,
      });
    }

    const segmentTotal = scene.generationSegments.reduce(
      (sum, segment) => sum + segment.durationSeconds,
      0,
    );

    if (Math.abs(segmentTotal - scene.durationSeconds) > 0.001) {
      issues.push({
        severity: 'ERROR',
        code: 'SEGMENT_DURATION_MISMATCH',
        message: `Generation segments for ${scene.id} do not cover the full scene duration.`,
        sceneId: scene.id,
      });
    }

    for (const segment of scene.generationSegments) {
      if (segment.durationSeconds > segment.maxProviderSeconds) {
        issues.push({
          severity: 'ERROR',
          code: 'PROVIDER_DURATION_LIMIT',
          message: `${segment.provider} segment ${segment.id} exceeds its provider limit.`,
          sceneId: scene.id,
        });
      }
    }

    if (scene.actionRequirements.length === 0) {
      issues.push({
        severity: 'WARNING',
        code: 'MISSING_VISIBLE_ACTION',
        message: `Scene ${scene.id} has no explicit visible physical action requirement.`,
        sceneId: scene.id,
      });
    }

    if (scene.executionEvidence.length === 0) {
      issues.push({
        severity: 'WARNING',
        code: 'MISSING_EXECUTION_EVIDENCE',
        message: `Scene ${scene.id} has no execution evidence requirement.`,
        sceneId: scene.id,
      });
    }

    const entry = scene.keyframes.entry;
    const exit = scene.keyframes.exit;

    if (entry.sceneId !== scene.id || exit.sceneId !== scene.id) {
      issues.push({
        severity: 'ERROR',
        code: 'KEYFRAME_SCENE_MISMATCH',
        message: `Scene ${scene.id} contains a keyframe linked to another scene.`,
        sceneId: scene.id,
      });
    }

    if (entry.kind !== 'ENTRY' || exit.kind !== 'EXIT') {
      issues.push({
        severity: 'ERROR',
        code: 'KEYFRAME_KIND_MISMATCH',
        message: `Scene ${scene.id} must have one ENTRY and one EXIT keyframe.`,
        sceneId: scene.id,
      });
    }

    if (entry.expectedState.worker.characterId !== exit.expectedState.worker.characterId) {
      issues.push({
        severity: 'ERROR',
        code: 'WORKER_IDENTITY_DRIFT',
        message: `Worker identity changes inside scene ${scene.id}.`,
        sceneId: scene.id,
      });
    }

    if (exit.expectedState.constructionProgress < entry.expectedState.constructionProgress) {
      issues.push({
        severity: 'ERROR',
        code: 'CONSTRUCTION_PROGRESS_REGRESSION',
        message: `Construction progress regresses inside scene ${scene.id}.`,
        sceneId: scene.id,
      });
    }

    if (!containsAll(
      exit.continuityLocks.preserveExistingComponents,
      entry.expectedState.existingComponents,
    )) {
      issues.push({
        severity: 'ERROR',
        code: 'KEYFRAME_PERSISTENCE_LOCK_MISSING',
        message: `Exit keyframe for ${scene.id} does not lock every component that existed at scene entry.`,
        sceneId: scene.id,
      });
    }

    if (entry.approvalChecklist.length === 0 || exit.approvalChecklist.length === 0) {
      issues.push({
        severity: 'ERROR',
        code: 'EMPTY_KEYFRAME_CHECKLIST',
        message: `Scene ${scene.id} has an empty keyframe approval checklist.`,
        sceneId: scene.id,
      });
    }

    const referenceRoles = new Set(entry.referencePlan.map(reference => reference.role));
    if (!referenceRoles.has('INITIAL') || !referenceRoles.has('FINAL')) {
      issues.push({
        severity: 'ERROR',
        code: 'MISSING_GLOBAL_REFERENCE_SLOT',
        message: `Scene ${scene.id} must reserve INITIAL and FINAL reference slots.`,
        sceneId: scene.id,
      });
    }

    if (sceneIndex > 0) {
      const previousScene = bundle.scenes.scenes[sceneIndex - 1];
      const previousReference = entry.referencePlan.find(
        reference => reference.role === 'PREVIOUS_ACCEPTED',
      );

      if (!previousReference || previousReference.sourceSceneId !== previousScene.id) {
        issues.push({
          severity: 'ERROR',
          code: 'MISSING_PREVIOUS_ACCEPTED_REFERENCE',
          message: `Scene ${scene.id} must reference the accepted result from ${previousScene.id}.`,
          sceneId: scene.id,
        });
      }

      const previousExit = previousScene.keyframes.exit.expectedState;
      const currentEntry = entry.expectedState;

      if (previousExit.worker.characterId !== currentEntry.worker.characterId) {
        issues.push({
          severity: 'ERROR',
          code: 'CROSS_SCENE_WORKER_DRIFT',
          message: `Worker identity changes between ${previousScene.id} and ${scene.id}.`,
          sceneId: scene.id,
        });
      }

      if (currentEntry.constructionProgress < previousExit.constructionProgress) {
        issues.push({
          severity: 'ERROR',
          code: 'CROSS_SCENE_PROGRESS_REGRESSION',
          message: `Construction progress regresses between ${previousScene.id} and ${scene.id}.`,
          sceneId: scene.id,
        });
      }

      if (!containsAll(currentEntry.existingComponents, previousExit.existingComponents)) {
        issues.push({
          severity: 'ERROR',
          code: 'CROSS_SCENE_COMPONENT_DISAPPEARANCE',
          message: `A completed component disappears between ${previousScene.id} and ${scene.id}.`,
          sceneId: scene.id,
        });
      }

      if (!containsAll(currentEntry.permanentObjects, previousExit.permanentObjects)) {
        issues.push({
          severity: 'ERROR',
          code: 'CROSS_SCENE_PERMANENT_OBJECT_DISAPPEARANCE',
          message: `A permanent object disappears between ${previousScene.id} and ${scene.id}.`,
          sceneId: scene.id,
        });
      }
    }
  }

  for (const snapshot of bundle.worldState.snapshots) {
    if (snapshot.status === 'approved' && snapshot.executionProof && !snapshot.executionProof.valid) {
      issues.push({
        severity: 'ERROR',
        code: 'INVALID_APPROVED_EXECUTION_PROOF',
        message: `Approved stage ${snapshot.stagePercentage}% in ${snapshot.sceneId} has invalid execution proof.`,
        sceneId: snapshot.sceneId,
      });
    }
  }

  return {
    valid: !issues.some(issue => issue.severity === 'ERROR'),
    issues,
  };
}
