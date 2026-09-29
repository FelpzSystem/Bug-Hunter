#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { scanProject, writeBaseline } from '../core/scanner.js';
import { allRules } from '../rules/index.js';
import { formatJson, formatPretty, formatSarif, formatMarkdown, formatHtml } from '../core/reporter.js';
import { analyzeScanWithAI, saveEncryptedApiKey, resolveApiKey, defaultCredentialPath } from '../ai/index.js';

const require = createRequire(import.meta.url);
const { version: VERSION } = require('../../package.json');
const program = new Command();
program.name('bug-hunter').description('Static bug, security and project-health analyzer for JavaScript, TypeScript and Python').version(VERSION);

program.command('scan')
  .argument('[path]', 'project/file to scan', '.')
  .option('--format <format>', 'pretty|json|sarif|markdown|html', 'pretty')
  .option('--min-severity <severity>', 'info|warning|error', 'warning')
  .option('--ignore <patterns>', 'comma-separated directory/file names to skip', '')
  .option('--max-file-bytes <n>', 'skip files larger than this many bytes', '10485760')
  .option('--disable <rules>', 'comma-separated rule IDs', '')
  .option('--max-complexity <n>', 'complexity threshold', '12')
  .option('--max-function-lines <n>', 'function line threshold', '60')
  .option('--max-file-lines <n>', 'file line threshold', '500')
  .option('--max-console-calls <n>', 'console threshold per file', '12')
  .option('--console-allow <paths>', 'paths where console.log is intentional', '')
  .option('--context-lines <n>', 'source context lines around each finding', '2')
  .option('--baseline <file>', 'baseline path', '.bug-hunter-baseline.json')
  .option('--no-baseline', 'show findings currently in baseline too')
  .option('--write-baseline', 'write current findings to baseline and exit')
  .option('--ci', 'exit 1 on error findings or parser errors')
  .option('--config <file>', 'config path relative to project root')
  .option('--no-color', 'disable terminal colors')
  .option('--python-command <command>', 'Python executable used for .py analysis')
  .option('--python-timeout-ms <n>', 'timeout for the Python AST helper', '5000')
  .option('--no-check-esm-extensions', 'skip extension checks for relative JavaScript ESM imports')
  .option('--verbose', 'show the full report in the terminal instead of the compact summary')
  .option('--log-file <file>', 'text log/report path', '.bug-hunter/scan.log.txt')
  .option('--no-log-file', 'do not save the detailed text log')
  .option('--ai', 'ask the AI assistant to review the scan')
  .option('--ai-code', 'allow short redacted code frames to be sent to the AI')
  .option('--ai-model <model>', 'AI model', 'qwen/qwen3.7-flash:free')
  .option('--ai-base-url <url>', 'AI API base URL', 'https://api.bazaarlink.ai/v1')
  .option('--ai-timeout-ms <n>', 'AI request timeout', '30000')
  .option('--ai-max-findings <n>', 'maximum findings sent to the AI', '20')
  .option('--ai-credential-file <file>', 'encrypted AI credential file')
  .action(async (target, opts) => {
    const ignore = opts.ignore ? opts.ignore.split(',').map((x) => x.trim()).filter(Boolean) : undefined;
    const disableRules = opts.disable ? opts.disable.split(',').map((x) => x.trim()).filter(Boolean) : undefined;
    const consoleAllowedPaths = opts.consoleAllow ? opts.consoleAllow.split(',').map((x) => x.trim()).filter(Boolean) : undefined;
    const result = await scanProject(target, {
      minSeverity: opts.minSeverity, ignore, disableRules, consoleAllowedPaths,
      maxComplexity: Number(opts.maxComplexity), maxFunctionLines: Number(opts.maxFunctionLines), maxFileLines: Number(opts.maxFileLines),
      maxConsoleCalls: Number(opts.maxConsoleCalls), contextLines: Number(opts.contextLines), maxFileBytes: Number(opts.maxFileBytes), baseline: opts.baseline,
      pythonCommand: opts.pythonCommand, pythonTimeoutMs: Number(opts.pythonTimeoutMs),
      checkEsmExtensions: opts.checkEsmExtensions,
      baselineMode: opts.writeBaseline ? 'show' : (opts.noBaseline ? 'show' : 'ignore'), config: opts.config
    });
    if (opts.writeBaseline) { const targetFile = await writeBaseline(result.root, result.findings, opts.baseline); console.log(`Baseline criado: ${targetFile}`); return; }

    if (opts.ai) {
      try {
        result.ai = await analyzeScanWithAI(result, {
          model: opts.aiModel, baseUrl: opts.aiBaseUrl, timeoutMs: Number(opts.aiTimeoutMs),
          maxFindings: Number(opts.aiMaxFindings), includeCode: Boolean(opts.aiCode),
          credentialFile: opts.aiCredentialFile ? path.resolve(result.root, opts.aiCredentialFile) : undefined
        });
      } catch (error) {
        result.ai = { enabled: true, error: error.message };
        if (opts.format === 'json' || opts.format === 'sarif') throw error;
        console.error(`
AI: ${error.message}`);
      }
    }
    const format = opts.format;
    let output;
    if (format === 'json') output = formatJson(result);
    else if (format === 'sarif') output = formatSarif(result);
    else if (format === 'markdown') output = formatMarkdown(result);
    else if (format === 'html') output = formatHtml(result);
    else output = formatPretty({ ...result, version: VERSION }, { color: !opts.noColor, compact: !opts.verbose, logFile: opts.logFile });

    if (opts.logFile !== false && opts.logFile) {
      const logTarget = path.resolve(result.root, opts.logFile);
      await fs.mkdir(path.dirname(logTarget), { recursive: true });
      const detailed = formatPretty({ ...result, version: VERSION }, { color: false, compact: false });
      await fs.writeFile(logTarget, detailed, 'utf8');
      if (format === 'pretty') output = formatPretty({ ...result, version: VERSION }, { color: !opts.noColor, compact: !opts.verbose, logFile: path.relative(result.root, logTarget) || logTarget });
    }
    console.log(output);
    if (opts.ci && !result.summary.passed) process.exitCode = 1;
  });

