#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const registry = 'https://npm.pkg.github.com/';
const owner = (process.env.GITHUB_REPOSITORY_OWNER || 'FelpzSystem').toLowerCase();
const scope = `@${owner}`;

function run(args) {
  const result = spawnSync('npm', args, { stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

console.log(`Preparing ${scope}/bug-hunter-static for GitHub Packages...`);
console.log('This command expects NODE_AUTH_TOKEN to contain a GitHub token with package write permission.');

if (!process.env.NODE_AUTH_TOKEN) {
  console.error('NODE_AUTH_TOKEN is not set.');
  console.error('In GitHub Actions, use the workflow provided in .github/workflows/publish-github-packages.yml.');
  process.exit(1);
}

if (run(['pkg', 'set', `name=${scope}/bug-hunter-static`]) !== 0) process.exit(1);
if (run(['pkg', 'set', `publishConfig.registry=${registry}`]) !== 0) process.exit(1);
if (run(['publish', '--registry', registry, '--access', 'public']) !== 0) process.exit(1);

console.log('Published to GitHub Packages.');
