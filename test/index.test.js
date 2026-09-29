import test from 'node:test';
import assert from 'node:assert/strict';
import { rules, projectRules, allRules } from '../src/rules/index.js';
import { codeFrame, isIgnoredLine, packageNameFromSpecifier, complexityOfFunction } from '../src/core/utils.js';
import { analyzeLexicalScopes, resolveBinding } from '../src/rules/helpers.js';
import { formatJson, formatMarkdown, formatHtml, formatSarif, formatPretty } from '../src/core/reporter.js';

test('rule catalog is broad, unique and documented', () => {
  assert.ok(rules.length >= 50);
  assert.ok(projectRules.length >= 10);
  assert.equal(new Set(allRules.map((r) => r.id)).size, allRules.length);
  for (const rule of allRules) assert.ok(rule.id && rule.title && rule.category && rule.severity);
});

test('source helpers understand suppressions and package names', () => {
  assert.equal(isIgnoredLine('// bug-hunter-ignore-next-line BH011\neval("x")', 2, 'BH011'), true);
  assert.equal(isIgnoredLine('// bug-hunter-ignore-next-line BH012\neval("x")', 2, 'BH011'), false);
  assert.equal(isIgnoredLine('// bug-hunter-ignore-next-line all\neval("x")', 2, 'BH011'), true);
  assert.equal(packageNameFromSpecifier('lodash/map'), 'lodash');
  assert.equal(packageNameFromSpecifier('@scope/tool/subpath'), '@scope/tool');
  assert.equal(packageNameFromSpecifier('./local.js'), null);
  assert.match(codeFrame('one\ntwo\nthree', 2, 1, 1), /2  \| two/);
});



test('scope analysis resolves lexical bindings without sibling leakage', () => {
  const id = (name) => ({ type: 'Identifier', name });
  const varDecl = (kind, name) => ({ type: 'VariableDeclaration', kind, declarations: [{ type: 'VariableDeclarator', id: id(name), init: { type: 'NumericLiteral', value: 1 } }] });
  const inner = { type: 'BlockStatement', body: [varDecl('const', 'value')] };
  const ast = { type: 'Program', body: [varDecl('const', 'value'), inner] };
  const model = analyzeLexicalScopes(ast);
  const outerScope = model.scopeByNode.get(ast);
  const innerScope = model.scopeByNode.get(inner);
  assert.equal(resolveBinding(outerScope, 'value'), outerScope);
  assert.equal(resolveBinding(innerScope, 'value'), innerScope);
  assert.equal(resolveBinding(innerScope, 'missing'), null);
  assert.equal(model.declarations.filter((d) => d.name === 'value').length, 2);
});

test('BH028 ignores async functions that actually await, including nested object properties', () => {
  const rule = rules.find((item) => item.id === 'BH028');
  const fn = {
    type: 'FunctionDeclaration',
    id: { type: 'Identifier', name: 'demo' },
    async: true,
    params: [],
    body: {
      type: 'BlockStatement',
      body: [{
        type: 'ReturnStatement',
        argument: {
          type: 'ObjectExpression',
          properties: [{
            type: 'ObjectProperty',
            key: { type: 'Identifier', name: 'result' },
            computed: false,
            value: { type: 'AwaitExpression', argument: { type: 'Identifier', name: 'work' } }
          }]
        }
      }]
    }
  };
  const findings = [];
  rule.check({ ast: { type: 'Program', body: [fn] }, report(finding) { findings.push(finding); } });
  assert.equal(findings.length, 0);
});

test('BH028 still reports async functions with no await', () => {
  const rule = rules.find((item) => item.id === 'BH028');
  const fn = {
    type: 'FunctionDeclaration',
    id: { type: 'Identifier', name: 'demo' },
    async: true,
    params: [],
    body: { type: 'BlockStatement', body: [{ type: 'ReturnStatement', argument: { type: 'StringLiteral', value: 'ok' } }] }
  };
  const findings = [];
  rule.check({ ast: { type: 'Program', body: [fn] }, report(finding) { findings.push(finding); } });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleId, 'BH028');
});

test('BH020 detects await inside a method forEach callback', () => {
  const awaitNode = { type: 'AwaitExpression', argument: { type: 'Identifier', name: 'work' } };
  const callback = { type: 'ArrowFunctionExpression', async: true, params: [{ type: 'Identifier', name: 'item' }], body: { type: 'BlockStatement', body: [{ type: 'ExpressionStatement', expression: awaitNode }] } };
  const call = {
    type: 'CallExpression',
    callee: {
      type: 'MemberExpression',
      computed: false,
      object: { type: 'Identifier', name: 'items' },
      property: { type: 'Identifier', name: 'forEach' }
    },
    arguments: [callback]
  };
  const ast = { type: 'Program', body: [{ type: 'ExpressionStatement', expression: call }] };
  const parents = new Map([
    [awaitNode, callback.body.body[0]],
    [callback.body.body[0], callback.body],
    [callback.body, callback],
    [callback, call],
    [call, ast]
  ]);
  const findings = [];
  const rule = rules.find((item) => item.id === 'BH020');
  rule.check({ ast, parents, report(finding) { findings.push(finding); } });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleId, 'BH020');
});

