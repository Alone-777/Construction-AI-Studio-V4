import { TimelineEvent, Operation, ValidationError, ErrorCode, ErrorSeverity } from '../types';

export function generateMicroTimeline(operation: Operation): TimelineEvent[] {
  return [
    { id: `ev_start_${operation.id}`, time: '00:00:00', description: `Início: ${operation.name}`, type: 'state' },
    { id: `ev_prep_${operation.id}`, time: '00:00:05', description: 'Preparação', type: 'preparation' },
    { id: `ev_act_${operation.id}`, time: '00:00:15', description: 'Ação principal', type: 'action' },
    { id: `ev_end_${operation.id}`, time: '00:00:30', description: 'Resultado', type: 'result' }
  ];
}

export function detectOverload(timeline: TimelineEvent[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const timeCounts: Record<string, number> = {};
  
  timeline.forEach(t => {
    timeCounts[t.time] = (timeCounts[t.time] || 0) + 1;
  });

  for (const time in timeCounts) {
    if (timeCounts[time] > 3) {
      errors.push({
        code: ErrorCode.E_TM01,
        severity: ErrorSeverity.WARNING,
        message: `Sobrecarga temporal no instante ${time}.`
      });
    }
  }
  return errors;
}

export function detectUnderutilization(timeline: TimelineEvent[]): boolean {
  return timeline.length < 2;
}

export function distributeRhythm(totalDuration: number, steps: number): number[] {
  if (steps === 0) return [];
  if (steps === 1) return [totalDuration];
  
  const basePart = totalDuration / steps;
  const result = new Array(steps).fill(basePart);
  
  if (steps >= 3) {
    result[0] *= 0.8;
    result[1] *= 1.4;
    result[steps - 1] *= 0.8;
  }
  
  const sum = result.reduce((a, b) => a + b, 0);
  return result.map(r => r * (totalDuration / sum));
}

export function allocateScenesToOperation(operation: Operation, maxScenes: number): string[] {
  const scenes: string[] = [];
  const sceneCount = Math.min(operation.stages.length, maxScenes);
  for (let i = 0; i < sceneCount; i++) {
    scenes.push(`scene_${operation.id}_${i}`);
  }
  return scenes;
}

export function validateTemporalProgression(timeline: TimelineEvent[]): ValidationError[] {
  return detectOverload(timeline);
}
