import puppeteer from 'puppeteer-core';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await puppeteer.launch({
  executablePath: edge,
  headless: true,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });

function fail(msg) {
  console.error('FALHOU:', msg);
}

function txt(s) {
  return (s || '').replace(/\u00a0/g, ' ');
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
    'chocogest_vendas',
    JSON.stringify([
      {
        id: 1,
        data: '2026-09-01',
        cliente: 'Ana',
        formaPagamento: 'Pix',
        status: 'concluida',
        total: 200,
        itens: [
          { id: 1, nome: 'Nibs', tipo: 'ProdutoAcabado', quantidade: 2, unidade: 'kg', valorUnit: 80 },
          { id: 2, nome: 'Casca', tipo: 'ProdutoAcabado', quantidade: 1, unidade: 'kg', valorUnit: 40 },
        ],
      },
      {
        id: 2,
        data: '2026-09-10',
        cliente: 'Bruno',
        formaPagamento: 'Dinheiro',
        status: 'concluida',
        total: 160,
        itens: [
          { id: 1, nome: 'Nibs', tipo: 'ProdutoAcabado', quantidade: 2, unidade: 'kg', valorUnit: 80 },
        ],
      },
      {
        id: 3,
        data: '2026-09-12',
        cliente: 'Ana',
        formaPagamento: 'Pix',
        status: 'em_processamento',
        total: 80,
        itens: [
          { id: 1, nome: 'Nibs', tipo: 'ProdutoAcabado', quantidade: 1, unidade: 'kg', valorUnit: 80 },
        ],
      },
    ])
  );
  localStorage.setItem('chocogest_estoque', JSON.stringify([]));
  localStorage.setItem('chocogest_producoes', JSON.stringify([]));
});
await page.reload({ waitUntil: 'networkidle0' });
await waitReady();

await clickTab('Dashboard');
await page.waitForFunction(
  () => document.body.innerText.includes('Produtos mais vendidos'),
  { timeout: 10000 }
);
const dash = txt(await page.evaluate(() => document.body.innerText));
if (!dash.includes('Nibs') || !dash.includes('4 kg')) {
  fail('dashboard não mostra Nibs como mais vendido (4 kg)');
  await browser.close();
  process.exit(1);
}

await clickTab('Vendas');
await page.waitForFunction(
  () => document.body.innerText.includes('Ranking por quantidade vendida'),
  { timeout: 10000 }
);
const vendasTxt = txt(await page.evaluate(() => document.body.innerText));
if (!vendasTxt.includes('Produtos mais vendidos')) {
  fail('aba Vendas sem seção de produtos mais vendidos');
  await browser.close();
  process.exit(1);
}
if (!vendasTxt.includes('4 kg')) {
  fail('ranking não mostra 4 kg de Nibs');
  await browser.close();
  process.exit(1);
}
if (!vendasTxt.includes('R$ 320,00')) {
  fail('ranking não mostra R$ 320,00 de Nibs');
  await browser.close();
  process.exit(1);
}
if (!vendasTxt.includes('+1 pendente')) {
  fail('ranking não mostra o pedido pendente de Nibs');
  await browser.close();
  process.exit(1);
}

console.log('OK produtos mais vendidos no dashboard e em Vendas');
await browser.close();
process.exit(0);
