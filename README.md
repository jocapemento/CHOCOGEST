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
2. Em **Source**, escolha **GitHub Actions** (recomendado)
3. Salve

**Se o site sumiu (404)** depois de tornar o repositório privado e voltar para público: o GitHub **desativa** o Pages — é preciso repetir o passo 2 acima e rodar o workflow **Deploy GitHub Pages** em Actions (ou dar push na `main`).

Em **Settings → Actions → General**, confirme **Workflow permissions: Read and write**.

**Alternativa:** **Deploy from branch** → `gh-pages` / `(root)` — o workflow também atualiza essa branch a cada push.

**Não use** a branch `main` como fonte — isso publica o README em vez do app.

### Validar antes do push

```bash
npm run check
```