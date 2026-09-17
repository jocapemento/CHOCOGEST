/** Embalagem entra no custo da produção e não na perda de massa — mesmo modelo do gás. */

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

const ALIASES_EMBALAGEM = new Set([
  'embalagem',
  'embalagens',
  'rotulo',
  'rotulos',
  'etiqueta',
  'etiquetas',
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

function ehInsumoEmbalagem(nome) {
  const key = normalizarNomeItem(nome);
  if (!key) return false;
  if (ALIASES_EMBALAGEM.has(key)) return true;
  return key.includes('embalagem');
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
  if (ehInsumoEmbalagem(nome)) return 'Embalagem';
  return fallback ?? 'MateriaPrima';
}

function tipoCadeiaFixo(nome) {
  if (ehMateriaPrimaCadeia(nome)) return 'MateriaPrima';
  if (ehProdutoGeradoCadeia(nome)) return 'ProdutoAcabado';
  if (ehInsumoEnergia(nome)) return 'Energia';
  if (ehInsumoEmbalagem(nome)) return 'Embalagem';
  return null;
}

function ehInsumoEnergiaProducao(ingrediente) {
  if (ehInsumoEnergia(ingrediente.nome)) return true;
  return ingrediente.tipo === 'Energia';
}

function ehInsumoEmbalagemProducao(ingrediente) {
  if (ehInsumoEmbalagem(ingrediente.nome)) return true;
  return ingrediente.tipo === 'Embalagem';
}

function ehInsumoCustoProducao(ingrediente) {
  return ehInsumoEnergiaProducao(ingrediente) || ehInsumoEmbalagemProducao(ingrediente);
}

function ingredientesMassaProducao(ingredientes) {
  return ingredientes.filter((ing) => !ehInsumoCustoProducao(ing));
}

function insumosEnergiaProducao(ingredientes) {
  return ingredientes.filter((ing) => ehInsumoEnergiaProducao(ing));
}

function insumosEmbalagemProducao(ingredientes) {
  return ingredientes.filter((ing) => ehInsumoEmbalagemProducao(ing));
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
    if (s.tipo === 'MateriaPrima' || s.tipo === 'Energia' || s.tipo === 'Embalagem') return true;
    return s.tipo === 'ProdutoAcabado';
  });
}

const fails = [];
function assert(cond, msg) {
  if (!cond) fails.push(msg);
}

assert(ehInsumoEmbalagem('Embalagem'), 'reconhece Embalagem');
assert(ehInsumoEmbalagem('embalagens'), 'reconhece plural');
assert(ehInsumoEmbalagem('Embalagem Kraft'), 'reconhece nome composto');
assert(ehInsumoEmbalagem('Rótulo'), 'reconhece Rótulo');
assert(ehInsumoEmbalagem('Etiqueta'), 'reconhece Etiqueta');
assert(!ehInsumoEmbalagem('Amendoa de Cacau'), 'amêndoa não é embalagem');
assert(!ehInsumoEmbalagem('Nibs'), 'nibs não é embalagem');
assert(!ehInsumoEmbalagem('Gás de Cozinha'), 'gás não é embalagem');
assert(!ehInsumoEmbalagem('Caixa 50g'), 'caixa com nome próprio não trava sozinha');

assert(
  tipoEstoqueCadeia('Embalagem Kraft', 'MateriaPrima') === 'Embalagem',
  'trava tipo Embalagem mesmo se lançado como matéria-prima'
);
assert(tipoCadeiaFixo('Embalagem') === 'Embalagem', 'categoria de Embalagem fica travada');
assert(tipoCadeiaFixo('Rótulo') === 'Embalagem', 'rótulo trava como Embalagem');
assert(tipoCadeiaFixo('Caixa 50g') === null, 'caixa continua livre para o usuário escolher');
assert(tipoEstoqueCadeia('Caixa 50g', 'Embalagem') === 'Embalagem', 'caixa comprada como Embalagem permanece Embalagem');
assert(tipoCadeiaFixo('Açúcar') === null, 'açúcar continua livre');

const ingredientes = [
  { nome: 'Licor de Cacau', quantidade: 2, valorUnit: 80, unidade: 'kg', tipo: 'ProdutoAcabado' },
  { nome: 'Caixa 50g', quantidade: 40, valorUnit: 0.5, unidade: 'un', tipo: 'Embalagem' },
];

