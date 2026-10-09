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

try {
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction(() => !document.body.innerText.includes('Carregando'), {
    timeout: 15000,
  });

  await page.evaluate(() => {
    localStorage.setItem(
      'chocogest_cartoes',
      JSON.stringify([{ id: 1, nome: 'Visa Teste', limite: 10000 }])
    );
    localStorage.setItem(
      'chocogest_compras',
      JSON.stringify([
        {
          id: 1,
          data: '2026-08-01',
          fornecedor: 'Fornecedor A',
          formaPagamento: 'Cartão',
          cartao: 'Visa Teste',
          parcelas: 2,
          total: 1000,
          itens: [{ nome: 'Cacau', quantidade: 1, unidade: 'kg', valorUnit: 1000 }],
        },
        {
          id: 2,
          data: '2026-08-02',
          fornecedor: 'Fornecedor B',
          formaPagamento: 'Cartão',
          cartao: 'Visa Teste',
          parcelas: 1,
          total: 500,
          itens: [{ nome: 'Açúcar', quantidade: 1, unidade: 'kg', valorUnit: 500 }],
        },
        {
          id: 3,
          data: '2026-08-03',
          fornecedor: 'À vista',
          formaPagamento: 'Pix',
          cartao: null,
          parcelas: 1,
          total: 200,
          itens: [{ nome: 'Embalagem', quantidade: 1, unidade: 'un', valorUnit: 200 }],
        },
      ])
    );
    localStorage.setItem(
      'chocogest_quitacoes_cartao',
      JSON.stringify([
        {
          id: 1,
          data: '2026-08-10',
          cartao: 'Visa Teste',
          compraId: 1,
          valor: 400,
          origem: 'caixa',
          descricao: 'Quitação parcial',
        },
      ])
    );
  });

  await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction(() => !document.body.innerText.includes('Carregando'), {
    timeout: 15000,
  });

  const dashboard = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('main .text-amber-300.text-sm')].map((el) => {
      const parent = el.parentElement;
      const value = parent?.querySelector('.text-xl')?.textContent?.trim() ?? '';
      const detalhe = parent?.querySelector('.text-xs')?.textContent?.trim() ?? '';
      return { label: el.textContent?.trim(), value, detalhe };
    });
    const labels = cards.map((c) => c.label);
    return {
      title: document.body.innerText.includes('Dashboard'),
      emprestimos: cards.find((c) => c.label === 'Empréstimos'),
      caixa: cards.find((c) => c.label === 'Saldo Caixa'),
      banco: cards.find((c) => c.label === 'Saldo Banco'),
      patrimonio: cards.find((c) => c.label === 'Patrimônio'),
      labels,
      text: document.body.innerText.slice(0, 2500),
    };
  });

  assert(dashboard.title, 'Dashboard visível');
  assert(!!dashboard.emprestimos, 'Card Empréstimos presente');
  assert(
    dashboard.emprestimos?.value?.includes('1.100,00') ||
      dashboard.emprestimos?.value?.includes('1100,00'),
    `Saldo em aberto esperado R$ 1.100,00, veio: ${dashboard.emprestimos?.value}`
  );
  assert(
    dashboard.emprestimos?.detalhe?.includes('2 em aberto'),
    `Detalhe deveria citar 2 em aberto, veio: ${dashboard.emprestimos?.detalhe}`
  );
  assert(
    dashboard.emprestimos?.detalhe?.includes('1.500,00') ||
      dashboard.emprestimos?.detalhe?.includes('1500,00'),
    `Detalhe deveria citar total emprestado R$ 1.500,00, veio: ${dashboard.emprestimos?.detalhe}`
  );
  assert(!!dashboard.caixa, 'Card Saldo Caixa ainda presente');
  assert(!!dashboard.banco, 'Card Saldo Banco ainda presente');
  assert(!!dashboard.patrimonio, 'Card Patrimônio ainda presente');

  // Cartões tab: saldo visível
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const cartoes = btns.find((b) => (b.textContent || '').includes('Cartões'));
    cartoes?.click();
  });
  await page.waitForFunction(
    () => document.body.innerText.includes('Cartões — empréstimos e quitações'),
    { timeout: 8000 }
  );

  const cartoes = await page.evaluate(() => document.body.innerText);
  assert(cartoes.includes('Saldo devedor'), 'Aba Cartões carrega saldo devedor');
  assert(
    cartoes.includes('1.100,00') || cartoes.includes('1100,00'),
    'Aba Cartões mostra o mesmo saldo de R$ 1.100,00'
  );

  // Back to dashboard
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const dash = btns.find((b) => (b.textContent || '').includes('Dashboard'));
    dash?.click();
  });
  await page.waitForFunction(() => document.body.innerText.includes('Valor Potencial Venda'), {
    timeout: 8000,
  });

  // Mobile layout
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.waitForFunction(() => document.body.innerText.includes('Empréstimos'), {
    timeout: 8000,
  });
  const mobile = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('main .text-amber-300.text-sm')].map((el) =>
      el.textContent?.trim()
    );
    return {
      hasEmprestimos: cards.includes('Empréstimos'),
      overflowX: document.body.scrollWidth > document.body.clientWidth + 8,
    };
  });
  assert(mobile.hasEmprestimos, 'Card Empréstimos visível no mobile');
  assert(!mobile.overflowX, 'Sem overflow horizontal no mobile');

  console.log(
    JSON.stringify(
      {
        emprestimos: dashboard.emprestimos,
        labels: dashboard.labels,
        mobile,
      },
      null,
      2
    )
  );
} catch (e) {
  fails.push(e.message);
} finally {
  await browser.close();
}

if (fails.length) {
  console.error('FALHOU:\n' + fails.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}

console.log('✓ Dashboard mostra valor total de empréstimo');
