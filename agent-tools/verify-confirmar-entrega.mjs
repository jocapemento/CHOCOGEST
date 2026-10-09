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

async function setField(label, value) {
  const handle = await page.evaluateHandle((label) => {
    const spans = [...document.querySelectorAll('label span')];
    const span = spans.find((s) => (s.textContent || '').trim() === label);
    const el = span?.parentElement?.querySelector('input, select, textarea');
    if (!el) throw new Error(`Campo não encontrado: ${label}`);
    return el;
  }, label);
  const tag = await handle.evaluate((el) => el.tagName);
  if (tag === 'SELECT') {
    await handle.select(String(value));
    return;
  }
  await handle.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  if (String(value) !== '') await handle.type(String(value), { delay: 15 });
}

async function clickButton(text) {
  await page.evaluate((text) => {
    const buttons = [...document.querySelectorAll('button')];
    const btn = buttons.find((b) => (b.textContent || '').trim() === text);
    if (!btn) throw new Error(`Botão não encontrado: ${text}`);
    btn.click();
  }, text);
}

async function botoes(texto) {
  return page.evaluate((texto) => {
    return [...document.querySelectorAll('button')].filter((b) => (b.textContent || '').trim() === texto)
      .length;
  }, texto);
}

async function lerDados() {
  return page.evaluate(() => ({
    vendas: JSON.parse(localStorage.getItem('chocogest_vendas') || '[]'),
    caixa: JSON.parse(localStorage.getItem('chocogest_caixa') || '[]'),
    estoque: JSON.parse(localStorage.getItem('chocogest_estoque') || '[]'),
  }));
}

function saldoNibs(estoque) {
  return estoque.filter((e) => e.nome === 'Nibs').reduce((acc, e) => acc + Number(e.quantidade), 0);
}

