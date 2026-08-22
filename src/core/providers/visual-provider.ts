import type { NormalizedVisualAnalysis } from '../../../shared/visual-schema.mjs';

export type VisualProviderKind = 'gemini' | 'openai' | 'custom';

export interface VisualAnalysisRequest {
  imageData: string;
  mimeType: string;
  userContext?: string;
}

export type VisualAnalysisResult = NormalizedVisualAnalysis;

export interface VisualProviderDescriptor {
  id: string;
  name: string;
  kind: VisualProviderKind;
  configured: boolean;
  /** Nome seguro do modelo selecionado exclusivamente pelo backend. */
  model?: string;
}

/** Adapter externo: autenticação e HTTP ficam fora do React e do Core determinístico. */
export interface VisualProvider {
  readonly descriptor: VisualProviderDescriptor;
  analyze(request: VisualAnalysisRequest): Promise<VisualAnalysisResult>;
}

export class VisualProviderUnavailableError extends Error {
  constructor(providerId?: string) {
    super(providerId
      ? `Provider visual '${providerId}' não está configurado.`
      : 'Nenhum provider visual está configurado.');
    this.name = 'VisualProviderUnavailableError';
  }
}

export class VisualProviderRegistry {
  private readonly providers = new Map<string, VisualProvider>();

  register(provider: VisualProvider): void {
    this.providers.set(provider.descriptor.id, provider);
  }

  unregister(providerId: string): void {
    this.providers.delete(providerId);
  }

  list(): VisualProviderDescriptor[] {
    return [...this.providers.values()].map(provider => ({ ...provider.descriptor }));
  }

  getConfigured(providerId?: string): VisualProvider {
    const provider = providerId
      ? this.providers.get(providerId)
      : [...this.providers.values()].find(candidate => candidate.descriptor.configured);
    if (!provider?.descriptor.configured) throw new VisualProviderUnavailableError(providerId);
    return provider;
  }
}

/** Registro vazio por padrão: não simula IA nem embute credenciais no cliente. */
export const visualProviderRegistry = new VisualProviderRegistry();
