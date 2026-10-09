import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, 'live-shots');
mkdirSync(outDir, { recursive: true });

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await puppeteer.launch({
  executablePath: edge,
  headless: true,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
const alerts = [];
const fails = [];
const notes = [];

page.on('dialog', async (dialog) => {
  alerts.push(dialog.message());
  await dialog.accept();
});

function assert(cond, msg) {
  if (!cond) fails.push(msg);
}

async function waitReady() {
  await page.waitForFunction(
    () => document.body && !document.body.innerText.includes('Carregando'),
    { timeout: 20000 }
  );
}

async function clickTab(label) {
  await page.evaluate((label) => {
    const buttons = [...document.querySelectorAll('button')];
    const btn = buttons.find((b) => (b.textContent || '').includes(label));
    if (!btn) throw new Error(`Aba não encontrada: ${label}`);
    btn.click();
  }, label);
}

async function shot(name) {
  await page.screenshot({ path: join(outDir, name), fullPage: true });
}

function seed() {
  localStorage.setItem(
    'chocogest_estoque',
    JSON.stringify([
      {
        id: 1,
        nome: 'Amendoa de Cacau',
        tipo: 'MateriaPrima',
        quantidade: 8,
        unidade: 'kg',
        valorUnit: 30,
        data: '2026-09-01',
      },
      {
        id: 2,
        nome: 'Amêndoa Torrada',
        tipo: 'MateriaPrima',
        quantidade: 12.5,
        unidade: 'kg',
        valorUnit: 40,
        data: '2026-09-02',
      },
      {
        id: 3,
        nome: 'Nibs',
        tipo: 'ProdutoAcabado',
        quantidade: 8,
        unidade: 'kg',
        valorUnit: 55,
        data: '2026-09-03',
      },
    ])
  );
  localStorage.setItem(
    'chocogest_producoes',
    JSON.stringify([
      {
        id: 1,
        data: '2026-09-02',
        lote: 'T-001',
        produto: 'Amêndoa Torrada',
        quantidade: 12.5,
        unidade: 'kg',
        produtos: [{ nome: 'Amêndoa Torrada', quantidade: 12.5, unidade: 'kg', custoAlocado: 500 }],
        ingredientes: [
          { nome: 'Amendoa de Cacau', quantidade: 15, valorUnit: 30, unidade: 'kg', tipo: 'MateriaPrima' },
        ],
        custoEstimado: 450,
      },
      {
        id: 2,
        data: '2026-09-03',
        lote: 'N-001',
        produto: 'Nibs',
        quantidade: 8,
        unidade: 'kg',
        produtos: [{ nome: 'Nibs', quantidade: 8, unidade: 'kg', custoAlocado: 440 }],
        ingredientes: [
          { nome: 'Amêndoa Torrada', quantidade: 10, valorUnit: 40, unidade: 'kg', tipo: 'MateriaPrima' },
        ],
        custoEstimado: 400,
      },
    ])
  );
  localStorage.setItem(
    'chocogest_precos',
    JSON.stringify([
      {
        id: 1,
        data: '2026-09-04',
        produto: 'Amêndoa Torrada',
        unidade: 'kg',
        custoUnitario: 40,
        margemLucro: 50,
        precoSugerido: 60,
      },
    ])
  );
  localStorage.setItem('chocogest_compras', JSON.stringify([]));
  localStorage.setItem('chocogest_vendas', JSON.stringify([]));
}

try {
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 30000 });
  await waitReady();

  await page.evaluate(seed);
  await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
  await waitReady();

  await clickTab('Dashboard');
  await page.waitForFunction(
    () => document.body.innerText.includes('Produtos produzidos — estoque e precificação'),
    { timeout: 10000 }
  );

  const dashboard = await page.evaluate(() => {
    const heading = [...document.querySelectorAll('h3')].find((h) =>
      (h.textContent || '').includes('Produtos produzidos')
    );
    heading?.scrollIntoView({ block: 'center' });
    const table = heading?.parentElement?.querySelector('table');
    const itens = table
      ? [...table.querySelectorAll('tbody tr')].map((tr) => {
          const tds = [...tr.querySelectorAll('td')];
          return {
            produto: (tds[0]?.innerText || '').split('\n')[0].trim(),
            qtd: (tds[1]?.innerText || '').trim(),
            custo: (tds[2]?.innerText || '').trim(),
            preco: (tds[4]?.innerText || '').trim(),
          };
        })
      : [];

    const cardTexto = (titulo) => {
      const h = [...document.querySelectorAll('h3')].find((el) =>
        (el.textContent || '').includes(titulo)
      );
      return h?.parentElement?.innerText || '';
    };

    return {
      itens,
      materias: cardTexto('Matérias-primas em estoque'),
      gerados: cardTexto('Produtos gerados em estoque'),
    };
  });

  await shot('01-dashboard-produtos-produzidos.png');

  const torrada = dashboard.itens.find((i) => i.produto === 'Amêndoa Torrada');
  const nibs = dashboard.itens.find((i) => i.produto === 'Nibs');
  notes.push('Dashboard itens: ' + JSON.stringify(dashboard.itens));
  assert(!!torrada, 'Amêndoa Torrada deveria aparecer em Produtos produzidos');
  assert(
    torrada?.qtd.includes('12.5') && torrada?.qtd.includes('kg'),
    `Qtd Amêndoa Torrada deveria ser 12.5 kg, foi "${torrada?.qtd}"`
  );
  assert(torrada?.qtd !== '—', 'Qtd da Amêndoa Torrada não pode ser traço');
  assert(nibs?.qtd.includes('8'), `Nibs deveria manter quantidade, foi "${nibs?.qtd}"`);
  assert(dashboard.materias.includes('Amêndoa Torrada'), 'Amêndoa Torrada continua nas matérias-primas');
  assert(!dashboard.gerados.includes('Amêndoa Torrada'), 'Amêndoa Torrada não deve ir para produtos gerados');

  await clickTab('Estoque');
  await page.waitForFunction(() => document.body.innerText.includes('Matérias-primas'), { timeout: 10000 });
  await shot('02-estoque.png');
  const estoqueTxt = await page.evaluate(() => document.body.innerText);
  assert(estoqueTxt.includes('Amêndoa Torrada'), 'Estoque lista Amêndoa Torrada');
  assert(estoqueTxt.includes('12.5'), 'Estoque mostra 12.5 da torrada');

  await clickTab('Precificação');
  await page.waitForFunction(
    () => document.body.innerText.includes('Precificação') || document.body.innerText.includes('Preço'),
    { timeout: 10000 }
  );
  await shot('03-precificacao.png');

  await clickTab('Dashboard');
  await page.setViewport({ width: 390, height: 844 });
  await page.waitForFunction(
    () => document.body.innerText.includes('Produtos produzidos — estoque e precificação'),
    { timeout: 10000 }
  );
  await page.evaluate(() => {
    const heading = [...document.querySelectorAll('h3')].find((h) =>
      (h.textContent || '').includes('Produtos produzidos')
    );
    heading?.scrollIntoView({ block: 'center' });
  });
  await shot('04-dashboard-mobile.png');
  const mobileQtd = await page.evaluate(() => {
    const heading = [...document.querySelectorAll('h3')].find((h) =>
      (h.textContent || '').includes('Produtos produzidos')
    );
    const table = heading?.parentElement?.querySelector('table');
    const row = [...(table?.querySelectorAll('tbody tr') || [])].find((tr) =>
      (tr.innerText || '').includes('Amêndoa Torrada')
    );
    return (row?.querySelectorAll('td')[1]?.innerText || '').trim();
  });
  assert(mobileQtd.includes('12.5'), `no mobile a quantidade também deve aparecer, foi "${mobileQtd}"`);

  await page.setViewport({ width: 1280, height: 900 });
  await page.evaluate(() => {
    localStorage.setItem(
      'chocogest_estoque',
      JSON.stringify([
        {
          id: 1,
          nome: 'Amendoa de Cacau',
          tipo: 'MateriaPrima',
          quantidade: 20,
          unidade: 'kg',
          valorUnit: 30,
          data: '2026-09-01',
        },
      ])
    );
    localStorage.setItem('chocogest_producoes', JSON.stringify([]));
    localStorage.setItem('chocogest_precos', JSON.stringify([]));
  });
  await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
  await waitReady();

  await clickTab('Produção');
  await page.waitForFunction(() => document.body.innerText.includes('Produtos gerados'), { timeout: 10000 });
  await page.select('select', 'Amendoa de Cacau');
  const qtdIng = await page.evaluateHandle(() => {
    const spans = [...document.querySelectorAll('label span')];
    const span = spans.find((s) => (s.textContent || '').trim() === 'Quantidade');
    return span?.parentElement?.querySelector('input');
  });
  await qtdIng.click({ clickCount: 3 });
  await qtdIng.type('10');
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')];
    buttons.find((b) => (b.textContent || '').includes('+ Ingrediente'))?.click();
  });
  await page.waitForFunction(() => document.body.innerText.includes('Custo total do lote'), { timeout: 10000 });
  await page.click('input[list="catalogo-produtos-producao"]', { clickCount: 3 });
  await page.type('input[list="catalogo-produtos-producao"]', 'Amêndoa Torrada');
  const qtdProd = await page.evaluateHandle(() => {
    const nomeInput = document.querySelector('input[list="catalogo-produtos-producao"]');
    const qtd = nomeInput?.closest('.grid')?.querySelector('input[type="number"]');
    if (!qtd) throw new Error('quantidade do produto não encontrada');
    return qtd;
  });
  await qtdProd.click({ clickCount: 3 });
  await qtdProd.type('9');
  alerts.length = 0;
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')];
    buttons.find((b) => (b.textContent || '').trim() === 'Registrar Produção')?.click();
  });
  await new Promise((r) => setTimeout(r, 800));
  assert(
    alerts.some((m) => m.includes('Produção registrada')),
    'não registrou produção. alerts=' + JSON.stringify(alerts)
  );

  await clickTab('Dashboard');
  await page.waitForFunction(
    () => document.body.innerText.includes('Produtos produzidos — estoque e precificação'),
    { timeout: 10000 }
  );
  await page.evaluate(() => {
    const heading = [...document.querySelectorAll('h3')].find((h) =>
      (h.textContent || '').includes('Produtos produzidos')
    );
    heading?.scrollIntoView({ block: 'center' });
  });
  await shot('05-depois-de-produzir.png');
  const qtdApos = await page.evaluate(() => {
    const heading = [...document.querySelectorAll('h3')].find((h) =>
      (h.textContent || '').includes('Produtos produzidos')
    );
    const table = heading?.parentElement?.querySelector('table');
    const row = [...(table?.querySelectorAll('tbody tr') || [])].find((tr) =>
      (tr.innerText || '').includes('Amêndoa Torrada')
    );
    return (row?.querySelectorAll('td')[1]?.innerText || '').trim();
  });
  notes.push('Qtd após produzir: ' + qtdApos);
  assert(qtdApos.includes('9'), `depois de produzir, quantidade deveria ser 9 kg, foi "${qtdApos}"`);
} catch (e) {
  fails.push(e.stack || e.message);
} finally {
  await browser.close();
}

if (fails.length) {
  console.error('FALHOU:\n' + fails.map((f) => `  - ${f}`).join('\n'));
  if (notes.length) console.error('notas:\n' + notes.join('\n'));
  process.exit(1);
}

console.log('OK');
for (const n of notes) console.log(n);
console.log('shots em ' + outDir);
