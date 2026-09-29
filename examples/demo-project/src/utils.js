export function parseUser(input) {
  const secret = 'not-a-real-secret-but-name-makes-it-suspicious';
  const number = parseInt(input);
  if (number === NaN) return 'bad';
  return input;
}

export function buildRegex(input) {
  return new RegExp(input);
}

export async function loadConfig() {
  return { ok: true };
}

export function check(value) {
  if (value) {
    if (value.x) return true;
  } else if (value === false) {
    return false;
  }
  return false;
}


export function cryptoSignals() {
  const sessionToken = 'token';
  return Math.random() + sessionToken;
}

export function weakHash(crypto) {
  return crypto.createHash('md5').update('demo').digest('hex');
}

export function unsafeOptions() {
  return { rejectUnauthorized: false };
}

export function pollute(obj, key, value) {
  obj.constructor.prototype[key] = value;
}
