# 🐛 Bug Hunter Static — Demo

**Autor / créditos: Shark**  
**Canal de release: `demo`**  
**Versão do pacote: `0.3.1-demo.1`**

Bug Hunter é um analisador estático para projetos **JavaScript e TypeScript**. Ele percorre o projeto inteiro, analisa código com AST, lê arquivos de texto para sinais que fazem sentido fora do código e gera relatórios com **regra, severidade, confiança, arquivo, linha, contexto, evidência e sugestão de correção**.

A edição atual é uma **build de demonstração**. O objetivo é mostrar um scanner amplo sem transformar todo aviso de manutenção em um falso alarme de segurança.

## O que esta versão faz diferente

A demo `0.3.1-demo.1` traz quatro mudanças importantes:

1. **Menos ruído no terminal.** O comando normal de `scan` mostra um resumo compacto e deixa o relatório completo em ` .bug-hunter/scan.log.txt`.
2. **BH024 ficou contextual.** `console.log`, `console.debug` e `console.info` não são tratados como problema em diretórios normalmente usados para ferramentas, scripts, testes e exemplos (`tools/`, `scripts/`, `test/`, `tests/`, `examples/`). A mesma regra continua disponível para código de aplicação.
3. **Configuração explícita de falsos positivos.** O projeto pode declarar diretórios onde `console` é intencional sem precisar desativar a regra inteira.
4. **Identidade de demo sem quebrar o npm.** O pacote usa a versão semver `0.3.1-demo.1` e o campo `releaseChannel: "demo"`. Usar literalmente `"demo"` no campo `version` quebraria o formato esperado por ecossistemas npm; por isso a identificação de demo fica no canal/prerelease.

## Instalação

### A partir do npm

```bash
npm install bug-hunter-static
```

### Direto do GitHub

```bash
npm install git+https://github.com/FelpzSystem/Bug-Hunter.git
```

### Rodando o repositório local

```bash
npm install
npm test
npm run demo
```

## Primeiro teste

Entre na pasta do projeto que deseja analisar e rode:

```bash
npx bug-hunter scan .
```

A saída padrão é compacta para não inundar o terminal. O relatório detalhado fica em:

```text
.bug-hunter/scan.log.txt
```

Para ver tudo diretamente no terminal:

```bash
npx bug-hunter scan . --verbose
```

Para escolher outro arquivo de log:

```bash
npx bug-hunter scan . --log-file reports/bug-hunter.txt
```

Para não criar o arquivo de log naquela execução:

```bash
npx bug-hunter scan . --no-log-file
```

A pasta `.bug-hunter/` já é ignorada pela varredura padrão, evitando que o próprio log apareça em execuções futuras.

## Como interpretar a saída

O Bug Hunter separa **severidade** de **confidence**.

- `error`: sinal com potencial de bug ou risco que normalmente merece ação.
- `warning`: problema provável de correção, manutenção ou performance.
- `info`: sugestão ou sinal que depende bastante da intenção do projeto.
- `confidence`: quão forte é a evidência estática usada pela regra.

Um `info` não significa vulnerabilidade. Um `error` também não prova, sozinho, que existe uma exploração real: o scanner é heurístico e trabalha sem executar o projeto.

## Menos falsos positivos

### BH024 — console em código de aplicação

A regra foi feita para chamar atenção para logging direto em código de aplicação, mas `console.log()` é completamente legítimo em vários contextos: scripts de manutenção, verificadores, testes, exemplos e ferramentas locais.

Por isso estes caminhos são permitidos por padrão:

```text
tools/
scripts/
test/
tests/
examples/
```

Exemplo que **não gera BH024**:

```text
tools/verify-mpv.mjs
scripts/release.mjs
test/index.test.js
examples/demo-project/app.js
```

Exemplo em que **BH024 continua ativo**:

```text
src/bot.js
src/services/audio.js
src/commands/play.js
```

Você pode adicionar seus próprios caminhos:

