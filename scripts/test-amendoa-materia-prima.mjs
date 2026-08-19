/** Verifica que Amêndoa Torrada é produto gerado relacionado no estoque. */

const CADEIA = ['Amêndoa Torrada', 'Nibs', 'Casca', 'Licor de Cacau'];
const ALIASES = new Set(['amendoa torrada']);

function ehProdutoGeradoCadeia(nome) {
  const key = nome.trim().toLowerCase();
  if (!key) return false;
  if (ALIASES.has(key)) return true;
  return CADEIA.some((p) => p.toLowerCase() === key);
}

function tipoEstoqueCadeia(nome, fallback = 'ProdutoAcabado') {
  if (ehProdutoGeradoCadeia(nome)) return 'ProdutoAcabado';
  return fallback ?? 'MateriaPrima';
}

function filtrarSaldoMateriaPrima(saldo) {
  return saldo.filter((s) => s.tipo === 'MateriaPrima');
}

function filtrarSaldoProdutosGerados(saldo, nomesProduzidos) {
  return saldo.filter((s) => nomesProduzidos.has(s.nome.toLowerCase()));
}

const fails = [];
function assert(cond, msg) {
  if (!cond) fails.push(msg);
}

assert(ehProdutoGeradoCadeia('Amêndoa Torrada'), 'nome com acento é produto gerado');
assert(ehProdutoGeradoCadeia('amendoa torrada'), 'nome sem acento é produto gerado');
assert(tipoEstoqueCadeia('Amêndoa Torrada', 'MateriaPrima') === 'ProdutoAcabado', 'entra no estoque como produto gerado');
assert(tipoEstoqueCadeia('Amendoa de Cacau', 'MateriaPrima') === 'MateriaPrima', 'amêndoa crua permanece matéria-prima');

const saldo = [
  { nome: 'Amendoa de Cacau', tipo: 'MateriaPrima' },
  { nome: 'Amêndoa Torrada', tipo: 'ProdutoAcabado' },
  { nome: 'Nibs', tipo: 'ProdutoAcabado' },
];
const nomesProduzidos = new Set(['amêndoa torrada', 'nibs']);

const mp = filtrarSaldoMateriaPrima(saldo).map((s) => s.nome);
const pg = filtrarSaldoProdutosGerados(saldo, nomesProduzidos).map((s) => s.nome);

assert(!mp.includes('Amêndoa Torrada'), 'Amêndoa Torrada não vai para matérias-primas');
assert(pg.includes('Amêndoa Torrada'), 'Amêndoa Torrada aparece em produtos gerados');
assert(pg.includes('Nibs'), 'Nibs permanece em produtos gerados');

const legado = { nome: 'Amêndoa Torrada', tipo: 'MateriaPrima' };
const normalizado = { ...legado, tipo: tipoEstoqueCadeia(legado.nome, legado.tipo) };
assert(normalizado.tipo === 'ProdutoAcabado', 'lançamento legado como MP volta a produto gerado');

if (fails.length) {
  console.error('FALHOU:\n' + fails.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}

console.log('✓ Amêndoa Torrada relacionada no estoque como produto gerado');
