const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const MAGENTA = '\x1b[35m';

export function formatPretty(result, opts = {}) {
  const color = opts.color ?? (process.stdout.isTTY && process.env.NO_COLOR == null);
  if (opts.compact) return formatCompact(result, opts);
  const c = (code, value) => color ? code + value + RESET : value;
  const out = [];
  const s = result.summary;
  out.push('');
  out.push(c(BOLD, '╔══════════════════════════════════════════════════════════════════════╗'));
  out.push(c(BOLD, `║  🐛 BUG HUNTER — DEMO v${result.version ?? '0.3.1-demo.1'} • STATIC ANALYSIS ║`));
  out.push(c(BOLD, '╚══════════════════════════════════════════════════════════════════════╝'));
  out.push(c(DIM, `  ${result.root}`));
  out.push('');
  out.push(`${c(CYAN, 'PROJECT')}  ${result.project.files} files found  •  ${result.project.filesRead} read  •  ${result.project.sourceFiles} source  •  ${result.project.textFiles} text  •  ${formatBytes(result.project.bytes)}`);
  out.push(`${c(CYAN, 'READ')}     whole project traversal  •  ${result.project.binaryFilesSkipped} binary skipped  •  ${result.project.oversizedFilesSkipped} oversized skipped  •  ${result.project.imports} external imports`);
  out.push(`${c(MAGENTA, 'HEALTH')}   ${healthBar(s.healthScore)} ${s.healthScore}/100  •  ${s.findingsPerKLoc} findings/KLoC`);
  out.push(`${c(MAGENTA, 'SCAN')}     ${s.findings} visible findings  •  ${s.rawFindings} total after rules  •  ${s.parseErrors} parse error(s)`);
  out.push(`${c(GREEN, 'ANALYST')}  Shark • deterministic rules + project context + file evidence`);
  out.push('');
  out.push(`  ${c(RED, `✖ ${s.bySeverity.error}`)} errors    ${c(YELLOW, `⚠ ${s.bySeverity.warning}`)} warnings    ${c(CYAN, `ℹ ${s.bySeverity.info}`)} info`);
  out.push(`  Categories: ${Object.entries(s.byCategory).map(([k,v]) => `${k}=${v}`).join('  ') || 'none'}`);

  const hotspots = buildHotspots(result);
  if (hotspots.length) {
    out.push('');
    out.push(c(BOLD, '🔥 HOTSPOTS'));
    for (const h of hotspots.slice(0, 5)) out.push(`  ${severityIcon(h.severity, color)} ${h.file}  ${h.count} finding(s)  ${h.categories.join(', ')}`);
  }

  if (result.findings.length) {
    out.push('');
    out.push(c(BOLD, '🔎 FINDINGS — cada achado explica o problema no contexto do código'));
    let previousFile = null;
    for (const f of result.findings) {
      if (f.file !== previousFile) {
        out.push('');
        out.push(c(BOLD, `── ${f.file} ─────────────────────────────────────────────────────────`));
        previousFile = f.file;
      }
      out.push(`${severityIcon(f.severity, color)} ${c(BOLD, f.ruleId)} ${c(DIM, `${f.title} • confidence=${f.confidence}`)}`);
      out.push(`   ${f.message}`);
      if (f.codeFrame) {
        out.push(`   ${c(DIM, f.file + ':' + f.line + ':' + (f.column + 1))}`);
        out.push(indent(f.codeFrame, '   '));
      }
      if (f.suggestion) out.push(`   ${c(GREEN, '→ ' + f.suggestion)}`);
      if (f.evidence) out.push(`   ${c(CYAN, 'Evidence: ' + f.evidence)}`);
    }
  }

  if (result.parseErrors.length) {
    out.push('');
    out.push(c(BOLD, '🧨 PARSER ERRORS'));
    for (const e of result.parseErrors) out.push(`  ${c(RED, '✖')} ${e.file}:${e.line}:${e.column + 1} ${e.message}`);
  }

  out.push('');
  out.push(c(BOLD, s.passed ? '✅ STATUS: PASS — nenhuma falha de nível error encontrada' : '❌ STATUS: FAIL — existem achados bloqueadores ou erros de parsing'));
  out.push(c(DIM, '  Dica: rode com --format json/sarif para automação; use --write-baseline para aceitar o estado atual.'));
  out.push('');
  return out.join('\n');
}


