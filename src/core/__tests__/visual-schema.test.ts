import { describe, expect, it } from 'vitest';
import {
  MAX_IMAGE_BYTES,
  VisualSchemaValidationError,
  validateAndNormalizeVisualAnalysis,
  validateImageMetadata,
} from '../../../shared/visual-schema.mjs';
import { makeRawVisualAnalysis } from './visual-analysis-fixture';

describe('Schema e normalização visual', () => {
  it('normaliza um documento completo e força UNKNOWN para null', () => {
    const result = validateAndNormalizeVisualAnalysis(makeRawVisualAnalysis(), 'gemini');
    expect(result.schemaVersion).toBe('1.0.0');
    expect(result.providerId).toBe('gemini');
    expect(result.claims.foundation.classification).toBe('UNKNOWN');
    expect(result.claims.foundation.value).toBeNull();
    expect(result.technicalUnknowns.some(item => item.includes('Capacidade'))).toBe(true);
  });

  it('rejeita classificação inválida, claim ausente e confiança fora do intervalo', () => {
    const raw = makeRawVisualAnalysis() as Record<string, any>;
    raw.claims.roof = { value: 'telhado', classification: 'CERTAIN', confidence: 2, evidence: '' };
    delete raw.claims.floor;
    expect(() => validateAndNormalizeVisualAnalysis(raw, 'invalid')).toThrow(VisualSchemaValidationError);
  });

  it('bloqueia propriedades técnicas e medidas exatas inventadas', () => {
    const technical = { ...makeRawVisualAnalysis(), structuralCapacity: 'alta' };
    expect(() => validateAndNormalizeVisualAnalysis(technical, 'invalid')).toThrow(/técnica não visual/);
    const measured = makeRawVisualAnalysis() as Record<string, any>;
    measured.claims.structure = { value: 'viga de 4 m', classification: 'FACT', confidence: 0.9, evidence: 'aparente' };
    expect(() => validateAndNormalizeVisualAnalysis(measured, 'invalid')).toThrow(/medida técnica exata/);
  });

  it('valida MIME e limite de upload antes do provider', () => {
    expect(() => validateImageMetadata('image/png', 1024)).not.toThrow();
    expect(() => validateImageMetadata('image/svg+xml', 1024)).toThrow(/não permitido/);
    expect(() => validateImageMetadata('image/jpeg', MAX_IMAGE_BYTES + 1)).toThrow(/excede/);
    expect(() => validateImageMetadata('image/webp', 0)).toThrow(/vazia/);
  });
});
