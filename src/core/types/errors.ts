/**
 * Códigos de erro da engine de análise e validação.
 */
export enum ErrorCode {
  /** transformação remota */
  E_SP01 = 'E-SP01',
  /** personagem em zona errada */
  E_SP02 = 'E-SP02',
  /** elemento futuro */
  E_SP03 = 'E-SP03',
  /** deslocamento ausente */
  E_SP04 = 'E-SP04',
  /** mudanças simultâneas indevidas */
  E_SP05 = 'E-SP05',
  /** regressão espacial */
  E_SP06 = 'E-SP06',
  /** câmera não mostra ação */
  E_SP07 = 'E-SP07',
  /** personagem teleportou */
  E_SP08 = 'E-SP08',
  /** dependência ausente */
  E_DP01 = 'E-DP01',
  /** ferramenta sem transição */
  E_TL01 = 'E-TL01',
  /** material apareceu */
  E_MT01 = 'E-MT01',
  /** resíduo desapareceu */
  E_WR01 = 'E-WR01',
  /** world state inconsistente */
  E_WS01 = 'E-WS01',
  /** prova de execução insuficiente */
  E_EX01 = 'E-EX01',
  /** cena sobrecarregada */
  E_TM01 = 'E-TM01'
}

/**
 * Nível de severidade do erro reportado.
 */
export enum ErrorSeverity {
  ERROR = 'ERROR',
  WARNING = 'WARNING',
  INFO = 'INFO'
}

/**
 * Representa um erro ou alerta de validação do sistema.
 */
export interface ValidationError {
  code: ErrorCode | string;
  severity: ErrorSeverity;
  message: string;
  sceneId?: string;
  stageId?: string;
  details?: Record<string, any>;
}

/**
 * Classificação de fatos na inferência.
 */
export type FactClassification = 'FATO' | 'HIPOTESE' | 'DESCONHECIDO';
