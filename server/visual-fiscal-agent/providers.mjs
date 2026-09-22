import { VISUAL_FISCAL_SYSTEM_PROMPT } from './prompt.mjs';
import { VISUAL_FISCAL_RESPONSE_SCHEMA } from './schema.mjs';
import {
  fetchWithTimeout,
  mapProviderStatus,
  normalizeProviderObject,
  parseImageRequest,
  parseProviderText,
  providerTimeout,
  VisualProviderError,
} from './provider-utils.mjs';

function sanitizeGeminiSchema(value) {
  if (Array.isArray(value)) return value.map(sanitizeGeminiSchema);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'additionalProperties')
      .map(([key, child]) => [key, sanitizeGeminiSchema(child)]),
  );
}

export class GeminiFiscalProvider {
  id = 'gemini';
  name = 'Gemini Visual Fiscal';
  billingClass = 'free_or_quota';

  constructor(env = process.env) {
    this.apiKey = String(env.VISUAL_FISCAL_GEMINI_API_KEY || env.GEMINI_API_KEY || '').trim();
    this.model = String(env.VISUAL_FISCAL_GEMINI_MODEL || env.GEMINI_MODEL || 'gemini-3.7-flash').trim();
    this.timeoutMs = providerTimeout(env);
  }

  get configured() {
    return Boolean(this.apiKey && this.model);
  }

  async analyze(request) {
    if (!this.configured) {
      throw new VisualProviderError(this.id, 'PROVIDER_UNAVAILABLE', 'Gemini fiscal provider is not configured.', 503);
    }
    const image = parseImageRequest(request);
    const response = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { mimeType: image.mimeType, data: image.base64 } },
              { text: `${VISUAL_FISCAL_SYSTEM_PROMPT}\n\n${image.context}` },
            ],
          }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseJsonSchema: sanitizeGeminiSchema(VISUAL_FISCAL_RESPONSE_SCHEMA),
          },
        }),
      },
      this.timeoutMs,
      this.id,
    );
    if (!response.ok) throw mapProviderStatus(this.id, response.status);
    const payload = await response.json().catch(() => null);
    const text = payload?.candidates?.[0]?.content?.parts
      ?.map(part => typeof part.text === 'string' ? part.text : '')
      .join('');
    return parseProviderText(text, this.id);
  }
}

export class OpenAIFiscalProvider {
  id = 'openai';
  name = 'OpenAI Visual Fiscal';
  billingClass = 'paid';

  constructor(env = process.env) {
    this.apiKey = String(env.VISUAL_FISCAL_OPENAI_API_KEY || env.OPENAI_API_KEY || '').trim();
    this.model = String(env.VISUAL_FISCAL_OPENAI_MODEL || env.OPENAI_VISUAL_MODEL || 'gpt-4.1-mini').trim();
    this.timeoutMs = providerTimeout(env);
  }

  get configured() {
    return Boolean(this.apiKey && this.model);
  }

  async analyze(request) {
    if (!this.configured) {
      throw new VisualProviderError(this.id, 'PROVIDER_UNAVAILABLE', 'OpenAI fiscal provider is not configured.', 503);
    }
    const image = parseImageRequest(request);
    const response = await fetchWithTimeout(
      'https://api.openai.com/v1/responses',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: [{
            role: 'user',
            content: [
              { type: 'input_text', text: `${VISUAL_FISCAL_SYSTEM_PROMPT}\n\n${image.context}` },
              { type: 'input_image', image_url: image.dataUrl, detail: 'high' },
            ],
          }],
          text: {
            format: {
              type: 'json_schema',
              name: 'construction_visual_fiscal',
              strict: true,
              schema: VISUAL_FISCAL_RESPONSE_SCHEMA,
            },
          },
        }),
      },
      this.timeoutMs,
      this.id,
    );
    if (!response.ok) throw mapProviderStatus(this.id, response.status);
    const payload = await response.json().catch(() => null);
    const text = payload?.output
      ?.flatMap(item => Array.isArray(item.content) ? item.content : [])
      .find(item => item.type === 'output_text')?.text;
    return parseProviderText(text, this.id);
  }
}

export class CustomFiscalProvider {
  id = 'custom';
  name = 'Custom Visual Fiscal';
  billingClass = 'custom';

  constructor(env = process.env) {
    this.endpoint = String(env.VISUAL_FISCAL_CUSTOM_ENDPOINT || '').trim();
    this.apiKey = String(env.VISUAL_FISCAL_CUSTOM_API_KEY || '').trim();
    this.model = String(env.VISUAL_FISCAL_CUSTOM_MODEL || 'custom').trim();
    this.timeoutMs = providerTimeout(env);
    this.allowHttpLocalhost = String(env.VISUAL_FISCAL_CUSTOM_ALLOW_HTTP_LOCALHOST || '').toLowerCase() === 'true';
  }

  get configured() {
    try {
      const endpoint = new URL(this.endpoint);
      if (endpoint.protocol === 'https:') return true;
      return this.allowHttpLocalhost && endpoint.protocol === 'http:' &&
        ['127.0.0.1', 'localhost', '::1'].includes(endpoint.hostname);
    } catch {
      return false;
    }
  }

  async analyze(request) {
    if (!this.configured) {
      throw new VisualProviderError(this.id, 'PROVIDER_UNAVAILABLE', 'Custom fiscal provider is not configured.', 503);
    }
    const image = parseImageRequest(request);
    const headers = { 'content-type': 'application/json' };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
    const response = await fetchWithTimeout(
      this.endpoint,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          contract: 'construction-visual-fiscal-agent/1',
          model: this.model,
          systemPrompt: VISUAL_FISCAL_SYSTEM_PROMPT,
          responseSchema: VISUAL_FISCAL_RESPONSE_SCHEMA,
          imageData: image.dataUrl,
          mimeType: image.mimeType,
          context: image.context,
        }),
      },
      this.timeoutMs,
      this.id,
    );
    if (!response.ok) throw mapProviderStatus(this.id, response.status);
    const payload = await response.json().catch(() => null);
    return normalizeProviderObject(payload?.analysis ?? payload, this.id);
  }
}

export function createFiscalProviders(env = process.env) {
  return [
    new GeminiFiscalProvider(env),
    new CustomFiscalProvider(env),
    new OpenAIFiscalProvider(env),
  ];
}

export function describeFiscalProviders(env = process.env) {
  return createFiscalProviders(env).map(provider => ({
    id: provider.id,
    name: provider.name,
    model: provider.model,
    billingClass: provider.billingClass,
    configured: provider.configured,
  }));
}
