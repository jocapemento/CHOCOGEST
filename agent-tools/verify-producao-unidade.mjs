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
  await handle.type(String(value));
}

async function setProduto(nome, quantidade) {
  await page.evaluate((nome) => {
    const input = document.querySelector('input[list="catalogo-produtos-producao"]');
    const proto = Object.getPrototypeOf(input);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    desc.set.call(input, nome);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, nome);
  const qtd = await page.evaluateHandle(() => {
    const nomeInput = document.querySelector('input[list="catalogo-produtos-producao"]');
    const campo = nomeInput?.closest('.grid')?.querySelector('input[type="number"]');
    if (!campo) throw new Error('quantidade do produto não encontrada');
    return campo;
  });
  await qtd.click({ clickCount: 3 });
  await qtd.type(String(quantidade));
}

async function produzir({ ingredienteQtd, produto, quantidade, unidades }) {
  await clickTab('Produção');
  await page.waitForFunction(() => document.body.innerText.includes('Produtos gerados'), { timeout: 8000 });
  await setField('Ingrediente', 'Amêndoa Torrada');
  await setField('Quantidade', String(ingredienteQtd));
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('+ Ingrediente'))?.click();
  });
  await page.waitForFunction(() => document.body.innerText.includes('Custo total do lote'), { timeout: 8000 });
  await setProduto(produto, quantidade);
  if (unidades) {
    await page.evaluate(() => {
      const label = [...document.querySelectorAll('label')].find((el) =>
        (el.textContent || '').includes('Produzir em unidades')
      );
      label?.querySelector('input')?.click();
    });
  }
  alerts.length = 0;
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Registrar Produção')?.click();
  });
  await new Promise((r) => setTimeout(r, 700));
}

try {
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
          quantidade: 20,
          unidade: 'kg',
          valorUnit: 50,
          data: '2026-10-01',
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
  await page.waitForFunction(() => document.body.innerText.includes('Produtos gerados'), { timeout: 8000 });
  const tela = await page.evaluate(() => document.body.innerText);
  assert(!tela.includes('Peso de cada unidade'), 'formulário não pede mais o peso da unidade');
  assert(tela.includes('Produzir em unidades'), 'opção de produzir em unidades');

  await produzir({ ingredienteQtd: 5, produto: 'Nibs', quantidade: 4, unidades: false });
  assert(alerts.some((m) => m.includes('Produção registrada')), 'peso: ' + JSON.stringify(alerts));

  await produzir({ ingredienteQtd: 2, produto: 'Tablete', quantidade: 30, unidades: true });
  assert(
    alerts.some((m) => m.includes('Produção registrada')),
    'unidade: ' + JSON.stringify(alerts)
  );
  assert(
    !alerts.some((m) => m.includes('mesma unidade') || m.includes('peso')),
    'unidade não foi barrada pelo peso: ' + JSON.stringify(alerts)
  );

  const dados = await page.evaluate(() => ({
    producoes: JSON.parse(localStorage.getItem('chocogest_producoes') || '[]'),
    estoque: JSON.parse(localStorage.getItem('chocogest_estoque') || '[]'),
    texto: document.body.innerText,
  }));
  const tablete = dados.producoes.find((p) => (p.produto || '').includes('Tablete') || (p.produtos || []).some((x) => x.nome === 'Tablete'));
  const saida = (tablete?.produtos || []).find((p) => p.nome === 'Tablete');
  assert(saida && saida.quantidade === 30 && saida.unidade === 'un', 'tablete gravado em unidades: ' + JSON.stringify(saida));
  assert(!saida.massa && !saida.pesoUnidade, 'tablete não guarda peso');
  assert(!tablete.quantidadePerdida, 'perda de peso não entra no lote em unidades');
  const nibs = dados.producoes.find((p) => (p.produtos || []).some((x) => x.nome === 'Nibs'));
  assert(nibs && nibs.quantidadePerdida === 1, 'lote em kg continua com perda de peso: ' + nibs?.quantidadePerdida);
  const saldoTablete = dados.estoque.filter((e) => e.nome === 'Tablete').reduce((acc, e) => acc + e.quantidade, 0);
  assert(saldoTablete === 30, 'estoque do tablete é 30 un, saldo=' + saldoTablete);
  const unidadeTablete = dados.estoque.find((e) => e.nome === 'Tablete')?.unidade;
  assert(unidadeTablete === 'un', 'estoque do tablete em un, foi ' + unidadeTablete);
  assert(dados.texto.includes('30 un'), 'histórico mostra 30 un');
  assert(!dados.texto.includes('de 15 g'), 'histórico não mostra o peso da unidade');

  await page.setViewport({ width: 390, height: 844 });
  await clickTab('Produção');
  await page.waitForFunction(() => document.body.innerText.includes('Produzir em unidades'), { timeout: 8000 });
  const mobile = await page.evaluate(() => {
    const label = [...document.querySelectorAll('label')].find((el) =>
      (el.textContent || '').includes('Produzir em unidades')
    );
    const card = label?.closest('.rounded-xl');
    const r = card?.getBoundingClientRect();
    return r
      ? { left: r.left, right: r.right, vw: window.innerWidth, scroll: document.documentElement.scrollWidth - window.innerWidth }
      : null;
  });
  assert(mobile, 'card do produto no celular');
  assert(mobile && mobile.left >= -1 && mobile.right <= mobile.vw + 2, 'card cabe na largura');
  assert(mobile && mobile.scroll <= 2, 'sem rolagem horizontal, extra=' + (mobile && mobile.scroll));
} catch (err) {
  fails.push(err && err.stack ? err.stack : String(err));
} finally {
  await browser.close();
}

if (fails.length) {
  console.error(fails.join('\n\n'));
  process.exit(1);
}
console.log('OK — produção em unidades');
