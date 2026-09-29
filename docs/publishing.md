# Publicando o Bug Hunter

A edição atual usa a identidade de release **demo** com a versão semver `0.3.1-demo.1`.

> O campo `version` do npm precisa continuar em um formato semver válido. Por isso o projeto usa `0.3.1-demo.1`, e não apenas `demo`.

## 1. Verificar o projeto

```bash
node -v
npm -v
npm test
npm pack --dry-run
```

Também rode:

```bash
npm run scan:self
npm run demo
```

A varredura normal salva um relatório textual em:

```text
.bug-hunter/scan.log.txt
```

## 2. Publicar no npm

Entrar na conta:

```bash
npm login
npm whoami
```

O pacote atual é público e sem scope:

```text
bug-hunter-static
```

Publicação manual:

```bash
npm publish --access public
```

Se a conta exigir 2FA por código, o npm poderá pedir um OTP de 6 dígitos. Nunca coloque OTP ou token em arquivos do repositório.

Fluxo assistido do projeto:

```bash
npm run release
```

Esse fluxo verifica identidade, executa testes e prepara o pacote antes da publicação.

## 3. Usar o GitHub como origem do código

Repositório:

```text
https://github.com/FelpzSystem/Bug-Hunter
```

Clonar:

```bash
git clone https://github.com/FelpzSystem/Bug-Hunter.git
cd Bug-Hunter
npm install
npm test
```

Instalação direta em outro projeto:

```bash
npm install git+https://github.com/FelpzSystem/Bug-Hunter.git
```

## 4. GitHub Packages (npm registry)

Para publicar no GitHub Packages, o nome do pacote precisa usar um scope do GitHub. Uma configuração de publicação pode usar:

```text
@felpzsystem/bug-hunter-static
```

O `package.json` público do npm continua podendo usar `bug-hunter-static`; a automação deve criar/ajustar os metadados para o registry do GitHub antes de publicar.

No GitHub Actions, o token padrão `GITHUB_TOKEN` pode ser usado quando o workflow tiver permissão adequada para packages. A ideia geral é:

```yaml
permissions:
  contents: read
  packages: write
```

Depois configure o Node para:

```text
https://npm.pkg.github.com
```

e publique usando:

```text
NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Não coloque um PAT diretamente no workflow ou no código.

## 5. Empacotamento local

```bash
npm run pack:release
```

O `.tgz` é criado em `.release/`.

## 6. Checklist antes de uma release

```bash
npm test
npm pack --dry-run
npm run demo
npm run scan:self
```

Verifique também:

- `node_modules/` não está no pacote;
- `.env` e segredos não estão no pacote;
- `.bug-hunter/` não está no pacote;
- a versão em `package.json` está correta;
- a documentação descreve a versão publicada;
- o changelog registra a mudança.
