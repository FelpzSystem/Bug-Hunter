# Publicando o Bug Hunter no npm

## 1. Pré-requisitos

Tenha Node.js 20+ e uma conta no npm.

Confira:

```bash
node -v
npm -v
```

## 2. Entre na conta npm

```bash
npm login
```

Confirme:

```bash
npm whoami
```

## 3. Confira o pacote

Antes de publicar, abra `package.json` e confirme:

- `name` está correto e disponível no npm;
- `version` está atualizada;
- `author` está como `Shark`;
- `files` inclui `src`, `docs`, `examples` e documentação;
- não existem segredos no repositório.

Veja o conteúdo do pacote sem publicar:

```bash
npm pack --dry-run
```

Depois gere o tarball na pasta de release:

```bash
npm run pack:release
```

O arquivo será criado em `.release/`, deixando a raiz do projeto livre de artefatos de empacotamento.

## 4. Rode os testes

```bash
npm test
npm run demo
```

Faça também uma varredura do próprio projeto:

```bash
npm run scan:self
```

## 5. Publique

Para fazer o fluxo completo com testes, dry-run e OTP interativo, use este comando como fluxo oficial de release:

```bash
npm run release
```

O `npm publish` pode ser recusado pelo npm quando a conta exige 2FA para escrita. Nesse caso, o erro aparece como `E403` e menciona `Two-factor authentication` ou `granular access token with bypass 2fa enabled`.

Com 2FA por código, publique informando o OTP solicitado pelo npm:

```bash
npm publish --otp=123456
```

Substitua `123456` pelo código atual do seu autenticador. Não salve esse código no repositório, em `package.json` ou em scripts.

Quando a automação usar token, o token precisa ter permissão de publicação compatível com o pacote e, conforme a política indicada pelo próprio npm, estar configurado para permitir publicação sem a etapa de 2FA. Nunca coloque o valor do token em arquivos versionados.

Antes de tentar novamente, confirme apenas a identidade e o registry (sem imprimir tokens):

```bash
npm whoami
npm config get registry
```

Como o pacote atual é público e não está sob um scope, `npm publish` é suficiente quando a autenticação da conta estiver autorizada para publicação.

## 6. Teste o pacote publicado

Em uma pasta limpa:

```bash
mkdir bug-hunter-test
cd bug-hunter-test
npm init -y
npm install bug-hunter-static
npx bug-hunter scan .
```

## 7. Atualizando uma nova versão

Altere o código e rode os testes. Depois aumente a versão:

```bash
npm version patch
```

Para uma mudança com recurso novo:

```bash
npm version minor
```

Para uma quebra de compatibilidade:

```bash
npm version major
```

Depois:

```bash
npm publish
```

## 8. O que conferir antes de cada release

```bash
npm test
npm pack --dry-run
npm run demo
npm run scan:self
```

Também abra o `.release/*.tgz` gerado e confirme que nenhum arquivo local, credencial, `.env`, build temporário ou `node_modules` foi incluído.
## Publicar no GitHub Packages

O projeto também está preparado para o GitHub Packages. O pacote publicado lá usa o scope `@felpzsystem`, enquanto o pacote do npm continua com o nome `bug-hunter-static`. Isso evita mudar os comandos e imports existentes do projeto.

### Publicação automática (recomendada)

O workflow `.github/workflows/publish-github-packages.yml` publica no GitHub Packages quando você cria uma tag `v*` ou executa o workflow manualmente. Ele usa o `GITHUB_TOKEN`, com permissão `packages: write`, e roda os testes antes da publicação.

Exemplo:

```bash
git tag v0.3.1
git push origin v0.3.1
```

O pacote fica disponível como:

```text
@felpzsystem/bug-hunter-static
```

### Instalar de um projeto local

Configure o registry do scope e autentique o npm no GitHub Packages. Nunca coloque o token no repositório.

```ini
@felpzsystem:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

Depois: 

```bash
npm install @felpzsystem/bug-hunter-static
```

Para publicar manualmente, defina `NODE_AUTH_TOKEN` com um token do GitHub que tenha permissão para publicar pacotes e rode:

```bash
npm run publish:github
```

