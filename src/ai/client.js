import { compactForAI, redactSecrets } from './security.js';

const DEFAULT_BASE_URL = 'https://api.bazaarlink.ai/v1';
const DEFAULT_MODEL = 'qwen/qwen3.7-flash:free';

export class BugHunterAIError extends Error {
  constructor(message, { status, body, cause } = {}) {
    super(message, { cause });
    this.name = 'BugHunterAIError';
    this.status = status;
    this.body = body;
  }
}

export function createAIClient({ apiKey, baseUrl = DEFAULT_BASE_URL, model = DEFAULT_MODEL, fetchImpl = globalThis.fetch, timeoutMs = 30000 } = {}) {
  if (!apiKey) throw new Error('Bug Hunter AI: API key não configurada. A IA integrada usa a credencial embutida; também aceita BUG_HUNTER_AI_KEY ou credencial externa criptografada.');
  if (typeof fetchImpl !== 'function') throw new Error('Bug Hunter AI: fetch não está disponível neste Node.');

  const endpoint = `${String(baseUrl).replace(/\/$/, '')}/chat/completions`;

  async function chat(messages, { temperature = 0.1, maxTokens = 1400, signal } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    if (signal) signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: messages.map((m) => ({ role: m.role, content: compactForAI(m.content, { maxChars: 12000 }) })),
          temperature,
          max_tokens: maxTokens
        }),
        signal: controller.signal
      });
      const raw = await response.text();
      let data;
      try { data = JSON.parse(raw); } catch { data = null; }
      if (!response.ok) {
        throw new BugHunterAIError(`API de IA retornou HTTP ${response.status}.`, {
          status: response.status,
          body: redactSecrets(raw.slice(0, 4000))
        });
      }
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new BugHunterAIError('Resposta da IA sem choices[0].message.content.', { body: compactForAI(raw) });
      return { content, raw: data };
    } catch (error) {
      if (error instanceof BugHunterAIError) throw error;
      if (error?.name === 'AbortError') throw new BugHunterAIError(`Tempo limite da IA excedido (${timeoutMs} ms).`, { cause: error });
      throw new BugHunterAIError(`Falha ao chamar a IA: ${error.message}`, { cause: error });
    } finally {
      clearTimeout(timer);
    }
  }

  return { endpoint, model, chat };
}
