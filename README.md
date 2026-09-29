# 🐛 Bug Hunter Static

**Autor / créditos: Shark**

Bug Hunter é um analisador estático para projetos JavaScript/TypeScript que faz uma varredura recursiva do projeto inteiro, lê os arquivos de texto que consegue interpretar e ignora `node_modules` por padrão. Arquivos binários não são tratados como código; eles são contabilizados como pulados.

> O objetivo é encontrar o máximo possível de sinais úteis antes da execução: bugs prováveis, padrões inseguros, problemas de manutenção, problemas de dependências e sinais em arquivos de configuração/documentação.

## ✨ O que mudou na 0.3.0

- Varredura recursiva do projeto inteiro por padrão.
- `node_modules` fica sempre fora da varredura padrão.
- Metadados de repositório `.git`, `.hg` e `.svn` também ficam fora por segurança/performance.
- Arquivos de código são analisados via AST.
- Outros arquivos de texto são lidos para sinais de segredos e dívida TODO/FIXME.
- Binários são detectados sem tentar tratá-los como código.
- Limite configurável de tamanho evita travar em artefatos gigantes.
- O relatório mostra quantos arquivos foram encontrados, lidos, classificados como source/text e pulados.
- Créditos oficiais: **Shark**.

## Instalação

### Usando como pacote

```bash
npm install bug-hunter-static

# GitHub Packages
# O pacote também pode ser distribuído pelo GitHub como:
# @felpzsystem/bug-hunter-static

npx bug-hunter scan .
```

### Rodando o repositório localmente

```bash
npm install
npm test
npm run demo
```

## 🚀 Demo

A demo incluída simula um projeto real com backend, frontend, utilitários, configuração e vários problemas espalhados em arquivos diferentes.

```bash
npm run demo
```

Ela mostra:

- leitura/varredura do projeto;
- quantidade de arquivos e linhas;
- hotspots;
- severidade e categoria;
- regra que detectou o problema;
- explicação do que foi encontrado;
- linha/coluna;
- trecho real do arquivo;
- sugestão de correção;
- evidência quando disponível;
- health score didático.

Relatório HTML:

```bash
npm run demo:report
```

Relatório JSON:

```bash
npm run demo:json
```

## 🔍 Escaneando um projeto inteiro

O comando padrão já recursa por todas as subpastas:

```bash
npx bug-hunter scan .
```

Ou:

```bash
npx bug-hunter scan ./meu-projeto
```

Você pode limitar o tamanho máximo de cada arquivo:

```bash
npx bug-hunter scan . --max-file-bytes 10485760
```

E excluir pastas/nomes específicos:

```bash
npx bug-hunter scan . --ignore node_modules,.git,.venv,fixtures
```

Importante: `node_modules` é sempre ignorado. A análise de código continua focada em JS/TS/JSX/TSX, enquanto arquivos de texto não suportados pelo parser são lidos para sinais de projeto, como candidatos a segredo e TODO/FIXME.

## 📊 Formatos

```bash
npx bug-hunter scan . --format pretty
npx bug-hunter scan . --format json > report.json
npx bug-hunter scan . --format sarif > report.sarif.json
npx bug-hunter scan . --format markdown > report.md
npx bug-hunter scan . --format html > report.html
```

## 🧠 Explicando uma regra

```bash
npx bug-hunter explain BH018
```

## 📚 Listando regras

```bash
npx bug-hunter rules
```

## 🧱 Baseline

Aceite o estado atual:

```bash
npx bug-hunter scan . --write-baseline
```

Depois:

```bash
npx bug-hunter scan .
```

Para voltar a mostrar tudo:

```bash
npx bug-hunter scan . --no-baseline
```

## 🛠️ Configuração

Crie uma configuração:

```bash
npx bug-hunter init
```

Exemplo:

```json
{
  "minSeverity": "warning",
  "maxComplexity": 12,
  "maxFunctionLines": 60,
  "maxFileLines": 500,
  "maxConsoleCalls": 8,
  "contextLines": 2,
  "maxFileBytes": 10485760,
  "ignore": ["node_modules", ".git", ".hg", ".svn"],
  "disableRules": [],
  "baseline": ".bug-hunter-baseline.json",
  "baselineMode": "ignore"
}
```

### O que entra na varredura

O scanner atravessa o diretório recursivamente. `node_modules` é sempre ignorado; `.git`, `.hg` e `.svn` também ficam fora por serem metadados do controle de versão. Arquivos binários são classificados e pulados sem tentativa de parsing. Arquivos de texto como `.env.example`, `.md`, `.json`, `.yaml` e arquivos sem extensão podem ser lidos para sinais compatíveis.

## 🧩 Biblioteca

```js
import { scanProject } from 'bug-hunter-static';

const result = await scanProject('./meu-projeto');

console.log(result.project);
console.log(result.summary);

for (const finding of result.findings) {
  console.log(finding.file, finding.line, finding.ruleId, finding.message);
}
```

## 🧪 Testes

```bash
npm test
```

A suíte inclui testes de catálogo, utilitários, reporters e integração da demo quando as dependências estão instaladas. O comando de teste executa apenas arquivos `*.test.js`, deixando fixtures de código dentro de `test/fixtures` sem que o Node os trate como testes.

## 🧾 Créditos

Projeto criado e mantido por **Shark**.

O design de análise usa referências públicas de ferramentas como ESLint, Semgrep, SonarJS, CodeQL e Knip para ideias de arquitetura e tipos de sinais. O código deste projeto foi escrito de forma independente e não copia implementações desses repositórios.

## ⚠️ Limites

“Ler todo o projeto” não significa interpretar todo formato de arquivo como linguagem. O Bug Hunter percorre o projeto, lê arquivos de texto e analisa profundamente as linguagens suportadas. Imagens, PDFs, executáveis e outros binários são contabilizados e ignorados para evitar corrupção de interpretação. Nenhuma análise estática consegue provar a ausência de todos os bugs, especialmente lógica de negócio e comportamentos dependentes de runtime.

## 📁 Estrutura do projeto

A raiz fica reservada para configuração e documentação. O código fica dividido em três áreas dentro de `src/`: `cli/` para a interface de linha de comando, `core/` para scanner/parser/utilitários/reporters e `rules/` para as regras de análise. Dados de teste ficam em `test/` e a demo em `examples/`.

```text
src/
  cli/
    index.js              entrada do comando `bug-hunter`
  core/
    parser.js             parsing JS/TS
    reporter.js           saída pretty/JSON/SARIF/Markdown/HTML
    scanner.js            descoberta e análise de projeto
    utils.js              utilitários compartilhados
  rules/
    helpers.js            helpers para regras
    index.js              catálogo das regras
test/
  fixtures/               arquivos de teste
examples/
  demo-project/            projeto demonstrativo
  bug-hunter.config.json   configuração de exemplo
docs/                      documentação técnica/publicação
.release/                  tarballs locais (gerados e ignorados pelo Git)
```

Para gerar o tarball sem poluir a raiz:

```bash
npm run pack:release
```

Para validar e publicar com 2FA interativo:

```bash
npm run release
```
