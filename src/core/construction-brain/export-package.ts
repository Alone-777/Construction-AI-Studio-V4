import type { Project } from '../types';
import {
  compileConstructionBrain,
  type CompileConstructionBrainOptions,
} from './compiler';
import {
  buildFireflyExecutionPlan,
  serializeFireflyExecutionPlan,
  validateFireflyExecutionPlan,
} from './firefly-bridge';
import { serializeConstructionBrain } from './serializer';
import { validateConstructionBrain } from './validator';
import type { ConstructionLearningMemory } from './fiscal-learning';

export interface ConstructionBrainExportFiles {
  'project.json': string;
  'construction_map.json': string;
  'world_state.json': string;
  'scenes.json': string;
  'firefly_plan.json': string;
}

export interface ConstructionBrainExportPackage {
  projectId: string;
  files: ConstructionBrainExportFiles;
  summary: {
    sceneCount: number;
    fireflyJobCount: number;
    klingJobCount: number;
    veoFastJobCount: number;
    targetDurationSeconds: number;
  };
}

export const DEFAULT_LONG_FORM_TARGET_SECONDS = 240;

export interface BuildConstructionBrainExportOptions extends CompileConstructionBrainOptions {
  learningMemory?: ConstructionLearningMemory;
}

export function buildConstructionBrainExportPackage(
  project: Project,
  options: BuildConstructionBrainExportOptions = {},
): ConstructionBrainExportPackage {
  const resolvedOptions: CompileConstructionBrainOptions = {
    initialReferenceUri: options.initialReferenceUri,
    finalReferenceUri: options.finalReferenceUri,
    targetDurationSeconds:
      options.targetDurationSeconds ?? DEFAULT_LONG_FORM_TARGET_SECONDS,
  };
  const bundle = compileConstructionBrain(project, resolvedOptions);
  const brainValidation = validateConstructionBrain(bundle);

  if (!brainValidation.valid) {
    const errors = brainValidation.issues
      .filter(issue => issue.severity === 'ERROR')
      .map(issue => `${issue.code}: ${issue.message}`)
      .join('; ');
    throw new Error(`Construction Brain export blocked: ${errors}`);
  }

  const fireflyPlan = buildFireflyExecutionPlan(bundle, {
    learningMemory: options.learningMemory,
  });
  const fireflyValidation = validateFireflyExecutionPlan(bundle, fireflyPlan);

  if (!fireflyValidation.valid) {
    const errors = fireflyValidation.issues
      .filter(issue => issue.severity === 'ERROR')
      .map(issue => `${issue.code}: ${issue.message}`)
      .join('; ');
    throw new Error(`Firefly export blocked: ${errors}`);
  }

  const canonical = serializeConstructionBrain(bundle);
  const klingJobCount = fireflyPlan.jobs.filter(job => job.model === 'KLING').length;
  const veoFastJobCount = fireflyPlan.jobs.filter(job => job.model === 'VEO_FAST').length;

  return {
    projectId: project.id,
    files: {
      ...canonical,
      'firefly_plan.json': serializeFireflyExecutionPlan(fireflyPlan),
    },
    summary: {
      sceneCount: bundle.scenes.scenes.length,
      fireflyJobCount: fireflyPlan.jobs.length,
      klingJobCount,
      veoFastJobCount,
      targetDurationSeconds: bundle.project.master.targetDurationSeconds,
    },
  };
}

export function buildFireflyPlanJson(
  project: Project,
  options: BuildConstructionBrainExportOptions = {},
): string {
  return buildConstructionBrainExportPackage(project, options).files['firefly_plan.json'];
}

export function downloadTextFile(
  filename: string,
  content: string,
  mimeType = 'application/json',
): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    throw new Error('File download is only available in a browser environment.');
  }

  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);

  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadFireflyPlanJson(
  project: Project,
  options: BuildConstructionBrainExportOptions = {},
): ConstructionBrainExportPackage['summary'] {
  const exported = buildConstructionBrainExportPackage(project, options);
  downloadTextFile('firefly_plan.json', exported.files['firefly_plan.json']);
  return exported.summary;
}
