import { Stage, StagePercentage, ValidationResult, ErrorCode, ErrorSeverity } from '../types';
import { analyzeTopology } from './topology';

/**
 * Gera progressão com os estágios 0/25/50/75/100
 */
export function generateProgression(
  operationId: string, 
  operationType: string, 
  elements: string[], 
  zones: string[],
  initialState: Record<string, any>
): Stage[] {
  const topology = analyzeTopology(elements, operationType, zones);
  const stages: Stage[] = [];
  
  const percentages: StagePercentage[] = [0, 25, 50, 75, 100];
  
  let lastZone = zones[0] || 'Z1';
  let currentState = { ...initialState };
  const elementProgress: Record<string, StagePercentage> = Object.fromEntries(
    elements.map(element => [element, 0 as StagePercentage]),
  );

  percentages.forEach(percent => {
    const topoStage = topology.progression.find(p => p.stagePercentage === percent);
    const activeZone = topoStage && topoStage.zones.length > 0 ? topoStage.zones[0] : lastZone;
    
    let displacement = undefined;
    if (activeZone !== lastZone) {
      displacement = { from: lastZone, to: activeZone };
    }

    const defaultValidation: ValidationResult = {
      dependencies: true, temporal: true, spatial: true, causality: true, 
      conservation: true, character: true, tools: true, visibility: true, 
      progression: true, approved: true, errors: []
    };

    const stageChanges = percent === 0 ? [] : (topoStage?.components ?? elements);
    const progressesByElement = topology.recommendedType === 'POINTS' || topology.recommendedType === 'AREA';
    if (percent > 0) {
      if (progressesByElement) {
        stageChanges.forEach(element => { elementProgress[element] = 100; });
      } else {
        elements.forEach(element => { elementProgress[element] = percent; });
      }
    }
    const completedElements = elements.filter(element => elementProgress[element] === 100);
    const partialElements = elements.filter(element => elementProgress[element] > 0 && elementProgress[element] < 100);
    const futureElements = elements.filter(element => elementProgress[element] < 100);
    const physicalState = {
      elementProgress: { ...elementProgress },
      completedElements,
      partialElements,
    };
    const finalState = { ...currentState, progress: percent, ...physicalState };

    const stage: Stage = {
      percentage: percent,
      initialState: currentState,
      characterPosition: activeZone,
      displacement,
      activeZone,
      physicalAction: percent === 0
        ? `Registrar estado inicial de ${operationType}`
        : `Executar ${operationType} até ${percent}%`,
      allowedChanges: stageChanges,
      finalState,
      visualEvidence: [percent === 0
        ? `Estado inicial de ${operationType} preservado`
        : `Mudança física de ${operationType} visível em ${percent}%`],
      preservedZones: zones.filter(z => z !== activeZone),
      futureElements,
      physicalState,
      cameraId: percent < 50 ? 'A' : 'B',
      validations: defaultValidation
    };

    stages.push(stage);
    
    lastZone = activeZone;
    currentState = { ...finalState, elementProgress: { ...elementProgress } };
  });

  return stages;
}
