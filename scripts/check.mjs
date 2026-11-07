import { execSync } from 'node:child_process';

process.env.GITHUB_PAGES = 'true';

console.log('1/21 Teste FIFO estoque...');
execSync('node scripts/test-fifo.mjs', { stdio: 'inherit' });

console.log('2/21 Amêndoa Torrada como matéria-prima...');
execSync('node scripts/test-amendoa-materia-prima.mjs', { stdio: 'inherit' });

console.log('3/21 Quebra Amêndoa Torrada (Nibs + Chá de Cacau)...');
execSync('node scripts/test-quebra-amendoa.mjs', { stdio: 'inherit' });

console.log('4/21 Gás de cozinha na produção...');
execSync('node scripts/test-gas-producao.mjs', { stdio: 'inherit' });

console.log('5/21 Embalagem na produção...');
execSync('node scripts/test-embalagem-producao.mjs', { stdio: 'inherit' });

console.log('6/21 Compra parcelada no cartão...');
execSync('node scripts/test-cartao-parcelas.mjs', { stdio: 'inherit' });

console.log('7/21 Empréstimo e quitação...');
execSync('node scripts/test-emprestimo-quitacao.mjs', { stdio: 'inherit' });

console.log('8/21 Desconto em vendas...');
execSync('node scripts/test-venda-desconto.mjs', { stdio: 'inherit' });

console.log('9/21 Entrega e pago em vendas...');
execSync(
  'node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/register-ts-ext.mjs scripts/test-venda-entrega-pago.mjs',
  { stdio: 'inherit' }
);

console.log('10/21 Produtos mais vendidos...');
execSync('node scripts/test-produtos-mais-vendidos.mjs', { stdio: 'inherit' });

console.log('11/21 Backup no Google Drive...');
execSync('node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/test-google-drive.mjs', { stdio: 'inherit' });

console.log('12/21 Fracionar peso em unidades...');
execSync('node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/register-ts-ext.mjs scripts/test-fracionar-producao.mjs', { stdio: 'inherit' });

console.log('13/21 Custo de estoque devolvido pela venda...');
execSync('node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/register-ts-ext.mjs scripts/test-custo-devolucao-venda.mjs', { stdio: 'inherit' });

console.log('14/21 Preço da venda igual à precificação...');
execSync('node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/register-ts-ext.mjs scripts/test-preco-venda.mjs', { stdio: 'inherit' });

console.log('15/21 Nome do produto na produção...');
execSync('node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/register-ts-ext.mjs scripts/test-nome-produto-producao.mjs', { stdio: 'inherit' });

console.log('16/21 Alerta de estoque baixo...');
execSync('node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/register-ts-ext.mjs scripts/test-alerta-estoque.mjs', { stdio: 'inherit' });

console.log('17/21 Sugestões de cliente na venda...');
execSync('node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/register-ts-ext.mjs scripts/test-sugestoes-cliente.mjs', { stdio: 'inherit' });

console.log('18/21 Confirmação de recebimento em compras...');
execSync('node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/register-ts-ext.mjs scripts/test-compra-recebimento.mjs', { stdio: 'inherit' });

console.log('19/21 Perda no Nibs e custo do Chá de Cacau...');
execSync(
  'node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./scripts/register-ts-ext.mjs scripts/test-perda-cha-cacau.mjs',
  { stdio: 'inherit' }
);

console.log('20/21 ESLint...');
execSync('npm run lint', { stdio: 'inherit' });

console.log('21/21 Build GitHub Pages...');
execSync('npm run build:pages', { stdio: 'inherit', env: process.env });

console.log('\n✓ Tudo OK — pode fazer git push');
