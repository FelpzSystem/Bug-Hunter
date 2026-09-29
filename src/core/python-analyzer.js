import { spawn } from 'node:child_process';

const PYTHON_SCRIPT = String.raw`
import ast, json, sys

source = sys.stdin.read()
filename = sys.argv[1] if len(sys.argv) > 1 else '<unknown>'

result = {"syntaxError": None, "findings": [], "imports": []}

def add(rule_id, title, severity, confidence, node, message, suggestion):
    result["findings"].append({
        "ruleId": rule_id,
        "title": title,
        "severity": severity,
        "confidence": confidence,
        "category": "security" if rule_id in {"BH069", "BH070", "BH071", "BH072", "BH073", "BH074", "BH075", "BH077", "BH078", "BH079"} else "correctness",
        "line": getattr(node, "lineno", 1),
        "column": getattr(node, "col_offset", 0),
        "endLine": getattr(node, "end_lineno", getattr(node, "lineno", 1)),
        "endColumn": getattr(node, "end_col_offset", getattr(node, "col_offset", 0) + 1),
        "message": message,
        "suggestion": suggestion,
    })

try:
    tree = ast.parse(source, filename=filename, mode="exec", type_comments=True)
except SyntaxError as e:
    result["syntaxError"] = {
        "message": e.msg,
        "line": e.lineno or 1,
        "column": max(0, (e.offset or 1) - 1),
        "endLine": e.lineno or 1,
        "endColumn": e.offset or 1,
    }
    print(json.dumps(result))
    raise SystemExit(0)

stdlib = set(getattr(sys, "stdlib_module_names", set()))
for node in ast.walk(tree):
    if isinstance(node, ast.Import):
        for alias in node.names:
            name = alias.name.split('.')[0]
            result["imports"].append({"name": name, "stdlib": name in stdlib})
    elif isinstance(node, ast.ImportFrom):
        if node.module:
            name = node.module.split('.')[0]
            result["imports"].append({"name": name, "stdlib": name in stdlib})

    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        defaults = list(node.args.defaults) + [x for x in node.args.kw_defaults if x is not None]
        for default in defaults:
            if isinstance(default, (ast.List, ast.Dict, ast.Set)):
                add("BH066", "Mutable default argument", "warning", "high", node,
                    "Função usa lista/dicionário/conjunto mutável como argumento padrão; o objeto é compartilhado entre chamadas.",
                    "Use None (ou outro sentinel imutável) e crie o objeto dentro da função.")
                break

    if isinstance(node, ast.ExceptHandler):
        if node.type is None:
            add("BH067", "Bare except", "warning", "high", node,
                "except sem tipo captura qualquer exceção, inclusive interrupções e erros inesperados.",
                "Capture exceções específicas ou use except Exception quando isso for realmente intencional.")
        elif isinstance(node.type, ast.Name) and node.type.id == "Exception":
            body = node.body or []
            if body and all(isinstance(stmt, ast.Pass) for stmt in body):
                add("BH068", "Swallowed exception", "warning", "high", node,
                    "except Exception apenas ignora o erro e não produz diagnóstico.",
                    "Registre o erro, trate a condição ou relance a exceção quando apropriado.")

    if isinstance(node, ast.Call):
        fn = node.func
        if isinstance(fn, ast.Name) and fn.id in {"eval", "exec", "compile"}:
            add("BH069", "Dynamic code execution", "error", "high", node,
                f"{fn.id}() executa ou compila código dinamicamente.",
                "Evite código dinâmico derivado de entrada e prefira estruturas/dispatch explícitos.")
        if isinstance(fn, ast.Attribute):
            owner = fn.value.id if isinstance(fn.value, ast.Name) else None
            if owner == "os" and fn.attr == "system":
                add("BH070", "os.system shell command", "error", "high", node,
                    "os.system() executa um comando por shell e pode introduzir injeção quando houver entrada externa.",
                    "Prefira subprocess com argumentos separados e validação de entrada.")
            if owner == "tempfile" and fn.attr == "mktemp":
                add("BH071", "Insecure temporary file", "warning", "high", node,
                    "tempfile.mktemp() cria um nome temporário sem reservar o arquivo, permitindo race conditions.",
                    "Use NamedTemporaryFile ou TemporaryDirectory e mantenha o handle aberto.")
            if owner == "pickle" and fn.attr in {"load", "loads"}:
                add("BH072", "Unsafe pickle deserialization", "error", "high", node,
                    "pickle.load/loads pode executar código durante a desserialização de dados não confiáveis.",
                    "Não desserialize pickle de origem não confiável; prefira formatos de dados sem execução.")
            if owner in {"yaml", "ruamel"} and fn.attr == "load":
                has_loader = any(isinstance(k, ast.keyword) and k.arg == "Loader" for k in node.keywords)
                if not has_loader:
                    add("BH073", "Unsafe YAML load", "error", "medium", node,
                        "yaml.load() sem Loader explícito merece revisão porque pode aceitar construções perigosas.",
                        "Use um loader seguro e restritivo, como SafeLoader, conforme a biblioteca.")
            if owner in {"subprocess"} and fn.attr in {"run", "Popen", "call", "check_call", "check_output"}:
                for kw in node.keywords:
                    if kw.arg == "shell" and isinstance(kw.value, ast.Constant) and kw.value.value is True:
                        add("BH074", "subprocess shell=True", "error", "high", node,
                            "subprocess usa shell=True; uma string influenciada por entrada pode virar comando arbitrário.",
                            "Passe argumentos em lista com shell=False e valide os valores permitidos.")
                        break
            if owner in {"requests", "httpx", "urllib3"} and fn.attr in {"get", "post", "put", "patch", "delete", "request"}:
                for kw in node.keywords:
                    if kw.arg == "verify" and isinstance(kw.value, ast.Constant) and kw.value.value is False:
                        add("BH075", "TLS verification disabled", "error", "high", node,
                            "A chamada HTTP desabilita a verificação TLS do certificado.",
                            "Mantenha a verificação TLS ativa e corrija a cadeia de certificados quando necessário.")
                        break

    if isinstance(node, ast.Assert):
        add("BH076", "Assert used for runtime validation", "info", "medium", node,
            "assert pode ser removido quando Python é executado com otimizações e não deve ser a única validação de entrada.",
            "Use uma condição explícita que continue existindo no runtime para validações importantes.")

    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
        owner = node.func.value.id if isinstance(node.func.value, ast.Name) else None
        if owner == "hashlib" and node.func.attr in {"md5", "sha1"}:
            add("BH077", "Weak Python hash", "warning", "high", node,
                f"hashlib.{node.func.attr}() usa um algoritmo inadequado para integridade criptográfica moderna e praticamente sempre inadequado para segredos.",
                "Use SHA-256/384/512 ou uma função de derivação de chave adequada ao objetivo.")
        if owner == "random" and node.func.attr in {"choice", "randint", "randrange", "getrandbits"}:
            text = " ".join([getattr(x, "id", "") for x in ast.walk(node) if isinstance(x, ast.Name)])
            if any(word in text.lower() for word in {"token", "secret", "password", "passwd", "key", "nonce", "session"}):
                add("BH078", "Non-cryptographic randomness for secret", "error", "high", node,
                    "random.* não fornece aleatoriedade criptográfica para tokens, chaves ou segredos.",
                    "Use secrets.token_* ou os.urandom para material de segurança.")
        if owner == "ssl" and node.func.attr in {"_create_unverified_context", "create_default_context"}:
            if node.func.attr == "_create_unverified_context":
                add("BH079", "Unverified TLS context", "error", "high", node,
                    "ssl._create_unverified_context() desativa validações TLS importantes.",
                    "Use ssl.create_default_context() e valide certificados normalmente.")

print(json.dumps(result))
`;

