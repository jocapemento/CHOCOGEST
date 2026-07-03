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

O workflow `.github/workflows/deploy-pages.yml` gera o site estático e publica na branch **`gh-pages`**.

### Configuração (uma vez)

1. Abra **Settings → Pages → Build and deployment**
2. Em **Source**, escolha **Deploy from a branch**
3. Branch: **`gh-pages`**
4. Pasta: **`/ (root)`**
5. Salve e aguarde 1–3 minutos

**Não use** a branch `main` como fonte — isso publica o README em vez do app.

O workflow publica na branch `gh-pages` e solicita rebuild automático do GitHub Pages (push via token não dispara o deploy sozinho).

### Validar antes do push

```bash
npm run check
```