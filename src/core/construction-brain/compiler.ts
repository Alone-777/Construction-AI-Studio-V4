import type { Project, Scene, Stage } from '../types';
import {
  CONSTRUCTION_BRAIN_SCHEMA_VERSION,
  type ConstructionBrainBundle,
  type ConstructionBrainGenerationSegment,
  type ConstructionBrainProviderId,
  type ConstructionBrainSceneArtifact,
} from './types';

const PROVIDER_LIMITS: Record<ConstructionBrainProviderId, number> = {
  KLING: 15,
  VEO_FAST: 8,
};

function topologicalComponentOrder(project: Project): string[] {
  const ids = project.dependencyGraph.nodes.map(node => node.id);
  const inDegree = new Map(ids.map(id => [id, 0]));
  const adjacency = new Map(ids.map(id => [id, [] as string[]]));

  for (const edge of project.dependencyGraph.edges) {
    if (!edge.required || !inDegree.has(edge.from) || !inDegree.has(edge.to)) continue;
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
    adjacency.get(edge.from)?.push(edge.to);
  }

  const queue = ids.filter(id => (inDegree.get(id) ?? 0) === 0);
  const ordered: string[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    ordered.push(id);
    for (const next of adjacency.get(id) ?? []) {
      const degree = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, degree);
      if (degree === 0) queue.push(next);
    }
  }

  return ordered.length === ids.length ? ordered : ids;
}

function chooseProvider(durationSeconds: number): ConstructionBrainProviderId {
  return durationSeconds <= PROVIDER_LIMITS.VEO_FAST ? 'VEO_FAST' : 'KLING';
}

function splitSceneForGeneration(scene: Scene): ConstructionBrainGenerationSegment[] {
  const segments: ConstructionBrainGenerationSegment[] = [];
  let remaining = scene.duration;
  let index = 1;

  while (remaining > 0) {
    const provider = chooseProvider(remaining);
    const maxProviderSeconds = PROVIDER_LIMITS[provider];
    const durationSeconds = Math.min(remaining, maxProviderSeconds);

    segments.push({
      id: `${scene.id}:segment:${index}`,
      provider,
      durationSeconds,
      maxProviderSeconds,
      sourceSceneId: scene.id,
    });

    remaining = Number((remaining - durationSeconds).toFixed(3));
    index += 1;
  }

  return segments;
}

function stageAction(stage: Stage): string[] {
  const action = stage.physicalActionIR?.primaryAction.description ?? stage.physicalAction;
  return action ? [action] : [];
}

function stageEvidence(stage: Stage): string[] {
  return [
    ...(stage.physicalActionIR?.evidence ?? []),
    ...stage.visualEvidence,
  ];
}

function compileScene(scene: Scene): ConstructionBrainSceneArtifact {
  const activeStages = scene.stages.filter(stage => stage.status !== 'rejected');

  return {
    id: scene.id,
    number: scene.number,
    operationId: scene.operationId,
    durationSeconds: scene.duration,
    generationSegments: splitSceneForGeneration(scene),
    actionRequirements: [...new Set(activeStages.flatMap(stageAction))],
    executionEvidence: [...new Set(activeStages.flatMap(stageEvidence))],
    forbiddenFutureElements: [...new Set(activeStages.flatMap(stage => [
      ...stage.futureElements,
      ...(stage.physicalActionIR?.constraints.forbiddenFutureComponents ?? []),
      ...(stage.physicalActionIR?.constraints.preventPrematureElements ?? []),
    ]))],
    preservedZones: [...new Set(activeStages.flatMap(stage => stage.preservedZones))],
    prompts: {
      kling: [...activeStages]
        .reverse()
        .find(stage => !!stage.prompts?.kling)
        ?.prompts?.kling,
      image: [...activeStages]
        .reverse()
        .find(stage => !!stage.prompts?.nanoBanana)
        ?.prompts?.nanoBanana,
    },
  };
}

export interface CompileConstructionBrainOptions {
  targetDurationSeconds?: number;
}

export function compileConstructionBrain(
  project: Project,
  options: CompileConstructionBrainOptions = {},
): ConstructionBrainBundle {
  const snapshots = project.scenes.flatMap(scene =>
    scene.stages
      .filter(stage => stage.worldStateBefore || stage.worldStateAfter)
      .map(stage => ({
        sceneId: scene.id,
        stagePercentage: stage.percentage,
        status: stage.status ?? 'pending' as const,
        before: stage.worldStateBefore,
        after: stage.worldStateAfter,
        executionProof: stage.executionProof,
      })),
  );

  return {
    project: {
      schemaVersion: CONSTRUCTION_BRAIN_SCHEMA_VERSION,
      projectId: project.id,
      name: project.name,
      domain: 'construction',
      master: {
        aspectRatio: '16:9',
        width: 1920,
        height: 1080,
        targetDurationSeconds: options.targetDurationSeconds ?? project.config?.totalDuration ?? 180,
      },
      providers: {
        KLING: {
          maxGenerationSeconds: PROVIDER_LIMITS.KLING,
          role: 'PRIMARY_LONG_ACTION',
        },
        VEO_FAST: {
          maxGenerationSeconds: PROVIDER_LIMITS.VEO_FAST,
          role: 'SECONDARY_SHORT_ACTION',
        },
      },
      globalRules: [
        'Every visible result must have a visible physical cause.',
        'Completed components persist until an explicit removal operation authorizes removal.',
        'Future components must not appear before their dependencies are complete.',
        'Materials, tools, residues and workers must not teleport or disappear without a state transition.',
        'Video providers are replaceable execution adapters and never own project logic.',
      ],
    },
    constructionMap: {
      schemaVersion: CONSTRUCTION_BRAIN_SCHEMA_VERSION,
      projectId: project.id,
      orderedComponentIds: topologicalComponentOrder(project),
      components: project.dependencyGraph.nodes.map(node => ({
        id: node.id,
        name: node.name,
        type: node.type,
        dependencies: [...node.dependencies],
        zones: [...node.zones],
        status: node.status,
      })),
      edges: project.dependencyGraph.edges.map(edge => ({
        from: edge.from,
        to: edge.to,
        required: edge.required,
      })),
      operations: project.operations.map(operation => ({
        id: operation.id,
        name: operation.name,
        type: operation.type,
        componentId: operation.componentId,
        zones: [...(operation.zones ?? [])],
        elements: [...(operation.elements ?? [])],
      })),
    },
    worldState: {
      schemaVersion: CONSTRUCTION_BRAIN_SCHEMA_VERSION,
      projectId: project.id,
      initial: project.worldState,
      snapshots,
    },
    scenes: {
      schemaVersion: CONSTRUCTION_BRAIN_SCHEMA_VERSION,
      projectId: project.id,
      scenes: project.scenes.map(compileScene),
    },
  };
}
