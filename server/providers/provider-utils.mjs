import {
  validateAndNormalizeVisualAnalysis,
  validateImageMetadata,
} from '../../shared/visual-schema.mjs';

export class ProviderUnavailableError extends Error {
  constructor(providerId) {
    super(`Provider '${providerId}' não está configurado no servidor.`);
    this.name = 'ProviderUnavailableError';
    this.code = 'PROVIDER_UNAVAILABLE';
    this.httpStatus = 503;
  }
}

export class ProviderResponseError extends Error {
  constructor(providerId, status) {
    const mapped = mapProviderHttpError(providerId, status);
    super(mapped.message);
    this.name = 'ProviderResponseError';
    this.code = mapped.code;
    this.httpStatus = mapped.httpStatus;
    this.providerStatus = status;
  }
}

export class ProviderTimeoutError extends ProviderResponseError {
  constructor(providerId) {
    super(providerId, 408);
    this.name = 'ProviderTimeoutError';
    this.code = 'PROVIDER_TIMEOUT';
    this.httpStatus = 504;
    this.message = `O provider '${providerId}' excedeu o tempo limite. Tente novamente com uma imagem menor.`;
  }
}

function mapProviderHttpError(providerId, status) {
  if (status === 401 || status === 403) return {
    code: 'INVALID_API_KEY', httpStatus: 401,
    message: `A credencial do provider '${providerId}' foi recusada (HTTP ${status}). Verifique a chave no servidor.`,
  };
  if (status === 404) return {
    code: 'MODEL_NOT_AVAILABLE', httpStatus: 422,
    message: `O modelo configurado para '${providerId}' não existe ou não está disponível (HTTP 404).`,
  };
  if (status === 402) return {
    code: 'QUOTA_EXCEEDED', httpStatus: 429,
    message: `A quota do provider '${providerId}' foi excedida (HTTP 402).`,
  };
  if (status === 429) return {
    code: 'RATE_OR_QUOTA_LIMIT', httpStatus: 429,
    message: `O provider '${providerId}' atingiu quota ou limite de requisições (HTTP 429). Aguarde e tente novamente.`,
  };
  if (status === 408 || status === 504) return {
    code: 'PROVIDER_TIMEOUT', httpStatus: 504,
    message: `O provider '${providerId}' excedeu o tempo limite (HTTP ${status}).`,
  };
  if (status && status >= 500) return {
    code: 'PROVIDER_UNAVAILABLE', httpStatus: 503,
    message: `O provider '${providerId}' está temporariamente indisponível (HTTP ${status}).`,
  };
  return {
    code: 'INVALID_PROVIDER_RESPONSE', httpStatus: 502,
    message: `O provider '${providerId}' retornou uma resposta inválida${status ? ` (HTTP ${status})` : ''}.`,
  };
}

function hasImageSignature(buffer, mimeType) {
  if (mimeType === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === 'image/webp') return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
}

export function parseImageRequest(request) {
  if (!request || typeof request !== 'object') throw new Error('Requisição visual inválida.');
  const mimeType = typeof request.mimeType === 'string' ? request.mimeType : '';
  const match = typeof request.imageData === 'string'
    ? request.imageData.match(/^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i)
    : null;
  if (!match || match[1].toLowerCase() !== mimeType.toLowerCase()) {
    throw new Error('Imagem deve ser enviada como data URL base64 com MIME consistente.');
  }
  const bytes = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  validateImageMetadata(mimeType, bytes.length);
  if (!hasImageSignature(bytes, mimeType)) throw new Error('Assinatura binária da imagem não corresponde ao MIME informado.');
  return {
    bytes,
    base64: bytes.toString('base64'),
    dataUrl: `data:${mimeType};base64,${bytes.toString('base64')}`,
    mimeType,
    userContext: typeof request.userContext === 'string' ? request.userContext.trim().slice(0, 2000) : '',
  };
}

export function parseJsonText(text, providerId) {
  if (typeof text !== 'string' || !text.trim()) throw new ProviderResponseError(providerId);
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  let raw;
  try {
    raw = JSON.parse(cleaned);
  } catch {
    throw new ProviderResponseError(providerId);
  }
  return validateAndNormalizeVisualAnalysis(raw, providerId);
}

export function normalizeProviderObject(raw, providerId) {
  return validateAndNormalizeVisualAnalysis(raw, providerId);
}

export function providerTimeoutFromEnv(env = process.env) {
  const configured = Number(env.VISUAL_PROVIDER_TIMEOUT_MS);
  return Number.isFinite(configured) && configured >= 1_000 && configured <= 180_000
    ? configured
    : 60_000;
}

export async function fetchWithTimeout(url, options, timeoutMs = 60_000, providerId = 'visual') {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new ProviderTimeoutError(providerId);
    }
    const unavailable = new ProviderResponseError(providerId, 503);
    unavailable.code = 'PROVIDER_UNAVAILABLE';
    unavailable.message = `Não foi possível conectar ao provider '${providerId}'.`;
    throw unavailable;
  }
}
