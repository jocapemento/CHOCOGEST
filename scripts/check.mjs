import { execSync } from 'node:child_process';

process.env.GITHUB_PAGES = 'true';

console.log('1/18 Teste FIFO estoque...');
execSync('node scripts/test-fifo.mjs', { stdio: 'inherit' });

console.log('2/18 Amêndoa Torrada como matéria-prima...');
execSync('node scripts/test-amendoa-materia-prima.mjs', { stdio: 'inherit' });

console.log('3/18 Quebra Amêndoa Torrada (Nibs + Casca)...');
execSync('node scripts/test-quebra-amendoa.mjs', { stdio: 'inherit' });

console.log('4/18 Gás de cozinha na produção...');
execSync('node scripts/test-gas-producao.mjs', { stdio: 'inherit' });

console.log('5/18 Embalagem na produção...');
execSync('node scripts/test-embalagem-producao.mjs', { stdio: 'inherit' });

console.log('6/18 Compra parcelada no cartão...');
execSync('node scripts/test-cartao-parcelas.mjs', { stdio: 'inherit' });

console.log('7/18 Empréstimo e quitação...');
execSync('node scripts/test-emprestimo-quitacao.mjs', { stdio: 'inherit' });

console.log('8/18 Desconto em vendas...');
execSync('node scripts/test-venda-desconto.mjs', { stdio: 'inherit' });

console.log('9/18 Entrega e pago em vendas...');
execSync('node scripts/test-venda-entrega-pago.mjs', { stdio: 'inherit' });

console.log('10/18 Produtos mais vendidos...');
execSync('node scripts/test-produtos-mais-vendidos.mjs', { stdio: 'inherit' });

console.log('11/18 Backup no Google Drive...');
execSync('node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/test-google-drive.mjs', { stdio: 'inherit' });

console.log('12/18 Fracionar peso em unidades...');
execSync('node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/register-ts-ext.mjs scripts/test-fracionar-producao.mjs', { stdio: 'inherit' });

console.log('13/18 Custo de estoque devolvido pela venda...');
execSync('node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/register-ts-ext.mjs scripts/test-custo-devolucao-venda.mjs', { stdio: 'inherit' });

console.log('14/18 Preço da venda igual à precificação...');
execSync('node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/register-ts-ext.mjs scripts/test-preco-venda.mjs', { stdio: 'inherit' });

console.log('15/18 Alerta de estoque baixo...');
execSync('node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/register-ts-ext.mjs scripts/test-alerta-estoque.mjs', { stdio: 'inherit' });

console.log('16/18 Sugestões de cliente na venda...');
execSync('node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/register-ts-ext.mjs scripts/test-sugestoes-cliente.mjs', { stdio: 'inherit' });

console.log('17/18 ESLint...');
execSync('npm run lint', { stdio: 'inherit' });

console.log('18/18 Build GitHub Pages...');
execSync('npm run build:pages', { stdio: 'inherit', env: process.env });

console.log('\n✓ Tudo OK — pode fazer git push');
