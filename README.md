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

O workflow `.github/workflows/deploy-pages.yml` gera o site estático e publica de duas formas:

1. **GitHub Actions** (recomendado) — artefato do workflow
2. **Branch `gh-pages`** — cópia automática do build

### Configuração (uma vez)

Em **Settings → Pages → Build and deployment → Source**, escolha **uma** opção:

| Opção | Quando usar |
|-------|-------------|
| **GitHub Actions** | Preferencial — usa o job `deploy` |
| **Deploy from a branch** → branch `gh-pages` / `/ (root)` | Alternativa — usa o job `deploy-gh-pages` |

**Não use** “Deploy from a branch” com a branch `main` — isso publica o README em vez do app.

### Validar antes do push

```bash
npm run check
```