# Bug Hunter Static

Analisador estático para **JavaScript, TypeScript, CommonJS, ESM e Python**, focado em encontrar problemas de correção, segurança, performance, compatibilidade e qualidade de projeto antes que eles cheguem à execução ou produção.

A ferramenta combina análise estática com contexto de módulo e, opcionalmente, uma camada de revisão assistida por IA.

> **Importante:** o Bug Hunter Static analisa código; ele não deve ser tratado como substituto de testes, revisão humana, SAST especializado ou ferramentas de segurança dedicadas.

## Índice

- [Instalação](#instalação)
- [Uso rápido](#uso-rápido)
- [Comandos](#comandos)
- [Formatos suportados](#formatos-suportados)
- [JavaScript e TypeScript](#javascript-e-typescript)
- [ESM e CommonJS](#esm-e-commonjs)
- [Python](#python)
- [O que o detector procura](#o-que-o-detector-procura)
- [Revisão com IA](#revisão-com-ia)
- [Uso como biblioteca](#uso-como-biblioteca)
- [Privacidade e credenciais](#privacidade-e-credenciais)
- [Estrutura publicada](#estrutura-publicada)
- [Boas práticas](#boas-práticas)
- [Limitações](#limitações)
- [Troubleshooting](#troubleshooting)
- [Segurança](#segurança)
- [Licença](#licença)

## Instalação

Como dependência do projeto:

```bash
npm install bug-hunter-static
```

Ou diretamente com `npx`:

```bash
npx bug-hunter scan .
```

Para usar uma versão específica:

```bash
npx bug-hunter@<versão> scan .
```

## Uso rápido

Analise o diretório atual:

```bash
npx bug-hunter scan .
```

Analise outro projeto:

```bash
npx bug-hunter scan ./meu-projeto
```

Gere um relatório mais detalhado:

```bash
npx bug-hunter scan . --verbose
```

Faça também a revisão assistida por IA:

```bash
npx bug-hunter scan . --ai
```

Quando disponível na sua build, o contexto de código pode ser incluído de forma controlada:

```bash
npx bug-hunter scan . --ai --ai-code
```

## Comandos

### `scan`

Executa a análise estática de um projeto ou diretório.

```bash
npx bug-hunter scan <caminho>
```

Exemplo:

```bash
npx bug-hunter scan .
```

### `scan --verbose`

Mostra um relatório mais detalhado dos resultados:

```bash
npx bug-hunter scan . --verbose
```

É útil para investigação local e para entender por que determinado arquivo ou regra foi sinalizado.

### `scan --ai`

Depois da análise estática, envia os achados para a camada de revisão assistida por IA.

```bash
npx bug-hunter scan . --ai
```

A IA pode:

- resumir os problemas encontrados;
- agrupar problemas relacionados;
- ajudar a interpretar o impacto de um achado;
- sugerir possíveis correções;
- destacar pontos que merecem revisão manual.

## Formatos suportados

### JavaScript / TypeScript

O detector reconhece:

```text
.js
.jsx
.mjs
.cjs
.ts
.tsx
.mts
.cts
```

### Python

O detector reconhece:

```text
.py
.pyw
.pyi
```

Arquivos Python são analisados com a AST do interpretador Python, sem executar o projeto durante a análise.

## JavaScript e TypeScript

A análise considera situações comuns de:

- código inalcançável;
- declarações duplicadas;
- Promises potencialmente esquecidas;
- construções assíncronas problemáticas;
- callbacks `async` usados em APIs que não aguardam o retorno;
- `new Promise(async ...)`;
- `reduce(async ...)`;
- retorno ou lançamento de erro dentro de `finally`;
- comparadores incorretos em `sort`;
- `require()` dinâmico;
- atribuições dinâmicas em objetos;
- uso desnecessário de APIs síncronas do filesystem;
- `process.exit()` em módulos reutilizáveis;
- padrões de segurança e qualidade de código.

A análise é estática: o projeto não precisa ser executado para que essas verificações sejam realizadas.

## ESM e CommonJS

O modo de módulo é inferido a partir da extensão do arquivo e dos `package.json` encontrados no caminho analisado.

Isso permite que o detector trate diferenças entre:

```js
import x from "x";
export default x;
```

e:

```js
const x = require("x");
module.exports = x;
```

Também são considerados padrões como:

- `require()` em contexto ESM;
- `module.exports` em contexto ESM;
- `import` / `export` em contexto CommonJS;
- `import.meta` em contexto incompatível;
- `top-level await` em contexto incompatível;
- mistura acidental de padrões ESM/CJS;
- imports relativos e resolução de módulo em cenários incompatíveis.

Isso é especialmente útil em projetos que estão migrando de CommonJS para ESM ou que possuem subprojetos com diferentes configurações de módulo.

## Python

O analisador cobre `.py`, `.pyw` e `.pyi` e usa AST, sem executar o código analisado.

Entre os padrões verificados estão:

- erros de sintaxe;
- defaults mutáveis;
- exceções engolidas ou tratadas de forma excessivamente ampla;
- execução dinâmica;
- `eval` / `exec`;
- comandos de shell;
- desserialização insegura;
- TLS desabilitado;
- hashes fracos;
- uso de `random` para material que deveria ser secreto;
- outros padrões de segurança e qualidade definidos pelas regras do analisador.

O objetivo é identificar problemas em uma etapa estática sem precisar importar ou executar o projeto.

## O que o detector procura

A cobertura é dividida em quatro grandes áreas:

### Correção

Problemas que podem causar comportamento inesperado ou bugs reais, incluindo padrões assíncronos incorretos, fluxo de controle problemático e incompatibilidades de módulo.

### Segurança

Padrões que podem aumentar a superfície de ataque, introduzir execução arbitrária, enfraquecer criptografia, expor dados sensíveis ou criar configurações inseguras.

### Performance

Operações desnecessariamente custosas ou síncronas, principalmente quando podem bloquear o event loop ou degradar o comportamento de um serviço.

### Qualidade e arquitetura

Padrões que tendem a dificultar manutenção, reutilização ou migração entre ambientes e sistemas de módulos.

Os achados devem ser tratados como sinais para investigação. A presença de uma regra não significa, sozinha, que existe uma vulnerabilidade explorável no contexto real.

## Revisão com IA

A revisão por IA é opcional e acontece depois da análise estática.

A integração usa uma API compatível com o formato Chat Completions e tem como configuração padrão o modelo:

```text
qwen/qwen3.7-flash:free
```

A IA funciona como uma camada de interpretação dos achados do scanner. O detector estático continua sendo a fonte primária da identificação das regras.

Exemplo:

```bash
npx bug-hunter scan . --ai
```

Para permitir contexto adicional de código, quando suportado pela build:

```bash
npx bug-hunter scan . --ai --ai-code
```

### Sobre privacidade

Ao usar `--ai`, partes do resultado da análise podem ser enviadas ao provedor de IA configurado para gerar a revisão.

Evite executar a revisão por IA em repositórios que contenham dados que não deveriam deixar o ambiente sem antes avaliar a política de privacidade do projeto e do provedor.

Não coloque tokens, senhas, certificados privados ou outras credenciais dentro de exemplos, issues, logs ou documentação pública.

## Uso como biblioteca

O pacote também pode ser usado diretamente em JavaScript/TypeScript.

### Exemplo básico

```js
import { scanProject } from "bug-hunter-static";

const result = await scanProject(".");

console.log(result);
```

### Análise + IA

```js
import {
  scanProject,
  analyzeScanWithAI,
} from "bug-hunter-static";

const result = await scanProject(".");

const ai = await analyzeScanWithAI(result, {
  includeCode: true,
});

console.log(ai.summary);
```

Use `includeCode` apenas quando o envio de contexto de código for compatível com os requisitos de privacidade do projeto.

## Privacidade e credenciais

A build atual pode conter uma credencial de IA embutida de forma criptografada e obfuscada, em vez de manter a chave em texto puro no código publicado.

Isso reduz exposição por busca textual simples, mas **não transforma uma credencial distribuída em segredo absoluto**. Quem recebe o pacote pode inspecioná-lo, fazer engenharia reversa e recuperar o material usado em runtime.

Para aplicações que exigem uma credencial realmente privada, prefira:

1. uma variável de ambiente administrada pelo ambiente de execução; ou
2. uma API intermediária/backend controlado pelo proprietário da aplicação.

Também são suportados caminhos externos por variável de ambiente e credencial local criptografada, conforme a build instalada.

### Regra importante para publicação no Git

Nunca publique no repositório:

```text
.env
.env.*
*.pem
*.key
*.p12
*.pfx
credentials.json
tokens.json
secrets.json
```

Também não coloque credenciais diretamente em:

- README;
- exemplos;
- screenshots;
- issues;
- pull requests;
- logs;
- arquivos de teste;
- commits.

Se uma credencial real for publicada por engano, trate-a como comprometida e faça a rotação/revogação.

## Estrutura publicada

A distribuição foi mantida deliberadamente simples:

```text
bug-hunter-static/
├── package.json
├── README.md
├── LICENSE
└── src/
```

Materiais de desenvolvimento, testes e conteúdo interno não precisam fazer parte da estrutura pública do pacote.

Essa organização deixa a raiz limpa e reduz a quantidade de arquivos expostos no repositório e na publicação.

## Boas práticas

### Rode localmente antes de publicar

```bash
npx bug-hunter scan .
```

### Use relatório detalhado para investigar

```bash
npx bug-hunter scan . --verbose
```

### Use IA como segunda camada

```bash
npx bug-hunter scan . --ai
```

Primeiro corrija ou revise os achados do scanner; depois use a IA para auxiliar na interpretação e priorização.

### Revise os achados antes de aplicar correções automáticas

Análise estática trabalha com padrões. Um achado pode ser válido, mas também pode exigir contexto adicional para determinar a gravidade real.

## Limitações

O Bug Hunter Static é um analisador estático. Isso significa que ele não consegue provar, sozinho, todas as propriedades do programa.

Exemplos de limitações:

- comportamento que só aparece em runtime;
- bugs dependentes de dados externos;
- problemas específicos de infraestrutura;
- configuração incorreta fora dos arquivos analisados;
- vulnerabilidades que dependem da interação entre múltiplos serviços;
- comportamento causado por dependências de terceiros que não pode ser inferido estaticamente.

Por isso, use a ferramenta junto com testes, revisão de código e práticas de segurança apropriadas ao projeto.

## Troubleshooting

### O comando não é encontrado

Tente executar pelo `npx`:

```bash
npx bug-hunter scan .
```

Ou reinstale o pacote:

```bash
npm install bug-hunter-static
```

### A análise parece incompleta

Execute com:

```bash
npx bug-hunter scan . --verbose
```

Confirme também se os arquivos que deseja analisar possuem uma extensão suportada.

### A IA não está disponível

A análise estática não depende da IA. Execute normalmente:

```bash
npx bug-hunter scan .
```

Depois valide a configuração usada para a camada de IA e as permissões/restrições de rede do ambiente.

## Segurança

Para relatar um problema de segurança, não publique detalhes sensíveis em uma issue pública.

Não inclua no relatório:

- API keys;
- tokens de acesso;
- senhas;
- chaves privadas;
- dados pessoais;
- dumps de produção;
- informações internas de infraestrutura.

Sempre que possível, forneça uma descrição mínima e segura do impacto e passos para reproduzir o problema sem expor segredos.

## Licença

Consulte o arquivo `LICENSE` distribuído com o projeto.
