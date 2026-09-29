import { report, literalValue, memberPath, analyzeLexicalScopes, resolveBinding } from './helpers.js';
import { complexityOfFunction, getCalleeName, isFunction, walkAst } from '../core/utils.js';

const isStaticLiteral = (node) => ['StringLiteral', 'NumericLiteral', 'BooleanLiteral', 'NullLiteral', 'RegExpLiteral'].includes(node?.type);
const isIdentifier = (node, name) => node?.type === 'Identifier' && (name ? node.name === name : true);


function isConsoleAllowedPath(file, allowlist = []) {
  const normalized = String(file ?? '').replaceAll('\\', '/').replace(/^\/+/, '');
  return allowlist.some((entry) => {
    const prefix = String(entry).replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
    if (!prefix) return false;
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  });
}

export const rules = [
  {
    id: 'BH001', title: 'Undefined identifier', severity: 'error', category: 'correctness', confidence: 'medium',
    suggestion: 'Verifique o import, declaração, escopo ou nome digitado.',
    description: 'Encontra referências que parecem não ter declaração visível no arquivo.',
    check(ctx) {
      const model = analyzeLexicalScopes(ctx.ast);
      for (const [node, parent] of collectIdentifierUses(ctx.ast, ctx, model)) {
        const scope = model.scopeByNode.get(node) ?? model.scopeByNode.get(parent) ?? model.root;
        if (!resolveBinding(scope, node.name) && !ctx.globals.has(node.name)) {
          report(ctx, this, node, `“${node.name}” não está declarado neste escopo.`, { confidence: 'medium' });
        }
      }
    }
  },
  {
    id: 'BH002', title: 'Shadowed variable', severity: 'warning', category: 'correctness', confidence: 'medium',
    suggestion: 'Renomeie a variável interna ou reduza o escopo para evitar confusão.',
    description: 'Sinaliza nomes repetidos em escopos aninhados.',
    check(ctx) {
      const model = analyzeLexicalScopes(ctx.ast);
      for (const { name, node, scope } of model.declarations) {
        let outer = scope.parent;
        while (outer) {
          if (outer.bindings.has(name)) {
            report(ctx, this, node, `“${name}” sombreia uma variável de um escopo externo.`);
            break;
          }
          outer = outer.parent;
        }
      }
    }
  },
  {
    id: 'BH003', title: 'Unreachable statement', severity: 'warning', category: 'correctness',
    suggestion: 'Remova o trecho morto ou mova-o antes da instrução que encerra o fluxo.',
    description: 'Detecta statements após return/throw em blocos lineares.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (n.type !== 'BlockStatement') return; let terminated = false; for (const stmt of n.body) { if (terminated && stmt.type !== 'EmptyStatement') report(ctx, this, stmt, 'Este trecho parece inalcançável.'); if (['ReturnStatement','ThrowStatement'].includes(stmt.type)) terminated = true; } }); }
  },
  {
    id: 'BH004', title: 'Duplicate switch case', severity: 'warning', category: 'correctness',
    suggestion: 'Remova o case repetido ou corrija o valor comparado.', description: 'Detecta labels literais repetidos no mesmo switch.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (n.type !== 'SwitchStatement') return; const seen = new Map(); for (const c of n.cases ?? []) { const v = literalValue(c.test); if (v !== undefined) { const k = `${typeof v}:${String(v)}`; if (seen.has(k)) report(ctx, this, c.test, `Case duplicado: ${String(v)}.`); else seen.set(k, c.test); } } }); }
  },
  {
    id: 'BH005', title: 'Duplicate object key', severity: 'warning', category: 'correctness',
    suggestion: 'Mantenha uma única definição para a chave ou torne a segunda intencional/condicional.', description: 'Encontra chaves estáticas repetidas em objetos.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (n.type !== 'ObjectExpression') return; const seen = new Set(); for (const p of n.properties ?? []) { if (p.type !== 'ObjectProperty' || p.computed) continue; const key = p.key?.name ?? literalValue(p.key); if (key == null) continue; if (seen.has(String(key))) report(ctx, this, p.key, `A chave “${key}” aparece mais de uma vez neste objeto.`); seen.add(String(key)); } }); }
  },
  {
    id: 'BH006', title: 'Constant condition', severity: 'warning', category: 'correctness',
    suggestion: 'Substitua a condição constante por fluxo direto ou corrija o valor.', description: 'Detecta if/while/ternário com condição literal booleana.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (!['IfStatement','ConditionalExpression','WhileStatement'].includes(n.type)) return; const v = literalValue(n.test); if (typeof v === 'boolean') report(ctx, this, n.test, `Condição constante ${v ? 'verdadeira' : 'falsa'}.`); }); }
  },
  {
    id: 'BH007', title: 'Self comparison / no-op assignment', severity: 'error', category: 'correctness',
    suggestion: 'Compare com outra expressão ou atribua o valor pretendido.', description: 'Encontra x === x, x !== x e x = x.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (['BinaryExpression','LogicalExpression'].includes(n.type) && ['===','!==','==','!='].includes(n.operator) && isIdentifier(n.left) && isIdentifier(n.right) && n.left.name === n.right.name) report(ctx, this, n, `“${n.left.name}” está sendo comparado com ele mesmo.`); if (n.type === 'AssignmentExpression' && n.operator === '=' && isIdentifier(n.left) && isIdentifier(n.right) && n.left.name === n.right.name) report(ctx, this, n, `A atribuição “${n.left.name} = ${n.right.name}” não altera o valor.`); }); }
  },
  {
    id: 'BH008', title: 'NaN comparison', severity: 'error', category: 'correctness',
    suggestion: 'Use Number.isNaN(valor) para testar NaN.', description: 'Detecta comparações diretas com NaN.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (n.type === 'BinaryExpression' && ['===','==','!==','!='].includes(n.operator) && ((isIdentifier(n.left,'NaN')) || (isIdentifier(n.right,'NaN')))) report(ctx, this, n, 'Comparações com NaN não funcionam como esperado; use Number.isNaN().'); }); }
  },
  {
    id: 'BH009', title: 'parseInt without radix', severity: 'warning', category: 'correctness', suggestion: 'Passe a base explicitamente: parseInt(valor, 10).', description: 'Exige radix explícita em parseInt.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (n.type === 'CallExpression' && getCalleeName(n) === 'parseInt' && n.arguments.length < 2) report(ctx, this, n, 'Passe a base explicitamente para parseInt(valor, 10).'); }); }
  },
  {
    id: 'BH010', title: 'Global isNaN', severity: 'warning', category: 'correctness', suggestion: 'Prefira Number.isNaN() para evitar coerção implícita.', description: 'Evita coerção implícita de isNaN global.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (n.type === 'CallExpression' && getCalleeName(n) === 'isNaN') report(ctx, this, n, 'Prefira Number.isNaN() para evitar coerção implícita.'); }); }
  },
  {
    id: 'BH011', title: 'eval usage', severity: 'error', category: 'security', suggestion: 'Remova eval; prefira estruturas de dados, funções explícitas ou um parser seguro.', description: 'Detecta execução dinâmica via eval.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (n.type === 'CallExpression' && getCalleeName(n) === 'eval') report(ctx, this, n, 'eval permite executar código dinâmico e aumenta o risco de injeção.'); }); }
  },
  {
    id: 'BH012', title: 'Function constructor', severity: 'error', category: 'security', suggestion: 'Evite new Function() e elimine a necessidade de código dinâmico.', description: 'Detecta new Function().',
    check(ctx) { walkAst(ctx.ast, (n) => { if (n.type === 'NewExpression' && getCalleeName(n) === 'Function') report(ctx, this, n, 'O construtor Function() executa código dinâmico.'); }); }
  },
  {
    id: 'BH013', title: 'Dynamic child_process exec', severity: 'error', category: 'security', suggestion: 'Prefira spawn/execFile com argumentos separados e validação de entrada.', description: 'Sinaliza shell command dinâmico em exec/execSync.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (n.type !== 'CallExpression') return; const name = getCalleeName(n); if (!['exec','child_process.exec','execSync','child_process.execSync'].includes(name)) return; const arg = n.arguments[0]; if (!arg || !isStaticLiteral(arg)) report(ctx, this, n, 'Comando de shell dinâmico detectado; valide/escape entradas e prefira spawn com args separados.'); }); }
  },
  {
    id: 'BH014', title: 'Dynamic timer code', severity: 'error', category: 'security', suggestion: 'Passe uma função em vez de uma string ao setTimeout/setInterval.', description: 'Detecta timer baseado em código string.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (n.type === 'CallExpression' && ['setTimeout','setInterval'].includes(getCalleeName(n)) && typeof literalValue(n.arguments[0]) === 'string') report(ctx, this, n, 'Evite timer baseado em string; passe uma função.'); }); }
  },
  {
    id: 'BH015', title: 'DOM HTML injection sink', severity: 'error', category: 'security', suggestion: 'Sanitize/encode conteúdo não confiável ou use textContent.', description: 'Detecta sinks HTML comuns.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (n.type !== 'AssignmentExpression') return; const p = memberPath(n.left); if (p && /\.(innerHTML|outerHTML)$/i.test(p)) report(ctx, this, n, `Sink de HTML detectado em ${p}; sanitize entradas não confiáveis.`); }); }
  },
  {
    id: 'BH016', title: 'document.write', severity: 'error', category: 'security', suggestion: 'Prefira criação de DOM via APIs seguras, sem HTML não confiável.', description: 'Detecta document.write/writeln.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (n.type === 'CallExpression' && ['document.write','document.writeln'].includes(getCalleeName(n))) report(ctx, this, n, 'document.write pode introduzir conteúdo não confiável na página.'); }); }
  },
  {
    id: 'BH017', title: 'Insecure HTTP URL', severity: 'warning', category: 'security', suggestion: 'Troque por HTTPS quando o endpoint suportar TLS.', description: 'Sinaliza URLs HTTP hard-coded fora de localhost.',
    check(ctx) { walkAst(ctx.ast, (n) => { const v = literalValue(n); if (typeof v === 'string' && /^http:\/\//i.test(v) && !/^http:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)([:/]|$)/i.test(v)) report(ctx, this, n, 'URL HTTP sem TLS detectada.'); }); }
  },
  {
    id: 'BH018', title: 'Hard-coded secret candidate', severity: 'error', category: 'security', suggestion: 'Remova o segredo do código e use variáveis de ambiente/secret manager.', description: 'Encontra nomes e padrões de credenciais em literais.',
    check(ctx) {
      const secretLike = /(api[_-]?key|secret|token|password|passwd|authorization|private[_-]?key)/i;
      const strongToken = /^(gh[pousr]_[A-Za-z0-9_\-]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_\-]{20,}|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})$/;
      const checkLiteral = (node, name, label) => {
        const value = literalValue(node);
        if (typeof value !== 'string' || value.length < 8) return;
        const strong = strongToken.test(value);
        if (secretLike.test(name ?? '') || strong) report(ctx, this, node, `Possível segredo embutido${label ? ` em ${label}` : ''}; mova credenciais para configuração/secret manager.`, { confidence: strong ? 'high' : 'medium' });
      };
      walkAst(ctx.ast, (n) => {
        if (n.type === 'VariableDeclarator' && n.init) checkLiteral(n.init, n.id?.type === 'Identifier' ? n.id.name : '', n.id?.type === 'Identifier' ? n.id.name : null);
        if (n.type === 'AssignmentExpression') {
          const path = memberPath(n.left) ?? '';
          checkLiteral(n.right, path, path);
        }
        if (n.type === 'ObjectProperty' && !n.computed) {
          const key = n.key?.name ?? literalValue(n.key);
          checkLiteral(n.value, typeof key === 'string' ? key : '', typeof key === 'string' ? key : null);
        }
        if (n.type === 'StringLiteral' || n.type === 'TemplateLiteral') checkLiteral(n, '', null);
      });
    }
  },
  {
    id: 'BH019', title: 'Async Promise executor', severity: 'error', category: 'correctness', suggestion: 'Remova o new Promise desnecessário ou use um executor síncrono.', description: 'Detecta async executor dentro de new Promise.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (n.type === 'NewExpression' && isIdentifier(n.callee,'Promise') && n.arguments[0] && isFunction(n.arguments[0]) && n.arguments[0].async) report(ctx, this, n.arguments[0], 'Evite async executor dentro de new Promise(); erros podem escapar do fluxo esperado.'); }); }
  },
  {
    id: 'BH020', title: 'Await inside loop', severity: 'warning', category: 'performance', confidence: 'medium', suggestion: 'Quando as operações forem independentes, acumule promessas e use Promise.all().', description: 'Sinaliza await em loops.',
    check(ctx) { walkAst(ctx.ast, (n) => {
      if (n.type !== 'AwaitExpression') return;
      let p = ctx.parents.get(n);
      while (p && !isFunction(p)) {
        if (['ForStatement','ForInStatement','ForOfStatement','WhileStatement','DoWhileStatement'].includes(p.type)) {
          report(ctx, this, n, 'await dentro de loop pode serializar operações; avalie Promise.all() quando houver independência.');
          return;
        }
        p = ctx.parents.get(p);
      }

      // Array iteration callbacks are loop-like from a concurrency perspective:
      // an async callback passed to forEach can create many sequential-looking
      // awaits while the outer loop does not await the callbacks at all.
      p = ctx.parents.get(n);
      while (p) {
        if (isFunction(p)) {
          const owner = ctx.parents.get(p);
          const calleeName = getCalleeName(owner);
          if (owner?.type === 'CallExpression' &&
              owner.arguments?.[0] === p &&
              (calleeName === 'forEach' || calleeName?.endsWith('.forEach'))) {
            report(ctx, this, n, 'await dentro de callback de forEach pode criar trabalho concorrente sem controle; prefira for...of ou Promise.all() conforme a intenção.');
          }
          return;
        }
        p = ctx.parents.get(p);
      }
    }); }
  },
  {
    id: 'BH021', title: 'Empty catch', severity: 'warning', category: 'correctness', suggestion: 'Registre, relance ou trate o erro explicitamente; mantenha vazio apenas se for intencional.', description: 'Detecta catch completamente vazio.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (n.type === 'CatchClause' && n.body?.body?.length === 0) report(ctx, this, n, 'Catch vazio engole erros silenciosamente.'); }); }
  },
  {
    id: 'BH022', title: 'Throw primitive', severity: 'warning', category: 'correctness', suggestion: 'Lance Error ou uma subclasse de Error.', description: 'Detecta throw de string/número/template estático.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (n.type === 'ThrowStatement' && ['StringLiteral','NumericLiteral','TemplateLiteral'].includes(n.argument?.type)) report(ctx, this, n, 'Lance Error em vez de um valor primitivo para preservar stack e contexto.'); }); }
  },
  {
    id: 'BH023', title: 'Var declaration', severity: 'warning', category: 'maintainability', suggestion: 'Use const quando não houver reatribuição, senão let.', description: 'Sinaliza var em código moderno.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (n.type === 'VariableDeclaration' && n.kind === 'var') report(ctx, this, n, 'Prefira let/const para evitar escopo de função inesperado.'); }); }
  },
  {
    id: 'BH024', title: 'Console in application code', severity: 'info', category: 'maintainability', suggestion: 'Use o logger da aplicação ou mantenha console apenas em scripts/debug intencional.', description: 'Sinaliza console.log/debug/info em código de aplicação, mas ignora por padrão diretórios de ferramentas, scripts, testes e exemplos onde console é normalmente a saída intencional.',
    check(ctx) {
      if (isConsoleAllowedPath(ctx.file, ctx.options.consoleAllowedPaths)) return;
      walkAst(ctx.ast, (n) => {
        if (n.type === 'CallExpression' && /^(console)\.(log|debug|info)$/.test(getCalleeName(n) ?? '')) report(ctx, this, n, 'console.* encontrado em código de aplicação; use o mecanismo de logging da aplicação quando apropriado.');
      });
    }
  },
  {
    id: 'BH025', title: 'Function too complex', severity: 'warning', category: 'maintainability', suggestion: 'Extraia decisões para funções menores e reduza branches aninhados.', description: 'Mede complexidade aproximada por AST.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (!isFunction(n) || !n.body) return; const c = complexityOfFunction(n); if (c > ctx.options.maxComplexity) report(ctx, this, n, `Complexidade aproximada ${c}, acima do limite ${ctx.options.maxComplexity}. Divida a função em unidades menores.`); }); }
  },
  {
    id: 'BH026', title: 'Function too long', severity: 'warning', category: 'maintainability', suggestion: 'Quebre a função por responsabilidade e extraia helpers.', description: 'Sinaliza funções acima do limite de linhas.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (!isFunction(n) || !n.loc) return; const lines = n.loc.end.line - n.loc.start.line + 1; if (lines > ctx.options.maxFunctionLines) report(ctx, this, n, `Função com ${lines} linhas, acima do limite ${ctx.options.maxFunctionLines}.`); }); }
  },
  {
    id: 'BH027', title: 'Regex with nested quantifier', severity: 'warning', category: 'performance', confidence: 'medium', suggestion: 'Revise quantificadores aninhados, adicione limites ou use parser específico.', description: 'Heurística para padrões com backtracking potencialmente explosivo.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (n.type !== 'RegExpLiteral') return; const p = n.pattern ?? ''; if (/\([^)]*[+*][^)]*\)[+*]/.test(p) || /\(.*\+.*\+.*\)/.test(p)) report(ctx, this, n, 'Regex contém quantificadores aninhados que podem causar backtracking excessivo.'); }); }
  },
  {
    id: 'BH028', title: 'Async without await', severity: 'warning', category: 'correctness', suggestion: 'Remova async se não for necessário ou confira se faltou await.', description: 'Sinaliza funções async sem await.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (!isFunction(n) || !n.async || !n.body) return; let hasAwait = false; const visit = (node) => { if (!node || typeof node !== 'object' || hasAwait) return; if (node !== n && isFunction(node)) return; if (node.type === 'AwaitExpression') { hasAwait = true; return; } for (const [key, value] of Object.entries(node)) { if (['loc','extra','comments','tokens','errors'].includes(key) || !value) continue; if (Array.isArray(value)) { for (const child of value) { if (child?.type) visit(child); } } else if (value?.type) { visit(value); } } }; visit(n.body); if (!hasAwait) report(ctx, this, n, 'Função async sem await; pode ser async desnecessário ou indicar promessa não aguardada.'); }); }
  },
  {
    id: 'BH029', title: 'Unused import', severity: 'warning', category: 'maintainability', suggestion: 'Remova o import ou use o símbolo no arquivo.', description: 'Detecta imports locais nunca referenciados.',
    check(ctx) { const imports = []; const counts = new Map(); const nodes = new Map(); walkAst(ctx.ast, (n) => { if (n.type === 'ImportSpecifier' || n.type === 'ImportDefaultSpecifier' || n.type === 'ImportNamespaceSpecifier') { if (n.local?.name) { imports.push(n.local.name); nodes.set(n.local.name, n.local); } } if (n.type === 'Identifier') counts.set(n.name, (counts.get(n.name) ?? 0) + 1); }); for (const name of imports) if ((counts.get(name) ?? 0) <= 1) report(ctx, this, nodes.get(name), `Import “${name}” parece não ser utilizado neste arquivo.`, { confidence: 'medium' }); }
  },
  {
    id: 'BH030', title: 'Suspicious empty function', severity: 'info', category: 'maintainability', suggestion: 'Confirme que a função vazia é um hook/no-op intencional.', description: 'Sinaliza funções vazias fora de convenções óbvias.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (!isFunction(n) || n.body?.type !== 'BlockStatement' || n.body.body.length !== 0) return; if (n.id?.name && /^(noop|empty|ignore)$/i.test(n.id.name)) return; report(ctx, this, n, 'Função vazia encontrada; confirme se é intencional.'); }); }
  },
  {
    id: 'BH031', title: 'Loose equality', severity: 'warning', category: 'correctness', suggestion: 'Use ===/!== quando você não precisa de coerção explícita.', description: 'Detecta == e != fora de comparações triviais com null.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (n.type === 'BinaryExpression' && ['==','!='].includes(n.operator) && !((n.left.type === 'NullLiteral') || (n.right.type === 'NullLiteral'))) report(ctx, this, n, `Comparação solta “${n.operator}” pode aplicar coerção implícita.`); }); }
  },
  {
    id: 'BH032', title: 'Assignment in condition', severity: 'warning', category: 'correctness', suggestion: 'Extraia a atribuição para uma linha separada ou use comparação explícita.', description: 'Detecta = dentro da condição de if/while.',
    check(ctx) { walkAst(ctx.ast, (n, p) => { if (!['IfStatement','WhileStatement','DoWhileStatement','ForStatement'].includes(n.type)) return; let hit = false; walkAst(n.test, (x) => { if (x.type === 'AssignmentExpression') hit = true; }); if (hit) report(ctx, this, n.test, 'A condição contém uma atribuição; isso pode ser um bug de digitação.'); }); }
  },
  {
    id: 'BH033', title: 'Async forEach callback', severity: 'warning', category: 'correctness', suggestion: 'Use for...of para sequenciar ou Promise.all(array.map(...)) para paralelizar.', description: 'Detecta forEach(async ...), cujo callback não é aguardado.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (n.type !== 'CallExpression' || !/\.forEach$/.test(getCalleeName(n) ?? '')) return; const cb = n.arguments?.[0]; if (isFunction(cb) && cb.async) report(ctx, this, cb, 'forEach não aguarda callbacks async; erros/promessas podem ficar soltos.'); }); }
  },
  {
    id: 'BH034', title: 'Floating promise candidate', severity: 'warning', category: 'correctness', confidence: 'medium', suggestion: 'Use await, return ou trate explicitamente a Promise.', description: 'Heurística para chamadas assíncronas aparentes usadas como statement.',
    check(ctx) { const names = new Set(['fetch','axios.get','axios.post','axios.put','axios.delete','fs.promises.readFile','fs.promises.writeFile']); walkAst(ctx.ast, (n, p) => { if (n.type !== 'CallExpression' || p?.type !== 'ExpressionStatement') return; if (names.has(getCalleeName(n))) report(ctx, this, n, 'A Promise retornada parece não ser aguardada nem retornada.'); }); }
  },
  {
    id: 'BH035', title: 'Math.random for security', severity: 'error', category: 'security', suggestion: 'Use crypto.randomUUID(), crypto.getRandomValues() ou crypto.randomBytes() para valores de segurança.', description: 'Sinaliza Math.random em geração de tokens, IDs ou segredos.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (n.type !== 'CallExpression' || getCalleeName(n) !== 'Math.random') return; const parent = ctx.parents.get(n); const context = parent ? JSON.stringify({ type: parent.type }) : ''; if (/token|secret|password|nonce|otp|session|key|id/i.test(ctx.code.slice(Math.max(0,n.start-90), Math.min(ctx.code.length,n.end+90)))) report(ctx, this, n, 'Math.random() não é adequado para valores de segurança/segredos.'); }); }
  },
  {
    id: 'BH036', title: 'Weak cryptographic hash', severity: 'warning', category: 'security', suggestion: 'Use SHA-256/SHA-384/SHA-512 ou algoritmo moderno adequado ao caso de uso.', description: 'Detecta createHash/md5/sha1 e aliases fracos.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (n.type !== 'CallExpression') return; const name = getCalleeName(n); const arg = n.arguments?.[0]; const value = literalValue(arg); if (['crypto.createHash','createHash'].includes(name) && typeof value === 'string' && /^(md5|sha1)$/i.test(value)) report(ctx, this, n, `Hash fraco “${value}” detectado.`); }); }
  },
  {
    id: 'BH037', title: 'TLS verification disabled', severity: 'error', category: 'security', suggestion: 'Remova rejectUnauthorized:false e valide certificados normalmente.', description: 'Detecta configurações que desabilitam verificação TLS.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (n.type !== 'ObjectProperty') return; const key = n.key?.name ?? n.key?.value; if (key === 'rejectUnauthorized' && literalValue(n.value) === false) report(ctx, this, n, 'Verificação de certificado TLS está desabilitada.'); }); }
  },
  {
    id: 'BH038', title: 'Dynamic RegExp', severity: 'warning', category: 'security', confidence: 'medium', suggestion: 'Valide/normalize a entrada e considere impor limites de tamanho/complexidade.', description: 'Sinaliza new RegExp com padrão não literal, que pode abrir superfície de ReDoS.',
    check(ctx) { walkAst(ctx.ast, (n) => { if ((n.type === 'NewExpression' || n.type === 'CallExpression') && isIdentifier(n.callee,'RegExp') && n.arguments?.[0] && !isStaticLiteral(n.arguments[0])) report(ctx, this, n, 'Expressão regular criada a partir de entrada dinâmica; considere risco de ReDoS e limite a complexidade.'); }); }
  },
  {
    id: 'BH039', title: 'Prototype pollution sink', severity: 'error', category: 'security', confidence: 'medium', suggestion: 'Rejeite __proto__/constructor/prototype, use Map ou valide chaves antes de escrever em objetos.', description: 'Detecta caminhos clássicos de prototype pollution em escrita.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (n.type !== 'AssignmentExpression') return; const p = memberPath(n.left) ?? ''; const raw = ctx.code.slice(n.left.start, n.left.end); if (/(?:^|\.)(?:__proto__|constructor\.prototype)(?:\.|\[|$)/.test(p) || /constructor\.prototype/.test(raw)) report(ctx, this, n, `Escrita em caminho sensível “${p}” pode permitir prototype pollution.`); }); }
  },
  {
    id: 'BH040', title: 'DOM javascript URL', severity: 'error', category: 'security', suggestion: 'Aceite apenas esquemas esperados como https/http e sanitize/normalize URLs.', description: 'Detecta atribuições href/src com literal javascript:.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (n.type !== 'AssignmentExpression') return; const p = memberPath(n.left) ?? ''; const v = literalValue(n.right); if (/(?:^|\.)(?:href|src)$/i.test(p) && typeof v === 'string' && /^\s*javascript:/i.test(v)) report(ctx, this, n, 'URL javascript: pode resultar em execução de script no navegador.'); }); }
  },
  {
    id: 'BH041', title: 'Unbounded user input parser', severity: 'warning', category: 'security', confidence: 'medium', suggestion: 'Valide tipo, tamanho e formato antes de parsear/processar entradas externas.', description: 'Heurística para JSON.parse/atob sobre nomes que parecem entrada externa.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (n.type !== 'CallExpression') return; const name = getCalleeName(n); if (!['JSON.parse','atob','decodeURIComponent'].includes(name)) return; const arg = n.arguments?.[0]; if (looksExternalInput(arg)) report(ctx, this, n, 'Entrada externa chega ao parser sem validação aparente de tamanho/formato.'); }); }
  },
  {
    id: 'BH042', title: 'Path traversal candidate', severity: 'error', category: 'security', confidence: 'medium', suggestion: 'Normalize o caminho, imponha um diretório raiz permitido e rejeite escapes como ../.', description: 'Heurística para APIs de filesystem com caminho potencialmente externo.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (n.type !== 'CallExpression') return; const name = getCalleeName(n); if (!/(?:^|\.)(readFile|writeFile|unlink|rm|readFileSync|writeFileSync|open|openSync)$/.test(name ?? '')) return; const arg = n.arguments?.[0]; if (looksExternalInput(arg)) report(ctx, this, n, 'Caminho potencialmente controlado por entrada externa chega ao filesystem.'); }); }
  },
  {
    id: 'BH043', title: 'Missing await in try/catch', severity: 'warning', category: 'correctness', confidence: 'medium', suggestion: 'Garanta que a Promise seja aguardada dentro do try para que o catch capture sua rejeição.', description: 'Heurística para chamada async aparente dentro de try sem await.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (n.type !== 'TryStatement') return; let found = null; const visit = (node, parent) => { if (!node || found) return; if (node !== n.block && isFunction(node)) return; if (node.type === 'CallExpression' && parent?.type === 'ExpressionStatement' && /^(fetch|axios|request|save|send|update|delete|create)/i.test(getCalleeName(node) ?? '')) { found = node; return; } for (const [key, value] of Object.entries(node)) { if (['loc','extra','comments','tokens','errors'].includes(key) || !value) continue; if (Array.isArray(value)) for (const child of value) if (child?.type) visit(child, node); else if (value.type) visit(value, node); } }; visit(n.block, n); if (found) report(ctx, this, found, 'Chamada que parece assíncrona está sem await; o catch pode não capturar a rejeição.'); }); }
  },
  {
    id: 'BH044', title: 'Array map without return', severity: 'warning', category: 'correctness', confidence: 'medium', suggestion: 'Retorne explicitamente o valor que deve entrar no novo array ou use forEach se o retorno não importa.', description: 'Detecta callback bloco de map que não retorna nada.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (n.type !== 'CallExpression' || getCalleeName(n) !== 'map') return; const cb = n.arguments?.[0]; if (!isFunction(cb) || cb.body?.type !== 'BlockStatement') return; const returns = cb.body.body.some((s) => s.type === 'ReturnStatement'); if (!returns) report(ctx, this, cb, 'Callback de map não retorna valor; o resultado será preenchido com undefined.'); }); }
  },
  {
    id: 'BH045', title: 'Array filter without boolean', severity: 'info', category: 'correctness', confidence: 'low', suggestion: 'Retorne explicitamente true/false ou use Boolean para deixar a intenção clara.', description: 'Sinaliza callback de filter sem return explícito.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (n.type !== 'CallExpression' || getCalleeName(n) !== 'filter') return; const cb = n.arguments?.[0]; if (!isFunction(cb) || cb.body?.type !== 'BlockStatement') return; const returns = cb.body.body.some((s) => s.type === 'ReturnStatement'); if (!returns) report(ctx, this, cb, 'Callback de filter não retorna boolean; todos os elementos podem ser descartados.'); }); }
  },
  {
    id: 'BH046', title: 'Object.hasOwnProperty call', severity: 'warning', category: 'correctness', suggestion: 'Use Object.hasOwn(obj, key) ou Object.prototype.hasOwnProperty.call(obj, key).', description: 'Evita falhas quando objetos substituem/ocultam hasOwnProperty.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (n.type === 'CallExpression' && /\.hasOwnProperty$/.test(getCalleeName(n) ?? '')) report(ctx, this, n, 'Chamar hasOwnProperty diretamente em um objeto pode falhar se a propriedade for sobrescrita.'); }); }
  },
  {
    id: 'BH047', title: 'parse JSON from string literal in hot code', severity: 'info', category: 'performance', suggestion: 'Pré-converta dados estáticos ou mantenha o parsing fora de loops/caminhos quentes.', description: 'Sinaliza JSON.parse literal, especialmente útil como dica de cleanup/performance.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (n.type !== 'CallExpression' || getCalleeName(n) !== 'JSON.parse') return; let p = ctx.parents.get(n); while (p) { if (['ForStatement','ForInStatement','ForOfStatement','WhileStatement','DoWhileStatement'].includes(p.type)) { report(ctx, this, n, 'JSON.parse dentro de loop pode repetir trabalho de parsing.'); break; } if (isFunction(p)) break; p = ctx.parents.get(p); } }); }
  },
  {
    id: 'BH048', title: 'Expensive spread in loop', severity: 'info', category: 'performance', confidence: 'medium', suggestion: 'Acumule em estrutura mutável local e finalize ao fim do loop quando apropriado.', description: 'Detecta spread de array/object dentro de loop.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (n.type !== 'SpreadElement') return; let p = ctx.parents.get(n); while (p) { if (['ForStatement','ForInStatement','ForOfStatement','WhileStatement','DoWhileStatement'].includes(p.type)) { report(ctx, this, n, 'Spread dentro de loop pode criar cópias repetidas e custosas.'); break; } if (isFunction(p)) break; p = ctx.parents.get(p); } }); }
  },
  {
    id: 'BH049', title: 'Date.parse ambiguous literal', severity: 'warning', category: 'correctness', confidence: 'medium', suggestion: 'Prefira ISO-8601 explícito e/ou Temporal/Date.UTC conforme o caso.', description: 'Detecta Date.parse com string sem formato ISO evidente.',
    check(ctx) { walkAst(ctx.ast, (n) => { if (n.type === 'CallExpression' && getCalleeName(n) === 'Date.parse') { const v = literalValue(n.arguments?.[0]); if (typeof v === 'string' && !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(v)) report(ctx, this, n, `Formato de data “${v}” pode ser interpretado de forma dependente de ambiente.`); } }); }
  },
  {
    id: 'BH050', title: 'Hard-coded production localhost', severity: 'info', category: 'maintainability', confidence: 'low', suggestion: 'Externalize endpoints por ambiente para evitar configuração fixa.', description: 'Dica para URLs localhost hard-coded.',
    check(ctx) { walkAst(ctx.ast, (n) => { const v = literalValue(n); if (typeof v === 'string' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(v)) report(ctx, this, n, `Endpoint local hard-coded: ${v}`); }); }
  }
];



function looksExternalInput(node) {
  if (!node) return false;
  if (node.type === 'Identifier') return /^(req|request|body|query|params|input|payload|data|file|filename|path|name)$/i.test(node.name);
  if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') return looksExternalInput(node.object);
  return false;
}

const TYPE_CONTAINER_TYPES = new Set([
  'TSTypeAnnotation', 'TSTypeReference', 'TSQualifiedName', 'TSTypeQuery', 'TSTypeLiteral',
  'TSTypeParameter', 'TSTypeParameterDeclaration', 'TSTypeParameterInstantiation',
  'TSInterfaceDeclaration', 'TSInterfaceBody', 'TSTypeAliasDeclaration', 'TSUnionType',
  'TSIntersectionType', 'TSArrayType', 'TSTupleType', 'TSMappedType', 'TSIndexedAccessType',
  'TSLiteralType', 'TSFunctionType', 'TSConstructorType', 'TSMethodSignature', 'TSPropertySignature',
  'TSCallSignatureDeclaration', 'TSConstructSignatureDeclaration', 'TSConditionalType',
  'TSInferType', 'TSImportType', 'TSParenthesizedType', 'TSRestType', 'TSOptionalType',
  'TSObjectKeyword', 'TSStringKeyword', 'TSNumberKeyword', 'TSBooleanKeyword', 'TSAnyKeyword',
  'TSUnknownKeyword', 'TSNeverKeyword', 'TSVoidKeyword', 'TSNullKeyword', 'TSUndefinedKeyword',
  'TSSymbolKeyword', 'TSBigIntKeyword', 'TSIntrinsicKeyword', 'TSTypeOperator', 'TSDeclareFunction'
]);

function isTypePosition(node, parent, parents) {
  let child = node;
  let current = parent;
  while (current) {
    if (TYPE_CONTAINER_TYPES.has(current.type)) return true;
    if (['TSAsExpression','TSTypeAssertion','TSSatisfiesExpression','TSInstantiationExpression'].includes(current.type)) {
      if (current.expression === child) return false;
      if (current.type === 'TSInstantiationExpression' && current.expression === child) return false;
      return true;
    }
    child = current;
    current = parents.get(current);
  }
  return false;
}

function isIdentifierReference(node, parent, ctx, model) {
  if (model.declarationNodes.has(node) || !parent) return false;
  if (isTypePosition(node, parent, ctx.parents)) return false;
  if (['LabeledStatement','BreakStatement','ContinueStatement','MetaProperty'].includes(parent.type)) return false;
  if (['MemberExpression','OptionalMemberExpression'].includes(parent.type) && parent.property === node && !parent.computed) return false;
  if (['ObjectMethod','ClassMethod','ClassPrivateMethod','ClassProperty','ClassPrivateProperty'].includes(parent.type) && parent.key === node) return false;
  if (parent.type === 'ObjectProperty' && parent.key === node && parent.value !== node) return false;
  if (parent.type === 'ImportSpecifier' && parent.imported === node) return false;
  if (parent.type === 'ExportSpecifier' && parent.exported === node) return false;
  return true;
}

function collectIdentifierUses(ast, ctx, model) {
  const uses = [];
  walkAst(ast, (node, parent) => {
    if (node.type !== 'Identifier' || !isIdentifierReference(node, parent, ctx, model)) return;
    uses.push([node, parent]);
  });
  return uses;
}

export const projectRules = [
  { id: 'BH051', title: 'Possibly unused dependency', severity: 'warning', category: 'maintainability', scope: 'project', description: 'Dependência declarada em dependencies que não apareceu em imports/requires analisados.' },
  { id: 'BH052', title: 'Undeclared external dependency', severity: 'error', category: 'correctness', scope: 'project', description: 'Pacote externo usado pelo código e não declarado no package.json.' },
  { id: 'BH053', title: 'Dependency declared twice', severity: 'warning', category: 'correctness', scope: 'project', description: 'Dependência declarada em mais de uma seção do package.json.' },
  { id: 'BH054', title: 'Project lifecycle script', severity: 'info', category: 'security', scope: 'project', description: 'Scripts de lifecycle do próprio projeto merecem revisão porque executam automaticamente em instalações.' },
  { id: 'BH055', title: 'Large dependency surface', severity: 'info', category: 'maintainability', scope: 'project', description: 'Muitos pacotes de runtime aumentam superfície de manutenção e supply chain.' },
  { id: 'BH056', title: 'Large file', severity: 'warning', category: 'maintainability', scope: 'project', description: 'Arquivo acima do limite configurado de linhas.' },
  { id: 'BH057', title: 'Console flood', severity: 'warning', category: 'maintainability', scope: 'project', description: 'Arquivo com volume elevado de chamadas console.' },
  { id: 'BH058', title: 'TODO/FIXME debt', severity: 'info', category: 'maintainability', scope: 'project', description: 'Comentários TODO/FIXME encontrados no projeto.' },
  { id: 'BH059', title: 'Secret-like value in project file', severity: 'error', category: 'security', scope: 'project', description: 'Valor com aparência de credencial encontrado em arquivo de texto do projeto.' },
  { id: 'BH060', title: 'Private key material', severity: 'error', category: 'security', scope: 'project', description: 'Material de chave privada encontrado em arquivo de texto do projeto.' }
];

export const allRules = [...rules, ...projectRules];
export const RULE_COUNT = allRules.length;

