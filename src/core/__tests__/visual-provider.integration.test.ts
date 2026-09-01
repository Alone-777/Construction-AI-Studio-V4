import { describe, expect, it } from 'vitest';
import {
  VisualProviderRegistry,
  VisualProviderUnavailableError,
  type VisualProvider,
} from '../providers/visual-provider';
import { createProjectFromVisualProvider } from '../blueprints/visual-blueprint';
import { validateAndNormalizeVisualAnalysis } from '../../../shared/visual-schema.mjs';
import { makeRawVisualAnalysis } from './visual-analysis-fixture';

describe('Arquitetura de reconstrução por imagem', () => {
  it('não inventa análise quando não existe provider configurado', () => {
    const registry = new VisualProviderRegistry();
    expect(() => registry.getConfigured()).toThrow(VisualProviderUnavailableError);
    expect(registry.list()).toEqual([]);
  });

  it('expõe providers não configurados sem permitir execução', () => {
    const registry = new VisualProviderRegistry();
    const provider: VisualProvider = {
      descriptor: { id: 'gemini', name: 'Gemini Vision', kind: 'gemini', configured: false },
      analyze: async () => { throw new Error('não deve executar'); },
    };
    registry.register(provider);
    expect(registry.list()[0].configured).toBe(false);
    expect(() => registry.getConfigured('gemini')).toThrow(/não está configurado/);
  });

  it('encadeia provider → interpretação → blueprint → orquestrador', async () => {
    const provider: VisualProvider = {
      descriptor: { id: 'openai-test', name: 'OpenAI Test Adapter', kind: 'openai', configured: true },
      analyze: async () => validateAndNormalizeVisualAnalysis(makeRawVisualAnalysis(), 'openai-test'),
    };
    const project = await createProjectFromVisualProvider(provider, {
      imageData: 'data:image/png;base64,AAAA',
      mimeType: 'image/png',
      name: 'Reconstrução Controlada',
    });
    expect(project.planning?.source).toBe('visual');
    expect(project.planning?.providerId).toBe('openai-test');
    expect(project.planning?.assumptions.some(item => item.includes('Dimensões exatas'))).toBe(true);
    expect(project.operations.length).toBeGreaterThan(0);
    expect(project.visualReconstruction?.analysis.schemaVersion).toBe('1.0.0');
  });

  it('recusa chamar adapter marcado como não configurado', async () => {
    const provider: VisualProvider = {
      descriptor: { id: 'custom-off', name: 'Custom', kind: 'custom', configured: false },
      analyze: async () => { throw new Error('não deve executar'); },
    };
    await expect(createProjectFromVisualProvider(provider, {
      imageData: 'data:image/jpeg;base64,AAAA',
      mimeType: 'image/jpeg',
    })).rejects.toThrow(/não está configurado/);
  });
});