```json
{
  "consoleAllowedPaths": [
    "tools",
    "scripts",
    "test",
    "tests",
    "examples",
    "dev"
  ]
}
```

Ou pela CLI:

```bash
npx bug-hunter scan . --console-allow tools,scripts,test,tests,examples,dev
```

Ainda existe a supressão por linha para um caso realmente específico:

```js
// bug-hunter-ignore-next-line BH024
console.log('saída proposital');
```

A recomendação é preferir a configuração por caminho quando o padrão se repete em vários arquivos.

## Varredura do projeto inteiro

O comando padrão é recursivo:

```bash
npx bug-hunter scan .
```

Diretório ou arquivo específico:

```bash
npx bug-hunter scan ./meu-projeto
npx bug-hunter scan ./src/bot.js
```

Exclusões adicionais:

```bash
npx bug-hunter scan . --ignore fixtures,coverage,dist
```

Diretórios ignorados por padrão:

```text
node_modules/
.git/
.hg/
.svn/
.bug-hunter/
```

O scanner não tenta analisar binários como código. Arquivos grandes demais também podem ser pulados conforme `maxFileBytes`.

## Arquivos analisados

### Código com AST

Por padrão:

```text
.js  .jsx  .mjs  .cjs  .ts  .tsx  .mts  .cts
```

Esses arquivos passam pelo parser Babel e pelas regras AST.

### Arquivos de texto

Outros textos podem participar de sinais de projeto, especialmente candidatos a segredo e material de chave privada. O valor de um possível segredo é mascarado no relatório.

### Binários

Imagens, áudio, vídeo, fontes, arquivos compactados, executáveis e outros formatos binários são contabilizados como pulados, sem tentativa de interpretar o conteúdo como JavaScript.

## Regras

A CLI lista todas as regras instaladas:

```bash
npx bug-hunter rules
```

Para entender uma regra específica:

```bash
npx bug-hunter explain BH024
```

Cada regra possui:

```text
ID → identificação estável
severity → impacto sugerido
category → correctness/security/maintainability/performance/project
confidence → força heurística do sinal
description → o que a regra procura
suggestion → próximo passo sugerido
```

O objetivo do catálogo não é acusar qualquer estilo que o autor não goste. Regras novas devem ter uma condição verificável e uma explicação clara.

## Relatórios

### Terminal compacto

```bash
npx bug-hunter scan .
```

### Terminal completo

```bash
npx bug-hunter scan . --verbose
```

### JSON

```bash
npx bug-hunter scan . --format json > report.json
```

### SARIF

```bash
npx bug-hunter scan . --format sarif > report.sarif.json
```

### Markdown

```bash
npx bug-hunter scan . --format markdown > report.md
```

### HTML

```bash
npx bug-hunter scan . --format html > report.html
```

O arquivo `.bug-hunter/scan.log.txt` é um relatório textual legível por humanos, independentemente do formato de saída solicitado para a CLI.

## Configuração completa

Crie uma configuração padrão:

```bash
npx bug-hunter init
```

Exemplo recomendado para um bot Node/Termux:

```json
{
  "minSeverity": "warning",
  "maxComplexity": 12,
  "maxFunctionLines": 60,
  "maxFileLines": 500,
  "maxConsoleCalls": 12,
  "contextLines": 2,
  "maxFileBytes": 10485760,
  "ignore": [
    "node_modules",
    ".git",
    ".hg",
    ".svn",
    ".bug-hunter"
  ],
  "consoleAllowedPaths": [
    "tools",
    "scripts",
    "test",
    "tests",
    "examples"
  ],
  "disableRules": [],
  "baseline": ".bug-hunter-baseline.json",
  "baselineMode": "ignore"
}
```

### `minSeverity`

Controla o que aparece nos resultados da CLI. A CLI começa em `warning` para reduzir ruído. A biblioteca ainda pode ser chamada diretamente com outra configuração.

```text
info     → mostra info, warning e error
warning  → mostra warning e error
error    → mostra apenas error
```

