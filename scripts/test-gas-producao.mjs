/** Gás de cozinha entra no custo da produção e não na perda de massa. */

function normalizarNomeItem(nome) {
  return nome
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const ALIASES_ENERGIA = new Set([
  'gas',
  'gas de cozinha',
  'gas cozinha',
  'glp',
  'botijao',
  'botijao de gas',
  'botijao 13kg',
  'botijao p13',
  'gas glp',
]);

function ehInsumoEnergia(nome) {
  const key = normalizarNomeItem(nome);
  if (!key) return false;
  if (ALIASES_ENERGIA.has(key)) return true;
  if (key.includes('gas de cozinha') || key.includes('gas cozinha')) return true;
  if (/\bbotijao\b/.test(key)) return true;
  if (/\bglp\b/.test(key)) return true;
  return /^gas\b/.test(key);
}

const ALIASES_MATERIA_PRIMA = new Set(['amêndoa torrada', 'amendoa torrada']);
const CADEIA = ['Amêndoa Torrada', 'Nibs', 'Casca', 'Licor de Cacau'];

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
  if (ehInsumoEnergia(nome)) return 'Energia';
  return fallback ?? 'MateriaPrima';
}

function tipoCadeiaFixo(nome) {
  if (ehMateriaPrimaCadeia(nome)) return 'MateriaPrima';
  if (ehProdutoGeradoCadeia(nome)) return 'ProdutoAcabado';
  if (ehInsumoEnergia(nome)) return 'Energia';
  return null;
}

function ehInsumoCustoProducao(ingrediente) {
  if (ehInsumoEnergia(ingrediente.nome)) return true;
  return ingrediente.tipo === 'Energia';
}

function ingredientesMassaProducao(ingredientes) {
  return ingredientes.filter((ing) => !ehInsumoCustoProducao(ing));
}

function insumosEnergiaProducao(ingredientes) {
  return ingredientes.filter((ing) => ehInsumoCustoProducao(ing));
}

function custoItensProducao(itens) {
  return itens.reduce((acc, i) => acc + i.quantidade * i.valorUnit, 0);
}

function totalEntradaIngredientes(ingredientes) {
  const massa = ingredientesMassaProducao(ingredientes);
  if (massa.length === 0) return null;
  const unidade = massa[0].unidade ?? 'kg';
  for (const ing of massa) {
    const u = ing.unidade ?? 'kg';
    if (u.toLowerCase() !== unidade.toLowerCase()) return null;
  }
  const total = massa.reduce((acc, ing) => acc + ing.quantidade, 0);
  return { total, unidade };
}

function arredondarQuantidade(valor) {
  return Math.round(valor * 1000) / 1000;
}

function calcularPerdaProducao(producao) {
  const entradaInfo = totalEntradaIngredientes(producao.ingredientes);
  if (!entradaInfo || entradaInfo.total <= 0) return null;
  const saida = arredondarQuantidade(
    producao.produtos.reduce((acc, p) => acc + p.quantidade, 0)
  );
  const perdaQuantidade = arredondarQuantidade(Math.max(0, entradaInfo.total - saida));
  const perdaPercentual =
    entradaInfo.total > 0
      ? arredondarQuantidade((perdaQuantidade / entradaInfo.total) * 100)
      : 0;
  return {
    entrada: entradaInfo.total,
    unidade: entradaInfo.unidade,
    saida,
    perdaQuantidade,
    perdaPercentual,
  };
}

function alocarCustoEntreProdutos(custoTotal, produtos) {
  const totalQtd = produtos.reduce((acc, p) => acc + p.quantidade, 0);
  if (totalQtd <= 0) return produtos.map((p) => ({ ...p, custoAlocado: 0 }));
  return produtos.map((p) => ({
    ...p,
    custoAlocado: arredondarQuantidade((custoTotal * p.quantidade) / totalQtd),
  }));
}

function ingredientesProducaoDisponiveis(estoque) {
  return estoque.filter((s) => {
    if (s.quantidade <= 0) return false;
    if (s.tipo === 'MateriaPrima' || s.tipo === 'Energia') return true;
    return s.tipo === 'ProdutoAcabado';
  });
}

const fails = [];
function assert(cond, msg) {
  if (!cond) fails.push(msg);
}

