import {
  fetchWithTimeout,
  normalizeProviderObject,
  parseImageRequest,
  providerTimeoutFromEnv,
  ProviderResponseError,
  ProviderUnavailableError,
} from './provider-utils.mjs';

export class CustomVisualProvider {
  id = 'custom';
  name = 'Custom Visual';
  kind = 'custom';

  constructor(env = process.env) {
    this.endpoint = env.CUSTOM_VISUAL_ENDPOINT?.trim() ?? '';
    this.apiKey = env.CUSTOM_VISUAL_API_KEY?.trim() ?? '';
    this.model = env.CUSTOM_VISUAL_MODEL?.trim() || 'custom';
    this.timeoutMs = providerTimeoutFromEnv(env);
    this.allowHttpLocalhost = String(env.CUSTOM_VISUAL_ALLOW_HTTP_LOCALHOST || '').toLowerCase() === 'true';
  }

  get configured() {
    try {
      const url = new URL(this.endpoint);
      if (url.protocol === 'https:') return true;
      return this.allowHttpLocalhost && url.protocol === 'http:' &&
        ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
    } catch {
      return false;
    }
  }

  async analyze(request) {
    if (!this.configured) throw new ProviderUnavailableError(this.id);
    const image = parseImageRequest(request);
    const headers = { 'content-type': 'application/json' };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
    const response = await fetchWithTimeout(this.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        imageData: image.dataUrl,
        mimeType: image.mimeType,
        userContext: image.userContext,
        contract: 'construction-ai-studio-visual-v1',
      }),
    }, this.timeoutMs, this.id);
    if (!response.ok) throw new ProviderResponseError(this.id, response.status);
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new ProviderResponseError(this.id, response.status);
    }
    return normalizeProviderObject(payload, this.id);
  }
}
