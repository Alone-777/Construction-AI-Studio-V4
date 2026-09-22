import { normalizeVisualFiscalAnalysis, parseVisualFiscalJson } from './schema.mjs';

const MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export class VisualProviderError extends Error {
  constructor(providerId, code, message, httpStatus = 502) {
    super(message);
    this.name = 'VisualProviderError';
    this.providerId = providerId;
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function mapProviderStatus(providerId, status) {
  if (status === 401 || status === 403) {
    return new VisualProviderError(providerId, 'INVALID_API_KEY', `Provider '${providerId}' rejected its credential.`, 401);
  }
  if (status === 404) {
    return new VisualProviderError(providerId, 'MODEL_NOT_AVAILABLE', `Provider '${providerId}' model is unavailable.`, 422);
  }
  if (status === 402 || status === 429) {
    return new VisualProviderError(providerId, 'RATE_OR_QUOTA_LIMIT', `Provider '${providerId}' reached a rate or quota limit.`, 429);
  }
  if (status === 408 || status === 504) {
    return new VisualProviderError(providerId, 'PROVIDER_TIMEOUT', `Provider '${providerId}' timed out.`, 504);
  }
  if (Number(status) >= 500) {
    return new VisualProviderError(providerId, 'PROVIDER_UNAVAILABLE', `Provider '${providerId}' is unavailable.`, 503);
  }
  return new VisualProviderError(providerId, 'INVALID_PROVIDER_RESPONSE', `Provider '${providerId}' returned HTTP ${status}.`);
}

export function providerTimeout(env = process.env) {
  const value = Number(env.VISUAL_FISCAL_TIMEOUT_MS);
  return Number.isFinite(value) && value >= 10_000 && value <= 180_000
    ? value
    : 120_000;
}

export function parseImageRequest(request) {
  const mimeType = String(request?.mimeType ?? '').toLowerCase();
  if (!MIME_TYPES.has(mimeType)) throw new Error('Unsupported fiscal image MIME type.');
  const imageData = String(request?.imageData ?? '');
  const match = imageData.match(/^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match || match[1].toLowerCase() !== mimeType) {
    throw new Error('Fiscal image must be a consistent base64 data URL.');
  }
  const bytes = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (bytes.length < 64 || bytes.length > 20 * 1024 * 1024) {
    throw new Error('Fiscal image must be between 64 bytes and 20 MB.');
  }
  return {
    base64: bytes.toString('base64'),
    dataUrl: `data:${mimeType};base64,${bytes.toString('base64')}`,
    mimeType,
    context: String(request?.context ?? '').trim().slice(0, 10_000),
  };
}

export async function fetchWithTimeout(url, options, timeoutMs, providerId) {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new VisualProviderError(providerId, 'PROVIDER_TIMEOUT', `Provider '${providerId}' timed out.`, 504);
    }
    throw new VisualProviderError(providerId, 'PROVIDER_UNAVAILABLE', `Could not connect to provider '${providerId}'.`, 503);
  }
}

export function parseProviderText(text, providerId) {
  try {
    return parseVisualFiscalJson(text);
  } catch (error) {
    if (error?.code === 'INVALID_PROVIDER_RESPONSE') {
      throw new VisualProviderError(providerId, error.code, error.message);
    }
    throw error;
  }
}

export function normalizeProviderObject(value, providerId) {
  try {
    return normalizeVisualFiscalAnalysis(value);
  } catch (error) {
    throw new VisualProviderError(providerId, 'INVALID_PROVIDER_RESPONSE', error.message);
  }
}
