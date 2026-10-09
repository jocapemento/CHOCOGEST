/**
 * Produção em unidades conta a unidade, não o peso.
 * Lote antigo que ainda tem massa registrada continua rateando o custo pelo peso.
 */
import assert from 'node:assert/strict';
import {
  descreverQuantidadeFracionada,
  ehUnidadeContagem,
  massaRegistrada,
  produtoFoiFracionado,
  quantidadeParaPerda,
  quantidadeParaRateio,
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

assert.equal(ehUnidadeContagem('un'), true);
assert.equal(ehUnidadeContagem('Unidade'), true);
assert.equal(ehUnidadeContagem('kg'), false);
assert.equal(produtoFoiFracionado(fracionado), true);
assert.deepEqual(massaRegistrada(fracionado), { quantidade: 1, unidade: 'kg' });
assert.equal(descreverQuantidadeFracionada(fracionado), '66.667 un');

const inteiro = { quantidade: 1, unidade: 'kg' };
assert.equal(produtoFoiFracionado(inteiro), false);
assert.deepEqual(massaRegistrada(inteiro), { quantidade: 1, unidade: 'kg' });
assert.equal(descreverQuantidadeFracionada(inteiro), '1 kg');

const custoLote = 12;
const custoAlocado = (custoLote * massaRegistrada(fracionado).quantidade) / 1;
const valorUnit = custoAlocado / fracionado.quantidade;
assert.ok(Math.abs(valorUnit - 12 / 66.667) < 1e-9);

assert.equal(quantidadeParaPerda({ quantidade: 66, unidade: 'un' }), null);
assert.deepEqual(quantidadeParaPerda({ quantidade: 4, unidade: 'kg' }), { quantidade: 4, unidade: 'kg' });
assert.deepEqual(quantidadeParaRateio({ quantidade: 40, unidade: 'un' }), {
  quantidade: 40,
  unidade: 'un',
});
assert.deepEqual(
  quantidadeParaRateio({
    quantidade: 60,
    unidade: 'un',
    massa: 1,
    unidadeMassa: 'kg',
  }),
  { quantidade: 1, unidade: 'kg' }
);

const custoUnidades = [40, 80].map((quantidade) =>
  quantidadeParaRateio({ quantidade, unidade: 'un' })
);
const totalUn = custoUnidades.reduce((acc, item) => acc + item.quantidade, 0);
assert.equal((120 * custoUnidades[0].quantidade) / totalUn, 40);
assert.equal((120 * custoUnidades[1].quantidade) / totalUn, 80);

console.log('fracionar produção ok');
