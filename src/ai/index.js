import { createAIClient } from './client.js';
import { resolveApiKey, decryptBundledApiKey } from './security.js';
import { compactForAI, redactSecrets } from './security.js';

const SYSTEM_PROMPT = `Você é o assistente de engenharia do Bug Hunter Static. Analise achados de análise estática com foco em bugs reais, segurança, compatibilidade ESM/CommonJS, JavaScript/TypeScript e Python. Não invente fatos que não aparecem no contexto. Diferencie certeza de hipótese. Responda SOMENTE JSON válido com este formato: {"summary":"...","prioritizedFindings":[{"ruleId":"BHxxx","file":"...","reason":"...","confidence":"high|medium|low","fix":"..."}],"projectRisks":["..."],"nextSteps":["..."]}. Seja objetivo.`;

export function buildAIContext(result, { includeCode = false, maxFindings = 20, maxChars = 18000 } = {}) {
  const findings = (result?.findings ?? []).slice(0, maxFindings).map((f) => ({
    id: f.id,
    ruleId: f.ruleId,
    title: f.title,
    severity: f.severity,
    confidence: f.confidence,
    category: f.category,
    file: f.file,
    line: f.line,
    message: f.message,
    evidence: f.evidence,
    suggestion: f.suggestion,
    ...(includeCode ? { codeFrame: f.codeFrame || f.snippet || null } : {})
  }));
  return compactForAI({
    scanner: { name: 'bug-hunter-static', project: result?.root ?? null },
    summary: result?.summary ?? {},
    project: result?.project ?? {},
    parseErrors: (result?.parseErrors ?? []).slice(0, 20),
    findings
  }, { maxChars });
}

export function parseAIJson(content) {
  const clean = String(content ?? '').trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(clean); } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
    return { summary: redactSecrets(clean.slice(0, 6000)), prioritizedFindings: [], projectRisks: [], nextSteps: [] };
  }
}

export async function analyzeScanWithAI(result, options = {}) {
  const root = options.root ?? result?.root ?? process.cwd();
  const credentials = options.apiKey ? { apiKey: options.apiKey, source: 'argument' } : await resolveApiKey({ root, env: options.env ?? process.env, file: options.credentialFile });
  if (!credentials.apiKey) {
    throw new Error('Bug Hunter AI: nenhuma API key encontrada. A credencial IA integrada é usada automaticamente; também é possível sobrescrever com BUG_HUNTER_AI_KEY ou credencial externa criptografada.');
  }
  const client = createAIClient({
    apiKey: credentials.apiKey,
    baseUrl: options.baseUrl,
    model: options.model,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs
  });
  const context = buildAIContext(result, options);
  const response = await client.chat([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Faça uma revisão assistida deste scan. Não execute código. Contexto:\n${context}` }
  ], { maxTokens: options.maxTokens ?? 1600 });
  const analysis = parseAIJson(response.content);
  return {
    ...analysis,
    provider: 'bazaarlink',
    model: client.model,
    endpoint: client.endpoint,
    credentialSource: credentials.source
  };
}

export async function askAI(prompt, options = {}) {
  const credentials = options.apiKey ? { apiKey: options.apiKey, source: 'argument' } : await resolveApiKey({ root: options.root ?? process.cwd(), env: options.env ?? process.env, file: options.credentialFile });
  if (!credentials.apiKey) throw new Error('Bug Hunter AI: nenhuma API key encontrada.');
  const client = createAIClient({ apiKey: credentials.apiKey, baseUrl: options.baseUrl, model: options.model, fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs });
  const response = await client.chat([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: redactSecrets(prompt) }
  ], { maxTokens: options.maxTokens ?? 1200 });
  return { ...parseAIJson(response.content), rawContent: response.content, provider: 'bazaarlink', model: client.model, credentialSource: credentials.source };
}

export { createAIClient } from './client.js';
export { decryptBundledApiKey, hasBundledApiKey, redactSecrets, compactForAI, resolveApiKey, saveEncryptedApiKey, loadEncryptedApiKey, encryptApiKey, decryptApiKey, defaultCredentialPath, defaultCredentialPathForUser } from './security.js';
