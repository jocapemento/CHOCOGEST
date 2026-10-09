import puppeteer from 'puppeteer-core';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await puppeteer.launch({
  executablePath: edge,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();
page.on('pageerror', (err) => console.log('PAGEERROR:', err.message));

await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 60000 });
await page.waitForFunction(() => !document.body.innerText.includes('Carregando ChocoGest'), {
  timeout: 15000,
});

await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem(
    'chocogest_estoque',
    JSON.stringify([
      {
        id: 1,
        nome: 'Nibs',
        tipo: 'ProdutoAcabado',
        quantidade: 10,
        unidade: 'kg',
        valorUnit: 50,
        data: '2026-07-01',
      },
    ])
  );
  localStorage.setItem(
    'chocogest_precos',
    JSON.stringify([
      {
        id: 1,
        data: '2026-06-01',
        produto: 'Nibs',
        unidade: 'kg',
        custoUnitario: 40,
        margemLucro: 30,
        precoSugerido: 52,
      },
      {
        id: 2,
        data: '2026-06-15',
        produto: 'Chocolate 100%',
        unidade: 'kg',
        custoUnitario: 80,
        margemLucro: 50,
        precoSugerido: 120,
      },
    ])
  );
  localStorage.setItem(
    'chocogest_producoes',
    JSON.stringify([
      {
        id: 1,
        data: '2026-07-01',
        lote: 'L1',
        produto: 'Nibs',
        quantidade: 10,
        unidade: 'kg',
        ingredientes: [],
        custoEstimado: 500,
      },
      {
        id: 2,
        data: '2026-06-01',
        lote: 'L0',
        produto: 'Chocolate 100%',
        quantidade: 5,
        unidade: 'kg',
        ingredientes: [],
        custoEstimado: 400,
      },
    ])
  );
});
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction(() => !document.body.innerText.includes('Carregando ChocoGest'), {
  timeout: 15000,
});

await page.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find((b) => b.textContent?.includes('Precificação'))
    ?.click();
});
await new Promise((r) => setTimeout(r, 500));

const options = await page.evaluate(() => {
  const s = [...document.querySelectorAll('select')].find((el) =>
    [...el.options].some((o) => o.value === 'Nibs' || o.textContent?.includes('Chocolate'))
  );
  return s ? [...s.options].map((o) => o.textContent) : [];
});
console.log('options (should include Chocolate sem estoque):', options);

await page.evaluate(() => {
  const s = [...document.querySelectorAll('select')].find((el) =>
    [...el.options].some((o) => o.value === 'Nibs')
  );
  s.value = 'Nibs';
  s.dispatchEvent(new Event('change', { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 300));

const body = await page.evaluate(() => document.body.innerText);
const hist = body.slice(body.indexOf('Histórico'), body.indexOf('Histórico') + 1000);
console.log('--- history with Nibs selected (must still show Chocolate) ---');
console.log(hist);
console.log('shows Chocolate:', body.includes('Chocolate 100%'));
console.log('shows Nibs history:', body.includes('Nibs') && body.includes('52'));

page.on('dialog', async (d) => {
  console.log('ALERT:', d.message());
  await d.accept();
});
await page.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find((b) => b.textContent?.includes('Registrar preço'))
    ?.click();
});
await new Promise((r) => setTimeout(r, 500));

const after = await page.evaluate(() => document.body.innerText);
const hist2 = after.slice(after.indexOf('Histórico'), after.indexOf('Histórico') + 1200);
console.log('--- after register ---');
console.log(hist2);
const stored = await page.evaluate(() => localStorage.getItem('chocogest_precos'));
console.log('stored count', JSON.parse(stored || '[]').length);

const rows = await page.evaluate(() => {
  const tables = [...document.querySelectorAll('table')];
  const histTable = tables.find((t) => t.innerText.includes('Produto') && t.innerText.includes('Margem'));
  return histTable ? histTable.querySelectorAll('tbody tr').length : -1;
});
console.log('history rows (expect 3):', rows);

// Select Chocolate without stock and ensure cost from production/history works
await page.evaluate(() => {
  const s = [...document.querySelectorAll('select')].find((el) =>
    [...el.options].some((o) => o.value === 'Chocolate 100%')
  );
  if (!s) throw new Error('Chocolate not in select');
  s.value = 'Chocolate 100%';
  s.dispatchEvent(new Event('change', { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 300));
const choc = await page.evaluate(() => document.body.innerText);
console.log('--- chocolate selected ---');
console.log(
  choc.includes('Preço Sugerido') || choc.includes('Custo Unitário')
    ? 'cost panel visible'
    : 'NO cost panel'
);
console.log('still all history:', choc.includes('Nibs') && choc.includes('Chocolate 100%'));

await browser.close();