export function formatCompact(result, opts = {}) {
  const color = opts.color ?? (process.stdout.isTTY && process.env.NO_COLOR == null);
  const c = (code, value) => color ? code + value + RESET : value;
  const s = result.summary;
  const out = [];
  out.push(c(BOLD, `🐛 BUG HUNTER — DEMO v${result.version ?? '0.3.1-demo.1'}`));
  out.push(`Target: ${result.target}`);
  out.push(`Files: ${result.project.filesRead}/${result.project.files} read • ${result.project.sourceFiles} source • ${formatBytes(result.project.bytes)}`);
  out.push(`Findings: ${s.findings} • ${c(RED, `${s.bySeverity.error} errors`)} • ${c(YELLOW, `${s.bySeverity.warning} warnings`)} • ${c(CYAN, `${s.bySeverity.info} info`)}`);
  out.push(`Health: ${s.healthScore}/100 • ${s.findingsPerKLoc} findings/KLoC`);
  if (result.parseErrors.length) out.push(c(RED, `Parser errors: ${result.parseErrors.length}`));
  if (s.passed) out.push(c(GREEN, 'Status: PASS'));
  else out.push(c(RED, 'Status: FAIL — veja o log detalhado'));
  if (opts.logFile) out.push(c(DIM, `Log detalhado: ${opts.logFile}`));
  if (result.findings.length) {
    out.push('');
    out.push(c(BOLD, 'Principais achados:'));
    for (const f of result.findings.slice(0, 5)) {
      out.push(`  ${severityIcon(f.severity, color)} ${f.ruleId} ${f.file}:${f.line} — ${f.message}`);
    }
    if (result.findings.length > 5) out.push(c(DIM, `  … e mais ${result.findings.length - 5}. Abra o log para o relatório completo.`));
  }
  return out.join('\n') + '\n';
}

function buildHotspots(result) {
  const map = new Map();
  for (const f of result.findings) {
    const current = map.get(f.file) ?? { file: f.file, count: 0, severity: 'info', categories: new Set() };
    current.count++; current.categories.add(f.category);
    if (f.severity === 'error' || (f.severity === 'warning' && current.severity === 'info')) current.severity = f.severity;
    map.set(f.file, current);
  }
  return [...map.values()].map((x) => ({ ...x, categories: [...x.categories] })).sort((a,b) => b.count-a.count);
}

function indent(text, prefix) { return text.split('\n').map((line) => prefix + line).join('\n'); }
function severityIcon(s, color = true) { const icon = s === 'error' ? '✖' : s === 'warning' ? '⚠' : 'ℹ'; if (!color) return icon; return s === 'error' ? `${RED}${icon}${RESET}` : s === 'warning' ? `${YELLOW}${icon}${RESET}` : `${CYAN}${icon}${RESET}`; }
function healthBar(score = 0) { const filled = Math.round(score / 10); return `[${'█'.repeat(filled)}${'░'.repeat(10-filled)}]`; }
function formatBytes(n) { if (n < 1024) return `${n} B`; if (n < 1024*1024) return `${(n/1024).toFixed(1)} KB`; return `${(n/1024/1024).toFixed(1)} MB`; }

export function formatJson(result) { return JSON.stringify({ project: result.project, summary: result.summary, findings: result.findings, parseErrors: result.parseErrors, skipped: result.skipped }, null, 2); }