assert(ehInsumoEnergia('Gás de Cozinha'), 'reconhece Gás de Cozinha');
assert(ehInsumoEnergia('gas de cozinha'), 'reconhece sem acento');
assert(ehInsumoEnergia('GLP'), 'reconhece GLP');
assert(ehInsumoEnergia('Botijão P13'), 'reconhece botijão');
assert(ehInsumoEnergia('Gás'), 'reconhece Gás');
assert(!ehInsumoEnergia('Amendoa de Cacau'), 'amêndoa não é energia');
assert(!ehInsumoEnergia('Nibs'), 'nibs não é energia');

assert(tipoEstoqueCadeia('Gás de Cozinha', 'MateriaPrima') === 'Energia', 'trava tipo Energia mesmo se lançado como matéria-prima');
assert(tipoCadeiaFixo('Gás de Cozinha') === 'Energia', 'categoria do gás fica travada');
assert(tipoCadeiaFixo('Açúcar') === null, 'açúcar continua livre');

const ingredientes = [
  { nome: 'Amendoa de Cacau', quantidade: 10, valorUnit: 40, unidade: 'kg', tipo: 'MateriaPrima' },
  { nome: 'Gás de Cozinha', quantidade: 0.5, valorUnit: 12, unidade: 'kg', tipo: 'Energia' },
];

assert(ingredientesMassaProducao(ingredientes).length === 1, 'massa ignora o gás');
assert(insumosEnergiaProducao(ingredientes).length === 1, 'isola o gás');
assert(custoItensProducao(ingredientes) === 10 * 40 + 0.5 * 12, 'custo total inclui gás');

const entrada = totalEntradaIngredientes(ingredientes);
assert(entrada && entrada.total === 10, 'entrada de perda é só a amêndoa (10 kg)');
assert(entrada.unidade === 'kg', 'unidade da perda é kg');

const perda = calcularPerdaProducao({
  ingredientes,
  produtos: [{ nome: 'Amêndoa Torrada', quantidade: 8.5, unidade: 'kg' }],
});
assert(perda && perda.entrada === 10, 'perda usa 10 kg de entrada');
assert(perda.saida === 8.5, 'saída 8,5 kg');
assert(perda.perdaQuantidade === 1.5, 'perda 1,5 kg (gás não infla a entrada)');
assert(perda.perdaPercentual === 15, 'perda 15%');

const alocado = alocarCustoEntreProdutos(custoItensProducao(ingredientes), [
  { nome: 'Amêndoa Torrada', quantidade: 8.5, unidade: 'kg' },
]);
assert(alocado[0].custoAlocado === 406, 'custo do produto inclui R$ 6 de gás (400 + 6)');

const semTipo = [
  { nome: 'Amendoa de Cacau', quantidade: 2, valorUnit: 40, unidade: 'kg' },
  { nome: 'Gás de Cozinha', quantidade: 0.2, valorUnit: 10, unidade: 'kg' },
];
assert(totalEntradaIngredientes(semTipo)?.total === 2, 'gás sem tipo no lançamento ainda é excluído da perda pelo nome');

const soGas = [{ nome: 'Gás de Cozinha', quantidade: 1, valorUnit: 12, unidade: 'kg', tipo: 'Energia' }];
assert(totalEntradaIngredientes(soGas) === null, 'só gás não calcula perda');

const estoque = [
  { nome: 'Amendoa de Cacau', tipo: 'MateriaPrima', quantidade: 20, unidade: 'kg' },
  { nome: 'Gás de Cozinha', tipo: 'Energia', quantidade: 13, unidade: 'kg' },
  { nome: 'Nibs', tipo: 'ProdutoAcabado', quantidade: 4, unidade: 'kg' },
];
const disponiveis = ingredientesProducaoDisponiveis(estoque).map((s) => s.nome);
assert(disponiveis.includes('Gás de Cozinha'), 'gás com saldo aparece na produção');
assert(disponiveis.includes('Amendoa de Cacau'), 'amêndoa continua disponível');

const legadoComoMateriaPrima = { nome: 'Gás de Cozinha', tipo: tipoEstoqueCadeia('Gás de Cozinha', 'MateriaPrima') };
assert(legadoComoMateriaPrima.tipo === 'Energia', 'backup antigo de gás como matéria-prima vira Energia');

if (fails.length) {
  console.error('FALHOU:\n' + fails.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}

console.log('✓ Gás de cozinha entra no custo da produção e fica fora da perda');
