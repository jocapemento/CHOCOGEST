import puppeteer from 'puppeteer-core';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CUSTO = 41.986 / 240.019;
const PRECO = 0.49854428191101535;
const NOME = 'Chocolate 70% com Açúcar de Coco Bombom';

const browser = await puppeteer.launch({
  executablePath: edge,
  headless: true,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
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
    const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes(label));
    if (!btn) throw new Error(`Aba não encontrada: ${label}`);
    btn.click();
  }, label);
}

try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 30000 });
  await waitReady();
  await page.evaluate(
    ({ CUSTO, PRECO, NOME }) => {
      localStorage.setItem(
        'chocogest_estoque',
        JSON.stringify([
          {
            id: 1,
            nome: NOME,
            tipo: 'ProdutoAcabado',
            quantidade: 112.019,
            unidade: 'un',
            valorUnit: CUSTO,
            data: '2026-09-28',
          },
          {
            id: 2,
            nome: NOME,
            tipo: 'ProdutoAcabado',
            quantidade: 40,
            unidade: 'un',
            valorUnit: PRECO,
            data: '2026-09-29',
          },
        ])
      );
      localStorage.setItem(
        'chocogest_producoes',
        JSON.stringify([
          {
            id: 31,
            data: '2026-09-28',
            lote: 'L1',
            produto: NOME,
            quantidade: 240.019,
            unidade: 'un',
            produtos: [
              {
                nome: NOME,
                quantidade: 240.019,
                unidade: 'un',
                custoAlocado: 41.986,
                massa: 1.004,
                unidadeMassa: 'kg',
              },
            ],
            ingredientes: [
              {
                nome: 'Chocolate 70% com Açúcar de Coco',
                quantidade: 1.004,
                valorUnit: 37.098,
                unidade: 'kg',
                tipo: 'ProdutoAcabado',
              },
            ],
            custoEstimado: 41.986,
          },
        ])
      );
      localStorage.setItem(
        'chocogest_precos',
        JSON.stringify([
          {
            id: 1,
            data: '2026-09-28',
            produto: NOME,
            unidade: 'un',
            custoUnitario: CUSTO,
            margemLucro: 185,
            precoSugerido: PRECO,
          },
        ])
      );
      localStorage.setItem(
        'chocogest_vendas',
        JSON.stringify([
          {
            id: 4,
            data: '2026-09-29',
            cliente: 'Rita',
            formaPagamento: 'Dinheiro',
            status: 'concluida',
            entrega: 'entregue',
            pago: 'pago',
            total: 4.99,
            itens: [
              {
                id: 1,
                nome: NOME,
                tipo: 'ProdutoAcabado',
                quantidade: 10,
                unidade: 'un',
                valorUnit: PRECO,
              },
            ],
          },
        ])
      );
      localStorage.setItem('chocogest_compras', '[]');
      localStorage.setItem('chocogest_caixa', '[]');
      localStorage.setItem('chocogest_banco', '[]');
    },
    { CUSTO, PRECO, NOME }
  );

  await page.reload({ waitUntil: 'networkidle0' });
  await waitReady();

  const estoqueCorrigido = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('chocogest_estoque') || '[]')
  );
  assert(
    estoqueCorrigido.every((item) => Math.abs(item.valorUnit - CUSTO) < 1e-9),
    'camada no preço de venda: ' + JSON.stringify(estoqueCorrigido.map((item) => item.valorUnit))
  );

  await clickTab('Produção');
  await page.waitForFunction(() => document.body.innerText.includes('Produtos gerados'), { timeout: 8000 });
  await page.select('select', NOME);
  const valor = await page.evaluate(() => {
    const span = [...document.querySelectorAll('label span')].find(
      (el) => (el.textContent || '').trim() === 'Valor Unitário (R$)'
    );
    return span?.parentElement?.querySelector('input')?.value ?? '';
  });
  const numero = Number(valor);
  assert(Math.abs(numero - CUSTO) < 1e-6, `valor unitário na produção ${valor}`);

  const qtd = await page.evaluateHandle(() => {
    const spans = [...document.querySelectorAll('label span')];
    const span = spans.find((el) => (el.textContent || '').trim() === 'Quantidade');
    return span?.parentElement?.querySelector('input');
  });
  await qtd.click({ clickCount: 3 });
  await qtd.type('20');
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('+ Ingrediente'))?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  const linha = await page.evaluate(() => document.body.innerText.replaceAll('\u00a0', ' '));
  assert(linha.includes('R$ 3,50'), 'custo de 20 un: ' + linha.slice(linha.indexOf('Bombom'), linha.indexOf('Bombom') + 180));
  assert(!linha.includes('R$ 5,00'), 'ainda mostra a média inflada');

  await clickTab('Vendas');
  await page.waitForFunction(() => document.body.innerText.includes('Rita'), { timeout: 8000 });
  alerts.length = 0;
  await page.evaluate(() => {
    const linha = [...document.querySelectorAll('tr')].find((tr) => (tr.textContent || '').includes('Rita'));
    const btn = [...(linha?.querySelectorAll('button') || [])].find((b) => (b.textContent || '').includes('Editar'));
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Salvar alterações')?.click();
  });
  await new Promise((r) => setTimeout(r, 500));
  const depois = await page.evaluate((NOME) =>
    JSON.parse(localStorage.getItem('chocogest_estoque') || '[]').filter((item) => item.nome === NOME)
  , NOME);
  assert(
    depois.every((item) => Math.abs(item.valorUnit - CUSTO) < 1e-6),
    'editar venda regravou preço: ' + JSON.stringify(depois)
  );
  assert(alerts.some((m) => m.includes('Venda atualizada')), 'venda salva: ' + JSON.stringify(alerts));
} catch (error) {
  fails.push(error instanceof Error ? error.stack || error.message : String(error));
} finally {
  await browser.close();
}

if (fails.length) {
  console.error(fails.join('\n'));
  process.exit(1);
}
console.log('OK — custo do bombom na produção');
