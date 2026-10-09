import puppeteer from 'puppeteer-core';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await puppeteer.launch({
  executablePath: edge,
  headless: true,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

try {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 20000 });
} catch (e) {
  console.log('DEV_DOWN', e.message);
  await browser.close();
  process.exit(0);
}

await page.waitForFunction(() => !document.body.innerText.includes('Carregando'), {
  timeout: 15000,
});

const metrics = await page.evaluate(() => {
  const body = document.body;
  const main = document.querySelector('main');
  const tabs = [...document.querySelectorAll('nav[aria-label="Módulos"]')];
  const mobileNav = tabs.find((n) => n.className.includes('tabs-scroll') || n.className.includes('lg:hidden'));
  return {
    scrollWidth: body.scrollWidth,
    clientWidth: body.clientWidth,
    overflowX: body.scrollWidth > body.clientWidth + 4,
    mobileTabsVisible: mobileNav ? getComputedStyle(mobileNav).display !== 'none' : false,
    mainPad: main ? getComputedStyle(main).padding : null,
    title: document.querySelector('h1')?.textContent,
    inputFont: (() => {
      const i = document.querySelector('input, select, button');
      return i ? getComputedStyle(i).fontSize : null;
    })(),
  };
});
console.log('mobile-390', metrics);

await page.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find((b) => b.textContent?.includes('Vendas'))
    ?.click();
});
await new Promise((r) => setTimeout(r, 400));
console.log(
  'vendas ok',
  await page.evaluate(() => document.body.innerText.includes('Vendas'))
);

await page.setViewport({ width: 1280, height: 800, isMobile: false });
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction(() => !document.body.innerText.includes('Carregando'), {
  timeout: 15000,
});
const desk = await page.evaluate(() => {
  const aside = document.querySelector('aside');
  const mobileNav = document.querySelector('nav.tabs-scroll, nav[class*="lg:hidden"]');
  return {
    asideVisible: aside ? getComputedStyle(aside).display !== 'none' : false,
    mobileNavHidden: mobileNav ? getComputedStyle(mobileNav).display === 'none' : true,
  };
});
console.log('desktop-1280', desk);

await browser.close();
