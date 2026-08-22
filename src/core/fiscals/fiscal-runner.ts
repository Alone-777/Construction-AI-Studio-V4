import { ErrorSeverity, ValidationError, type Project, type Scene, type Stage } from '../types';
import { FiscalContext, FiscalInspector, FiscalReport } from './types';
import { DependencyFiscal } from './dependency-fiscal';
import { SpatialFiscal } from './spatial-fiscal';
import { ConservationFiscal } from './conservation-fiscal';
import { CharacterFiscal } from './character-fiscal';
import { TemporalFiscal } from './temporal-fiscal';
import { VisualFiscal } from './visual-fiscal';
import { CameraFiscal } from './camera-fiscal';
import { ExecutionFiscal } from './execution-fiscal';
import { ProgressionFiscal } from './progression-fiscal';
import { TopologyFiscal } from './topology-fiscal';
import { StateTransitionFiscal } from './state-transition-fiscal';
import { VisualSourceFiscal } from './visual-source-fiscal';

export class FiscalRunner {
  private inspectors: FiscalInspector[] = [
    new DependencyFiscal(),
    new SpatialFiscal(),
    new ConservationFiscal(),
    new CharacterFiscal(),
    new TemporalFiscal(),
    new VisualFiscal(),
    new CameraFiscal(),
    new ExecutionFiscal(),
    new ProgressionFiscal(),
    new TopologyFiscal(),
    new StateTransitionFiscal(),
    new VisualSourceFiscal(),
  ];

  runAllFiscals(context: FiscalContext): FiscalReport {
    const allErrors: ValidationError[] = [];
    const checks = [];
    for (const inspector of this.inspectors) {
      const errs = inspector.inspect(context);
      allErrors.push(...errs);
      const blocking = errs.some(error => error.severity === ErrorSeverity.ERROR);
      const warning = errs.some(error => error.severity !== ErrorSeverity.ERROR);
      checks.push({
        ruleId: inspector.id,
        rule: inspector.name,
        status: blocking ? 'FAIL' as const : warning ? 'WARNING' as const : 'PASS' as const,
        explanation: errs.length > 0
          ? errs.map(error => `${error.code}: ${error.message}`).join(' | ')
          : `${inspector.name}: regra satisfeita para o estado e o estágio auditados.`,
      });
    }

    const errors = allErrors.filter(e => e.severity === ErrorSeverity.ERROR);
    const warnings = allErrors.filter(e => e.severity === ErrorSeverity.WARNING || e.severity === ErrorSeverity.INFO);
    
    const approved = errors.length === 0;

    const blockingCodes = new Set(errors.map(error => String(error.code)));
    const hasBlocking = (...prefixes: string[]) =>
      [...blockingCodes].some(code => prefixes.some(prefix => code.startsWith(prefix)));
    const scoreFor = (...prefixes: string[]) => hasBlocking(...prefixes) ? 55 : 100;

    const continuity = scoreFor('E-WS', 'E-WR', 'E-CH');
    const causality = scoreFor('E-EX', 'E-DP');
    const progression = scoreFor('E-PR', 'E-SP03', 'E-SP05', 'E-SP06');
    const space = scoreFor('E-SP01', 'E-SP02', 'E-SP04', 'E-SP08');
    const rhythm = scoreFor('E-TM');
    const clarity = scoreFor('E-EX', 'E-SP07', 'E-CA');
    const camera = scoreFor('E-SP07', 'E-CA');
    const categoryScores = [continuity, causality, progression, space, rhythm, clarity, camera];
    const overall = Math.round(categoryScores.reduce((sum, value) => sum + value, 0) / categoryScores.length);
    const jumpRiskValue = Math.min(100, Math.max(0, 100 - overall + errors.length * 8));

    const qualityScore = {
      continuity,
      causality,
      progression,
      space,
      rhythm,
      clarity,
      camera,
      jumpRisk: jumpRiskValue,
      overall,
    };

    const results = {
      dependencies: !hasBlocking('E-DP'),
      temporal: !hasBlocking('E-TM'),
      spatial: !hasBlocking('E-SP01', 'E-SP02', 'E-SP03', 'E-SP04', 'E-SP05', 'E-SP06', 'E-SP08'),
      causality: !hasBlocking('E-EX'),
      conservation: !hasBlocking('E-MT', 'E-WR', 'E-WS'),
      character: !hasBlocking('E-CH'),
      tools: !hasBlocking('E-TL', 'E-CH02'),
      visibility: !hasBlocking('E-SP07', 'E-CA'),
      progression: !hasBlocking('E-PR'),
      approved,
      errors: allErrors,
      checks,
    };

    return {
      results,
      errors,
      warnings,
      approved,
      qualityScore,
      jumpRisk: qualityScore.jumpRisk > 75 ? 'HIGH' : qualityScore.jumpRisk > 30 ? 'MEDIUM' : 'LOW',
      status: approved ? (warnings.length > 0 ? 'warnings' : 'approved') : 'blocked'
    };
  }
}

export function auditProjectStage(project: Project, scene: Scene, stage: Stage): FiscalReport {
  if (!stage.worldStateBefore || !stage.worldStateAfter) {
    throw new Error('O estágio não possui snapshots suficientes para executar a fiscalização.');
  }
  const sceneIndex = project.scenes.findIndex(item => item.id === scene.id);
  return new FiscalRunner().runAllFiscals({
    scene,
    stage,
    worldStateBefore: stage.worldStateBefore,
    worldStateAfter: stage.worldStateAfter,
    spatialMap: project.spatialMap,
    dependencyGraph: project.dependencyGraph,
    character: stage.worldStateAfter.character,
    previousScene: sceneIndex > 0 ? project.scenes[sceneIndex - 1] : undefined,
    projectDNA: project.dna,
    operation: project.operations.find(operation => operation.id === scene.operationId),
  });
}
