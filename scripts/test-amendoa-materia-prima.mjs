/** Verifica que Amêndoa Torrada entra no estoque como matéria-prima. */

const CADEIA = ['Amêndoa Torrada', 'Nibs', 'Casca', 'Licor de Cacau'];
const ALIASES_MATERIA_PRIMA = new Set(['amêndoa torrada', 'amendoa torrada']);

function ehMateriaPrimaCadeia(nome) {
  return ALIASES_MATERIA_PRIMA.has(nome.trim().toLowerCase());
}

function ehProdutoGeradoCadeia(nome) {
  const key = nome.trim().toLowerCase();
  if (!key || ehMateriaPrimaCadeia(key)) return false;
  return CADEIA.some((p) => p.toLowerCase() === key);
}

function tipoEstoqueCadeia(nome, fallback = 'ProdutoAcabado') {
  if (ehMateriaPrimaCadeia(nome)) return 'MateriaPrima';
  if (ehProdutoGeradoCadeia(nome)) return 'ProdutoAcabado';
  return fallback ?? 'MateriaPrima';
}

function tipoCadeiaFixo(nome) {
  if (ehMateriaPrimaCadeia(nome)) return 'MateriaPrima';
  if (ehProdutoGeradoCadeia(nome)) return 'ProdutoAcabado';
  return null;
}

function filtrarSaldoMateriaPrima(saldo) {
  return saldo.filter((s) => s.tipo === 'MateriaPrima');
}

function filtrarSaldoProdutosGerados(saldo, nomesProduzidos) {
  return saldo.filter(
    (s) =>
      s.tipo !== 'MateriaPrima' &&
      !ehMateriaPrimaCadeia(s.nome) &&
      nomesProduzidos.has(s.nome.toLowerCase())
  );
}

function catalogoProdutosProduzidos(saldo, nomesProduzidos) {
  return saldo.filter((s) => nomesProduzidos.has(s.nome.toLowerCase()) && s.quantidade > 0);
}

function totalizarProdutosPrecificados(saldo, producoes, precosGerados) {
  const nomesCatalogo = [];
  const nomesSet = new Set();
  for (const p of producoes) {
    for (const prod of p.produtos ?? [{ nome: p.produto }]) {
      const nome = (prod.nome ?? '').trim();
      if (!nome) continue;
      const key = nome.toLowerCase();
      if (!nomesSet.has(key)) {
        nomesSet.add(key);
        nomesCatalogo.push(nome);
      }
    }
  }
  const saldos = catalogoProdutosProduzidos(saldo, nomesSet);
  const mapaSaldo = new Map(saldos.map((s) => [s.nome.toLowerCase(), s]));
  const nomes = new Set(nomesSet);
  for (const s of saldos) nomes.add(s.nome.toLowerCase());

  return Array.from(nomes)
    .map((key) => {
      const saldoItem = mapaSaldo.get(key);
      const produto = saldoItem?.nome ?? nomesCatalogo.find((n) => n.toLowerCase() === key) ?? key;
      const ultimoPreco = precosGerados.find((p) => p.produto.toLowerCase() === key);
      return {
        produto,
        quantidade: saldoItem?.quantidade ?? 0,
        precoSugerido: ultimoPreco?.precoSugerido ?? null,
      };
    })
    .filter((i) => i.quantidade > 0 || i.precoSugerido !== null);
}

function resolverTipoIngredienteProducao(ingrediente, nomesProduzidos) {
  return tipoEstoqueCadeia(
    ingrediente.nome,
    ingrediente.tipo ?? (nomesProduzidos.has(ingrediente.nome.toLowerCase()) ? 'ProdutoAcabado' : 'MateriaPrima')
  );
}

const fails = [];
function assert(cond, msg) {
  if (!cond) fails.push(msg);
}

