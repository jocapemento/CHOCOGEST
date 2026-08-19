/** Compra no cartão sem nome gravado deve aparecer no cartão cadastrado. */

function semAcento(valor) {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isPagamentoCartao(forma) {
  const n = semAcento(forma ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return n === 'cartao' || n === 'credito' || n === 'cartao de credito' || n === 'cartao credito';
}

function nomesCartaoIguais(a, b) {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
}

const CARTAO_NAO_IDENTIFICADO = 'Não identificado';

function nomeCartaoDaCompra(compra, cartoes = []) {
  const salvo = compra.cartao?.trim();
  if (salvo) {
    const match = cartoes.find((c) => nomesCartaoIguais(c.nome, salvo));
    return (match?.nome ?? salvo).trim();
  }
  if (cartoes.length === 1) return cartoes[0].nome.trim() || cartoes[0].nome;
  if (cartoes.length === 0) return CARTAO_NAO_IDENTIFICADO;
  return CARTAO_NAO_IDENTIFICADO;
}

function resolverCartaoPorId(cartoes, cartaoId) {
  return cartoes.find((c) => c.id === cartaoId) ?? cartoes[0];
}

function calcularParcelasMensais(compras, cartoes = []) {
  const map = new Map();
  for (const compra of compras) {
    if (!isPagamentoCartao(compra.formaPagamento)) continue;
    const cartao = nomeCartaoDaCompra(compra, cartoes);
    if (!cartao) continue;
    map.set(cartao, (map.get(cartao) ?? 0) + compra.total);
  }
  return map;
}

const fails = [];
function assert(cond, msg) {
  if (!cond) fails.push(msg);
}

const cartoes = [{ id: 1782492592840, nome: 'Ourocard' }];
const compra = {
  formaPagamento: 'Cartao',
  cartao: null,
  parcelas: 6,
  total: 9800,
};

assert(nomeCartaoDaCompra(compra, []) === CARTAO_NAO_IDENTIFICADO, 'sem cadastro: não identificado');
assert(nomeCartaoDaCompra(compra, cartoes) === 'Ourocard', 'um cartão cadastrado recebe a compra sem nome');

const porCartao = calcularParcelasMensais([compra], cartoes);
assert(porCartao.get('Ourocard') === 9800, 'parcela entra no Ourocard');
assert(!porCartao.has(CARTAO_NAO_IDENTIFICADO), 'não fica órfã se há um cartão');

const salvoComIdInvalido = resolverCartaoPorId(cartoes, 1);
assert(salvoComIdInvalido?.nome === 'Ourocard', 'cartaoId 1 cai no cartão cadastrado');

if (fails.length) {
  console.error('FALHOU:\n' + fails.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}

console.log('✓ Compra parcelada sem cartão gravado aparece no cartão cadastrado');
