import puppeteer from 'puppeteer-core';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await puppeteer.launch({
  executablePath: edge,
  headless: true,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
const fails = [];

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

try {
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 30000 });
  await waitReady();

  await page.evaluate(() => {
    localStorage.setItem(
      'chocogest_estoque',
      JSON.stringify([
        {
          id: 1,
          nome: 'Amêndoa Torrada',
          tipo: 'MateriaPrima',
          quantidade: 12.5000000001,
          unidade: 'kg',
          valorUnit: 40,
          data: '2026-09-02',
        },
        {
          id: 2,
          nome: 'Nibs',
          tipo: 'ProdutoAcabado',
          quantidade: 8.333333333,
          unidade: 'kg',
          valorUnit: 55,
          data: '2026-09-03',
        },
        {
          id: 3,
          nome: 'Licor de Cacau',
          tipo: 'ProdutoAcabado',
          quantidade: 1.23456,
          unidade: 'kg',
          valorUnit: 70,
          data: '2026-09-04',
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
          quantidade: 12.5000000001,
          unidade: 'kg',
          produtos: [{ nome: 'Amêndoa Torrada', quantidade: 12.5000000001, unidade: 'kg' }],
          ingredientes: [{ nome: 'Amendoa de Cacau', quantidade: 15, valorUnit: 30, unidade: 'kg' }],
          custoEstimado: 450,
        },
        {
          id: 2,
          data: '2026-09-03',
          lote: 'N-001',
          produto: 'Nibs',
          quantidade: 8.333333333,
          unidade: 'kg',
          produtos: [{ nome: 'Nibs', quantidade: 8.333333333, unidade: 'kg' }],
          ingredientes: [{ nome: 'Amêndoa Torrada', quantidade: 10, valorUnit: 40, unidade: 'kg' }],
          custoEstimado: 400,
        },
        {
          id: 3,
          data: '2026-09-04',
          lote: 'L-001',
          produto: 'Licor de Cacau',
          quantidade: 1.23456,
          unidade: 'kg',
          produtos: [{ nome: 'Licor de Cacau', quantidade: 1.23456, unidade: 'kg' }],
          ingredientes: [{ nome: 'Nibs', quantidade: 2, valorUnit: 55, unidade: 'kg' }],
          custoEstimado: 110,
        },
      ])
    );
    localStorage.setItem('chocogest_precos', JSON.stringify([]));
    localStorage.setItem('chocogest_compras', JSON.stringify([]));
    localStorage.setItem('chocogest_vendas', JSON.stringify([]));
  });
  await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
  await waitReady();

  await clickTab('Dashboard');
  await page.waitForFunction(
    () => document.body.innerText.includes('Produtos produzidos — estoque e precificação'),
    { timeout: 10000 }
  );

  const itens = await page.evaluate(() => {
    const heading = [...document.querySelectorAll('h3')].find((h) =>
      (h.textContent || '').includes('Produtos produzidos')
    );
    const table = heading?.parentElement?.querySelector('table');
    return [...(table?.querySelectorAll('tbody tr') || [])].map((tr) => {
      const tds = [...tr.querySelectorAll('td')];
      return {
        produto: (tds[0]?.innerText || '').split('\n')[0].trim(),
        qtd: (tds[1]?.innerText || '').trim(),
      };
    });
  });

  const torrada = itens.find((i) => i.produto === 'Amêndoa Torrada');
  const nibs = itens.find((i) => i.produto === 'Nibs');
  const licor = itens.find((i) => i.produto === 'Licor de Cacau');

  assert(torrada?.qtd === '12.5 kg', `Amêndoa Torrada deveria ser 12.5 kg, foi "${torrada?.qtd}"`);
  assert(!String(torrada?.qtd).includes('00000'), 'não pode mostrar lixo de ponto flutuante');
  assert(nibs?.qtd === '8.333 kg', `Nibs deveria ser 8.333 kg, foi "${nibs?.qtd}"`);
  assert(licor?.qtd === '1.235 kg', `1.23456 deveria arredondar para 1.235 kg, foi "${licor?.qtd}"`);

  await clickTab('Estoque');
  await page.waitForFunction(() => document.body.innerText.includes('Matérias-primas'), { timeout: 10000 });
  const estoqueTxt = await page.evaluate(() => document.body.innerText);
  assert(estoqueTxt.includes('12.5 kg'), 'Estoque mostra 12.5 kg');
  assert(!estoqueTxt.includes('12.500000'), 'Estoque não mostra fração longa');
  assert(estoqueTxt.includes('8.333 kg'), 'Estoque mostra 8.333 kg');
  assert(estoqueTxt.includes('1.235 kg'), 'Estoque mostra 1.235 kg');
} catch (e) {
  fails.push(e.message);
} finally {
  await browser.close();
}

if (fails.length) {
  console.error('FALHOU:\n' + fails.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}

console.log('✓ Dashboard e Estoque limitam a fração a 3 dígitos');