assert(ehMateriaPrimaCadeia('Amêndoa Torrada'), 'nome com acento é matéria-prima da cadeia');
assert(ehMateriaPrimaCadeia('amendoa torrada'), 'nome sem acento é matéria-prima da cadeia');
assert(!ehProdutoGeradoCadeia('Amêndoa Torrada'), 'não é produto gerado');
assert(!ehProdutoGeradoCadeia('amendoa torrada'), 'alias sem acento não é produto gerado');
assert(tipoEstoqueCadeia('Amêndoa Torrada', 'ProdutoAcabado') === 'MateriaPrima', 'entra no estoque como matéria-prima');
assert(tipoEstoqueCadeia('Amendoa de Cacau', 'MateriaPrima') === 'MateriaPrima', 'amêndoa crua permanece matéria-prima');
assert(tipoEstoqueCadeia('Nibs') === 'ProdutoAcabado', 'Nibs permanece produto gerado');
assert(tipoCadeiaFixo('Amêndoa Torrada') === 'MateriaPrima', 'categoria trava em matéria-prima');
assert(tipoCadeiaFixo('Nibs') === 'ProdutoAcabado', 'Nibs continua travado como produto gerado');
assert(tipoCadeiaFixo('Açúcar') === null, 'item fora da cadeia não trava categoria');

const saldo = [
  { nome: 'Amendoa de Cacau', tipo: 'MateriaPrima' },
  { nome: 'Amêndoa Torrada', tipo: 'MateriaPrima' },
  { nome: 'Nibs', tipo: 'ProdutoAcabado' },
];
const nomesProduzidos = new Set(['amêndoa torrada', 'nibs']);

const mp = filtrarSaldoMateriaPrima(saldo).map((s) => s.nome);
const pg = filtrarSaldoProdutosGerados(saldo, nomesProduzidos).map((s) => s.nome);

assert(mp.includes('Amêndoa Torrada'), 'Amêndoa Torrada vai para matérias-primas');
assert(!pg.includes('Amêndoa Torrada'), 'Amêndoa Torrada não aparece em produtos gerados');
assert(pg.includes('Nibs'), 'Nibs permanece em produtos gerados');

const legado = { nome: 'Amêndoa Torrada', tipo: 'ProdutoAcabado' };
const normalizado = { ...legado, tipo: tipoEstoqueCadeia(legado.nome, legado.tipo) };
assert(normalizado.tipo === 'MateriaPrima', 'lançamento legado como produto gerado volta a matéria-prima');

assert(
  resolverTipoIngredienteProducao({ nome: 'Amêndoa Torrada' }, nomesProduzidos) === 'MateriaPrima',
  'na produção a torrada é baixada como matéria-prima mesmo se já foi produzida'
);
assert(
  resolverTipoIngredienteProducao({ nome: 'Nibs' }, nomesProduzidos) === 'ProdutoAcabado',
  'Nibs continua insumo intermediário'
);

const saldoComQuantidade = [
  { nome: 'Amendoa de Cacau', tipo: 'MateriaPrima', quantidade: 20, unidade: 'kg' },
  { nome: 'Amêndoa Torrada', tipo: 'MateriaPrima', quantidade: 12.5, unidade: 'kg' },
  { nome: 'Nibs', tipo: 'ProdutoAcabado', quantidade: 8, unidade: 'kg' },
];
const dashboardSaldos = catalogoProdutosProduzidos(saldoComQuantidade, nomesProduzidos);
assert(
  dashboardSaldos.some((s) => s.nome === 'Amêndoa Torrada' && s.quantidade === 12.5),
  'produtos produzidos no dashboard incluem quantidade da Amêndoa Torrada'
);
assert(
  !dashboardSaldos.some((s) => s.nome === 'Amendoa de Cacau'),
  'amêndoa crua (só compra) não entra em produtos produzidos'
);

const resumo = totalizarProdutosPrecificados(
  saldoComQuantidade,
  [
    {
      produto: 'Amêndoa Torrada',
      produtos: [{ nome: 'Amêndoa Torrada', quantidade: 12.5, unidade: 'kg' }],
    },
    { produto: 'Nibs', produtos: [{ nome: 'Nibs', quantidade: 8, unidade: 'kg' }] },
  ],
  [{ produto: 'Amêndoa Torrada', precoSugerido: 80 }]
);
const torrada = resumo.find((i) => i.produto === 'Amêndoa Torrada');
assert(torrada, 'Amêndoa Torrada aparece no resumo de precificação do dashboard');
assert(torrada?.quantidade === 12.5, 'quantidade da Amêndoa Torrada não some no dashboard');

if (fails.length) {
  console.error('FALHOU:\n' + fails.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}

console.log('✓ Amêndoa Torrada relacionada no estoque como matéria-prima');
