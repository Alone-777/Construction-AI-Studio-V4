import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STUDIO_ROOT = path.resolve(HERE, '..');

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function operationKey(operationId) {
  return String(operationId || '').replace(/^op_/, '');
}

function clone(value) {
  return structuredClone(value);
}

function applyToolOverrides(config, blueprint, toolOverrides = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(toolOverrides || {})) {
    const tool = String(value || '').trim();
    if (tool) normalized[String(key)] = tool;
  }
  if (!Object.keys(normalized).length) return;

  for (const operation of blueprint.operations || []) {
    const key = operationKey(operation.id);
    const override = normalized[key];
    if (!override) continue;
    operation.tool = override;
  }

  const tools = unique((blueprint.operations || []).map(operation => operation.tool));
  blueprint.tools = tools.map(toolId => {
    const existing = (blueprint.tools || []).find(tool => tool.toolId === toolId);
    return existing || { toolId, location: 'Z1' };
  });
  config.tools = tools;
  if (config.character) {
    config.character = {
      ...config.character,
      tools,
    };
  }
}

function retryKey(operationType, start, target) {
  return String(operationType) + ':' + String(start) + '-' + String(target);
}

function normalizeRetryCorrections(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => ({
      code: String(item?.code || '').trim(),
      correction: String(item?.correction || '').trim(),
    }))
    .filter(item => item.code && item.correction)
    .slice(0, 10);
}

export async function compileManualVideoProjectV2({
  description,
  name,
  workerCount,
  toolOverrides = {},
  retryCorrectionsBySegment = {},
  studioRoot = STUDIO_ROOT,
} = {}) {
  if (!String(description || '').trim()) {
    throw new Error('description is required for Physical Execution V2 compilation.');
  }

  const { createServer } = await import('vite');
  const server = await createServer({
    root: studioRoot,
    configFile: false,
    appType: 'custom',
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false },
  });

  try {
    const descriptionModule = await server.ssrLoadModule(
      '/src/core/blueprints/description-blueprint.ts',
    );
    const pipelineModule = await server.ssrLoadModule(
      '/src/core/engines/pipeline/index.ts',
    );
    const physicalModule = await server.ssrLoadModule(
      '/src/core/actions/physical-execution-v2/index.ts',
    );
    const imagePromptModule = await server.ssrLoadModule(
      '/src/core/image-prompts/canonical-image-prompt-compiler.ts',
    );

    const compiled = descriptionModule.compileDescriptionToBlueprint({
      description: String(description).trim(),
      ...(String(name || '').trim() ? { name: String(name).trim() } : {}),
      sceneDuration: 15,
      ...(workerCount !== undefined ? { workerCount } : {}),
    });

    const config = clone(compiled.config);
    const blueprint = clone(compiled.blueprint);
    applyToolOverrides(config, blueprint, toolOverrides);

    const project = pipelineModule.createProjectFromBlueprint(config, blueprint);
    const operationsById = new Map(project.operations.map(operation => [operation.id, operation]));
    const segments = [];

    for (const scene of project.scenes) {
      const operation = operationsById.get(scene.operationId);
      if (!operation) {
        throw new Error('V2 bridge could not resolve operation ' + scene.operationId + '.');
      }
      const key = operationKey(operation.id);
      const orderedStages = [...scene.stages].sort((a, b) => a.percentage - b.percentage);

      for (let index = 0; index < orderedStages.length; index += 1) {
        const stage = orderedStages[index];
        if (stage.percentage === 0) continue;
        const previous = orderedStages[index - 1]?.percentage ?? 0;
        const plan = stage.physicalExecutionPlanV2;
        const simulation = stage.physicalSimulationV2;
        if (!plan || !simulation?.validation?.ok || !simulation.projected) {
          throw new Error(
            'Physical Execution V2 is not valid for ' + key + ':' + previous + '-' + stage.percentage +
            (stage.physicalExecutionV2Error ? ' — ' + stage.physicalExecutionV2Error : ''),
          );
        }

        const corrections = normalizeRetryCorrections(
          retryCorrectionsBySegment[retryKey(key, previous, stage.percentage)],
        );

        // Base V2 prompt stays independent from review/retry history.
        // Retry corrections are a sidecar compiled into a distinct prompt so
        // Critic/learning can compare failed base vs corrective retry honestly.
        const baseArtifact = physicalModule.compileProviderNeutralPromptArtifact(
          plan,
          simulation,
          [],
        );
        const baseCompiledPrompt = physicalModule.compileAdobeFireflyVideoPromptV2({
          artifact: baseArtifact,
          model: 'KLING_3_0',
          durationSeconds: 15,
          aspectRatio: '16:9',
        });

        let retryArtifact = null;
        let retryCompiledPrompt = null;
        if (corrections.length) {
          retryArtifact = physicalModule.compileProviderNeutralPromptArtifact(
            plan,
            simulation,
            corrections,
          );
          retryCompiledPrompt = physicalModule.compileAdobeFireflyVideoPromptV2({
            artifact: retryArtifact,
            model: 'KLING_3_0',
            durationSeconds: 15,
            aspectRatio: '16:9',
          });
        }

        let logisticsShadow = null;
        try {
          if (plan.equipmentLogisticsPlan && simulation.logisticsPreflight) {
            logisticsShadow = {
              mode: 'SHADOW',
              generationAuthorized: false,
              preflight: clone(simulation.logisticsPreflight),
              preview: physicalModule.compileLogisticsShadowPrompt(baseArtifact),
              retryPreview: retryArtifact ? physicalModule.compileLogisticsShadowPrompt(retryArtifact) : null,
              sourcePreparation: imagePromptModule.compileLogisticsSourcePreparation(
                plan.equipmentLogisticsPlan, simulation.logisticsPreflight,
                segments.length === 0 ? 'INITIAL_SOURCE' : 'CONTINUATION',
              ),
            };
          }
        } catch (error) {
          // A diagnostic failure cannot change the active prompt or legacy approval gates.
          logisticsShadow = { mode: 'SHADOW', generationAuthorized: false, error: String(error) };
        }

        segments.push({
          operationType: key,
          operationId: operation.id,
          operationName: operation.name,
          physicalAction: stage.physicalAction,
          startStagePercentage: previous,
          targetStagePercentage: stage.percentage,
          activeZone: stage.activeZone,
          tool: stage.tool || null,
          prompt: baseCompiledPrompt.prompt,
          promptCharacters: baseCompiledPrompt.characterCount,
          retryPrompt: retryCompiledPrompt?.prompt ?? null,
          retryPromptCharacters: retryCompiledPrompt?.characterCount ?? null,
          promptMaxChars: baseCompiledPrompt.maxChars,
          promptSource: 'PHYSICAL_EXECUTION_V2',
          physicalExecutionPlanV2: clone(plan),
          physicalSimulationV2: clone(simulation),
          providerNeutralPromptV2: clone(baseArtifact),
          retryProviderNeutralPromptV2: retryArtifact ? clone(retryArtifact) : null,
          logisticsShadow,
        });
      }
    }

    const operations = [];
    for (const operation of project.operations) {
      const key = operationKey(operation.id);
      const firstSegment = segments.find(segment => segment.operationType === key);
      operations.push({
        id: key,
        operationId: operation.id,
        name: operation.name,
        physicalAction: firstSegment?.physicalAction || operation.name,
        tool: firstSegment?.tool || null,
      });
    }

    return {
      schema: 'construction-manual-v2-bridge/1',
      platform: 'ADOBE_FIREFLY',
      model: 'KLING_3_0',
      promptMaxChars: 1800,
      operations,
      segments,
      interpretation: clone(compiled.interpretation),
      assumptions: clone(compiled.assumptions),
      config: {
        construction: config.construction,
        environment: config.environment,
        materials: clone(config.materials),
        workerCount: config.workerCount,
      },
    };
  } finally {
    await server.close();
  }
}

