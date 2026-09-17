import { execSync } from 'node:child_process';

process.env.GITHUB_PAGES = 'true';

console.log('1/10 Teste FIFO estoque...');
execSync('node scripts/test-fifo.mjs', { stdio: 'inherit' });

console.log('2/10 Amêndoa Torrada como matéria-prima...');
execSync('node scripts/test-amendoa-materia-prima.mjs', { stdio: 'inherit' });

console.log('3/10 Quebra Amêndoa Torrada (Nibs + Casca)...');
execSync('node scripts/test-quebra-amendoa.mjs', { stdio: 'inherit' });

console.log('4/10 Gás de cozinha na produção...');
execSync('node scripts/test-gas-producao.mjs', { stdio: 'inherit' });

console.log('5/10 Embalagem na produção...');
execSync('node scripts/test-embalagem-producao.mjs', { stdio: 'inherit' });

console.log('6/10 Compra parcelada no cartão...');
execSync('node scripts/test-cartao-parcelas.mjs', { stdio: 'inherit' });

console.log('7/10 Empréstimo e quitação...');
execSync('node scripts/test-emprestimo-quitacao.mjs', { stdio: 'inherit' });

console.log('8/10 Desconto em vendas...');
execSync('node scripts/test-venda-desconto.mjs', { stdio: 'inherit' });

console.log('9/10 ESLint...');
execSync('npm run lint', { stdio: 'inherit' });

console.log('10/10 Build GitHub Pages...');
execSync('npm run build:pages', { stdio: 'inherit', env: process.env });

console.log('\n✓ Tudo OK — pode fazer git push');