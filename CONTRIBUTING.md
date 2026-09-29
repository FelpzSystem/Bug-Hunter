**Credits: Shark**

# Contributing

1. Adicione ou altere uma regra em `src/rules/index.js`; funcionalidades de análise ficam em `src/core/` e a CLI em `src/cli/`.
2. Dê à regra um ID `BHxxx` único, severidade, categoria, descrição e teste.
3. Rode `npm test`.
4. Atualize o README quando uma regra pública for adicionada.

Regras devem evitar execução de código do projeto analisado e, sempre que possível, explicar por que um padrão é suspeito sem afirmar que todo achado é explorável.
