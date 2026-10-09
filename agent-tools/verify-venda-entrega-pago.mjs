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
  if (String(value) !== '') {
    await handle.type(String(value), { delay: 15 });
  }
}

async function clickButton(text) {
  await page.evaluate((text) => {
    const buttons = [...document.querySelectorAll('button')];
    const btn = buttons.find((b) => (b.textContent || '').trim() === text);
    if (!btn) throw new Error(`Botão não encontrado: ${text}`);
    btn.click();
  }, text);
}

async function lerDados() {
  return page.evaluate(() => ({
    vendas: JSON.parse(localStorage.getItem('chocogest_vendas') || '[]'),
    caixa: JSON.parse(localStorage.getItem('chocogest_caixa') || '[]'),
    banco: JSON.parse(localStorage.getItem('chocogest_banco') || '[]'),
    estoque: JSON.parse(localStorage.getItem('chocogest_estoque') || '[]'),
  }));
}

function saldoNibs(estoque) {
  return estoque
    .filter((e) => e.nome === 'Nibs')
    .reduce((acc, e) => acc + Number(e.quantidade), 0);
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
    localStorage.setItem('chocogest_compras', JSON.stringify([]));
    localStorage.setItem('chocogest_vendas', JSON.stringify([]));
    localStorage.setItem('chocogest_caixa', JSON.stringify([]));
    localStorage.setItem('chocogest_banco', JSON.stringify([]));
  });
  await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
  await waitReady();
  await clickTab('Vendas');
  await page.waitForFunction(() => document.body.innerText.includes('Registrar Venda'), { timeout: 10000 });

  const opcoes = await page.evaluate(() => {
    const spans = [...document.querySelectorAll('label span')];
    const ler = (label) => {
      const span = spans.find((s) => (s.textContent || '').trim() === label);
      const select = span?.parentElement?.querySelector('select');
      return select ? [...select.options].map((o) => (o.textContent || '').trim()) : [];
    };
    return { entrega: ler('Entrega'), pago: ler('Pago') };
  });
  assert(
    opcoes.entrega.join('|') === 'Retirada|A entregar|Entregue',
    'opções de entrega: ' + JSON.stringify(opcoes.entrega)
  );
  assert(opcoes.pago.join('|') === 'Pago|A receber', 'opções de pago: ' + JSON.stringify(opcoes.pago));

  await setField('Cliente', 'Ana');
  await setField('Entrega', 'a_entregar');
  await setField('Pago', 'a_receber');
  await setField('Produto', 'Nibs');
  await setField('Quantidade', '1');
  await clickButton('+ Item');
  await page.waitForFunction(() => document.body.innerText.includes('Nibs × 1'), { timeout: 8000 });

  alerts.length = 0;
  await clickButton('Registrar Venda');
  await new Promise((r) => setTimeout(r, 700));
  assert(
    alerts.some((m) => m.includes('permanece na Relação de vendas pendentes')),
    'alerta impede conclusão com pendência: ' + JSON.stringify(alerts)
  );

  await page.waitForFunction(() => document.body.innerText.includes('Ana'), { timeout: 8000 });
  const depoisAna = await page.evaluate(() => document.body.innerText);
  assert(depoisAna.includes('Relação de vendas pendentes'), 'mostra a relação de pendentes');
  assert(depoisAna.includes('A entregar'), 'pendentes mostra A entregar');
  assert(depoisAna.includes('A receber'), 'pendentes mostra A receber');
  assert(depoisAna.includes('50,00') || depoisAna.includes('50.00'), 'mostra o valor da venda');

  let dados = await lerDados();
  const ana = dados.vendas.find((v) => v.cliente === 'Ana');
  assert(
    ana && ana.status === 'em_processamento' && ana.entrega === 'a_entregar' && ana.pago === 'a_receber',
    'Ana permanece pendente: ' + JSON.stringify(ana)
  );
  assert(saldoNibs(dados.estoque) === 10, 'pendência não baixa estoque, saldo=' + saldoNibs(dados.estoque));
  assert(dados.caixa.length === 0 && dados.banco.length === 0, 'a receber não lança financeiro');

  await clickTab('Caixa');
  await page.waitForFunction(() => document.body.innerText.includes('Caixa'), { timeout: 8000 });
  const caixaVazio = await page.evaluate(() => document.body.innerText);
  assert(!caixaVazio.includes('Venda: Ana'), 'caixa não mostra a venda em aberto');

  await clickTab('Vendas');
  alerts.length = 0;
  await clickButton('Receber');
  await new Promise((r) => setTimeout(r, 700));
  assert(
    alerts.some((m) => m.includes('permanece pendente até confirmar a entrega')),
    'receber com entrega aberta: ' + JSON.stringify(alerts)
  );
  dados = await lerDados();
  const anaPaga = dados.vendas.find((v) => v.cliente === 'Ana');
  assert(anaPaga.pago === 'pago' && anaPaga.status === 'em_processamento', 'Ana paga e ainda pendente');
  assert(dados.caixa.length === 1 && dados.caixa[0].valor === 50, 'caixa recebeu 50: ' + JSON.stringify(dados.caixa));
  assert(saldoNibs(dados.estoque) === 10, 'receber sem concluir não baixa estoque');

  await clickTab('Caixa');
  await page.waitForFunction(() => document.body.innerText.includes('Venda: Ana'), { timeout: 8000 });

  await clickTab('Vendas');
  await setField('Cliente', 'Bruno');
  await setField('Status', 'em_processamento');
  await setField('Entrega', 'retirada');
  await setField('Pago', 'pago');
  await setField('Produto', 'Nibs');
  await setField('Quantidade', '1');
  await clickButton('+ Item');
  await page.waitForFunction(() => document.body.innerText.includes('Nibs × 1'), { timeout: 8000 });
  alerts.length = 0;
  await clickButton('Registrar Venda');
  await new Promise((r) => setTimeout(r, 700));
  assert(
    alerts.some((m) => m.includes('estoque reservado') && m.includes('recebimento lançado')),
    'pendente pago: ' + JSON.stringify(alerts)
  );
  dados = await lerDados();
  const bruno = dados.vendas.find((v) => v.cliente === 'Bruno');
  assert(bruno.status === 'em_processamento' && bruno.pago === 'pago' && bruno.entrega === 'retirada', 'Bruno pendente, pago, retirada');
  assert(saldoNibs(dados.estoque) === 10, 'pendente não baixa estoque');
  assert(dados.caixa.reduce((a, m) => a + m.valor, 0) === 100, 'adiantamento entrou no caixa');

  const pendenteTxt = await page.evaluate(() => document.body.innerText);
  assert(pendenteTxt.includes('Bruno'), 'relação pendente mostra Bruno');
  assert(pendenteTxt.includes('Retirada'), 'relação pendente mostra Retirada');

  await clickButton('Editar');
  await page.waitForFunction(() => {
    const spans = [...document.querySelectorAll('label span')];
    const span = spans.find((s) => (s.textContent || '').trim() === 'Cliente');
    const input = span?.parentElement?.querySelector('input');
    return input && input.value === 'Bruno';
  }, { timeout: 8000 });
  await setField('Pago', 'a_receber');
  alerts.length = 0;
  await clickButton('Salvar alterações');
  await new Promise((r) => setTimeout(r, 700));
  assert(alerts.some((m) => m.includes('Venda atualizada')), 'edição: ' + JSON.stringify(alerts));
  dados = await lerDados();
  const brunoAberto = dados.vendas.find((v) => v.cliente === 'Bruno');
  assert(brunoAberto.pago === 'a_receber' && brunoAberto.status === 'em_processamento', 'Bruno voltou a receber');
  assert(dados.caixa.reduce((a, m) => a + m.valor, 0) === 50, 'tirar pago remove o recebimento');
  assert(saldoNibs(dados.estoque) === 10, 'editar pago não mexe no estoque pendente');

  const semConcluir = await page.evaluate(() => {
    const linhas = [...document.querySelectorAll('tr')];
    const linha = linhas.find((tr) => (tr.textContent || '').includes('Bruno'));
    return linha ? ![...linha.querySelectorAll('button')].some((b) => (b.textContent || '').trim() === 'Concluir') : false;
  });
  assert(semConcluir, 'Concluir some enquanto o pagamento está pendente');

  const pendenteAinda = await page.evaluate(() => {
    const titulo = [...document.querySelectorAll('h4')].find((el) => (el.textContent || '').includes('Relação de vendas pendentes'));
    return titulo?.parentElement?.innerText.includes('Bruno') ?? false;
  });
  assert(pendenteAinda, 'Bruno continua na relação de pendentes');

  alerts.length = 0;
  const botoesReceber = await page.evaluate(() =>
    [...document.querySelectorAll('button')].filter((b) => (b.textContent || '').trim() === 'Receber').length
  );
  assert(botoesReceber >= 1, 'há botão Receber');
  await page.evaluate(() => {
    const linhas = [...document.querySelectorAll('tr')];
    const linha = linhas.find((tr) => (tr.textContent || '').includes('Bruno'));
    const btn = [...(linha?.querySelectorAll('button') || [])].find((b) => (b.textContent || '').trim() === 'Receber');
    if (!btn) throw new Error('Receber do Bruno não encontrado');
    btn.click();
  });
  await new Promise((r) => setTimeout(r, 700));
  assert(
    alerts.some((m) => m.includes('Venda concluída')),
    'receber com retirada conclui: ' + JSON.stringify(alerts)
  );
  dados = await lerDados();
  const brunoConcluido = dados.vendas.find((v) => v.cliente === 'Bruno');
  assert(brunoConcluido.status === 'concluida' && brunoConcluido.pago === 'pago', 'Bruno concluído e pago');
  assert(saldoNibs(dados.estoque) === 9, 'concluir no recebimento baixa estoque para 9');
  assert(dados.caixa.reduce((a, m) => a + m.valor, 0) === 100, 'receber relança o caixa');

  const brunoFora = await page.evaluate(() => {
    const titulo = [...document.querySelectorAll('h4')].find((el) => (el.textContent || '').includes('Relação de vendas pendentes'));
    const historico = [...document.querySelectorAll('h4')].find((el) => (el.textContent || '').includes('Histórico de vendas concluídas'));
    return {
      pendente: titulo?.parentElement?.innerText.includes('Bruno') ?? false,
      concluida: historico?.parentElement?.innerText.includes('Bruno') ?? false,
    };
  });
  assert(!brunoFora.pendente && brunoFora.concluida, 'Bruno saiu das pendentes e entrou no histórico');

  await clickTab('Vendas');
  await setField('Cliente', 'Carla');
  await setField('Pagamento', 'Pix');
  await setField('Entrega', 'entregue');
  await setField('Pago', 'pago');
  await setField('Status', 'concluida');
  await setField('Produto', 'Nibs');
  await setField('Quantidade', '1');
  await clickButton('+ Item');
  await page.waitForFunction(() => document.body.innerText.includes('Nibs × 1'), { timeout: 8000 });
  alerts.length = 0;
  await clickButton('Registrar Venda');
  await new Promise((r) => setTimeout(r, 700));
  assert(alerts.some((m) => m.includes('Venda concluída')), 'Pix pago: ' + JSON.stringify(alerts));
  dados = await lerDados();
  assert(dados.banco.some((m) => m.descricao.includes('Carla') && m.valor === 50), 'Pix entra no banco');
  assert(dados.caixa.every((m) => !m.descricao.includes('Carla')), 'Pix não entra no caixa');
  assert(saldoNibs(dados.estoque) === 8, 'terceira venda baixa para 8');

  await clickTab('Banco');
  await page.waitForFunction(() => document.body.innerText.includes('Carla'), { timeout: 8000 });

  await page.setViewport({ width: 390, height: 844 });
  await clickTab('Vendas');
  await page.waitForFunction(() => document.body.innerText.includes('Registrar Venda'), { timeout: 8000 });
  const mobile = await page.evaluate(() => {
    const spans = [...document.querySelectorAll('label span')];
    const ler = (label) => {
      const span = spans.find((s) => (s.textContent || '').trim() === label);
      const el = span?.parentElement?.querySelector('select');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, width: r.width, vw: window.innerWidth };
    };
    return {
      entrega: ler('Entrega'),
      pago: ler('Pago'),
      scroll: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  assert(mobile.entrega && mobile.entrega.width > 40, 'campo Entrega visível no celular');
  assert(mobile.pago && mobile.pago.width > 40, 'campo Pago visível no celular');
  assert(mobile.entrega.right <= mobile.entrega.vw + 2, 'Entrega cabe na largura do celular');
  assert(mobile.pago.right <= mobile.pago.vw + 2, 'Pago cabe na largura do celular');
  assert(mobile.scroll <= 2, 'página sem rolagem horizontal no celular, extra=' + mobile.scroll);
} catch (err) {
  fails.push(err && err.stack ? err.stack : String(err));
} finally {
  await browser.close();
}

if (fails.length) {
  console.error(fails.join('\n\n'));
  process.exit(1);
}
console.log('OK — entrega e pago na tela de vendas');
