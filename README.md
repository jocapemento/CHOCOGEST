# ChocoGest

Sistema de gestão para fábrica de chocolate artesanal (bean-to-bar) — Bahia.

**App online:** https://jocapemento.github.io/CHOCOGEST/

## Critérios de funcionamento multi-dispositivo

O app é uma SPA estática pensada para **smartphone, tablet e desktop** (uso em fábrica e escritório).

| Critério | Como é atendido |
|----------|-----------------|
| **Viewport** | `width=device-width`, escala inicial 1, zoom permitido (`app/layout.tsx`) |
| **Breakpoints** | 1 coluna no telefone; grids a partir de `sm` (640px); menu lateral a partir de `lg` (1024px) |
| **Navegação mobile** | Abas horizontais com scroll no topo (sticky); menu lateral só no desktop |
| **Toque** | Botões/campos com altura mínima ~44px; estados `active` além de `hover` |
| **iOS / inputs** | Fonte ≥ 16px nos campos no mobile (evita zoom automático do Safari) |
| **Tabelas** | Scroll horizontal (`.table-scroll`) sem estourar a largura da página |
| **Safe area** | Respeito a notch e barra inferior (`safe-area-inset`) |
| **Legibilidade** | Tipografia e padding reduzidos no telefone; botões de backup compactos (ícones) |
| **Performance** | Fundo fixo só em desktop; no mobile usa `scroll` (mais leve) |

**Larguras de referência:** telefone (~360–430px), tablet (~768px), notebook/desktop (≥1024px).

## Desenvolvimento local

```bash
npm install
npm run dev
```

Abra http://localhost:3000 — no Chrome DevTools use o modo dispositivo para validar smartphone.

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