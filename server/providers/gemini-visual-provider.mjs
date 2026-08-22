import { VISUAL_ANALYSIS_PROMPT, VISUAL_RESPONSE_SCHEMA } from '../visual-prompt.mjs';
import {
  fetchWithTimeout,
  parseImageRequest,
  parseJsonText,
  providerTimeoutFromEnv,
  ProviderResponseError,
  ProviderUnavailableError,
} from './provider-utils.mjs';

export class GeminiVisualProvider {
  id = 'gemini';
  name = 'Gemini Visual';
  kind = 'gemini';

  constructor(env = process.env) {
    this.apiKey = env.GEMINI_API_KEY?.trim() ?? '';
    this.model = env.GEMINI_MODEL?.trim() || 'gemini-3.7-flash';
    this.timeoutMs = providerTimeoutFromEnv(env);
  }

  get configured() {
    return this.apiKey.length > 0;
  }

  async analyze(request) {
    if (!this.configured) throw new ProviderUnavailableError(this.id);
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
              { text: `${VISUAL_ANALYSIS_PROMPT}${image.userContext ? `\n\nContexto adicional do usuário: ${image.userContext}` : ''}` },
            ],
          }],
          generationConfig: {
            responseFormat: {
              text: {
                mimeType: 'application/json',
                schema: VISUAL_RESPONSE_SCHEMA,
              },
            },
            temperature: 0.1,
          },
        }),
      },
      this.timeoutMs,
      this.id,
    );
    if (!response.ok) throw new ProviderResponseError(this.id, response.status);
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new ProviderResponseError(this.id, response.status);
    }
    const text = payload?.candidates?.[0]?.content?.parts
      ?.map(part => typeof part.text === 'string' ? part.text : '')
      .join('');
    return parseJsonText(text, this.id);
  }
}