export function formatSarif(result) {
  const ruleMap = new Map();
  for (const f of result.findings) if (!ruleMap.has(f.ruleId)) ruleMap.set(f.ruleId, f);
  return JSON.stringify({
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json', version: '2.1.0',
    runs: [{
      tool: { driver: { name: 'Bug Hunter', version: '0.3.0', informationUri: 'https://github.com/bug-hunter-static', rules: [...ruleMap.values()].map((f) => ({ id: f.ruleId, name: f.title, shortDescription: { text: f.title }, help: { text: f.suggestion ?? f.message } })) } },
      results: result.findings.map((f) => ({ ruleId: f.ruleId, level: f.severity === 'error' ? 'error' : f.severity === 'warning' ? 'warning' : 'note', message: { text: f.message }, locations: [{ physicalLocation: { artifactLocation: { uri: f.file }, region: { startLine: f.line, startColumn: f.column + 1, endLine: f.endLine, endColumn: f.endColumn + 1 } } }] }))
    }]
  }, null, 2);
}

export function formatMarkdown(result) {
  const s = result.summary;
  const out = [`# Bug Hunter report`, '', `**${result.project.files} files found · ${result.project.filesRead} read · ${result.project.lines} lines · ${s.findings} findings**`, '', `**Credits:** Shark`, '', `| Severity | Count |`, `|---|---:|`, `| Error | ${s.bySeverity.error} |`, `| Warning | ${s.bySeverity.warning} |`, `| Info | ${s.bySeverity.info} |`, ''];
  if (!result.findings.length) out.push('## ✅ No findings');
  for (const f of result.findings) { out.push(`## ${f.ruleId} — ${f.title}`, '', `**${f.file}:${f.line}:${f.column+1}** · ${f.severity} · ${f.category}`, '', f.message, '', '```text', f.codeFrame || f.snippet || '', '```', '', `**Suggested action:** ${f.suggestion ?? 'Review the code path and confirm intent.'}`, ''); }
  return out.join('\n');
}

export function formatHtml(result) {
  const findings = result.findings.map((f) => `<article class="finding ${f.severity}"><div class="meta"><b>${escapeHtml(f.ruleId)}</b> · ${escapeHtml(f.title)} · ${escapeHtml(f.file)}:${f.line}</div><p>${escapeHtml(f.message)}</p><pre>${escapeHtml(f.codeFrame || f.snippet || '')}</pre><div class="fix">→ ${escapeHtml(f.suggestion || '')}</div></article>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Bug Hunter</title><style>body{font-family:Inter,system-ui,sans-serif;background:#0b1020;color:#eef2ff;max-width:1100px;margin:40px auto;padding:0 24px}.hero{padding:28px;border-radius:18px;background:linear-gradient(135deg,#171f38,#11182c)}.stats{display:flex;gap:12px;flex-wrap:wrap}.stat{padding:12px 16px;background:#19233f;border-radius:12px}.finding{margin:18px 0;padding:20px;border-radius:14px;background:#121a2d;border-left:4px solid #7dd3fc}.finding.error{border-color:#fb7185}.finding.warning{border-color:#fbbf24}.finding.info{border-color:#60a5fa}.meta{font-size:14px}.finding p{line-height:1.6}pre{overflow:auto;background:#080d19;padding:14px;border-radius:10px}.fix{color:#86efac}</style></head><body><section class="hero"><h1>🐛 Bug Hunter</h1><p>Whole-project static analysis with code context, evidence and remediation hints.</p><p><b>Credits:</b> Shark</p><div class="stats"><div class="stat">${result.project.filesRead}/${result.project.files} files read</div><div class="stat">${result.project.sourceFiles} source</div><div class="stat">${result.project.textFiles} text</div><div class="stat">${result.project.lines} lines</div><div class="stat">✖ ${result.summary.bySeverity.error}</div><div class="stat">⚠ ${result.summary.bySeverity.warning}</div><div class="stat">ℹ ${result.summary.bySeverity.info}</div></div></section>${findings || '<h2>✅ No findings</h2>'}</body></html>`;
}
function escapeHtml(value) { return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
