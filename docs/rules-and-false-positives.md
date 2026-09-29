# Regras e controle de falsos positivos

## Como o Bug Hunter decide mostrar um achado

Cada finding passa por quatro etapas:

1. Uma regra encontra um padrão no AST, no texto ou nos dados agregados do projeto.
2. A regra fornece severidade, categoria, confiança e explicação.
3. O scanner aplica supressões de linha, regras desabilitadas, `minSeverity` e baseline.
4. O reporter transforma o resultado em terminal, JSON, SARIF, Markdown ou HTML.

Isso é importante porque **detectar um padrão não é o mesmo que provar um defeito**.

## BH024 — Console in application code

### Problema antigo

A versão anterior procurava qualquer `console.log`, `console.debug` ou `console.info` e relatava BH024 mesmo dentro de scripts como:

```text
tools/verify-mpv.mjs
tools/verify-mute.mjs
tools/verify-youtube-engine.mjs
tools/verify-ytdl-runtime.mjs
```

Esse comportamento misturava saída intencional de ferramenta com logging de aplicação e gerava muito ruído.

### Comportamento da demo

A regra continua procurando `console.*` no código de aplicação, mas ignora por padrão os seguintes prefixos de caminho:

```text
tools/
scripts/
test/
tests/
examples/
```

O comportamento pode ser ampliado pela configuração:

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

### Quando desabilitar BH024 inteiro

Caso o projeto adote `console` de forma deliberada em toda a aplicação:

```json
{
  "disableRules": ["BH024"]
}
```

Isso é mais agressivo. Quando apenas alguns diretórios usam `console` intencionalmente, `consoleAllowedPaths` preserva a utilidade da regra no restante do código.

## Supressão pontual

Para uma linha específica:

```js
// bug-hunter-ignore-next-line BH024
console.log('saída proposital');
```

Para uma regra diferente, troque o ID. `all` pode ser usado em uma exceção excepcional:

```js
// bug-hunter-ignore-next-line all
```

## Princípio para novas regras

Uma nova regra deve evitar heurísticas que dependam apenas de "parece estranho". Sempre que possível, use:

- contexto do nó AST;
- tipo da expressão;
- escopo lexical;
- caminho do arquivo;
- configuração explícita;
- evidência concreta do padrão encontrado.

Regras que geram muito ruído devem ser refinadas ou ter severidade/confiança adequadas, em vez de simplesmente despejar dezenas de mensagens na saída.
