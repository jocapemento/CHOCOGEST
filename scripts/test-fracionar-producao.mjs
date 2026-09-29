/**
 * 1 kg de chocolate em barras de 15 g vira 66.667 un.
 * A massa registrada continua em kg para a perda e o rateio do custo.
 */
import assert from 'node:assert/strict';
import {
  descreverQuantidadeFracionada,
  massaRegistrada,
  produtoFoiFracionado,
  unidadesFracionadas,
} from '../lib/fracionar-massa.ts';

assert.equal(unidadesFracionadas(1, 'kg', 15, 'g'), 66.667);
assert.equal(unidadesFracionadas(1, 'quilo', 15, 'gramas'), 66.667);
assert.equal(unidadesFracionadas(500, 'g', 15, 'g'), 33.333);
assert.equal(unidadesFracionadas(1, 'kg', 0.015, 'kg'), 66.667);
assert.equal(unidadesFracionadas(2, 'kg', 15, 'g'), 133.333);
assert.equal(unidadesFracionadas(15000, 'mg', 15, 'g'), 1);
assert.equal(unidadesFracionadas(1, 'un', 15, 'g'), null);
assert.equal(unidadesFracionadas(1, 'kg', 0, 'g'), null);
assert.equal(unidadesFracionadas(0, 'kg', 15, 'g'), null);

const fracionado = {
  nome: 'Chocolate 70%',
  quantidade: 66.667,
  unidade: 'un',
  massa: 1,
  unidadeMassa: 'kg',
  pesoUnidade: 15,
  unidadePeso: 'g',
};

assert.equal(produtoFoiFracionado(fracionado), true);
assert.deepEqual(massaRegistrada(fracionado), { quantidade: 1, unidade: 'kg' });
assert.equal(descreverQuantidadeFracionada(fracionado), '66.667 un de 15 g (1 kg)');

const inteiro = { quantidade: 1, unidade: 'kg' };
assert.equal(produtoFoiFracionado(inteiro), false);
assert.deepEqual(massaRegistrada(inteiro), { quantidade: 1, unidade: 'kg' });
assert.equal(descreverQuantidadeFracionada(inteiro), '1 kg');

const custoLote = 12;
const custoAlocado = (custoLote * massaRegistrada(fracionado).quantidade) / 1;
const valorUnit = custoAlocado / fracionado.quantidade;
assert.ok(Math.abs(valorUnit - 12 / 66.667) < 1e-9);

console.log('fracionar produção ok');
