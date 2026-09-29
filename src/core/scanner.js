import fs from 'node:fs/promises';
import path from 'node:path';
import { builtinModules } from 'node:module';
import { parseSource } from './parser.js';
import { rules } from '../rules/index.js';
import { hashFinding, isIgnoredLine, locOf, severityAtLeast, snippet, codeFrame, packageNameFromSpecifier, isLikelyBuiltin, lineCount, getCalleeName, walkAst } from './utils.js';

const DEFAULT_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']);
const DEFAULT_IGNORES = ['node_modules', '.git', '.hg', '.svn', '.bug-hunter'];
const DEFAULT_MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALWAYS_BINARY_EXTENSIONS = new Set(['.png','.jpg','.jpeg','.gif','.webp','.ico','.bmp','.tiff','.zip','.gz','.tgz','.tar','.7z','.rar','.pdf','.woff','.woff2','.ttf','.otf','.eot','.mp3','.wav','.ogg','.mp4','.mov','.avi','.webm','.exe','.dll','.so','.dylib','.node','.class']);
const DEFAULT_GLOBALS = new Set([
  'console','window','document','globalThis','global','process','Buffer','setTimeout','setInterval','clearTimeout','clearInterval',
  'URL','URLSearchParams','fetch','Request','Response','Headers','AbortController','Promise','Map','Set','WeakMap','WeakSet','Math','Date','JSON',
  'Object','Array','String','Number','Boolean','BigInt','Symbol','RegExp','Error','TypeError','RangeError','ReferenceError','SyntaxError',
  'parseInt','parseFloat','isNaN','isFinite','Infinity','NaN','Intl','Reflect','Proxy','WebSocket','FormData','Blob','File','FileReader',
  'structuredClone','queueMicrotask','atob','btoa','TextEncoder','TextDecoder','URLPattern','crypto','require','module','exports','__dirname','__filename'
]);
const NODE_BUILTINS = new Set(builtinModules.flatMap((name) => [name, name.startsWith('node:') ? name.slice(5) : `node:${name}`]));

