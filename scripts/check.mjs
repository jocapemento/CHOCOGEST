import { execSync } from 'node:child_process';

process.env.GITHUB_PAGES = 'true';

console.log('1/15 Teste FIFO estoque...');
execSync('node scripts/test-fifo.mjs', { stdio: 'inherit' });

console.log('2/15 Amêndoa Torrada como matéria-prima...');
execSync('node scripts/test-amendoa-materia-prima.mjs', { stdio: 'inherit' });

console.log('3/15 Quebra Amêndoa Torrada (Nibs + Casca)...');
execSync('node scripts/test-quebra-amendoa.mjs', { stdio: 'inherit' });

console.log('4/15 Gás de cozinha na produção...');
execSync('node scripts/test-gas-producao.mjs', { stdio: 'inherit' });

console.log('5/15 Embalagem na produção...');
execSync('node scripts/test-embalagem-producao.mjs', { stdio: 'inherit' });

console.log('6/15 Compra parcelada no cartão...');
execSync('node scripts/test-cartao-parcelas.mjs', { stdio: 'inherit' });

console.log('7/15 Empréstimo e quitação...');
execSync('node scripts/test-emprestimo-quitacao.mjs', { stdio: 'inherit' });

console.log('8/15 Desconto em vendas...');
execSync('node scripts/test-venda-desconto.mjs', { stdio: 'inherit' });

console.log('9/15 Entrega e pago em vendas...');
execSync('node scripts/test-venda-entrega-pago.mjs', { stdio: 'inherit' });

console.log('10/15 Produtos mais vendidos...');
execSync('node scripts/test-produtos-mais-vendidos.mjs', { stdio: 'inherit' });

console.log('11/15 Backup no Google Drive...');
execSync('node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/test-google-drive.mjs', { stdio: 'inherit' });

console.log('12/15 Fracionar peso em unidades...');
execSync('node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/register-ts-ext.mjs scripts/test-fracionar-producao.mjs', { stdio: 'inherit' });

console.log('13/15 Custo de estoque devolvido pela venda...');
execSync('node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/register-ts-ext.mjs scripts/test-custo-devolucao-venda.mjs', { stdio: 'inherit' });

console.log('14/15 ESLint...');
execSync('npm run lint', { stdio: 'inherit' });

console.log('15/15 Build GitHub Pages...');
execSync('npm run build:pages', { stdio: 'inherit', env: process.env });

console.log('\n✓ Tudo OK — pode fazer git push');
