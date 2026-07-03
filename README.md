# ChocoGest

Sistema de gestão para fábrica de chocolate artesanal (bean-to-bar) — Bahia.

**App online:** https://jocapemento.github.io/CHOCOGEST/

## Desenvolvimento local

```bash
npm install
npm run dev
```

Abra http://localhost:3000

## Publicar no GitHub Pages

O workflow `.github/workflows/deploy-pages.yml` gera o site estático e publica via **GitHub Actions** (`deploy-pages`).

### Configuração (uma vez)

1. Abra **Settings → Pages → Build and deployment**
2. Em **Source**, escolha **GitHub Actions**
3. Salve

**Importante:** com **Deploy from branch** (`gh-pages`), o site **não atualiza** automaticamente após cada push — o token do Actions não dispara o rebuild. Use **GitHub Actions** como fonte.

**Não use** a branch `main` como fonte — isso publica o README em vez do app.

### Validar antes do push

```bash
npm run check
```