export async function scanProject(inputPath = '.', options = {}) {
  const requested = path.resolve(inputPath);
  const requestedStat = await fs.stat(requested);
  const root = requestedStat.isFile() ? path.dirname(requested) : requested;
  const config = await loadConfig(root, options);
  const findings = [];
  const parseErrors = [];
  const fileData = [];
  const textFindings = [];
  const skipped = { binary: [], oversized: [], unreadable: [] };
  const files = await discoverFiles(requestedStat.isFile() ? requested : root, config, skipped);

  for (const file of files) {
    const relative = path.relative(root, file) || path.basename(file);
    let stat;
    try { stat = await fs.stat(file); } catch (error) {
      skipped.unreadable.push({ file: relative, reason: error.message });
      continue;
    }
    if (stat.size > config.maxFileBytes) {
      skipped.oversized.push({ file: relative, bytes: stat.size, limit: config.maxFileBytes });
      continue;
    }
    let buffer;
    try { buffer = await fs.readFile(file); } catch (error) {
      skipped.unreadable.push({ file: relative, reason: error.message });
      continue;
    }
    if (!isTextLikeFile(file, buffer)) {
      skipped.binary.push({ file: relative, bytes: stat.size });
      continue;
    }
    const code = buffer.toString('utf8');
    const isSource = config.extensions.has(path.extname(file).toLowerCase());
    const metrics = { file: relative, lines: lineCount(code), bytes: Buffer.byteLength(code), imports: [], dynamicImports: 0, consoleCalls: 0, todos: 0, kind: isSource ? 'source' : 'text' };
    const comments = extractCommentSignals(code);
    metrics.todos = comments.todoCount;
    try {
      if (!isSource) {
        textFindings.push(...scanTextFile(relative, code, config.contextLines, config.disableRules));
        fileData.push(metrics);
        continue;
      }
      const ast = parseSource(code, file);
      const parents = new Map();
      buildParentMap(ast, parents);
      const ctx = {
        ast, code, file: relative, root, parents, options: config,
        globals: new Set([...DEFAULT_GLOBALS, ...(config.globals ?? [])]),
        report(finding) {
          const line = finding.node?.loc?.start?.line ?? finding.line ?? 1;
          if (isIgnoredLine(code, line, finding.ruleId)) return;
          const loc = finding.node ? locOf(finding.node) : {
            line, column: finding.column ?? 0, endLine: finding.endLine ?? line, endColumn: finding.endColumn ?? (finding.column ?? 0) + 1
          };
          const out = {
            id: '', ruleId: finding.ruleId, title: finding.title, category: finding.category, severity: finding.severity,
            confidence: finding.confidence ?? 'high', message: finding.message, file: relative,
            line: loc.line, column: loc.column, endLine: loc.endLine, endColumn: loc.endColumn,
            snippet: finding.snippet ?? snippet(code, finding.node),
            codeFrame: codeFrame(code, loc.line, loc.column, config.contextLines),
            suggestion: finding.suggestion ?? null,
            evidence: finding.evidence ?? null
          };
          out.id = hashFinding(out);
          findings.push(out);
        }
      };
      collectFileSignals(ast, metrics);
      const disabled = new Set(config.disableRules ?? []);
      for (const rule of rules.filter((r) => !r.scope || r.scope === 'file')) {
        if (disabled.has(rule.id)) continue;
        rule.check.call(rule, ctx);
      }
      fileData.push(metrics);
    } catch (error) {
      parseErrors.push({ file: relative, message: error.message, line: error.loc?.line ?? 1, column: error.loc?.column ?? 0 });
      fileData.push(metrics);
    }
  }

  findings.push(...textFindings);

  const project = await analyzeProject({ root, files, fileData, config, skipped, disabled: config.disableRules });
  for (const item of project.findings) {
    item.id = item.id || hashFinding(item);
    findings.push(item);
  }

  const unique = dedupeFindings(findings).filter((f) => severityAtLeast(f.severity, config.minSeverity));
  const baseline = await loadBaseline(root, config.baseline);
  const filtered = config.baselineMode === 'ignore' && baseline.size ? unique.filter((f) => !baseline.has(f.id)) : unique;
  const summary = summarize(filtered, parseErrors, files.length, unique.length, baseline, skipped);
  const projectView = summarizeProject(project, fileData, files.length, skipped);
  summary.healthScore = healthScore(summary);
  summary.findingsPerKLoc = projectView.lines ? Number((summary.findings / (projectView.lines / 1000)).toFixed(2)) : 0;

  return {
    root, target: requested, files, findings: filtered.sort(compareFindings), parseErrors,
    summary, config, project: projectView, fileData, skipped
  };
}


async function discoverFiles(rootOrFile, config, skipped) {
  const stat = await fs.stat(rootOrFile);
  if (stat.isFile()) return [rootOrFile];
  const result = [];
  const ignores = new Set(config.ignore ?? DEFAULT_IGNORES);
  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      skipped.unreadable.push({ file: path.relative(rootOrFile, dir) || '.', reason: error.message });
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      if (ignores.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        result.push(full);
      }
    }
  }
  await walk(rootOrFile);
  return result;
}