async function vender({ cliente, entrega, pago, status }) {
  await setField('Cliente', cliente);
  await setField('Status', status);
  await setField('Entrega', entrega);
  await setField('Pago', pago);
  await setField('Produto', 'Nibs');
  await setField('Quantidade', '1');
  await clickButton('+ Item');
  await page.waitForFunction(() => document.body.innerText.includes('Nibs × 1'), { timeout: 8000 });
  alerts.length = 0;
  await clickButton('Registrar Venda');
  await new Promise((r) => setTimeout(r, 600));
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
          nome: 'Nibs',
          tipo: 'ProdutoAcabado',
          quantidade: 10,
          unidade: 'kg',
          valorUnit: 40,
          data: '2026-09-01',
        },
      ])
    );
    localStorage.setItem(
      'chocogest_producoes',
      JSON.stringify([
        {
          id: 1,
          data: '2026-09-01',
          lote: 'N-001',
          produto: 'Nibs',
          quantidade: 10,
          unidade: 'kg',
          produtos: [{ nome: 'Nibs', quantidade: 10, unidade: 'kg', custoAlocado: 400 }],
          ingredientes: [{ nome: 'Amêndoa Torrada', quantidade: 12, valorUnit: 30, unidade: 'kg' }],
          custoEstimado: 400,
        },
      ])
    );
    localStorage.setItem(
      'chocogest_precos',
      JSON.stringify([
        {
          id: 1,
          data: '2026-09-01',
          produto: 'Nibs',
          unidade: 'kg',
          custoUnitario: 40,
          margemLucro: 25,
          precoSugerido: 50,
        },
      ])
    );
    localStorage.setItem('chocogest_compras', '[]');
    localStorage.setItem('chocogest_vendas', '[]');
    localStorage.setItem('chocogest_caixa', '[]');
    localStorage.setItem('chocogest_banco', '[]');
  });
  await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
  await waitReady();
  await clickTab('Vendas');
  await page.waitForFunction(() => document.body.innerText.includes('Confirmar entrega'), { timeout: 10000 });

  await vender({ cliente: 'Ana', entrega: 'a_entregar', pago: 'a_receber', status: 'concluida' });
  assert(
    alerts.some((m) => m.includes('permanece na Relação de vendas pendentes')),
    'Ana não conclui com pendência: ' + JSON.stringify(alerts)
  );
  assert((await botoes('Confirmar entrega')) === 1, 'venda a entregar mostra o botão');
  let dados = await lerDados();
  assert(saldoNibs(dados.estoque) === 10, 'pendência não baixa estoque');
  alerts.length = 0;
  await clickButton('Confirmar entrega');
  await new Promise((r) => setTimeout(r, 600));
  assert(
    alerts.some((m) => m.includes('permanece pendente até o recebimento')),
    'confirmar entrega sem pagamento: ' + JSON.stringify(alerts)
  );
  dados = await lerDados();
  const ana = dados.vendas.find((v) => v.cliente === 'Ana');
  assert(ana.entrega === 'entregue' && ana.status === 'em_processamento' && ana.pago === 'a_receber', 'Ana entregue e ainda pendente');
  assert(saldoNibs(dados.estoque) === 10, 'confirmar entrega sem pagamento não baixa estoque');
  assert(dados.caixa.length === 0, 'confirmação não lança recebimento');
  assert((await botoes('Confirmar entrega')) === 0, 'botão some depois de confirmar');
  const anaPendente = await page.evaluate(() => {
    const titulo = [...document.querySelectorAll('h4')].find((el) => (el.textContent || '').includes('Relação de vendas pendentes'));
    return titulo?.parentElement?.innerText.includes('Ana') ?? false;
  });
  assert(anaPendente, 'Ana continua na relação de pendentes');

  await vender({ cliente: 'Bruno', entrega: 'a_entregar', pago: 'pago', status: 'em_processamento' });
  dados = await lerDados();
  assert(saldoNibs(dados.estoque) === 10, 'pendente pago segue reservado');
  assert(dados.caixa.some((m) => m.descricao.includes('Bruno')), 'pendente pago lança caixa');
  assert((await botoes('Confirmar entrega')) === 1, 'pendente pago a entregar mostra o botão');
  alerts.length = 0;
  await clickButton('Confirmar entrega');
  await new Promise((r) => setTimeout(r, 600));
  assert(
    alerts.some((m) => m.includes('estoque será baixado')),
    'confirmar entrega paga conclui: ' + JSON.stringify(alerts)
  );
  dados = await lerDados();
  const bruno = dados.vendas.find((v) => v.cliente === 'Bruno');
  assert(bruno.entrega === 'entregue' && bruno.status === 'concluida' && bruno.pago === 'pago', 'Bruno ficou entregue e concluído');
  assert(saldoNibs(dados.estoque) === 9, 'confirmar entrega paga baixa estoque');

  await vender({ cliente: 'Carla', entrega: 'retirada', pago: 'pago', status: 'concluida' });
  assert((await botoes('Confirmar entrega')) === 0, 'retirada não pede confirmação de entrega');
  dados = await lerDados();
  assert(dados.caixa.some((m) => m.descricao.includes('Carla')), 'retirada paga lança caixa');
  assert(saldoNibs(dados.estoque) === 8, 'retirada concluída baixa estoque');

  await page.setViewport({ width: 390, height: 844 });
  await clickTab('Vendas');
  const mobile = await page.evaluate(() => {
    const titulo = [...document.querySelectorAll('h4')].find((el) => (el.textContent || '').trim() === 'A entregar');
    const card = titulo?.parentElement;
    const r = card?.getBoundingClientRect();
    return r
      ? { left: r.left, right: r.right, vw: window.innerWidth, scroll: document.documentElement.scrollWidth - window.innerWidth }
      : null;
  });
  assert(mobile, 'card A entregar no celular');
  assert(mobile.left >= -1 && mobile.right <= mobile.vw + 2, 'card A entregar cabe na largura');
  assert(mobile.scroll <= 2, 'sem rolagem horizontal, extra=' + (mobile && mobile.scroll));
} catch (err) {
  fails.push(err && err.stack ? err.stack : String(err));
} finally {
  await browser.close();
}

if (fails.length) {
  console.error(fails.join('\n\n'));
  process.exit(1);
}
console.log('OK — confirmação de entrega');