export function executionRecipeFromV2Segment(segment) {
  const artifact = segment?.providerNeutralPromptV2;
  const plan = segment?.physicalExecutionPlanV2;
  if (!artifact || !plan) {
    throw new Error('Physical Execution V2 segment is required for recipe compatibility projection.');
  }

  const tools = unique(
    artifact.executionBeats.map(beat => beat.toolId).filter(Boolean),
  );
  const actionSequence = artifact.executionBeats
    .filter(beat => !String(beat.instruction || '').toLowerCase().includes('stop construction'))
    .map(beat => String(beat.instruction || '').trim())
    .filter(Boolean)
    .slice(0, 8);
  const terminalEvidence = artifact.evidence
    .filter(item => item.visibleIn === 'TERMINAL_FRAME')
    .map(item => item.relation + ' expected ' + JSON.stringify(item.expected))
    .join('; ') ||
    'Final frame must visibly prove the V2 target and leave later work unfinished.';
  const visibleTransformation = plan.evidence
    .map(item => item.relation)
    .filter(Boolean)
    .join('; ') ||
    'The V2 physical effects must remain visible after the worker action.';

  return {
    schema: 'construction-manual-execution-recipe/1',
    operationType: segment.operationType,
    operationName: segment.operationName,
    tools: tools.length ? tools : ['appropriate hand tool'],
    actorAction: actionSequence[0] ||
      'Worker physically executes the V2 action with visible tool/material causality.',
    actionSequence: actionSequence.length >= 2
      ? actionSequence
      : [
          actionSequence[0] || 'Make visible physical contact with the current target.',
          'Continue until the declared V2 terminal evidence is visibly satisfied.',
        ],
    visibleTransformation,
    terminalEvidence,
    forbidden: artifact.forbiddenFutureComponentIds.length
      ? 'Do not create future elements: ' + artifact.forbiddenFutureComponentIds.join(', ') + '.'
      : 'Do not begin any future operation.',
    physicalActionIRProjection: {
      primaryAction: {
        type: 'OTHER',
        verb: 'execute',
        description: segment.physicalAction,
      },
      target: {
        id: plan.intent.targetEntityId,
        label: plan.intent.targetEntityId,
        elements: [],
      },
      tools: tools.length ? tools : ['appropriate hand tool'],
      expectedEffects: {
        constructionProgress: {
          before: plan.intent.canonicalProgress.beforePercentage,
          after: plan.intent.canonicalProgress.targetPercentage,
        },
        visibleTransformation,
      },
      evidence: [terminalEvidence],
    },
  };
}