async function loadConfig(root, options) {
  let fileConfig = {};
  const configPath = options.config ? path.resolve(root, options.config) : path.join(root, 'bug-hunter.config.json');
  try { fileConfig = JSON.parse(await fs.readFile(configPath, 'utf8')); } catch {}

  const rawIgnore = [
    ...DEFAULT_IGNORES,
    ...(Array.isArray(fileConfig.ignore) ? fileConfig.ignore : []),
    ...(Array.isArray(options.ignore) ? options.ignore : [])
  ];
  const rawDisable = [
    ...(Array.isArray(fileConfig.disableRules) ? fileConfig.disableRules : []),
    ...(Array.isArray(options.disableRules) ? options.disableRules : [])
  ];
  const rawExtensions = options.extensions ?? fileConfig.extensions ?? [...DEFAULT_EXTENSIONS];
  const extensions = new Set([...rawExtensions].map((ext) => String(ext).trim().toLowerCase()).filter(Boolean).map((ext) => ext.startsWith('.') ? ext : `.${ext}`));
  const minSeverity = String(options.minSeverity ?? fileConfig.minSeverity ?? 'info').toLowerCase();
  if (!['info', 'warning', 'error'].includes(minSeverity)) throw new RangeError(`minSeverity inválido: ${minSeverity}`);
  const baselineMode = String(options.baselineMode ?? fileConfig.baselineMode ?? 'ignore').toLowerCase();
  if (!['ignore', 'show'].includes(baselineMode)) throw new RangeError(`baselineMode inválido: ${baselineMode}`);

  return {
    ...fileConfig, ...options,
    ignore: [...new Set(rawIgnore.map((x) => String(x).trim()).filter(Boolean))],
    extensions,
    maxFileBytes: finiteNumber(options.maxFileBytes ?? fileConfig.maxFileBytes, DEFAULT_MAX_FILE_BYTES, 1),
    minSeverity,
    maxComplexity: finiteNumber(options.maxComplexity ?? fileConfig.maxComplexity, 12, 0),
    maxFunctionLines: finiteNumber(options.maxFunctionLines ?? fileConfig.maxFunctionLines, 60, 0),
    maxFileLines: finiteNumber(options.maxFileLines ?? fileConfig.maxFileLines, 500, 0),
    maxConsoleCalls: finiteNumber(options.maxConsoleCalls ?? fileConfig.maxConsoleCalls, 12, 0),
    contextLines: Math.floor(finiteNumber(options.contextLines ?? fileConfig.contextLines, 2, 0)),
    disableRules: [...new Set(rawDisable.map((x) => String(x).trim().toUpperCase()).filter(Boolean))],
    consoleAllowedPaths: normalizePathList(options.consoleAllowedPaths ?? fileConfig.consoleAllowedPaths ?? ['tools', 'scripts', 'test', 'tests', 'examples']),
    baseline: options.baseline ?? fileConfig.baseline ?? '.bug-hunter-baseline.json',
    baselineMode
  };
}


function normalizePathList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item).trim().replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')).filter(Boolean))];
}

function finiteNumber(value, fallback, minimum = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum ? number : fallback;
}

// O @babel/parser devolve a árvore dentro de um nó `File` (`{ type: 'File', program: Program }`).
// O mapa de pais tem de usar o MESMO percurso de AST que as regras usam (`walkAst`): o
// percurso manual anterior deixava `ctx.parents` sem entradas em ficheiros reais, e todas
// as regras que dependem do pai (BH020, BH043, BH044…) nunca disparavam fora de testes.
function normalizeRootAst(ast) {
  let current = ast;
  while (current && current.type === 'File' && current.program) current = current.program;
  return current;
}

function buildParentMap(ast, map) {
  walkAst(normalizeRootAst(ast), (node, parent) => {
    if (parent) map.set(node, parent);
  });
}

function collectFileSignals(ast, metrics) {
  const imports = new Set();
  walkAst(ast, (n) => {
    if (n.type === 'ImportDeclaration' && n.source?.value) imports.add(n.source.value);
    if ((n.type === 'ExportNamedDeclaration' || n.type === 'ExportAllDeclaration') && n.source?.value) imports.add(n.source.value);
    if (n.type === 'CallExpression' && n.callee?.type === 'Identifier' && n.callee.name === 'require' && typeof n.arguments?.[0]?.value === 'string') imports.add(n.arguments[0].value);
    if (n.type === 'Import' || n.type === 'ImportExpression') metrics.dynamicImports += 1;
    if (n.type === 'CallExpression' && /^(console)\.(log|debug|info|warn|error)$/.test(getCalleeName(n) ?? '')) metrics.consoleCalls += 1;
  });
  metrics.imports = [...imports];
}

