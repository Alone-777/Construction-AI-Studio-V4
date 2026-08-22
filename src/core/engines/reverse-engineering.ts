import { FactClassification } from '../types';

export interface ConstructionPhase {
  name: string;
  order: number;
  components: string[];
  materials: string[];
  estimatedComplexity: 'low' | 'medium' | 'high';
  classification: FactClassification;
}

export function decomposeFromFinal(finalTarget: string): ConstructionPhase[] {
  const phases: ConstructionPhase[] = [];
  const normalized = finalTarget.toLowerCase();

  if (normalized.includes('cabana') || normalized.includes('casa')) {
    phases.push({ name: 'Acabamento', order: 4, components: ['Pintura', 'Porta', 'Janela'], materials: ['Tinta', 'Madeira Fina'], estimatedComplexity: 'low', classification: 'HIPOTESE' });
    phases.push({ name: 'Cobertura', order: 3, components: ['Telhado', 'Vigas'], materials: ['Telhas', 'Madeira'], estimatedComplexity: 'high', classification: 'HIPOTESE' });
    phases.push({ name: 'Estrutura', order: 2, components: ['Paredes', 'Pilares'], materials: ['Tijolo', 'Cimento'], estimatedComplexity: 'medium', classification: 'HIPOTESE' });
    phases.push({ name: 'Base', order: 1, components: ['Fundação', 'Piso'], materials: ['Concreto', 'Pedra'], estimatedComplexity: 'high', classification: 'HIPOTESE' });
    phases.push({ name: 'Preparação', order: 0, components: ['Nivelamento'], materials: [], estimatedComplexity: 'low', classification: 'HIPOTESE' });
  } else {
    phases.push({ name: `Construção de ${finalTarget}`, order: 1, components: ['Componentes'], materials: ['Materiais'], estimatedComplexity: 'medium', classification: 'HIPOTESE' });
  }

  return phases.sort((a, b) => a.order - b.order);
}
