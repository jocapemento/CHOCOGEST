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
    await handle.type(String(value), { delay: 20 });
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
  await page.waitForFunction(
    () => document.body.innerText.includes('Registrar Venda'),
    { timeout: 10000 }
  );

  const formTxt = await page.evaluate(() => document.body.innerText);
  assert(formTxt.includes('Desconto'), 'formulário deve ter opção Desconto');
  assert(formTxt.includes('Sem desconto'), 'opção Sem desconto visível');

  await setField('Cliente', 'Maria');
  await setField('Produto', 'Nibs');
  await setField('Quantidade', '2');
  await clickButton('+ Item');
  await page.waitForFunction(() => document.body.innerText.includes('Nibs × 2'), { timeout: 8000 });

  await setField('Desconto', 'percentual');
  await page.waitForFunction(
    () => document.body.innerText.includes('Percentual (%)'),
    { timeout: 8000 }
  );
  await setField('Percentual (%)', '10');
  await page.waitForFunction(
    () => document.body.innerText.includes('90,00'),
    { timeout: 8000 }
  );

  const resumo = await page.evaluate(() => document.body.innerText);
  assert(resumo.includes('Subtotal'), 'mostra subtotal');
  assert(resumo.includes('100,00'), 'subtotal R$ 100,00');
  assert(resumo.includes('10%'), 'mostra 10%');
  assert(resumo.includes('90,00'), 'total líquido R$ 90,00');

  alerts.length = 0;
  await clickButton('Registrar Venda');
  await new Promise((r) => setTimeout(r, 600));
  assert(
    alerts.some((m) => m.includes('Venda concluída')),
    'não registrou venda com desconto. alerts=' + JSON.stringify(alerts)
  );

  await page.waitForFunction(
    () => document.body.innerText.includes('Histórico de vendas concluídas'),
    { timeout: 8000 }
  );
  const hist = await page.evaluate(() => document.body.innerText);
  assert(hist.includes('Maria'), 'histórico mostra cliente');
  assert(hist.includes('90,00'), 'histórico mostra total líquido');
  assert(hist.includes('desc.'), 'histórico mostra desconto');

  await clickTab('Dashboard');
  await page.waitForFunction(() => document.body.innerText.includes('Últimas Vendas'), {
    timeout: 8000,
  });
  const dash = await page.evaluate(() => document.body.innerText);
  assert(dash.includes('90,00'), 'dashboard usa total com desconto');
  assert(dash.includes('desc.'), 'dashboard menciona desconto');

  await clickTab('Caixa');
  await page.waitForFunction(() => document.body.innerText.includes('Caixa'), { timeout: 8000 });
  const caixa = await page.evaluate(() => document.body.innerText);
  assert(caixa.includes('90,00'), 'caixa recebe valor líquido');
  assert(caixa.includes('desconto'), 'lançamento de caixa menciona desconto');

  await clickTab('Vendas');
  await page.waitForFunction(() => document.body.innerText.includes('Registrar Venda'), {
    timeout: 8000,
  });

  await setField('Cliente', 'João');
  await setField('Status', 'em_processamento');
  await setField('Produto', 'Nibs');
  await setField('Quantidade', '1');
  await clickButton('+ Item');
  await page.waitForFunction(() => document.body.innerText.includes('Nibs × 1'), { timeout: 8000 });
  await setField('Desconto', 'valor');
  await page.waitForFunction(
    () => document.body.innerText.includes('Valor do desconto (R$)'),
    { timeout: 8000 }
  );
  await setField('Valor do desconto (R$)', '15');
  await page.waitForFunction(
    () => document.body.innerText.includes('35,00'),
    { timeout: 8000 }
  );

  alerts.length = 0;
  await clickButton('Registrar Venda');
  await new Promise((r) => setTimeout(r, 600));
  assert(
    alerts.some((m) => m.includes('pendente')),
    'não registrou venda pendente. alerts=' + JSON.stringify(alerts)
  );

  const pend = await page.evaluate(() => document.body.innerText);
  assert(pend.includes('João'), 'pendente mostra João');
  assert(pend.includes('35,00'), 'pendente mostra total com desconto em R$');
  assert(pend.includes('Valor pendente'), 'card de valor pendente visível');

  const ranking = await page.evaluate(() => document.body.innerText);
  assert(ranking.includes('Melhores clientes'), 'ranking visível');
  assert(ranking.includes('90,00'), 'ranking usa valor líquido da venda concluída');

  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('tr')];
    const maria = rows.find((tr) => (tr.innerText || '').includes('Maria'));
    const btn = [...(maria?.querySelectorAll('button') || [])].find((b) =>
      (b.textContent || '').includes('Editar')
    );
    if (!btn) throw new Error('Editar da Maria não encontrado');
    btn.click();
  });
  await page.waitForFunction(
    () => document.body.innerText.includes('Editando venda'),
    { timeout: 8000 }
  );
  await setField('Percentual (%)', '20');
  await page.waitForFunction(
    () => document.body.innerText.includes('80,00'),
    { timeout: 8000 }
  );
  alerts.length = 0;
  await clickButton('Salvar alterações');
  await new Promise((r) => setTimeout(r, 600));
  assert(
    alerts.some((m) => m.includes('atualizada')),
    'não salvou edição com desconto. alerts=' + JSON.stringify(alerts)
  );
  const aposEdicao = await page.evaluate(() => document.body.innerText);
  assert(aposEdicao.includes('80,00'), 'histórico atualiza total após mudar o desconto');
  assert(aposEdicao.includes('20%'), 'histórico mostra 20%');

  await clickTab('Caixa');
  await page.waitForFunction(() => document.body.innerText.includes('Caixa'), { timeout: 8000 });
  const caixaEdit = await page.evaluate(() => document.body.innerText);
  assert(caixaEdit.includes('80,00'), 'caixa atualiza para o novo total líquido');
  assert(!caixaEdit.includes('90,00'), 'caixa não mantém o valor antigo de 90,00');

  await clickTab('Vendas');
  await page.waitForFunction(() => document.body.innerText.includes('Registrar Venda'), {
    timeout: 8000,
  });

  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await new Promise((r) => setTimeout(r, 400));
  await clickTab('Vendas');
  await page.waitForFunction(() => document.body.innerText.includes('Registrar Venda'), {
    timeout: 8000,
  });
  const descontoVisivel = await page.evaluate(() => {
    const spans = [...document.querySelectorAll('label span')];
    const span = spans.find((s) => (s.textContent || '').trim() === 'Desconto');
    if (!span) return { ok: false, reason: 'label ausente' };
    span.scrollIntoView({ block: 'center' });
    const r = span.getBoundingClientRect();
    return {
      ok: r.width > 0 && r.height > 0,
      reason: `w=${r.width} h=${r.height}`,
      overflowX: document.body.scrollWidth > document.body.clientWidth + 8,
    };
  });
  assert(descontoVisivel.ok, 'opção de desconto visível no mobile: ' + descontoVisivel.reason);
} catch (e) {
  fails.push(e.message);
} finally {
  await browser.close();
}

if (fails.length) {
  console.error('FALHOU:\n' + fails.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}

console.log('✓ Desconto em Vendas: percentual, valor, listas, caixa e mobile');
