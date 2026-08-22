import {
  validateAndNormalizeVisualAnalysis,
  type NormalizedVisualAnalysis,
} from '../../../shared/visual-schema.mjs';
import type {
  VisualAnalysisRequest,
  VisualProvider,
  VisualProviderDescriptor,
} from './visual-provider';

export class VisualApiError extends Error {
  readonly code: string;

  constructor(message: string, code = 'VISUAL_API_ERROR') {
    super(message);
    this.name = 'VisualApiError';
    this.code = code;
  }
}

async function parseApiResponse(response: Response): Promise<Record<string, unknown>> {
  let payload: Record<string, unknown> = {};
  try {
    payload = await response.json() as Record<string, unknown>;
  } catch {
    throw new VisualApiError('O backend visual retornou uma resposta ilegível.');
  }
  if (!response.ok) {
    throw new VisualApiError(
      typeof payload.error === 'string' ? payload.error : 'Falha ao analisar a imagem.',
      typeof payload.code === 'string' ? payload.code : 'VISUAL_API_ERROR',
    );
  }
  return payload;
}

export async function fetchVisualProviderDescriptors(): Promise<VisualProviderDescriptor[]> {
  let response: Response;
  try {
    response = await fetch('/api/visual/providers', { headers: { accept: 'application/json' } });
  } catch {
    throw new VisualApiError('Backend visual indisponível. Inicie o servidor seguro.');
  }
  const payload = await parseApiResponse(response);
  if (!Array.isArray(payload.providers)) throw new VisualApiError('Status de providers inválido.');
  return payload.providers.filter((provider): provider is VisualProviderDescriptor => {
    if (!provider || typeof provider !== 'object') return false;
    const item = provider as Record<string, unknown>;
    return typeof item.id === 'string' && typeof item.name === 'string' &&
      ['gemini', 'openai', 'custom'].includes(String(item.kind)) && typeof item.configured === 'boolean' &&
      (item.model === undefined || typeof item.model === 'string');
  });
}

export class InternalApiVisualProvider implements VisualProvider {
  readonly descriptor: VisualProviderDescriptor;

  constructor(descriptor: VisualProviderDescriptor) {
    this.descriptor = { ...descriptor };
  }

  async analyze(request: VisualAnalysisRequest): Promise<NormalizedVisualAnalysis> {
    if (!this.descriptor.configured) {
      throw new VisualApiError(`Provider '${this.descriptor.name}' não está configurado.`, 'PROVIDER_UNAVAILABLE');
    }
    let response: Response;
    try {
      response = await fetch('/api/visual/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ ...request, providerId: this.descriptor.id }),
      });
    } catch {
      throw new VisualApiError('Backend visual indisponível durante a análise.');
    }
    const payload = await parseApiResponse(response);
    return validateAndNormalizeVisualAnalysis(payload.analysis, this.descriptor.id);
  }
}
