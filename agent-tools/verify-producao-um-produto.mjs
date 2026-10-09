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
        quantidade: 20,
        unidade: 'kg',
        valorUnit: 50,
        data: '2026-09-14',
      },
    ])
  );
  localStorage.setItem('chocogest_producoes', JSON.stringify([]));
  localStorage.setItem('chocogest_compras', JSON.stringify([]));
  localStorage.setItem('chocogest_vendas', JSON.stringify([]));
});
await page.reload({ waitUntil: 'networkidle0' });
await waitReady();

await clickTab('Produção');
await page.waitForFunction(
  () => document.body.innerText.includes('Produtos gerados'),
  { timeout: 10000 }
);

const linhasAntes = await page.$$('input[list="catalogo-produtos-producao"]');
if (linhasAntes.length !== 1) {
  fail(`formulário inicial deveria ter 1 produto, tinha ${linhasAntes.length}`);
  await browser.close();
  process.exit(1);
}

const ingSelect = await labeledControl('Ingrediente');
await ingSelect.select('Amêndoa Torrada');

const qtdIng = await labeledControl('Quantidade');
await qtdIng.click({ clickCount: 3 });
await qtdIng.type('10');

await page.evaluate(() => {
  const buttons = [...document.querySelectorAll('button')];
  buttons.find((b) => (b.textContent || '').includes('+ Ingrediente'))?.click();
});

await page.waitForFunction(
  () => document.body.innerText.includes('Amêndoa Torrada') && document.body.innerText.includes('Custo total do lote'),
  { timeout: 10000 }
);

const hint = await page.evaluate(() => document.body.innerText);
if (!hint.includes('Um produto já basta')) {
  fail('dica de um produto não apareceu');
  await browser.close();
  process.exit(1);
}
if (hint.includes('Informe a quantidade de cada um.')) {
  fail('texto antigo ainda exige os dois produtos');
  await browser.close();
  process.exit(1);
}

const linhasDepois = await page.$$('input[list="catalogo-produtos-producao"]');
if (linhasDepois.length !== 1) {
  fail(`depois do ingrediente deveria permanecer 1 produto, tinha ${linhasDepois.length}`);
  await browser.close();
  process.exit(1);
}

const nomeProduto = await page.$eval(
  'input[list="catalogo-produtos-producao"]',
  (el) => el.value
);
if (nomeProduto !== 'Nibs') {
  fail(`produto sugerido deveria ser Nibs, foi "${nomeProduto}"`);
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
await qtdProd.type('8');

alerts.length = 0;
await page.evaluate(() => {
  const buttons = [...document.querySelectorAll('button')];
  buttons.find((b) => (b.textContent || '').trim() === 'Registrar Produção')?.click();
});
await page.waitForFunction(() => window.__alertsDone || true);
await new Promise((r) => setTimeout(r, 800));

const erroDois = alerts.find(
  (m) =>
    m.includes('mais de um produto') ||
    m.includes('Informe também a quantidade') ||
    m.includes('Informe a quantidade de cada um')
);
if (erroDois) {
  fail('ainda bloqueou um único produto: ' + erroDois);
  await browser.close();
  process.exit(1);
}
if (!alerts.some((m) => m.includes('Produção registrada'))) {
  fail('não registrou produção com um produto. alerts=' + JSON.stringify(alerts));
  await browser.close();
  process.exit(1);
}

await page.waitForFunction(
  () => document.body.innerText.includes('Nibs'),
  { timeout: 10000 }
);

const lista = await page.evaluate(() => document.body.innerText);
if (!lista.includes('Nibs') || lista.includes('Nibs + Casca') || lista.includes('Nibs e Casca')) {
  // list row can mention Nibs only
}

await clickTab('Estoque');
await page.waitForFunction(
  () => document.body.innerText.includes('Estoque') || document.body.innerText.includes('Nibs'),
  { timeout: 10000 }
);
const estoqueTxt = await page.evaluate(() => document.body.innerText);
if (!estoqueTxt.includes('Nibs')) {
  fail('Nibs não entrou no estoque');
  await browser.close();
  process.exit(1);
}

await clickTab('Produção');
await page.waitForFunction(
  () => document.body.innerText.includes('Produtos gerados'),
  { timeout: 10000 }
);

const ingSelect2 = await labeledControl('Ingrediente');
await ingSelect2.select('Amêndoa Torrada');
const qtdIng2 = await labeledControl('Quantidade');
await qtdIng2.click({ clickCount: 3 });
await qtdIng2.type('10');
await page.evaluate(() => {
  const buttons = [...document.querySelectorAll('button')];
  buttons.find((b) => (b.textContent || '').includes('+ Ingrediente'))?.click();
});
await page.waitForFunction(
  () => (document.body.innerText.match(/Amêndoa Torrada/g) || []).length >= 1,
  { timeout: 10000 }
);

await page.evaluate(() => {
  const buttons = [...document.querySelectorAll('button')];
  buttons.find((b) => (b.textContent || '').includes('+ Produto gerado'))?.click();
});
await page.waitForFunction(
  () => document.querySelectorAll('input[list="catalogo-produtos-producao"]').length === 2,
  { timeout: 10000 }
);

const nomes = await page.$$eval('input[list="catalogo-produtos-producao"]', (els) =>
  els.map((e) => e.value)
);
if (nomes[0] !== 'Nibs') {
  fail('primeira linha deveria continuar Nibs, foi ' + JSON.stringify(nomes));
  await browser.close();
  process.exit(1);
}

const segundaLinha = await page.evaluateHandle(() => {
  const els = document.querySelectorAll('input[list="catalogo-produtos-producao"]');
  return els[1];
});
await segundaLinha.click({ clickCount: 3 });
await segundaLinha.type('Casca');

const productRows = await page.$$('input[list="catalogo-produtos-producao"]');
for (let i = 0; i < productRows.length; i++) {
  const qtdHandle = await page.evaluateHandle((idx) => {
    const nomeInput = document.querySelectorAll('input[list="catalogo-produtos-producao"]')[idx];
    return nomeInput?.closest('.grid')?.querySelector('input[type="number"]');
  }, i);
  await qtdHandle.click({ clickCount: 3 });
  await qtdHandle.type(i === 0 ? '7' : '2');
}

alerts.length = 0;
await page.evaluate(() => {
  const buttons = [...document.querySelectorAll('button')];
  buttons.find((b) => (b.textContent || '').trim() === 'Registrar Produção')?.click();
});
await new Promise((r) => setTimeout(r, 800));

if (!alerts.some((m) => m.includes('Produção registrada'))) {
  fail('não registrou lote com dois produtos. alerts=' + JSON.stringify(alerts) + ' nomes=' + JSON.stringify(nomes));
  await browser.close();
  process.exit(1);
}

const listaFinal = await page.evaluate(() => document.body.innerText);
if (!listaFinal.includes('Casca')) {
  fail('lote com Casca não apareceu na listagem');
  await browser.close();
  process.exit(1);
}

console.log('OK um produto e dois produtos');
await browser.close();
process.exit(0);
