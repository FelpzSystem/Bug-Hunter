# Changelog

**Credits: Shark**

## 0.3.1

### Correções e organização

- Bin npm corrigido para `src/cli/index.js`, com entrada executável e versão da CLI lida diretamente do `package.json`.
- Código reorganizado em três áreas dentro de `src/`: `cli/`, `core/` e `rules/`.
- Projeto de demonstração movido para `examples/demo-project/`, deixando a raiz mais limpa.
- Tarballs locais passaram a ser gerados em `.release/`, pasta ignorada pelo Git.
- `prepublishOnly` agora executa a suíte de testes e `npm pack --dry-run` antes de uma publicação.


- `buildParentMap` agora desembrulha o nó `File` do Babel para o `Program` antes de mapear pais. Como o mapa saía vazio em ficheiros reais, todas as regras que dependem de `ctx.parents` — `BH020` (await em callback de `forEach` e em loops) e as verificações de loop de `JSON.parse`/spread — nunca disparavam na análise de projeto.
- Teste de regressão de integração para `BH020` em código real parseado (não apenas AST sintética).

## 0.3.0

### Manutenção e correções

- Correção da detecção de `BH020` em callbacks assíncronos de `forEach`, incluindo chamadas como `items.forEach(...)`.
- Correção do escopo lexical de funções e análise de referências em valores padrão de parâmetros.
- Fixtures de teste reorganizados em `test/fixtures` sem serem descobertos como testes pelo Node.
- Artefatos `.tgz` movidos para `.release/` e empacotamento centralizado em `npm run pack:release`.

- Whole-project recursive discovery by default.
- `node_modules` excluded by default.
- VCS metadata excluded by default.
- Binary files detected and skipped without parsing.
- Non-AST text files can be inspected for secret-like values and private-key material.
- New project text signals BH059 and BH060.
- New project-read metrics in terminal/JSON/Markdown/HTML reports.
- Configurable `maxFileBytes` and CLI `--max-file-bytes`.
- Author metadata/documentation credits set to Shark.