const commandCache = new Map();

function tryCommand(command, args, input, filename, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (value) => { if (settled) return; settled = true; resolve(value); };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({ ok: false, reason: `Python analyzer timed out after ${timeoutMs}ms` });
    }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      clearTimeout(timer);
      finish({ ok: false, unavailable: error.code === 'ENOENT', reason: error.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        finish({ ok: false, reason: stderr.trim() || `Python exited with code ${code}` });
        return;
      }
      try { finish({ ok: true, data: JSON.parse(stdout) }); }
      catch (error) { finish({ ok: false, reason: `Invalid Python analyzer output: ${error.message}` }); }
    });
    child.stdin.end(input);
  });
}

export async function analyzePythonSource(code, filename = '<unknown.py>', options = {}) {
  const timeoutMs = Number.isFinite(Number(options.pythonTimeoutMs)) ? Math.max(500, Number(options.pythonTimeoutMs)) : 5000;
  const preferred = String(options.pythonCommand ?? '').trim();
  const commands = preferred ? [preferred] : ['python3', 'python'];
  for (const command of commands) {
    const cached = commandCache.get(command);
    if (cached === false) continue;
    const result = await tryCommand(command, ['-c', PYTHON_SCRIPT, filename], code, filename, timeoutMs);
    if (result.ok) { commandCache.set(command, true); return { ...result.data, command }; }
    if (result.unavailable) { commandCache.set(command, false); continue; }
    return { unavailable: false, error: result.reason, command };
  }
  return { unavailable: true, error: 'Nenhum interpretador Python (python3/python) foi encontrado no PATH.' };
}
