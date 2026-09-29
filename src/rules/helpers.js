import { getCalleeName, isFunction, nodeName, walkAst } from '../core/utils.js';

const SCOPE_NODES = new Set(['BlockStatement', 'CatchClause', 'ForStatement', 'ForInStatement', 'ForOfStatement', 'SwitchStatement']);

export function report(ctx, rule, node, message, extra = {}) {
  ctx.report({
    ruleId: rule.id,
    title: rule.title,
    severity: rule.severity,
    category: rule.category,
    message,
    suggestion: rule.suggestion ?? null,
    confidence: rule.confidence ?? 'high',
    ...extra,
    node
  });
}

export function literalValue(node) {
  if (!node) return undefined;
  if (['StringLiteral', 'NumericLiteral', 'BooleanLiteral', 'BigIntLiteral', 'RegExpLiteral'].includes(node.type)) return node.value ?? node.pattern;
  if (node.type === 'NullLiteral') return null;
  if (node.type === 'TemplateLiteral' && node.expressions?.length === 0) return node.quasis?.[0]?.value?.cooked ?? '';
  return undefined;
}

export function memberPath(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'ThisExpression') return 'this';
  if (node.type === 'Super') return 'super';
  if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
    const left = memberPath(node.object);
    const right = node.computed ? literalValue(node.property) : nodeName(node.property);
    if (left && right !== undefined && right !== null) return `${left}.${right}`;
  }
  return null;
}

export function isLiteral(node) {
  return ['StringLiteral', 'NumericLiteral', 'BooleanLiteral', 'NullLiteral', 'RegExpLiteral'].includes(node?.type);
}

export function collectBindingNames(pattern, out = new Set()) {
  if (!pattern) return out;
  if (pattern.type === 'Identifier') out.add(pattern.name);
  else if (pattern.type === 'RestElement') collectBindingNames(pattern.argument, out);
  else if (pattern.type === 'AssignmentPattern') collectBindingNames(pattern.left, out);
  else if (pattern.type === 'ObjectPattern') {
    for (const p of pattern.properties ?? []) {
      if (p.type === 'ObjectProperty') collectBindingNames(p.value, out);
      else if (p.type === 'RestElement') collectBindingNames(p.argument, out);
    }
  } else if (pattern.type === 'ArrayPattern') for (const p of pattern.elements ?? []) collectBindingNames(p, out);
  return out;
}

function collectBindingIdentifiers(pattern, out = []) {
  if (!pattern) return out;
  if (pattern.type === 'Identifier') out.push(pattern);
  else if (pattern.type === 'RestElement') collectBindingIdentifiers(pattern.argument, out);
  else if (pattern.type === 'AssignmentPattern') collectBindingIdentifiers(pattern.left, out);
  else if (pattern.type === 'ObjectPattern') {
    for (const p of pattern.properties ?? []) {
      if (p.type === 'ObjectProperty') collectBindingIdentifiers(p.value, out);
      else if (p.type === 'RestElement') collectBindingIdentifiers(p.argument, out);
    }
  } else if (pattern.type === 'ArrayPattern') {
    for (const p of pattern.elements ?? []) collectBindingIdentifiers(p, out);
  }
  return out;
}

function nearestFunctionScope(scope) {
  let current = scope;
  while (current?.parent && current.type !== 'function' && current.type !== 'program') current = current.parent;
  return current ?? scope;
}

export function analyzeLexicalScopes(ast) {
  const root = { type: 'program', parent: null, bindings: new Map(), node: ast };
  const scopeByNode = new Map();
  const declarationNodes = new Set();
  const declarations = [];

  const addBinding = (scope, name, node) => {
    if (!scope || !name) return;
    if (!scope.bindings.has(name)) scope.bindings.set(name, []);
    scope.bindings.get(name).push(node);
    declarationNodes.add(node);
    declarations.push({ name, node, scope });
  };

  const traverse = (node, currentScope, variableKind = null) => {
    if (!node || typeof node !== 'object' || typeof node.type !== 'string') return;
    if (isFunction(node)) {
      if (node.type === 'FunctionDeclaration' && node.id?.name) addBinding(currentScope, node.id.name, node.id);
      const fnScope = { type: 'function', parent: currentScope, bindings: new Map(), node };
      scopeByNode.set(node, fnScope);
      if (node.type !== 'FunctionDeclaration' && node.id?.name) addBinding(fnScope, node.id.name, node.id);
      for (const param of node.params ?? []) {
        scopeByNode.set(param, fnScope);
        for (const id of collectBindingIdentifiers(param)) addBinding(fnScope, id.name, id);
      }
      for (const param of node.params ?? []) traverse(param, fnScope);
      if (node.body) traverse(node.body, fnScope);
      return;
    }

    let scope = currentScope;
    if (node.type === 'Program') scope = root;
    else if (SCOPE_NODES.has(node.type)) scope = { type: 'block', parent: currentScope, bindings: new Map(), node };
    scopeByNode.set(node, scope);

    if (node.type === 'ImportDeclaration') {
      for (const specifier of node.specifiers ?? []) {
        if (specifier.local?.name) addBinding(scope, specifier.local.name, specifier.local);
      }
    }
    if (node.type === 'VariableDeclarator') {
      const target = variableKind === 'var' ? nearestFunctionScope(scope) : scope;
      for (const id of collectBindingIdentifiers(node.id)) addBinding(target, id.name, id);
    }
    if (node.type === 'ClassDeclaration' && node.id?.name) addBinding(scope, node.id.name, node.id);
    if (node.type === 'CatchClause') {
      for (const id of collectBindingIdentifiers(node.param)) addBinding(scope, id.name, id);
    }

    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'extra', 'comments', 'tokens', 'errors'].includes(key) || !value) continue;
      const childVariableKind = node.type === 'VariableDeclaration' && key === 'declarations' ? node.kind : null;
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child?.type) traverse(child, scope, childVariableKind);
        }
      } else if (value?.type) {
        traverse(value, scope, childVariableKind);
      }
    }
  };
  traverse(ast, root);

  return { root, scopeByNode, declarationNodes, declarations };
}

export function resolveBinding(scope, name) {
  let current = scope;
  while (current) {
    if (current.bindings.has(name)) return current;
    current = current.parent;
  }
  return null;
}

export function isLoop(node, parent) {
  return ['ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement'].includes(parent?.type) ||
    ['ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement'].includes(node?.type);
}

export function enclosingFunction(parentMap, node) {
  let current = node;
  while (current) {
    current = parentMap.get(current);
    if (current && isFunction(current)) return current;
  }
  return null;
}

export function calledInsideFunction(fn, name) {
  const result = [];
  walkAst(fn.body, (node) => {
    if (node.type === 'CallExpression' && getCalleeName(node) === name) result.push(node);
  });
  return result;
}

export function getStringArgument(node, index = 0) {
  const arg = node?.arguments?.[index];
  return isLiteral(arg) && typeof literalValue(arg) === 'string' ? literalValue(arg) : null;
}
