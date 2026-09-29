# Arquitetura do Bug Hunter

**Autor / créditos: Shark**  
**Release atual: `0.3.1-demo.1` (`demo`)**

## Visão geral

O pipeline principal é:

```text
CLI
  ↓
config
  ↓
discovery recursivo
  ↓
classificação de arquivo
  ├─ binário → pula
  ├─ texto   → sinais textuais
  └─ JS/TS   → parser AST
                 ↓
               regras
                 ↓
          análise de projeto
                 ↓
             baseline
                 ↓
              resumo
                 ↓
  compact terminal / pretty / JSON / SARIF / Markdown / HTML
```

## Discovery

O scanner caminha recursivamente pelo diretório solicitado.

Por padrão ficam fora da análise:

```text
node_modules/
.git/
.hg/
.svn/
.bug-hunter/
```

A pasta `.bug-hunter/` é reservada para artefatos gerados pelo próprio scanner, principalmente o log textual. Isso evita que o scanner analise seus próprios logs em execuções futuras.

## Classificação

Cada arquivo é classificado antes de ser analisado. Extensões suportadas por AST:

```text
.js .jsx .mjs .cjs .ts .tsx .mts .cts
```

Arquivos de texto que não pertencem às extensões de código ainda podem contribuir com sinais de projeto, como candidatos a segredo e material de chave privada. Binários conhecidos e arquivos que excedem `maxFileBytes` são pulados.

## Contexto de regra

Regras de arquivo recebem:

- AST;
- código-fonte;
- caminho relativo;
- raiz do projeto;
- mapa de pais;
- opções de configuração;
- conjunto de globais conhecidas;
- helper `report()`.

Esse contexto permite que uma regra use mais do que um padrão textual isolado.

## Regras com contexto de caminho

A BH024 é um exemplo importante. `console.log()` em `src/bot.js` significa algo diferente de `console.log()` em `tools/verify-mpv.mjs`.

Em vez de desligar a regra globalmente, o scanner fornece `consoleAllowedPaths`. O catálogo padrão trata `tools`, `scripts`, `test`, `tests` e `examples` como caminhos onde console é normalmente intencional.

## Discovery ≠ parsing

"Varredura do projeto inteiro" não significa "interpretar qualquer arquivo como JavaScript".

O scanner:

1. encontra os arquivos;
2. decide quais são binários, texto ou código suportado;
3. analisa AST somente onde há parser apropriado;
4. usa sinais textuais específicos nos demais arquivos.

Isso reduz interpretações absurdas de formatos que não são linguagem de programação.

## Findings

Um achado contém, entre outros campos:

```text
id
ruleId
title
category
severity
confidence
message
file
line
column
endLine
endColumn
snippet
codeFrame
suggestion
evidence
```

O `id` é derivado de dados estáveis para permitir baseline.

## Filtro e baseline

A ordem lógica é:

```text
achados brutos
  ↓
deduplicação
  ↓
minSeverity
  ↓
baseline
  ↓
resultado visível
```

Assim o mesmo catálogo pode ser usado de forma rigorosa em CI e de forma mais tranquila no desenvolvimento local.

## Reporter e logs

A saída `pretty` continua disponível e contém contexto completo. A CLI, porém, usa **modo compacto por padrão** para reduzir ruído. O relatório detalhado é salvo como texto em:

```text
.bug-hunter/scan.log.txt
```

`--verbose` força o relatório detalhado no terminal. `--log-file <arquivo>` troca o destino do log e `--no-log-file` desativa o arquivo.

## Limites

O projeto é heurístico. Ele não executa o código nem garante cobertura total de dataflow, runtime ou lógica de negócio.
