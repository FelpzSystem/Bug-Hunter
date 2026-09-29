export const SEVERITIES = Object.freeze({ info: 0, warning: 1, error: 2 });

export function locOf(node) {
  if (!node?.loc) return { line: 1, column: 0, endLine: 1, endColumn: 1 };
  return {
    line: node.loc.start.line,
    column: node.loc.start.column,
    endLine: node.loc.end.line,
    endColumn: node.loc.end.column
  };
}

export function snippet(code, node, max = 220) {
  if (!node || typeof node.start !== 'number' || typeof node.end !== 'number') return '';
  const raw = code.slice(node.start, node.end).replace(/\s+/g, ' ').trim();
  return raw.length <= max ? raw : `${raw.slice(0, max - 1)}…`;
}

export function nodeName(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'PrivateName') return node.id?.name ?? null;
  if (['StringLiteral', 'NumericLiteral', 'BooleanLiteral', 'BigIntLiteral'].includes(node.type)) return String(node.value);
  return null;
}

export function isFunction(node) {
  return !!node && /Function(?:Declaration|Expression)|ArrowFunctionExpression|ObjectMethod|ClassMethod|ClassPrivateMethod/.test(node.type);
}

export function unwrap(node) {
  let current = node;
  while (current && ['TSAsExpression', 'TSTypeAssertion', 'TypeCastExpression', 'TSNonNullExpression', 'TSInstantiationExpression'].includes(current.type)) current = current.expression;
  return current;
}

export function getCalleeName(node) {
  const callee = unwrap(node?.callee);
  if (!callee) return null;
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression' || callee.type === 'OptionalMemberExpression') {
    const obj = memberPath(callee.object);
    const prop = callee.computed ? nodeName(callee.property) : nodeName(callee.property);
    return obj && prop ? `${obj}.${prop}` : prop;
  }
  return null;
}

export function memberPath(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'ThisExpression') return 'this';
  if (node.type === 'Super') return 'super';
  if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
    const left = memberPath(node.object);
    const right = node.computed ? nodeName(node.property) : nodeName(node.property);
    return left && right ? `${left}.${right}` : null;
  }
  return null;
}

export function walkAst(node, visitor, parent = null, key = null) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') visitor(node, parent, key);
  for (const [childKey, value] of Object.entries(node)) {
    if (childKey === 'loc' || childKey === 'extra' || childKey === 'tokens' || childKey === 'comments' || childKey === 'errors') continue;
    if (!value) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object' && typeof item.type === 'string') walkAst(item, visitor, node, childKey);
      }
    } else if (value && typeof value === 'object' && typeof value.type === 'string') {
      walkAst(value, visitor, node, childKey);
    }
  }
}

export function complexityOfFunction(fn) {
  let score = 1;
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node !== fn && isFunction(node)) return;
    if ([
      'IfStatement', 'ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement',
      'DoWhileStatement', 'CatchClause', 'ConditionalExpression', 'LogicalExpression', 'SwitchCase'
    ].includes(node.type)) score += 1;
    if (node.type === 'LogicalExpression' && ['&&', '||', '??'].includes(node.operator)) score += 1;
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'extra', 'comments', 'tokens', 'errors'].includes(key) || !value) continue;
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child?.type) visit(child);
        }
      } else if (value?.type) {
        visit(value);
      }
    }
  };
  visit(fn.body);
  return score;
}

export function lineCount(code) {
  return code ? code.split(/\r?\n/).length : 0;
}

export function codeFrame(code, line, column = 0, context = 2) {
  const lines = code.split(/\r?\n/);
  const start = Math.max(1, line - context);
  const end = Math.min(lines.length, line + context);
  const width = String(end).length;
  return lines.slice(start - 1, end).map((text, i) => {
    const number = start + i;
    const pointer = number === line ? `${' '.repeat(width)}  | ${' '.repeat(column)}^` : '';
    return `${String(number).padStart(width)}  | ${text}${pointer ? `\n${pointer}` : ''}`;
  }).join('\n');
}

export function hashFinding(finding) {
  const stable = [finding.ruleId, finding.file, finding.line, finding.column, finding.message].join('|');
  let hash = 2166136261;
  for (let i = 0; i < stable.length; i++) {
    hash ^= stable.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function severityAtLeast(actual, minimum) { return SEVERITIES[actual] >= SEVERITIES[minimum]; }

export function isIgnoredLine(code, line, ruleId) {
  const lines = code.split(/\r?\n/);
  const current = lines[line - 1] ?? '';
  const previous = lines[line - 2] ?? '';
  const patterns = [
    new RegExp(`bug-hunter-ignore-next-line\\s+(?:${escapeRegExp(ruleId)}|all)\\b`, 'i'),
    new RegExp(`bug-hunter-disable-line\\s+(?:${escapeRegExp(ruleId)}|all)\\b`, 'i')
  ];
  return patterns.some((p) => p.test(previous) || p.test(current));
}

export function packageNameFromSpecifier(specifier) {
  if (!specifier || specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('#')) return null;
  if (specifier.startsWith('node:')) return null;
  if (specifier.startsWith('@')) return specifier.split('/').slice(0, 2).join('/');
  return specifier.split('/')[0];
}

export function isLikelyBuiltin(specifier, builtinSet) {
  if (!specifier) return false;
  if (specifier.startsWith('node:')) return true;
  return builtinSet.has(specifier);
}

export function sourceLines(code, line, radius = 3) {
  const lines = code.split(/\r?\n/);
  const from = Math.max(1, line - radius);
  const to = Math.min(lines.length, line + radius);
  return lines.slice(from - 1, to).map((text, index) => ({ line: from + index, text, highlight: from + index === line }));
}

function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\[\]\\]/g, '\\$&'); }