program.command('ai')
  .description('gerencia a credencial criptografada e o assistente de IA')
  .command('set-key')
  .description('cria/atualiza a credencial local criptografada')
  .option('--key <key>', 'API key; prefira fornecer via BUG_HUNTER_AI_KEY')
  .option('--secret <secret>', 'senha de criptografia; prefira BUG_HUNTER_AI_SECRET')
  .option('--file <file>', 'arquivo de destino', '.bug-hunter/ai-key.enc.json')
  .action(async (opts) => {
    const apiKey = opts.key || process.env.BUG_HUNTER_AI_KEY;
    const secret = opts.secret || process.env.BUG_HUNTER_AI_SECRET;
    if (!apiKey || !secret) {
      throw new Error('Defina BUG_HUNTER_AI_KEY e BUG_HUNTER_AI_SECRET, ou use --key/--secret.');
    }
    const file = path.resolve(opts.file);
    const saved = await saveEncryptedApiKey(apiKey, { secret, file });
    console.log(`Credencial IA salva criptografada em: ${saved}`);
    console.log('Remova BUG_HUNTER_AI_KEY do ambiente; mantenha apenas BUG_HUNTER_AI_SECRET para descriptografar em runtime.');
  });

program.command('ai-status')
  .description('mostra de onde a credencial de IA seria carregada, sem revelar a chave')
  .option('--credential-file <file>', 'arquivo criptografado')
  .action(async (opts) => {
    const resolved = await resolveApiKey({ root: process.cwd(), file: opts.credentialFile ? path.resolve(opts.credentialFile) : undefined });
    console.log(JSON.stringify({ configured: Boolean(resolved.apiKey), source: resolved.source ?? null, builtIn: resolved.source === 'bundled', defaultFile: defaultCredentialPath(process.cwd()) }, null, 2));
  });

program.command('rules').description('lista todas as regras disponíveis').action(() => {
  for (const r of allRules) console.log(`${r.id}\t${r.severity}\t${r.category}\t${r.title}\t${r.description}`);
});

program.command('explain').description('explica uma regra com exemplo de uso').argument('<ruleId>', 'ID da regra, ex.: BH013').action((ruleId) => {
  const rule = allRules.find((r) => r.id.toUpperCase() === ruleId.toUpperCase());
  if (!rule) { console.error(`Regra não encontrada: ${ruleId}`); process.exitCode = 2; return; }
  console.log(`\n${rule.id} — ${rule.title}\nSeveridade: ${rule.severity}\nCategoria: ${rule.category}\nConfidence: ${rule.confidence ?? 'high'}\n\n${rule.description}\n\nSugestão: ${rule.suggestion ?? 'Revise o achado e confirme a intenção.'}\n`);
});

program.command('init').description('cria uma configuração padrão').argument('[path]', 'diretório', '.').action(async (target) => {
  const file = path.resolve(target, 'bug-hunter.config.json');
  const config = { minSeverity: 'warning', maxComplexity: 12, maxFunctionLines: 60, maxFileLines: 500, maxConsoleCalls: 12, contextLines: 2, maxFileBytes: 10485760, ignore: ['node_modules','.git','.hg','.svn','.bug-hunter'], consoleAllowedPaths: ['tools','scripts','test','tests','examples'], checkEsmExtensions: true, pythonCommand: '', pythonTimeoutMs: 5000, pythonDependencyAliases: { yaml: 'pyyaml', PIL: 'pillow', cv2: 'opencv-python', bs4: 'beautifulsoup4', dotenv: 'python-dotenv', sklearn: 'scikit-learn' }, ai: { enabled: false, baseUrl: 'https://api.bazaarlink.ai/v1', model: 'qwen/qwen3.7-flash:free', includeCode: false, maxFindings: 20, timeoutMs: 30000, credentialFile: '.bug-hunter/ai-key.enc.json' }, disableRules: [], baseline: '.bug-hunter-baseline.json', baselineMode: 'ignore' };
  await fs.writeFile(file, JSON.stringify(config, null, 2) + '\n'); console.log(`Configuração criada: ${file}`);
});

program.command('demo').description('executa a demonstração completa do Bug Hunter').action(async () => {
  const target = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'examples', 'demo-project');
  const result = await scanProject(target, { baselineMode: 'show', contextLines: 2 });
  console.log(formatPretty(result, { color: true }));
});

program.parseAsync().catch((error) => { console.error(error.stack || error.message); process.exitCode = 2; });
