import { analyzeLexicalScopes, report } from './helpers.js';
import { getCalleeName, isFunction, memberPath, walkAst } from '../core/utils.js';

export const hardeningRules = [
  {
    id: 'BH081', title: 'Duplicate declaration in scope', severity: 'warning', category: 'correctness', confidence: 'high',
    suggestion: 'Remova a declaração duplicada ou ajuste o escopo para evitar sobrescrita acidental.',
    description: 'Detecta múltiplas declarações do mesmo identificador no mesmo escopo lexical.',
    check(ctx) {
      if (!ctx?.ast) return;
      const model = analyzeLexicalScopes(ctx.ast);
      for (const scope of new Set(model.scopeByNode.values())) {
        for (const [name, nodes] of scope.bindings) {
          if (nodes.length < 2) continue;
          for (const node of nodes.slice(1)) report(ctx, this, node, `“${name}” foi declarado ${nodes.length} vezes no mesmo escopo.`);
        }
      }
    }
  },
  {
    id: 'BH082', title: 'Return from finally', severity: 'error', category: 'correctness', confidence: 'high',
    suggestion: 'Evite return/throw dentro de finally quando isso puder substituir o erro ou o retorno original.',
    description: 'Detecta return dentro de finally, que pode engolir uma exceção ou substituir o resultado do try/catch.',
    check(ctx) {
      walkAst(ctx.ast, (n) => {
        if (n.type !== 'TryStatement' || !n.finalizer) return;
        walkAst(n.finalizer, (child) => {
          if (child.type === 'ReturnStatement') report(ctx, this, child, 'return dentro de finally pode substituir a exceção ou o retorno original.');
          if (child.type === 'ThrowStatement') report(ctx, this, child, 'throw dentro de finally pode substituir a exceção original.');
        });
      });
    }
  },
  {
    id: 'BH083', title: 'Async Promise executor', severity: 'error', category: 'correctness', confidence: 'high',
    suggestion: 'Nunca use async como executor de new Promise; retorne uma Promise diretamente ou use await fora do construtor.',
    description: 'O executor async de Promise cria uma segunda Promise que o construtor ignora.',
    check(ctx) {
      walkAst(ctx.ast, (n) => {
        if (n.type !== 'NewExpression' || getCalleeName(n) !== 'Promise') return;
        const executor = n.arguments?.[0];
        if (isFunction(executor) && executor.async) report(ctx, this, executor, 'new Promise(async executor) pode perder rejeições e torna o fluxo de Promises incorreto.');
      });
    }
  },
  {
    id: 'BH084', title: 'Async callback passed to timer', severity: 'warning', category: 'correctness', confidence: 'medium',
    suggestion: 'Trate a Promise retornada pelo callback ou capture erros explicitamente.',
    description: 'Callbacks async passados a timers podem gerar rejeições não observadas.',
    check(ctx) {
      walkAst(ctx.ast, (n) => {
        if (n.type !== 'CallExpression') return;
        const name = getCalleeName(n);
        if (!['setTimeout', 'setInterval', 'queueMicrotask'].includes(name)) return;
        const callback = n.arguments?.[0];
        if (isFunction(callback) && callback.async) report(ctx, this, callback, `${name} recebeu callback async; rejeições podem ficar sem tratamento.`);
      });
    }
  },
  {
    id: 'BH085', title: 'Likely wrong sort comparator', severity: 'warning', category: 'correctness', confidence: 'medium',
    suggestion: 'Use comparador numérico como (a, b) => a - b ou retorne valores negativos, zero ou positivos de forma consistente.',
    description: 'Sinaliza comparadores de Array.sort que retornam boolean em vez de número.',
    check(ctx) {
      walkAst(ctx.ast, (n) => {
        if (n.type !== 'CallExpression' || !/(?:^|\.)sort$/.test(getCalleeName(n) ?? '')) return;
        const comparator = n.arguments?.[0];
        if (!isFunction(comparator)) return;
        if (comparator.type === 'ArrowFunctionExpression' && !comparator.body?.type) return;
        const returnedBoolean = comparator.body?.type === 'BinaryExpression' && ['<', '>', '<=', '>=', '===', '!=='].includes(comparator.body.operator);
        if (returnedBoolean) report(ctx, this, comparator, 'Comparador de sort parece retornar boolean; Array.sort espera valor numérico negativo, zero ou positivo.');
      });
    }
  },
  {
    id: 'BH086', title: 'Async callback in reduce', severity: 'warning', category: 'correctness', confidence: 'medium',
    suggestion: 'Para pipelines assíncronos, use um loop for...of ou encadeie Promises explicitamente.',
    description: 'reduce com callback async frequentemente produz uma Promise acumulada de forma incorreta.',
    check(ctx) {
      walkAst(ctx.ast, (n) => {
        if (n.type !== 'CallExpression' || !/(?:^|\.)reduce$/.test(getCalleeName(n) ?? '')) return;
        const callback = n.arguments?.[0];
        if (isFunction(callback) && callback.async) report(ctx, this, callback, 'reduce recebeu callback async; o acumulador tende a virar Promise e pode quebrar a lógica esperada.');
      });
    }
  },
  {
    id: 'BH087', title: 'Forgotten Promise rejection handler', severity: 'warning', category: 'correctness', confidence: 'medium',
    suggestion: 'Use await em contexto async, return, ou trate a rejeição com catch quando a Promise não for observada pelo chamador.',
    description: 'Detecta chamadas aparentes de Promise como statement sem await/return/catch.',
    check(ctx) {
      walkAst(ctx.ast, (n, parent) => {
        if (n.type !== 'ExpressionStatement' || n.expression?.type !== 'CallExpression') return;
        const call = n.expression;
        const name = getCalleeName(call) ?? '';
        if (!/^(?:fetch|axios|request|got|superagent|\w+\.(?:then|finally))$/.test(name)) return;
        if (call.callee?.type === 'MemberExpression' && ['catch', 'finally'].includes(call.callee.property?.name)) return;
        report(ctx, this, call, `Chamada “${name}” parece criar/trabalhar com Promise sem tratamento visível da rejeição.`, { confidence: 'medium' });
      });
    }
  },
  {
    id: 'BH088', title: 'Unsafe object key assignment', severity: 'error', category: 'security', confidence: 'medium',
    suggestion: 'Valide a chave contra uma allowlist ou use Map quando as chaves vierem de entrada externa.',
    description: 'Escrita dinâmica em objeto com chave externa pode reabrir prototype pollution.',
    check(ctx) {
      walkAst(ctx.ast, (n) => {
        if (n.type !== 'AssignmentExpression' || n.left?.type !== 'MemberExpression' || !n.left.computed) return;
        const key = n.left.property;
        if (key?.type !== 'Identifier') return;
        const source = n.left.object;
        const objectName = source?.type === 'Identifier' ? source.name : '';
        if (/^(obj|object|target|result|out|config|options|data|state|acc)$/i.test(objectName)) {
          report(ctx, this, n, `Atribuição por chave dinâmica em “${objectName}[...]” pode aceitar chaves perigosas como __proto__/constructor.`, { confidence: 'medium' });
        }
      });
    }
  },
  {
    id: 'BH089', title: 'Dangerous dynamic require', severity: 'error', category: 'security', confidence: 'high',
    suggestion: 'Use uma allowlist de módulos e evite transformar entrada externa diretamente em require().',
    description: 'Detecta require com argumento não literal.',
    check(ctx) {
      if (ctx.module?.kind !== 'cjs') return;
      walkAst(ctx.ast, (n) => {
        if (n.type !== 'CallExpression' || getCalleeName(n) !== 'require') return;
        const arg = n.arguments?.[0];
        if (arg && !['StringLiteral', 'TemplateLiteral'].includes(arg.type)) report(ctx, this, n, 'require() recebe módulo dinâmico; uma entrada controlável pode redirecionar o carregamento de código.');
      });
    }
  },
  {
    id: 'BH090', title: 'Synchronous filesystem in request/runtime path', severity: 'warning', category: 'performance', confidence: 'low',
    suggestion: 'Prefira APIs assíncronas quando o código roda em servidor, handler ou loop de alto volume.',
    description: 'Heurística para fs.*Sync em arquivos de aplicação.',
    check(ctx) {
      walkAst(ctx.ast, (n) => {
        if (n.type !== 'CallExpression') return;
        const path = memberPath(n.callee);
        if (!path || !/^(?:fs|node:fs)\..+Sync$/.test(path)) return;
        report(ctx, this, n, `API síncrona “${path}” pode bloquear o event loop em código de servidor.`, { confidence: 'low' });
      });
    }
  },
  {
    id: 'BH091', title: 'Process exit in library code', severity: 'warning', category: 'correctness', confidence: 'medium',
    suggestion: 'Retorne/propague o erro para o consumidor da biblioteca em vez de encerrar o processo hospedeiro.',
    description: 'Detecta process.exit em código que parece ser biblioteca/módulo reutilizável.',
    check(ctx) {
      if (ctx.file?.startsWith('cli/') || ctx.file?.startsWith('bin/')) return;
      walkAst(ctx.ast, (n) => {
        if (n.type === 'CallExpression' && getCalleeName(n) === 'process.exit') report(ctx, this, n, 'process.exit() encerra o processo do consumidor e pode quebrar bibliotecas reutilizáveis.');
      });
    }
  }
];

