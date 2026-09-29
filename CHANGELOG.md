# Changelog

**Credits: Shark**

## 0.3.1-demo.1 — Demo

### Ruído e contexto

- `BH024` agora ignora por padrão `tools/`, `scripts/`, `test/`, `tests/` e `examples/`, onde `console.log/debug/info` costuma ser saída intencional de ferramentas, verificadores, testes e exemplos.
- Adicionada a configuração `consoleAllowedPaths` para incluir outros diretórios sem desativar a regra inteira.
- A CLI passa a usar `warning` como severidade mínima padrão, reduzindo avisos de baixo impacto no terminal.
- O limite padrão de `BH057 Console flood` passa de 8 para 12 chamadas por arquivo.

### Terminal e logs

- O `scan` passa a usar resumo compacto por padrão.
- `--verbose` mostra o relatório completo no terminal.
- `--log-file <arquivo>` permite escolher o destino do relatório textual.
- Por padrão o relatório detalhado é salvo em `.bug-hunter/scan.log.txt`.
- `.bug-hunter/` foi adicionado às exclusões padrão e ao `.gitignore`.
- O reporter ganhou `formatCompact()` e a biblioteca passa a exportá-lo.

### Demo e documentação

- Versão do pacote ajustada para `0.3.1-demo.1` com `releaseChannel: "demo"`.
- README ampliado com explicações de severidade, confidence, falsos positivos, logs, baseline, configuração, CI e limites.
- Nova documentação `docs/rules-and-false-positives.md`.
- Arquitetura e publicação atualizadas para o fluxo de demo e GitHub/GitHub Packages.

## 0.3.1

### Correções e organização

- Bin npm corrigido para `src/cli/index.js`, com entrada executável e versão da CLI lida diretamente do `package.json`.
- Código reorganizado em três áreas dentro de `src/`: `cli/`, `core/` e `rules/`.
- Projeto de demonstração movido para `examples/demo-project/`, deixando a raiz mais limpa.
- Tarballs locais passaram a ser gerados em `.release/`, pasta ignorada pelo Git.
- `prepublishOnly` agora executa a suíte de testes e `npm pack --dry-run` antes de uma publicação.
- `buildParentMap` agora desembrulha o nó `File` do Babel para o `Program` antes de mapear pais.
- Teste de regressão de integração para `BH020` em código real parseado.

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
