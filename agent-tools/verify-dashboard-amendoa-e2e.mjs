import puppeteer from 'puppeteer-core';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await puppeteer.launch({
  executablePath: edge,
  headless: true,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
const alerts = [];
const fails = [];

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
    localStorage.setItem('chocogest_compras', JSON.stringify([]));
    localStorage.setItem('chocogest_vendas', JSON.stringify([]));
  });
  await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
  await waitReady();

  await clickTab('Produção');
  await page.waitForFunction(
    () => document.body.innerText.includes('Produtos gerados'),
    { timeout: 10000 }
  );

  await page.select('select', 'Amendoa de Cacau');
  await page.evaluate(() => {
    const spans = [...document.querySelectorAll('label span')];
    const span = spans.find((s) => (s.textContent || '').trim() === 'Quantidade');
    const input = span?.parentElement?.querySelector('input');
    if (!input) throw new Error('quantidade do ingrediente não encontrada');
    input.focus();
    input.value = '';
  });
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
  await page.waitForFunction(
    () => document.body.innerText.includes('Custo total do lote'),
    { timeout: 10000 }
  );

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
    'não registrou produção de Amêndoa Torrada. alerts=' + JSON.stringify(alerts)
  );

  await clickTab('Dashboard');
  await page.waitForFunction(
    () => document.body.innerText.includes('Produtos produzidos — estoque e precificação'),
    { timeout: 10000 }
  );

  const qtd = await page.evaluate(() => {
    const heading = [...document.querySelectorAll('h3')].find((h) =>
      (h.textContent || '').includes('Produtos produzidos')
    );
    const table = heading?.parentElement?.querySelector('table');
    const row = [...(table?.querySelectorAll('tbody tr') || [])].find((tr) =>
      (tr.innerText || '').includes('Amêndoa Torrada')
    );
    return (row?.querySelectorAll('td')[1]?.innerText || '').trim();
  });

  assert(qtd.includes('9'), `depois de produzir, quantidade deveria ser 9 kg, foi "${qtd}"`);
  assert(qtd !== '—' && qtd !== '', 'quantidade da Amêndoa Torrada continua em branco após produzir');
} catch (e) {
  fails.push(e.message);
} finally {
  await browser.close();
}

if (fails.length) {
  console.error('FALHOU:\n' + fails.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}

console.log('✓ Produção de Amêndoa Torrada aparece com quantidade no Dashboard');
