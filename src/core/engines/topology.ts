import { ZoneType, StagePercentage } from '../types';

export interface ZoneProgression {
  stagePercentage: StagePercentage;
  zones: string[];
  components: string[];
}

export interface TopologyResult {
  recommendedType: ZoneType;
  progression: ZoneProgression[];
  reasoning: string;
}

/**
 * Analisa a topologia da operação baseada nos elementos.
 */
export function analyzeTopology(elements: string[], operationType: string, availableZones: string[]): TopologyResult {
  const normalizedType = operationType.toLowerCase();
  const zones = availableZones.length > 0 ? availableZones : ['Z1'];
  
  let recommendedType: ZoneType = 'CUSTOM';
  let reasoning = 'Classificação padrão.';
  const progression: ZoneProgression[] = [];

  if (elements.length === 1 && (normalizedType.includes('porta') || normalizedType.includes('janela'))) {
    recommendedType = 'LOCAL';
    reasoning = 'Ação focada em um único elemento local.';
    progression.push({ stagePercentage: 0, zones: [zones[0]], components: [] });
    progression.push({ stagePercentage: 100, zones: [zones[0]], components: elements });
  } else if (normalizedType.includes('pilar') || normalizedType.includes('estaca') || normalizedType.includes('sapata')) {
    recommendedType = 'POINTS';
    reasoning = 'Ação distribuída em pontos específicos.';
    [25, 50, 75, 100].forEach((percent, idx) => {
      const start = Math.floor((idx * elements.length) / 4);
      const end = Math.floor(((idx + 1) * elements.length) / 4);
      const slice = elements.slice(start, end);
      progression.push({ 
        stagePercentage: percent as StagePercentage, 
        zones: [zones[idx % zones.length]],
        components: slice 
      });
    });
  } else if (normalizedType.includes('parede') || normalizedType.includes('viga') || normalizedType.includes('travessa')) {
    recommendedType = 'LINEAR';
    reasoning = 'Construção linear cruzando ambiente.';
    [25, 50, 75, 100].forEach((percent, idx) => {
      progression.push({
        stagePercentage: percent as StagePercentage,
        zones: [zones[Math.min(idx, zones.length - 1)]],
        components: elements,
      });
    });
  } else if (normalizedType.includes('cobertura') || normalizedType.includes('telhado')) {
    recommendedType = 'SURFACE';
    reasoning = 'Transformação contínua de uma superfície construtiva.';
    [25, 50, 75, 100].forEach((percent, idx) => {
      progression.push({
        stagePercentage: percent as StagePercentage,
        zones: [zones[Math.min(idx, zones.length - 1)]],
        components: elements,
      });
    });
  } else if (normalizedType.includes('limpeza') || normalizedType.includes('laje') ||
             normalizedType.includes('piso') || normalizedType.includes('base') ||
             normalizedType.includes('fundação') || normalizedType.includes('fundacao')) {
    recommendedType = 'AREA';
    reasoning = 'Atuação sobre área de superfície.';
    progression.push({ stagePercentage: 0, zones: [], components: [] });
    [25, 50, 75, 100].forEach((percent, idx) => {
      const start = Math.floor((idx * elements.length) / 4);
      const end = Math.max(start + 1, Math.floor(((idx + 1) * elements.length) / 4));
      progression.push({
        stagePercentage: percent as StagePercentage,
        zones: [zones[idx % zones.length]],
        components: elements.length > 1 ? elements.slice(start, Math.min(end, elements.length)) : elements,
      });
    });
  } else {
    recommendedType = 'HYBRID';
    reasoning = 'Combinação complexa de operações.';
    [25, 50, 75, 100].forEach((percent, idx) => {
      progression.push({
        stagePercentage: percent as StagePercentage,
        zones: [zones[idx % zones.length]],
        components: elements,
      });
    });
  }

  return { recommendedType, progression, reasoning };
}
