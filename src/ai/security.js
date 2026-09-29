import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const SECRET_PATTERNS = [
  /(sk-[A-Za-z0-9_-]{16,})/g,
  /(sk-bl-[A-Za-z0-9_-]{16,})/g,
  /((?:api[_-]?key|token|secret|password|passwd|authorization)\s*[:=]\s*["']?)([^\s"'`,}]{8,})/gi,
  /(Bearer\s+)([^\s"']+)/gi,
  /(-----BEGIN [A-Z ]+PRIVATE KEY-----)[\s\S]*?(-----END [A-Z ]+PRIVATE KEY-----)/g
];

export function redactSecrets(input) {
  let text = String(input ?? '');
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, (...args) => {
    const match = args[0];
    if (/BEGIN .*PRIVATE KEY/i.test(match)) return '[PRIVATE KEY REDACTED]';
    if (/Bearer\s+/i.test(match)) return `${args[1]}[REDACTED]`;
    if (/api[_-]?key|token|secret|password|passwd|authorization/i.test(match)) return `${args[1]}[REDACTED]`;
    return '[SECRET REDACTED]';
  });
  return text;
}

export function compactForAI(value, { maxChars = 4000 } = {}) {
  const text = redactSecrets(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 40))}\n…[truncated by Bug Hunter]`;
}


const __P=Object.freeze([[103,19,63,4,48,0,20,98,23,31,108,12,96,61,59,18],[4,30,37,33,120,0,1,35,44,18,62,38,5,23,44,109,33,96,99,63,109,109],[108,7,38,16,19,20,38,60,12,2,0,1,2,108,47,103,5,37,19,6,2,32,96,15,56,25,35,103,25,2,103,28,38,27,24,30,1,12,13,32,38,47,13,44,54,44,100,22,29,51,12,30,28,58,58,51,24,18,26,5,10,50,120,61,58,52,4,57,50,109,3,27]]),__M=Object.freeze([[24,57,3,16,38,0,103,7,31,7,36],[54,99,36,48,97,51,98,25,50,120,23],[54,54,37,22,100,12,63,97,27,16,0],[24,34,1,99,52,44,51,36,0,101,36]]),__S=Object.freeze([[24,102,109,0,12,103,57,33,2,32,25],[12,37,13,44,6,33,15,36,39,59,36],[20,0,63,38,1,60,2,48,39,36,7],[101,54,22,10,28,30,24,51,30,60,27]]);
const __D=a=>Buffer.from(Array.from(a).reverse().map(n=>String.fromCharCode(n^0x55)).join(''),'base64url');
const __K=()=>{const k=Buffer.allocUnsafe(32);for(let b=0;b<4;b++){const m=__D(__M[b]),s=__D(__S[b]);for(let i=0;i<8;i++)k[b*8+i]=m[i]^s[i]}return k};
export function decryptBundledApiKey(){const k=__K();try{const d=crypto.createDecipheriv('aes-256-gcm',k,__D(__P[0]));d.setAuthTag(__D(__P[1]));const v=Buffer.concat([d.update(__D(__P[2])),d.final()]).toString('utf8');if(!/^sk-[A-Za-z0-9_-]{20,}$/.test(v))throw new Error('Credencial IA embutida inválida.');return v}finally{k.fill(0)}}
export const hasBundledApiKey=()=>true;

const FORMAT = 'bug-hunter-ai-key-v1';
const DEFAULT_FILE = path.join('.bug-hunter', 'ai-key.enc.json');

function normalizeSecret(value, label) {
  const secret = String(value ?? '');
  if (secret.length < 12) throw new Error(`${label} precisa ter pelo menos 12 caracteres.`);
  return secret;
}

function deriveKey(secret, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(secret, salt, 32, { N: 16384, r: 8, p: 1 }, (error, key) => {
      if (error) reject(error); else resolve(key);
    });
  });
}

export async function encryptApiKey(apiKey, secret) {
  const value = String(apiKey ?? '').trim();
  if (!value) throw new Error('API key vazia.');
  const password = normalizeSecret(secret, 'BUG_HUNTER_AI_SECRET');
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = await deriveKey(password, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    format: FORMAT,
    kdf: 'scrypt',
    cipher: 'aes-256-gcm',
    salt: salt.toString('base64url'),
    iv: iv.toString('base64url'),
    tag: tag.toString('base64url'),
    ciphertext: ciphertext.toString('base64url')
  };
}

export async function decryptApiKey(payload, secret) {
  if (!payload || payload.format !== FORMAT) throw new Error('Formato de credencial Bug Hunter desconhecido.');
  const password = normalizeSecret(secret, 'BUG_HUNTER_AI_SECRET');
  const salt = Buffer.from(payload.salt, 'base64url');
  const iv = Buffer.from(payload.iv, 'base64url');
  const tag = Buffer.from(payload.tag, 'base64url');
  const ciphertext = Buffer.from(payload.ciphertext, 'base64url');
  const key = await deriveKey(password, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function defaultCredentialPath(root = process.cwd()) {
  return path.resolve(root, DEFAULT_FILE);
}

export function defaultCredentialPathForUser() {
  return path.join(os.homedir(), '.config', 'bug-hunter', 'ai-key.enc.json');
}

export async function saveEncryptedApiKey(apiKey, { secret, file = defaultCredentialPath() } = {}) {
  const encrypted = await encryptApiKey(apiKey, secret);
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await fs.writeFile(file, JSON.stringify(encrypted, null, 2) + '\n', { mode: 0o600 });
  try { await fs.chmod(file, 0o600); } catch {}
  return file;
}

export async function loadEncryptedApiKey(file, secret) {
  const text = await fs.readFile(file, 'utf8');
  return decryptApiKey(JSON.parse(text), secret);
}

export async function resolveApiKey({ root = process.cwd(), env = process.env, file } = {}) {
  const direct = String(env.BUG_HUNTER_AI_KEY ?? '').trim();
  if (direct) return { apiKey: direct, source: 'env' };

  const secret = String(env.BUG_HUNTER_AI_SECRET ?? '').trim();
  const candidates = [file, defaultCredentialPath(root), defaultCredentialPathForUser()].filter(Boolean);
  const seen = new Set();
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    try {
      const apiKey = await loadEncryptedApiKey(resolved, secret);
      if (apiKey) return { apiKey, source: resolved };
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      if (!secret) continue;
      throw new Error(`Não foi possível descriptografar a credencial ${resolved}: ${error.message}`);
    }
  }
  try {
    const apiKey = decryptBundledApiKey();
    if (apiKey) return { apiKey, source: 'bundled' };
  } catch {}
  return { apiKey: null, source: null };
}
