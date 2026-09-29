#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import process from 'node:process';
import fs from 'node:fs';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false, ...options });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const registry = pkg.publishConfig?.registry ?? 'https://registry.npmjs.org/';

console.log(`\nPublishing ${pkg.name}@${pkg.version}`);
console.log(`Registry: ${registry}`);

const whoami = spawnSync('npm', ['whoami', '--registry', registry], { encoding: 'utf8' });
if (whoami.status !== 0) {
  console.error('\nNão foi possível confirmar o login do npm. Rode: npm login');
  process.exit(whoami.status ?? 1);
}
console.log(`npm user: ${whoami.stdout.trim()}`);

console.log('\n1/2 Rodando testes...');
if (run('npm', ['test']) !== 0) process.exit(1);

console.log('\n2/2 Validando pacote...');
if (run('npm', ['pack', '--dry-run']) !== 0) process.exit(1);

if (process.env.RELEASE_DRY_RUN === '1') {
  console.log('\nDry-run concluído: testes e validação do pacote passaram.');
  process.exit(0);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const otp = await new Promise((resolve) => rl.question('\nCódigo 2FA do npm (OTP): ', (answer) => {
  rl.close();
  resolve(answer.trim());
}));
if (!/^\d{6}$/.test(otp)) {
  console.error('\nOTP inválido. Informe o código de 6 dígitos do autenticador e rode npm run release novamente.');
  process.exit(1);
}

const args = ['publish', '--access', 'public', '--registry', registry, `--otp=${otp}`];

console.log('\nPublicando...');
const status = run('npm', args);
if (status === 0) {
  console.log(`\nPublicado: ${pkg.name}@${pkg.version}`);
  process.exit(0);
}

console.error('\nA publicação foi recusada pelo registry.');
console.error('Se o erro for E403 por 2FA, confirme que o OTP está correto e que sua conta/token tem permissão de publish para este pacote.');
process.exit(status);