assert(ingredientesMassaProducao(ingredientes).length === 1, 'massa ignora a embalagem');
assert(insumosEmbalagemProducao(ingredientes).length === 1, 'isola a embalagem');
assert(insumosEnergiaProducao(ingredientes).length === 0, 'embalagem não conta como gás');
assert(custoItensProducao(ingredientes) === 2 * 80 + 40 * 0.5, 'custo total inclui embalagem');

const entrada = totalEntradaIngredientes(ingredientes);
assert(entrada && entrada.total === 2, 'entrada de perda é só o licor (2 kg)');
assert(entrada.unidade === 'kg', 'unidade da perda é kg, não un da caixa');

const perda = calcularPerdaProducao({
  ingredientes,
  produtos: [{ nome: 'Chocolate 70%', quantidade: 1.8, unidade: 'kg' }],
});
assert(perda && perda.entrada === 2, 'perda usa 2 kg de entrada');
assert(perda.saida === 1.8, 'saída 1,8 kg');
assert(perda.perdaQuantidade === 0.2, 'perda 0,2 kg (embalagem não infla a entrada)');
assert(perda.perdaPercentual === 10, 'perda 10%');

const alocado = alocarCustoEntreProdutos(custoItensProducao(ingredientes), [
  { nome: 'Chocolate 70%', quantidade: 1.8, unidade: 'kg' },
]);
assert(alocado[0].custoAlocado === 180, 'custo do produto inclui R$ 20 de embalagem (160 + 20)');

const semTipo = [
  { nome: 'Licor de Cacau', quantidade: 1, valorUnit: 80, unidade: 'kg' },
  { nome: 'Embalagem Kraft', quantidade: 10, valorUnit: 0.4, unidade: 'un' },
];
assert(totalEntradaIngredientes(semTipo)?.total === 1, 'embalagem sem tipo no lançamento ainda é excluída da perda pelo nome');

const soEmbalagem = [
  { nome: 'Caixa 50g', quantidade: 10, valorUnit: 0.5, unidade: 'un', tipo: 'Embalagem' },
];
assert(totalEntradaIngredientes(soEmbalagem) === null, 'só embalagem não calcula perda');

const comGasEEmbalagem = [
  { nome: 'Amendoa de Cacau', quantidade: 10, valorUnit: 40, unidade: 'kg', tipo: 'MateriaPrima' },
  { nome: 'Gás de Cozinha', quantidade: 0.5, valorUnit: 12, unidade: 'kg', tipo: 'Energia' },
  { nome: 'Caixa 50g', quantidade: 20, valorUnit: 0.5, unidade: 'un', tipo: 'Embalagem' },
];
assert(ingredientesMassaProducao(comGasEEmbalagem).length === 1, 'massa ignora gás e embalagem');
assert(insumosEnergiaProducao(comGasEEmbalagem).length === 1, 'isola só o gás');
assert(insumosEmbalagemProducao(comGasEEmbalagem).length === 1, 'isola só a embalagem');
assert(
  custoItensProducao(comGasEEmbalagem) === 10 * 40 + 0.5 * 12 + 20 * 0.5,
  'custo total soma matéria-prima + gás + embalagem'
);
assert(totalEntradaIngredientes(comGasEEmbalagem)?.total === 10, 'perda continua só com a massa');

const estoque = [
  { nome: 'Licor de Cacau', tipo: 'ProdutoAcabado', quantidade: 5, unidade: 'kg' },
  { nome: 'Caixa 50g', tipo: 'Embalagem', quantidade: 200, unidade: 'un' },
  { nome: 'Gás de Cozinha', tipo: 'Energia', quantidade: 13, unidade: 'kg' },
];
const disponiveis = ingredientesProducaoDisponiveis(estoque).map((s) => s.nome);
assert(disponiveis.includes('Caixa 50g'), 'embalagem com saldo aparece na produção');
assert(disponiveis.includes('Gás de Cozinha'), 'gás continua disponível');
assert(disponiveis.includes('Licor de Cacau'), 'produto intermediário continua disponível');

const legadoComoMateriaPrima = {
  nome: 'Embalagem Kraft',
  tipo: tipoEstoqueCadeia('Embalagem Kraft', 'MateriaPrima'),
};
assert(legadoComoMateriaPrima.tipo === 'Embalagem', 'backup antigo de embalagem como matéria-prima vira Embalagem');

if (fails.length) {
  console.error('FALHOU:\n' + fails.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}

console.log('✓ Embalagem entra no custo da produção e fica fora da perda');