### `contextLines`

Número de linhas exibidas ao redor de cada achado no relatório detalhado.

### `maxConsoleCalls`

Quantidade de chamadas `console.*` por arquivo antes de a regra de projeto de "console flood" ser considerada. Isso é independente do BH024.

### `disableRules`

Desliga regras específicas quando existe uma decisão consciente do projeto:

```json
{
  "disableRules": ["BH024"]
}
```

Use isso apenas quando a regra inteira não for útil. Para exceções locais, prefira `consoleAllowedPaths` ou um comentário de supressão.

## Baseline

Para aceitar o estado atual como referência:

```bash
npx bug-hunter scan . --write-baseline
```

Em execuções normais, os achados já presentes no baseline podem ficar ocultos:

```bash
npx bug-hunter scan .
```

Para mostrar tudo novamente:

```bash
npx bug-hunter scan . --no-baseline
```

O baseline guarda IDs estáveis de achados; ele não apaga o problema do código.

## CI / uso automatizado

Para falhar a execução quando houver `error` ou erro de parsing:

```bash
npx bug-hunter scan . --ci
```

Para automação, prefira JSON ou SARIF:

```bash
npx bug-hunter scan . --format sarif --ci > report.sarif.json
```

## Demo incluída

A pasta `examples/demo-project/` contém um projeto artificial com problemas distribuídos entre arquivos diferentes.

```bash
npm run demo
```

Relatório HTML:

```bash
npm run demo:report
```

Relatório JSON:

```bash
npm run demo:json
```

A demo é deliberadamente problemática para provar que as regras funcionam. Ela não deve ser usada como referência de código saudável.

## Biblioteca JavaScript

```js
import { scanProject } from 'bug-hunter-static';

const result = await scanProject('./meu-projeto', {
  minSeverity: 'warning',
  consoleAllowedPaths: ['tools', 'scripts', 'test', 'examples']
});

console.log(result.summary);

for (const finding of result.findings) {
  console.log(finding.file, finding.line, finding.ruleId, finding.message);
}
```

O retorno também inclui `project`, `fileData`, `parseErrors`, `skipped`, `config` e a lista completa de `findings`.

## Testes de desenvolvimento

```bash
npm test
```

O projeto usa o runner de testes nativo do Node. O catálogo tem testes de unicidade/documentação das regras, helpers, análise de escopo, regras específicas, reporters e integração da demo quando as dependências estão disponíveis.

## Estrutura

```text
src/
  cli/
    index.js              entrada do comando bug-hunter
  core/
    parser.js             parser JS/TS
    reporter.js           pretty/compact/JSON/SARIF/Markdown/HTML
    scanner.js            discovery, leitura, regras e projeto
    utils.js              helpers compartilhados
  rules/
    helpers.js            escopo e helpers de regras
    index.js              catálogo das regras

test/
  index.test.js
  fixtures/

examples/
  demo-project/
  bug-hunter.config.json

docs/
  architecture.md
  publishing.md
  rules-and-false-positives.md
```

## Limites importantes

Bug Hunter é **análise estática heurística**. Ele não executa o projeto, não conhece todos os estados possíveis em runtime e não pode provar ausência de bugs.

Em especial:

- uma detecção pode exigir revisão humana;
- lógica de negócio pode escapar do scanner;
- dependências com comportamento dinâmico podem exigir ferramentas adicionais;
- uma URL HTTP, `eval` ou segredo candidato é um sinal concreto para revisão, não uma prova automática de exploração;
- um `warning` ou `info` deve ser interpretado dentro do contexto do projeto.

Nenhuma ferramenta estática substitui testes, revisão de código e controles de segurança apropriados.

## Créditos

Projeto criado e mantido por **Shark**.

As ideias de arquitetura e categorias são inspiradas em abordagens públicas de ferramentas como ESLint, Semgrep, SonarJS, CodeQL e Knip. O código deste projeto é independente e não copia implementações desses projetos.
