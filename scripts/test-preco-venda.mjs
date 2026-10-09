/**
 * O preço da venda usa os centavos exibidos na Precificação.
 * O registro guarda o cálculo bruto (0,49854); a tela mostra R$ 0,50.
 */
import assert from 'node:assert/strict';
import { formatCurrency } from '../lib/format.ts';
import { calcularPrecoSugerido, precoUnitarioParaVenda } from '../lib/preco-venda.ts';

function preco(produto, precoSugerido, extra = {}) {
  return {
    id: extra.id ?? 1,
    data: extra.data ?? '2026-09-28',
    produto,
    unidade: extra.unidade ?? 'un',
    custoUnitario: extra.custoUnitario ?? 1,
    margemLucro: extra.margemLucro ?? 100,
    precoSugerido,
  };
}

const casos = [
  ['Chocolate 70% com Açúcar de Coco Bombom', 0.49854428191101535, 0.5],
  ['Chocolate 70% com Açúcar de Coco', 132.99633, 133],
  ['Chocolate 70% com Açúcar de Coco Kit Kat', 1.9966433878157501, 2],
  ['Nibs', 60.12824191328654, 60.13],
  ['Amêndoa Torrada', 50.067204481568886, 50.07],
  ['Amêndoa Fino Torrada', 75.01590524534687, 75.02],
  ['Chá de Cacau', 30.229, 30.23],
  ['Chocolate 60% com Açúcar de Coco', 132.99756987441586, 133],
];

for (const [nome, bruto, centavos] of casos) {
  const venda = precoUnitarioParaVenda([preco(nome, bruto)], nome, 999);
  assert.equal(venda.origem, 'precificacao', nome);
  assert.equal(venda.valor, centavos, `${nome}: venda ${venda.valor} deveria ser ${centavos}`);
  assert.equal(formatCurrency(bruto), formatCurrency(centavos), `${nome}: exibição`);
  assert.equal(venda.registro.precoSugerido, bruto, `${nome}: histórico permanece bruto`);
}

const bombom = preco('Chocolate 70% com Açúcar de Coco Bombom', 0.49854428191101535, {
  id: 12,
  data: '2026-09-28',
  custoUnitario: 0.17492781821439135,
  margemLucro: 185,
});
const antigo = preco('Chocolate 70% com Açúcar de Coco Bombom', 0.4, {
  id: 3,
  data: '2026-09-01',
});
const recente = precoUnitarioParaVenda([antigo, bombom], '  chocolate 70% com açúcar de coco bombom  ', 0.17);
assert.equal(recente.valor, 0.5, 'usa o registro mais recente, ignorando espaços e maiúsculas');

const semPreco = precoUnitarioParaVenda([], 'Bombom', 0.17492781821439135);
assert.equal(semPreco.origem, 'custo');
assert.equal(semPreco.valor, 0.17, 'sem precificação, o custo também entra em centavos');

const precoZero = precoUnitarioParaVenda([preco('Bombom', 0)], 'Bombom', 37.098);
assert.equal(precoZero.origem, 'custo');
assert.equal(precoZero.valor, 37.1);

assert.equal(
  calcularPrecoSugerido(0.17492781821439135, 185),
  0.5,
  'registrar preço grava os centavos da tela'
);
assert.equal(calcularPrecoSugerido(37.098, 258.5), 133);
assert.equal(calcularPrecoSugerido(0.588112927191679, 239.5), 2);

console.log('preco venda = precificacao ok');
