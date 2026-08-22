import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateAndNormalizeVisualAnalysis } from '../../../shared/visual-schema.mjs';
import {
  fetchVisualProviderDescriptors,
  InternalApiVisualProvider,
  VisualApiError,
} from '../providers/internal-api-visual-provider';
import { makeRawVisualAnalysis } from './visual-analysis-fixture';

afterEach(() => vi.unstubAllGlobals());

describe('Cliente da API visual interna', () => {
  it('consulta apenas status sanitizado dos providers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ providers: [
      { id: 'gemini', name: 'Gemini Visual', kind: 'gemini', configured: true },
      { id: 'openai', name: 'OpenAI Visual', kind: 'openai', configured: false },
    ] }), { status: 200, headers: { 'content-type': 'application/json' } })));
    const providers = await fetchVisualProviderDescriptors();
    expect(providers).toHaveLength(2);
    expect(JSON.stringify(providers)).not.toContain('API_KEY');
    expect(Object.keys(providers[0]).sort()).toEqual(['configured', 'id', 'kind', 'name']);
  });

  it('envia a imagem ao backend e valida novamente a resposta antes do Core', async () => {
    const normalized = validateAndNormalizeVisualAnalysis(makeRawVisualAnalysis(), 'gemini');
    const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => {
      const body = JSON.parse(String(options?.body));
      expect(body.providerId).toBe('gemini');
      expect(body.imageData).toContain('data:image/png;base64');
      expect(JSON.stringify(body)).not.toContain('API_KEY');
      return new Response(JSON.stringify({ analysis: normalized }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const provider = new InternalApiVisualProvider({ id: 'gemini', name: 'Gemini', kind: 'gemini', configured: true });
    const result = await provider.analyze({ imageData: 'data:image/png;base64,AAAA', mimeType: 'image/png' });
    expect(result.schemaVersion).toBe('1.0.0');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('bloqueia resposta externa inválida sem gerar análise silenciosa', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ analysis: { summary: 'incompleto' } }), { status: 200 })));
    const provider = new InternalApiVisualProvider({ id: 'gemini', name: 'Gemini', kind: 'gemini', configured: true });
    await expect(provider.analyze({ imageData: 'data:image/png;base64,AAAA', mimeType: 'image/png' })).rejects.toThrow(/Análise visual inválida/);
  });

  it('expõe erro seguro quando backend ou provider estão indisponíveis', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: 'Provider não configurado no servidor.', code: 'PROVIDER_UNAVAILABLE',
    }), { status: 503 })));
    const provider = new InternalApiVisualProvider({ id: 'gemini', name: 'Gemini', kind: 'gemini', configured: true });
    await expect(provider.analyze({ imageData: 'data:image/png;base64,AAAA', mimeType: 'image/png' }))
      .rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' } satisfies Partial<VisualApiError>);
  });
});