test('function scopes include parameters and default-value references', () => {
  const param = { type: 'Identifier', name: 'value' };
  const missing = { type: 'Identifier', name: 'fallback' };
  const fn = {
    type: 'FunctionDeclaration',
    id: { type: 'Identifier', name: 'demo' },
    params: [{ type: 'AssignmentPattern', left: param, right: missing }],
    body: { type: 'BlockStatement', body: [] }
  };
  const ast = { type: 'Program', body: [fn] };
  const model = analyzeLexicalScopes(ast);
  const fnScope = model.scopeByNode.get(fn);
  assert.ok(fnScope);
  assert.equal(resolveBinding(fnScope, 'value'), fnScope);
  assert.equal(resolveBinding(fnScope, 'demo'), model.root);
});

test('complexity ignores nested functions', () => {
  const nested = { type: 'FunctionExpression', async: false, params: [], body: { type: 'BlockStatement', body: [{ type: 'IfStatement', test: { type: 'BooleanLiteral', value: true }, consequent: { type: 'EmptyStatement' }, alternate: null }] } };
  const outer = { type: 'ArrowFunctionExpression', async: false, params: [], body: { type: 'BlockStatement', body: [nested, { type: 'IfStatement', test: { type: 'BooleanLiteral', value: true }, consequent: { type: 'EmptyStatement' }, alternate: null }] } };
  assert.equal(complexityOfFunction(outer), 2);
});

test('reporters expose full machine and human readable output', () => {
  const result = {
    root: '/demo', target: '/demo', project: { files: 2, lines: 20, bytes: 1000, imports: 2 },
    summary: { filesScanned: 2, findings: 1, rawFindings: 1, parseErrors: 0, baselineEntries: 0, passed: false, bySeverity: { error: 1, warning: 0, info: 0 }, byCategory: { security: 1 } },
    findings: [{ id: 'abc', ruleId: 'BH011', title: 'eval usage', category: 'security', severity: 'error', confidence: 'high', message: 'bad', file: 'a.js', line: 2, column: 0, endLine: 2, endColumn: 8, snippet: 'eval(x)', codeFrame: '1 | const x\n2 | eval(x)', suggestion: 'remove eval', evidence: null }],
    parseErrors: []
  };
  assert.equal(JSON.parse(formatJson(result)).findings[0].ruleId, 'BH011');
  assert.match(formatPretty(result, { color: false }), /BUG HUNTER/);
  assert.match(formatMarkdown(result), /BH011/);
  assert.match(formatHtml(result), /Bug Hunter/);
  assert.equal(JSON.parse(formatSarif(result)).version, '2.1.0');
  assert.doesNotMatch(formatPretty(result, { color: false }), /\x1b\[/);
});


test('integration scanner runs against the included multi-file demo when dependencies are installed', async (t) => {
  try { await import('@babel/parser'); } catch { t.skip('dependencies are not installed in this environment'); return; }
  const { scanProject } = await import('../src/core/scanner.js');
  const path = await import('node:path');
  const result = await scanProject(path.resolve('examples/demo-project'), { baselineMode: 'show', contextLines: 2 });
  assert.equal(result.parseErrors.length, 0);
  assert.ok(result.findings.length >= 12);
  const ids = new Set(result.findings.map((f) => f.ruleId));
  for (const id of ['BH018','BH020','BH031','BH032','BH033','BH035','BH036','BH037','BH038','BH039','BH042','BH051','BH052','BH054']) assert.ok(ids.has(id), `expected ${id}`);
  assert.ok(result.summary.healthScore < 100);
  assert.ok(result.findings.some((f) => f.codeFrame.includes('exec(command)')));
});


test('whole-project mode excludes node_modules while reading text files', async (t) => {
  try { await import('@babel/parser'); } catch { t.skip('dependencies are not installed in this environment'); return; }
  const { scanProject } = await import('../src/core/scanner.js');
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bug-hunter-'));
  await fs.mkdir(path.join(root, 'node_modules', 'fake'), { recursive: true });
  await fs.writeFile(path.join(root, 'main.js'), 'const token = "demo";\n');
  await fs.writeFile(path.join(root, '.env.example'), 'API_KEY=demo_key_value_that_looks_long_enough_12345\n');
  await fs.writeFile(path.join(root, 'node_modules', 'fake', 'bad.js'), 'eval("this should never be read");\n');
  const result = await scanProject(root, { baselineMode: 'show' });
  assert.ok(result.files.every((f) => !f.includes('node_modules')));
  assert.ok(result.fileData.some((f) => f.file === '.env.example'));
  assert.equal(result.skipped.binary.length, 0);
  assert.ok(result.findings.some((f) => f.ruleId === 'BH059' && f.file === '.env.example'));
  assert.ok(!result.findings.some((f) => f.file.includes('node_modules')));
  await fs.rm(root, { recursive: true, force: true });
});


test('parent map unwraps the babel File root so parent-dependent rules fire on real files', async (t) => {
  try { await import('@babel/parser'); } catch { t.skip('dependencies are not installed in this environment'); return; }
  const { scanProject } = await import('../src/core/scanner.js');
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bug-hunter-parents-'));
  await fs.writeFile(path.join(root, 'loop.js'), [
    'export async function audit(items) {',
    '  items.forEach(async (item) => {',
    '    await Promise.resolve(item);',
    '  });',
    '  for (const item of items) {',
    '    await Promise.resolve(item);',
    '  }',
    '}',
    ''
  ].join('\n'));
  const result = await scanProject(root, { baselineMode: 'show' });
  const bh020 = result.findings.filter((f) => f.ruleId === 'BH020');
  assert.ok(bh020.length >= 2, `expected BH020 for forEach callback and for...of, got ${bh020.length}`);
  assert.ok(bh020.some((f) => f.line === 3), 'expected BH020 inside the forEach callback');
  await fs.rm(root, { recursive: true, force: true });
});
