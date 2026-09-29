# Bug Hunter Static

Analisador estático para JavaScript, TypeScript, CommonJS, ESM e Python, com regras de correção, segurança, performance, projeto e revisão assistida por IA.

## Instalação

```bash
npm install bug-hunter-static
```

## Uso

```bash
npx bug-hunter scan .
```

Relatório detalhado:

```bash
npx bug-hunter scan . --verbose
```

Com IA:

```bash
npx bug-hunter scan . --ai
```

A IA pode revisar os achados, priorizar problemas e sugerir correções. O cliente usa a API Chat Completions compatível do Bazaarlink e o modelo `qwen/qwen3.7-flash:free` por padrão.

## Suporte

JavaScript/TypeScript: `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, `.cts`.

Python: `.py`, `.pyw`, `.pyi`, analisado com o AST do interpretador Python sem executar o projeto.

O contexto ESM/CommonJS é inferido pela extensão e pelos `package.json` encontrados no caminho analisado. Isso permite detectar mistura de `require`, `module.exports`, `import`, `export`, `import.meta` e `top-level await` em contextos incompatíveis.

## Cobertura de bugs

Além das regras existentes, esta versão reforça casos como declarações duplicadas, `return/throw` em `finally`, `new Promise(async ...)`, callbacks `async` em timers, comparadores incorretos de `sort`, `reduce(async ...)`, Promises potencialmente esquecidas, `require()` dinâmico, atribuições dinâmicas em objetos, APIs síncronas do filesystem e `process.exit()` em módulos reutilizáveis.

Em Python, também há verificações para sintaxe, defaults mutáveis, exceções engolidas, execução dinâmica, shell commands, desserialização insegura, TLS desabilitado, hashes fracos e uso de `random` para material secreto.

## IA e credencial embutida

A build inclui a credencial de IA como ciphertext AES-256-GCM com material fragmentado/obfuscado. Isso remove a chave em texto puro dos arquivos publicados e dificulta extração casual por busca textual.

Isso **não** transforma uma chave distribuída em um segredo criptográfico absoluto: quem recebe o pacote pode fazer engenharia reversa e recuperar a credencial em runtime. Para uma credencial realmente privada, use uma API intermediária sua ou uma variável de ambiente.

Também existem caminhos externos suportados por `BUG_HUNTER_AI_KEY` e por credencial local criptografada.

## Biblioteca

```js
import { scanProject, analyzeScanWithAI } from 'bug-hunter-static';

const result = await scanProject('.');
const ai = await analyzeScanWithAI(result, { includeCode: true });
console.log(ai.summary);
```

## Estrutura

A publicação mantém a raiz mínima: `package.json`, `README.md`, `LICENSE` e `src/`. Testes, exemplos e materiais de desenvolvimento não entram no pacote publicado.
