import { VISUAL_ANALYSIS_PROMPT, VISUAL_RESPONSE_SCHEMA } from '../visual-prompt.mjs';
import {
  FISCAL_VISUAL_ANALYSIS_PROMPT,
  FISCAL_VISUAL_RESPONSE_SCHEMA,
} from '../fiscal-visual-prompt.mjs';
import {
  fetchWithTimeout,
  parseImageRequest,
  parseFiscalJsonText,
  parseJsonText,
  providerTimeoutFromEnv,
  ProviderResponseError,
  ProviderUnavailableError,
} from './provider-utils.mjs';

export class OpenAIVisualProvider {
  id = 'openai';
  name = 'OpenAI Visual';
  kind = 'openai';

  constructor(env = process.env) {
    this.apiKey = env.OPENAI_API_KEY?.trim() ?? '';
    this.model = env.OPENAI_VISUAL_MODEL?.trim() || 'gpt-4.1-mini';
    this.timeoutMs = providerTimeoutFromEnv(env);
  }

  get configured() {
    return this.apiKey.length > 0;
  }

  async analyze(request) {
    if (!this.configured) throw new ProviderUnavailableError(this.id);
    const image = parseImageRequest(request);
    const fiscal = request?.contract === 'construction-fiscal-v1';
    const prompt = fiscal ? FISCAL_VISUAL_ANALYSIS_PROMPT : VISUAL_ANALYSIS_PROMPT;
    const schema = fiscal ? FISCAL_VISUAL_RESPONSE_SCHEMA : VISUAL_RESPONSE_SCHEMA;
    const response = await fetchWithTimeout('https://api.openai.com/v1/responses', {
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
            { type: 'input_text', text: `${prompt}${image.userContext ? `\n\nContexto adicional do usuário: ${image.userContext}` : ''}` },
            { type: 'input_image', image_url: image.dataUrl, detail: 'high' },
          ],
        }],
        text: {
          format: {
            type: 'json_schema',
            name: 'construction_visual_analysis',
            strict: true,
            schema,
          },
        },
      }),
    }, this.timeoutMs, this.id);
    if (!response.ok) throw new ProviderResponseError(this.id, response.status);
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new ProviderResponseError(this.id, response.status);
    }
    const text = payload?.output
      ?.flatMap(item => Array.isArray(item.content) ? item.content : [])
      .find(item => item.type === 'output_text')?.text;
    return fiscal ? parseFiscalJsonText(text, this.id) : parseJsonText(text, this.id);
  }
}