async function analyzeProject({ root, files, fileData, config, disabled = [] }) {
  const disabledRules = new Set(disabled);
  const findings = [];
  const allImports = new Map();
  for (const f of fileData) for (const spec of f.imports) {
    const pkg = packageNameFromSpecifier(spec);
    if (!pkg || isLikelyBuiltin(spec, NODE_BUILTINS)) continue;
    if (!allImports.has(pkg)) allImports.set(pkg, []);
    allImports.get(pkg).push(f.file);
  }

  let manifest = null;
  try { manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')); } catch {}
  if (manifest) {
    analyzeDependencies(manifest, allImports, findings, disabledRules);
    const lifecycle = manifest.scripts ?? {};
    if ((lifecycle.preinstall || lifecycle.install || lifecycle.postinstall || lifecycle.prepare) && !disabledRules.has('BH054')) {
      addProjectFinding(findings, 'BH054', 'Project lifecycle script', 'security', 'info', 'package.json', 'O projeto define preinstall/install/postinstall/prepare; esses scripts executam automaticamente em momentos do ciclo npm.', 'Revise cada comando e mantenha lifecycle scripts mínimos e auditáveis.');
    }
    const runtimeCount = Object.keys(manifest.dependencies ?? {}).length;
    if (runtimeCount > 20 && !disabledRules.has('BH055')) addProjectFinding(findings, 'BH055', 'Large dependency surface', 'maintainability', 'info', 'package.json', `O projeto declara ${runtimeCount} dependências de runtime.`, 'Revise dependências diretas e prefira APIs nativas quando fizer sentido.');
  }

  for (const f of fileData) {
    if (f.lines > config.maxFileLines && !disabledRules.has('BH056')) addProjectFinding(findings, 'BH056', 'Large file', 'maintainability', 'warning', f.file, `Arquivo com ${f.lines} linhas, acima do limite ${config.maxFileLines}.`, 'Divida por responsabilidade e preserve módulos menores.');
    if (f.consoleCalls > config.maxConsoleCalls && !disabledRules.has('BH057')) addProjectFinding(findings, 'BH057', 'Console flood', 'maintainability', 'warning', f.file, `Arquivo possui ${f.consoleCalls} chamadas de console, acima do limite ${config.maxConsoleCalls}.`, 'Consolide logging e remova debug temporário.');
    if (f.todos > 0 && !disabledRules.has('BH058')) addProjectFinding(findings, 'BH058', 'TODO/FIXME debt', 'maintainability', 'info', f.file, `${f.todos} comentário(s) TODO/FIXME encontrado(s).`, 'Converta dívidas importantes em issues/tarefas rastreáveis.');
  }

  return { findings, manifest, imports: [...allImports.entries()].map(([name, files]) => ({ name, files })) };
}

function analyzeDependencies(manifest, allImports, findings, disabledRules = new Set()) {
  const sections = ['dependencies','devDependencies','optionalDependencies','peerDependencies'];
  const owners = new Map();
  for (const section of sections) for (const name of Object.keys(manifest[section] ?? {})) {
    if (!owners.has(name)) owners.set(name, []);
    owners.get(name).push(section);
  }
  for (const [name, sectionsForName] of owners) {
    if (sectionsForName.length > 1 && !disabledRules.has('BH053')) addProjectFinding(findings, 'BH053', 'Dependency declared twice', 'correctness', 'warning', 'package.json', `“${name}” aparece em ${sectionsForName.join(', ')}.`, 'Mantenha a intenção de cada seção clara e evite divergências de versão.');
    if (sectionsForName.includes('dependencies') && !allImports.has(name) && !manifest.bin?.[name] && !dependencyAppearsInScripts(name, manifest.scripts) && !disabledRules.has('BH051')) addProjectFinding(findings, 'BH051', 'Possibly unused dependency', 'maintainability', 'warning', 'package.json', `“${name}” está em dependencies, mas não apareceu em imports/requires analisados.`, 'Remova a dependência se ela não for usada em runtime; confirme scripts/geração antes.');
  }
  for (const [name, usedIn] of allImports) {
    if (['node:test','node:assert','node:fs','node:path'].includes(name)) continue;
    const declared = owners.has(name);
    if (!declared && name !== 'test' && !name.startsWith('@types/') && !disabledRules.has('BH052')) addProjectFinding(findings, 'BH052', 'Undeclared external dependency', 'correctness', 'error', usedIn[0] ?? 'package.json', `O pacote “${name}” é usado, mas não está declarado no package.json.`, 'Adicione-o à dependência correta ou corrija o import.');
  }
}

function dependencyAppearsInScripts(name, scripts = {}) {
  const source = Object.values(scripts).join(' \n');
  if (!source) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^A-Za-z0-9_@/-])${escaped}(?:$|[^A-Za-z0-9_@/-])`).test(source);
}

function addProjectFinding(findings, ruleId, title, category, severity, file, message, suggestion) {
  findings.push({ id: '', ruleId, title, category, severity, confidence: 'medium', message, file, line: 1, column: 0, endLine: 1, endColumn: 1, snippet: '', codeFrame: '', suggestion, evidence: null });
}

function extractCommentSignals(code) {
  const matches = code.match(/\b(?:TODO|FIXME|XXX)\b/gi) ?? [];
  return { todoCount: matches.length };
}

function summarize(findings, parseErrors, fileCount, rawFindingCount, baseline, skipped = {}) {
  const bySeverity = { error: 0, warning: 0, info: 0 };
  const byCategory = {}; const byRule = {};
  for (const f of findings) { bySeverity[f.severity]++; byCategory[f.category] = (byCategory[f.category] ?? 0) + 1; byRule[f.ruleId] = (byRule[f.ruleId] ?? 0) + 1; }
  const unreadable = skipped.unreadable?.length ?? 0;
  return { filesScanned: fileCount, findings: findings.length, rawFindings: rawFindingCount, bySeverity, byCategory, byRule, parseErrors: parseErrors.length, unreadableFiles: unreadable, baselineEntries: baseline.size, passed: parseErrors.length === 0 && unreadable === 0 && bySeverity.error === 0 };
}

function summarizeProject(project, fileData, fileCount, skipped = {}) {
  const totalLines = fileData.reduce((n, f) => n + f.lines, 0);
  const totalBytes = fileData.reduce((n, f) => n + f.bytes, 0);
  const languages = {};
  for (const f of fileData) {
    const ext = path.extname(f.file).toLowerCase().replace('.', '') || 'extensionless';
    languages[ext] = (languages[ext] ?? 0) + 1;
  }
  const sourceFiles = fileData.filter((f) => f.kind === 'source').length;
  const textFiles = fileData.filter((f) => f.kind === 'text').length;
  return {
    files: fileCount, filesRead: fileData.length, sourceFiles, textFiles,
    binaryFilesSkipped: skipped.binary?.length ?? 0, oversizedFilesSkipped: skipped.oversized?.length ?? 0,
    unreadableFiles: skipped.unreadable?.length ?? 0,
    lines: totalLines, bytes: totalBytes, languages,
    dependencyCount: project.manifest ? Object.keys(project.manifest.dependencies ?? {}).length : 0, imports: project.imports.length
  };
}

function isTextLikeFile(file, buffer) {
  const ext = path.extname(file).toLowerCase();
  if (ALWAYS_BINARY_EXTENSIONS.has(ext)) return false;
  if (buffer.includes(0)) return false;
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192)).toString('utf8');
  if (!sample) return true;
  let printable = 0;
  for (const ch of sample) {
    const code = ch.charCodeAt(0);
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)) printable++;
  }
  return printable / sample.length >= 0.85;
}

function scanTextFile(relative, code, contextLines = 2, disabledRules = []) {
  const findings = [];
  const disabled = new Set(disabledRules);
  const lines = code.split(/\r?\n/);
  const push = (ruleId, title, category, severity, line, message, suggestion, confidence = 'medium', evidence = null) => {
    if (disabled.has(ruleId) || isIgnoredLine(code, line, ruleId)) return;
    const column = Math.max(0, lines[line - 1]?.search(/\S|$/) ?? 0);
    findings.push({ id: '', ruleId, title, category, severity, confidence, message, file: relative, line, column, endLine: line, endColumn: column + 1, snippet: lines[line - 1] ?? '', codeFrame: codeFrame(code, line, column, contextLines), suggestion, evidence });
  };
  const secretPatterns = [
    { re: /(?:api[_-]?key|access[_-]?token|secret[_-]?key|client[_-]?secret)\s*[:=]\s*["']?([A-Za-z0-9_\-]{20,})/i, label: 'credencial/API key' },
    { re: /(?:ghp|gho|ghs|ghr|ghu)_[A-Za-z0-9]{30,}/, label: 'token GitHub' },
    { re: /github_pat_[A-Za-z0-9_]{20,}/, label: 'token GitHub fine-grained' },
    { re: /glpat-[A-Za-z0-9_\-]{20,}/, label: 'token GitLab' },
    { re: /xox[baprs]-[A-Za-z0-9-]{20,}/, label: 'token Slack' },
    { re: /sk-[A-Za-z0-9]{20,}/, label: 'token estilo secret key' },
    { re: /AKIA[0-9A-Z]{16}/, label: 'access key AWS' },
    { re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, label: 'chave privada', privateKey: true }
  ];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of secretPatterns) {
      const match = line.match(pattern.re);
      if (!match) continue;
      const raw = match[1] ?? match[0];
      const masked = pattern.privateKey ? '[conteúdo ocultado]' : `${String(raw).slice(0, 4)}••••${String(raw).slice(-2)}`;
      push(pattern.privateKey ? 'BH060' : 'BH059', pattern.privateKey ? 'Private key material' : 'Secret-like value in project file', 'security', 'error', i + 1, `O arquivo contém um possível ${pattern.label}. O valor foi ocultado no relatório: ${masked}.`, 'Mova o segredo para um secret manager/variável de ambiente e remova-o do repositório.', 'medium');
      break;
    }
  }
  return findings;
}

function dedupeFindings(findings) { return [...new Map(findings.map((f) => [f.id, f])).values()]; }
function compareFindings(a, b) { const rank = { error: 0, warning: 1, info: 2 }; return (rank[a.severity] - rank[b.severity]) || a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column || a.ruleId.localeCompare(b.ruleId); }

function healthScore(summary) {
  const penalty = summary.bySeverity.error * 12 + summary.bySeverity.warning * 4 + summary.bySeverity.info * 1 + summary.parseErrors * 15;
  return Math.max(0, Math.min(100, 100 - penalty));
}

export async function writeBaseline(root, findings, baselinePath = '.bug-hunter-baseline.json') {
  const target = path.resolve(root, baselinePath);
  const payload = { version: 2, generatedAt: new Date().toISOString(), findings: [...new Set(findings.map((f) => f.id).filter(Boolean))].sort() };
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(payload, null, 2) + '\n');
  return target;
}

async function loadBaseline(root, baselinePath) {
  try { const data = JSON.parse(await fs.readFile(path.resolve(root, baselinePath), 'utf8')); return new Set(data.findings ?? []); } catch { return new Set(); }
}
