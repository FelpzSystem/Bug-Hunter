#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { scanProject, writeBaseline } from '../core/scanner.js';
import { allRules } from '../rules/index.js';
import { formatJson, formatPretty, formatSarif, formatMarkdown, formatHtml } from '../core/reporter.js';

const require = createRequire(import.meta.url);
const { version: VERSION } = require('../../package.json');
const program = new Command();
program.name('bug-hunter').description('Static bug, security and project-health analyzer for JS/TS').version(VERSION);

program.command('scan')
  .argument('[path]', 'project/file to scan', '.')
  .option('--format <format>', 'pretty|json|sarif|markdown|html', 'pretty')
  .option('--min-severity <severity>', 'info|warning|error', 'info')
  .option('--ignore <patterns>', 'comma-separated directory/file names to skip', '')
  .option('--max-file-bytes <n>', 'skip files larger than this many bytes', '10485760')
  .option('--disable <rules>', 'comma-separated rule IDs', '')
  .option('--max-complexity <n>', 'complexity threshold', '12')
  .option('--max-function-lines <n>', 'function line threshold', '60')
  .option('--max-file-lines <n>', 'file line threshold', '500')
  .option('--max-console-calls <n>', 'console threshold per file', '8')
  .option('--context-lines <n>', 'source context lines around each finding', '2')
  .option('--baseline <file>', 'baseline path', '.bug-hunter-baseline.json')
  .option('--no-baseline', 'show findings currently in baseline too')
  .option('--write-baseline', 'write current findings to baseline and exit')
  .option('--ci', 'exit 1 on error findings or parser errors')
  .option('--config <file>', 'config path relative to project root')
  .option('--no-color', 'disable terminal colors')
  .action(async (target, opts) => {
    const ignore = opts.ignore ? opts.ignore.split(',').map((x) => x.trim()).filter(Boolean) : undefined;
    const disableRules = opts.disable ? opts.disable.split(',').map((x) => x.trim()).filter(Boolean) : undefined;
    const result = await scanProject(target, {
      minSeverity: opts.minSeverity, ignore, disableRules,
      maxComplexity: Number(opts.maxComplexity), maxFunctionLines: Number(opts.maxFunctionLines), maxFileLines: Number(opts.maxFileLines),
      maxConsoleCalls: Number(opts.maxConsoleCalls), contextLines: Number(opts.contextLines), maxFileBytes: Number(opts.maxFileBytes), baseline: opts.baseline,
      baselineMode: opts.writeBaseline ? 'show' : (opts.noBaseline ? 'show' : 'ignore'), config: opts.config
    });
    if (opts.writeBaseline) { const targetFile = await writeBaseline(result.root, result.findings, opts.baseline); console.log(`Baseline criado: ${targetFile}`); return; }
    const format = opts.format;
    if (format === 'json') console.log(formatJson(result));
    else if (format === 'sarif') console.log(formatSarif(result));
    else if (format === 'markdown') console.log(formatMarkdown(result));
    else if (format === 'html') console.log(formatHtml(result));
    else console.log(formatPretty(result, { color: !opts.noColor }));
    if (opts.ci && !result.summary.passed) process.exitCode = 1;
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
  const config = { minSeverity: 'info', maxComplexity: 12, maxFunctionLines: 60, maxFileLines: 500, maxConsoleCalls: 8, contextLines: 2, maxFileBytes: 10485760, ignore: ['node_modules','.git','.hg','.svn'], disableRules: [], baseline: '.bug-hunter-baseline.json', baselineMode: 'ignore' };
  await fs.writeFile(file, JSON.stringify(config, null, 2) + '\n'); console.log(`Configuração criada: ${file}`);
});

program.command('demo').description('executa a demonstração completa do Bug Hunter').action(async () => {
  const target = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'examples', 'demo-project');
  const result = await scanProject(target, { baselineMode: 'show', contextLines: 2 });
  console.log(formatPretty(result, { color: true }));
});

program.parseAsync().catch((error) => { console.error(error.stack || error.message); process.exitCode = 2; });
