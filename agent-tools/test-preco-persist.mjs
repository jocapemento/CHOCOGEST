import puppeteer from 'puppeteer-core';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await puppeteer.launch({
  executablePath: edge,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();

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
  localStorage.setItem('chocogest_precos', JSON.stringify([]));
});
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction(() => !document.body.innerText.includes('Carregando ChocoGest'), {
  timeout: 15000,
});

await page.evaluate(() => {
  const buttons = [...document.querySelectorAll('button')];
  buttons.find((b) => b.textContent?.includes('Precificação'))?.click();
});
await new Promise((r) => setTimeout(r, 300));

await page.evaluate(() => {
  const s = [...document.querySelectorAll('select')].find((el) =>
    [...el.options].some((o) => o.value === 'Nibs')
  );
  s.value = 'Nibs';
  s.dispatchEvent(new Event('change', { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 200));

page.on('dialog', async (d) => {
  await d.accept();
});

// Register three prices with different margins
for (const margem of [30, 40, 50]) {
  await page.evaluate((m) => {
    const inputs = [...document.querySelectorAll('input[type="number"]')];
    // first number input in precificacao should be margem
    const margemInput = inputs.find((i) => i.value !== '' && Number(i.value) >= 0);
    if (margemInput) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(margemInput, String(m));
      margemInput.dispatchEvent(new Event('input', { bubbles: true }));
      margemInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, margem);
  await new Promise((r) => setTimeout(r, 150));
  await page.evaluate(() => {
    [...document.querySelectorAll('button')]
      .find((b) => b.textContent?.includes('Registrar preço'))
      ?.click();
  });
  await new Promise((r) => setTimeout(r, 400));
}

let stored = await page.evaluate(() => localStorage.getItem('chocogest_precos'));
console.log('after 3 registers:', stored);
console.log('count:', JSON.parse(stored || '[]').length);

// Reload several times — history should persist
for (let i = 0; i < 3; i++) {
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(() => !document.body.innerText.includes('Carregando ChocoGest'), {
    timeout: 15000,
  });
  stored = await page.evaluate(() => localStorage.getItem('chocogest_precos'));
  console.log(`reload ${i + 1} count:`, JSON.parse(stored || '[]').length);
}

await page.evaluate(() => {
  const buttons = [...document.querySelectorAll('button')];
  buttons.find((b) => b.textContent?.includes('Precificação'))?.click();
});
await new Promise((r) => setTimeout(r, 400));
const text = await page.evaluate(() => document.body.innerText);
const hist = text.slice(text.indexOf('Histórico'), text.indexOf('Histórico') + 900);
console.log('history after reloads:\n', hist);

await browser.close();
