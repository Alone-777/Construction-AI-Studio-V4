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

  for (const scene of bundle.scenes.scenes) {
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
