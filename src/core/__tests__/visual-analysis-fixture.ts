import type { VisualClassification } from '../../../shared/visual-schema.mjs';

function claim<T>(value: T | null, classification: VisualClassification = 'FACT', evidence = 'Elemento diretamente visível na imagem.') {
  return { value, classification, confidence: classification === 'UNKNOWN' ? 0 : 0.86, evidence };
}

export function makeRawVisualAnalysis(construction = 'plataforma', environment = 'clareira') {
  return {
    summary: `${construction} aparente em ${environment}, com estrutura e superfície visíveis.`,
    claims: {
      constructionType: claim(construction),
      environment: claim(environment),
      terrain: claim('terreno natural parcialmente vegetado'),
      watercourse: claim(null, 'UNKNOWN', 'Nenhum curso d’água verificável no enquadramento.'),
      vegetation: claim(['vegetação rasteira', 'árvores ao fundo']),
      visibleComponents: claim(['apoios aparentes', 'estrutura', 'superfície']),
      apparentMaterials: claim(['madeira', 'pedra']),
      structure: claim('estrutura principal aparente em madeira'),
      foundation: claim(null, 'UNKNOWN', 'Fundação encoberta pela estrutura e pelo terreno.'),
      floor: claim('superfície horizontal aparente'),
      walls: claim(null, 'UNKNOWN', 'Não há paredes verificáveis no enquadramento.'),
      roof: claim(null, 'UNKNOWN', 'Não há cobertura verificável no enquadramento.'),
      openings: claim([], 'FACT', 'Não há aberturas em paredes porque nenhuma parede é visível.'),
      externalAreas: claim(['área natural ao redor']),
      paths: claim(null, 'UNKNOWN', 'Caminhos não são verificáveis.'),
      drainage: claim(null, 'UNKNOWN', 'Drenagem oculta ou fora do enquadramento.'),
      spatialRelations: claim(['estrutura central', 'vegetação no perímetro']),
      naturalElements: claim(['árvores', 'vegetação rasteira']),
      preservationElements: claim(['árvores no perímetro']),
      apparentCompletion: claim(100, 'HYPOTHESIS', 'A superfície parece utilizável, mas o término não pode ser confirmado por uma imagem.'),
    },
    uncertainties: ['Elementos ocultos permanecem desconhecidos.'],
    technicalUnknowns: ['Propriedades estruturais não são visualmente verificáveis.'],
  };
}
