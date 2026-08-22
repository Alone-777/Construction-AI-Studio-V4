import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiVisualProvider } from './providers/gemini-visual-provider.mjs';
import { OpenAIVisualProvider } from './providers/openai-visual-provider.mjs';
import { CustomVisualProvider } from './providers/custom-visual-provider.mjs';
import {
  parseImageRequest,
  parseJsonText,
  ProviderResponseError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from './providers/provider-utils.mjs';
import { VISUAL_ANALYSIS_PROMPT } from './visual-prompt.mjs';
import {
  createSafeVisualDiagnostic,
  recordSafeVisualDiagnostic,
} from './visual-diagnostics.mjs';

const onePixelPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

afterEach(() => vi.unstubAllGlobals());

describe('Adapters visuais do backend', () => {
  it('Gemini é funcional apenas com chave de servidor e não a expõe no status', async () => {
    const off = new GeminiVisualProvider({});
    expect(off.configured).toBe(false);
    await expect(off.analyze({})).rejects.toBeInstanceOf(ProviderUnavailableError);
    const on = new GeminiVisualProvider({ GEMINI_API_KEY: 'secret-only-on-server', GEMINI_MODEL: 'gemini-test' });
    expect(on.configured).toBe(true);
    expect(JSON.stringify({ id: on.id, name: on.name, kind: on.kind, configured: on.configured })).not.toContain('secret-only-on-server');
  });

  it('mantém OpenAI e Custom como adapters separados e configuráveis', () => {
    expect(new OpenAIVisualProvider({}).configured).toBe(false);
    expect(new OpenAIVisualProvider({ OPENAI_API_KEY: 'server-only' }).configured).toBe(true);
    expect(new CustomVisualProvider({ CUSTOM_VISUAL_ENDPOINT: 'http://inseguro.local' }).configured).toBe(false);
    expect(new CustomVisualProvider({
      CUSTOM_VISUAL_ENDPOINT: 'http://127.0.0.1:8788/analyze',
      CUSTOM_VISUAL_ALLOW_HTTP_LOCALHOST: 'true',
    }).configured).toBe(true);
    expect(new CustomVisualProvider({ CUSTOM_VISUAL_ENDPOINT: 'https://provider.example/analyze' }).configured).toBe(true);
  });

  it('valida MIME, tamanho e assinatura binária antes de qualquer chamada externa', () => {
    const parsed = parseImageRequest({ imageData: onePixelPng, mimeType: 'image/png' });
    expect(parsed.bytes.length).toBeGreaterThan(20);
    expect(() => parseImageRequest({ imageData: 'data:image/png;base64,AAAA', mimeType: 'image/png' })).toThrow(/Assinatura/);
    expect(() => parseImageRequest({ imageData: onePixelPng, mimeType: 'image/jpeg' })).toThrow(/MIME consistente/);
  });

  it('recusa JSON livre ou incompleto retornado pelo provider', () => {
    expect(() => parseJsonText('texto livre', 'gemini')).toThrow(/resposta inválida/);
    expect(() => parseJsonText('{"summary":"incompleto"}', 'gemini')).toThrow(/Análise visual inválida/);
  });

  it('bloqueia resposta inválida recebida pelo adapter Custom', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ summary: 'sem claims' }), { status: 200 })));
    const provider = new CustomVisualProvider({ CUSTOM_VISUAL_ENDPOINT: 'https://provider.example/analyze' });
    await expect(provider.analyze({ imageData: onePixelPng, mimeType: 'image/png' })).rejects.toThrow(/Análise visual inválida/);
  });

  it('converte falha externa em erro seguro sem chave ou corpo remoto', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('quota e detalhes internos', { status: 429 })));
    const provider = new GeminiVisualProvider({ GEMINI_API_KEY: 'never-return-this-secret' });
    await expect(provider.analyze({ imageData: onePixelPng, mimeType: 'image/png' })).rejects.toThrow(/HTTP 429/);
    try {
      await provider.analyze({ imageData: onePixelPng, mimeType: 'image/png' });
    } catch (error) {
      expect(String(error)).not.toContain('never-return-this-secret');
      expect(String(error)).not.toContain('quota e detalhes internos');
    }
  });

  it('instrui o provider a separar fatos, hipóteses e desconhecidos', () => {
    expect(VISUAL_ANALYSIS_PROMPT).toContain('FACT');
    expect(VISUAL_ANALYSIS_PROMPT).toContain('HYPOTHESIS');
    expect(VISUAL_ANALYSIS_PROMPT).toContain('UNKNOWN');
    expect(VISUAL_ANALYSIS_PROMPT).toContain('Never invent exact dimensions');
  });

  it('traduz chave inválida sem vazar chave ou corpo remoto', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('credential secret body', { status: 401 })));
    const provider = new GeminiVisualProvider({ GEMINI_API_KEY: 'server-secret' });
    await expect(provider.analyze({ imageData: onePixelPng, mimeType: 'image/png' })).rejects.toMatchObject({
      code: 'INVALID_API_KEY',
      httpStatus: 401,
    });
    try {
      await provider.analyze({ imageData: onePixelPng, mimeType: 'image/png' });
    } catch (error) {
      expect(String(error)).toContain('credencial');
      expect(String(error)).not.toContain('server-secret');
      expect(String(error)).not.toContain('credential secret body');
    }
  });

  it('informa explicitamente quando o modelo configurado não está disponível', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
    const provider = new GeminiVisualProvider({ GEMINI_API_KEY: 'server-secret', GEMINI_MODEL: 'modelo-inexistente' });
    await expect(provider.analyze({ imageData: onePixelPng, mimeType: 'image/png' })).rejects.toMatchObject({
      code: 'MODEL_NOT_AVAILABLE',
    });
  });

  it('converte timeout em erro compreensível e seguro', async () => {
    const timeout = Object.assign(new Error('aborted with internal details'), { name: 'TimeoutError' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw timeout; }));
    const provider = new GeminiVisualProvider({
      GEMINI_API_KEY: 'server-secret',
      VISUAL_PROVIDER_TIMEOUT_MS: '1000',
    });
    await expect(provider.analyze({ imageData: onePixelPng, mimeType: 'image/png' })).rejects.toBeInstanceOf(ProviderTimeoutError);
    await expect(provider.analyze({ imageData: onePixelPng, mimeType: 'image/png' })).rejects.toMatchObject({
      code: 'PROVIDER_TIMEOUT', httpStatus: 504,
    });
  });

  it.each([
    [402, 'QUOTA_EXCEEDED'],
    [429, 'RATE_OR_QUOTA_LIMIT'],
    [503, 'PROVIDER_UNAVAILABLE'],
  ])('mapeia HTTP %s para erro operacional %s', (status, code) => {
    expect(new ProviderResponseError('gemini', status)).toMatchObject({ code });
  });

  it('gera diagnóstico apenas com campos seguros e contagens do schema', () => {
    const diagnostic = createSafeVisualDiagnostic({
      provider: 'gemini',
      model: 'model-from-env',
      durationMs: 123.6,
      internalHttpStatus: 200,
      analysis: { claims: {
        a: { classification: 'FACT' },
        b: { classification: 'HYPOTHESIS' },
        c: { classification: 'UNKNOWN' },
      } },
      apiKey: 'never-log-this',
      imageData: onePixelPng,
    });
    expect(diagnostic).toMatchObject({
      provider: 'gemini', model: 'model-from-env', durationMs: 124,
      totalClaims: 3, factClaims: 1, hypothesisClaims: 1, unknownClaims: 1,
      schemaValidation: 'valid',
    });
    expect(JSON.stringify(diagnostic)).not.toContain('never-log-this');
    expect(JSON.stringify(diagnostic)).not.toContain('base64');
  });

  it('permite desativar o diagnóstico sem produzir log', () => {
    const logger = vi.fn();
    expect(recordSafeVisualDiagnostic({ provider: 'gemini' }, { enabled: false, logger })).toBeUndefined();
    expect(logger).not.toHaveBeenCalled();
    const result = recordSafeVisualDiagnostic({ provider: 'gemini', errorCode: 'INVALID_PROVIDER_RESPONSE' }, { enabled: true, logger });
    expect(result?.parsingErrors).toBe(1);
    expect(logger).toHaveBeenCalledOnce();
  });
});
