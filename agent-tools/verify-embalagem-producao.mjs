import puppeteer from 'puppeteer-core';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await puppeteer.launch({
  executablePath: edge,
  headless: true,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });

const alerts = [];
page.on('dialog', async (dialog) => {
  alerts.push(dialog.message());
  await dialog.accept();
});

function fail(msg) {
  console.error('FALHOU:', msg);
  console.error('alerts:', alerts);
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

async function labeledControl(label) {
  const handle = await page.evaluateHandle((label) => {
    const spans = [...document.querySelectorAll('label span')];
    const span = spans.find((s) => (s.textContent || '').trim() === label);
    const el = span?.parentElement?.querySelector('input, select, textarea');
    if (!el) throw new Error(`Campo não encontrado: ${label}`);
    return el;
  }, label);
  return handle.asElement();
}

try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 30000 });
} catch (e) {
  fail('DEV_DOWN ' + e.message);
  await browser.close();
  process.exit(1);
}

await waitReady();

await page.evaluate(() => {
  localStorage.setItem(
    'chocogest_estoque',
    JSON.stringify([
      {
        id: 1,
        nome: 'Amêndoa Torrada',
        tipo: 'MateriaPrima',
        quantidade: 10,
        unidade: 'kg',
        valorUnit: 50,
        data: '2026-09-14',
      },
      {
        id: 2,
        nome: 'Caixa 50g',
        tipo: 'Embalagem',
        quantidade: 100,
        unidade: 'un',
        valorUnit: 0.5,
        data: '2026-09-14',
      },
    ])
  );
  localStorage.setItem('chocogest_producoes', JSON.stringify([]));
  localStorage.setItem('chocogest_compras', JSON.stringify([]));
  localStorage.setItem('chocogest_vendas', JSON.stringify([]));
  localStorage.setItem('chocogest_precos', JSON.stringify([]));
});
await page.reload({ waitUntil: 'networkidle0' });
await waitReady();

await clickTab('Dashboard');
await page.waitForFunction(
  () => document.body.innerText.includes('Embalagem em estoque'),
  { timeout: 10000 }
);
const dash = await page.evaluate(() => document.body.innerText);
if (!dash.includes('Caixa 50g')) {
  fail('dashboard não mostra Caixa 50g em embalagem');
  await browser.close();
  process.exit(1);
}

await clickTab('Estoque');
await page.waitForFunction(
  () => document.body.innerText.includes('Saldo — Embalagem'),
  { timeout: 10000 }
);
const estoqueAntes = await page.evaluate(() => document.body.innerText);
if (!estoqueAntes.includes('Caixa 50g') || !estoqueAntes.includes('100 un')) {
  fail('estoque não lista 100 un de Caixa 50g');
  await browser.close();
  process.exit(1);
}

await clickTab('Produção');
await page.waitForFunction(
  () => document.body.innerText.includes('Produtos gerados'),
  { timeout: 10000 }
);

const ingSelect = await labeledControl('Ingrediente');
const opcoes = await page.evaluate((el) => [...el.options].map((o) => o.value), ingSelect);
if (!opcoes.includes('Caixa 50g')) {
  fail('Caixa 50g não aparece como ingrediente. opções=' + JSON.stringify(opcoes));
  await browser.close();
  process.exit(1);
}

await ingSelect.select('Amêndoa Torrada');
const qtdIng = await labeledControl('Quantidade');
await qtdIng.click({ clickCount: 3 });
await qtdIng.type('5');
await page.evaluate(() => {
  const buttons = [...document.querySelectorAll('button')];
  buttons.find((b) => (b.textContent || '').includes('+ Ingrediente'))?.click();
});
await page.waitForFunction(
  () => document.body.innerText.includes('Custo total do lote'),
  { timeout: 10000 }
);

await ingSelect.select('Caixa 50g');
await qtdIng.click({ clickCount: 3 });
await qtdIng.type('20');
await page.evaluate(() => {
  const buttons = [...document.querySelectorAll('button')];
  buttons.find((b) => (b.textContent || '').includes('+ Ingrediente'))?.click();
});
await page.waitForFunction(
  () => document.body.innerText.includes('Custo da embalagem'),
  { timeout: 10000 }
);

const formTxt = await page.evaluate(() => document.body.innerText.replace(/\u00a0/g, ' '));
if (!formTxt.includes('Custo da embalagem') || !formTxt.includes('R$ 10,00')) {
  fail('custo da embalagem não apareceu no formulário');
  await browser.close();
  process.exit(1);
}
if (!formTxt.includes('Caixa 50g') || !formTxt.includes('(embalagem)')) {
  fail('ingrediente de embalagem não foi listado com o rótulo');
  await browser.close();
  process.exit(1);
}

const qtdProd = await page.evaluateHandle(() => {
  const nomeInput = document.querySelector('input[list="catalogo-produtos-producao"]');
  const qtd = nomeInput?.closest('.grid')?.querySelector('input[type="number"]');
  if (!qtd) throw new Error('quantidade do produto não encontrada');
  return qtd;
});
await qtdProd.click({ clickCount: 3 });
await qtdProd.type('4');

alerts.length = 0;
await page.evaluate(() => {
  const buttons = [...document.querySelectorAll('button')];
  buttons.find((b) => (b.textContent || '').trim() === 'Registrar Produção')?.click();
});
await new Promise((r) => setTimeout(r, 800));

if (!alerts.some((m) => m.includes('Produção registrada'))) {
  fail('não registrou produção com embalagem. alerts=' + JSON.stringify(alerts));
  await browser.close();
  process.exit(1);
}

const lista = await page.evaluate(() => document.body.innerText.replace(/\u00a0/g, ' '));
if (!lista.includes('incl.') || !lista.includes('de embalagem')) {
  fail('listagem não mostra custo de embalagem incluso');
  await browser.close();
  process.exit(1);
}

await clickTab('Estoque');
await page.waitForFunction(
  () => document.body.innerText.includes('Saldo — Embalagem'),
  { timeout: 10000 }
);
const estoqueDepois = await page.evaluate(() => document.body.innerText.replace(/\u00a0/g, ' '));
if (!estoqueDepois.includes('80 un')) {
  fail('embalagem não foi baixada do estoque (esperava 80 un)');
  await browser.close();
  process.exit(1);
}

await clickTab('Precificação');
await page.waitForFunction(
  () => document.body.innerText.includes('Produto Acabado'),
  { timeout: 10000 }
);
await page.evaluate(() => {
  const select = [...document.querySelectorAll('select')].find((el) =>
    [...el.options].some((o) => (o.textContent || '').includes('Nibs'))
  );
  if (!select) throw new Error('select de produto não encontrado');
  const opt = [...select.options].find((o) => (o.textContent || '').includes('Nibs'));
  select.value = opt.value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForFunction(
  () => document.body.innerText.includes('Custo Unitário'),
  { timeout: 10000 }
);
const precoTxt = await page.evaluate(() => document.body.innerText.replace(/\u00a0/g, ' '));
if (!precoTxt.includes('R$ 65,00')) {
  fail('custo unitário deveria incluir embalagem (R$ 65,00)');
  await browser.close();
  process.exit(1);
}

console.log('OK embalagem na produção, estoque e precificação');
await browser.close();
process.exit(0);
