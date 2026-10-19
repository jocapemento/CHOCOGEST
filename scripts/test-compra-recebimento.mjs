/**
 * Recebimento da compra libera o lançamento no estoque.
 * Compra antiga sem o campo já tinha entrado no estoque.
 */
import assert from 'node:assert/strict';
import {
  compraAguardandoRecebimento,
  compraAposConfirmarRecebimento,
  compraLancaEstoque,
  listarComprasAguardandoRecebimento,
  listarComprasRecebidas,
  normalizarRecebimentoCompra,
  recebimentoDaCompra,
  resumoComprasAguardandoRecebimento,
} from '../lib/compras.ts';
import { normalizeAppData } from '../lib/storage.ts';
import { EMPTY_DATA } from '../lib/types.ts';

assert.equal(normalizarRecebimentoCompra(undefined), 'recebido');
assert.equal(normalizarRecebimentoCompra(null), 'recebido');
assert.equal(normalizarRecebimentoCompra('outro'), 'recebido');
assert.equal(normalizarRecebimentoCompra('a_receber'), 'a_receber');
assert.equal(normalizarRecebimentoCompra('recebido'), 'recebido');

const antiga = { id: 1, total: 10, itens: [] };
assert.equal(recebimentoDaCompra(antiga), 'recebido');
assert.equal(compraLancaEstoque(antiga), true);
assert.equal(compraAguardandoRecebimento(antiga), false);

const aberta = { id: 2, recebimento: 'a_receber', total: 25.5, itens: [] };
assert.equal(compraLancaEstoque(aberta), false);
assert.equal(compraAguardandoRecebimento(aberta), true);

const confirmada = compraAposConfirmarRecebimento(aberta);
assert.equal(confirmada.recebimento, 'recebido');
assert.equal(compraLancaEstoque(confirmada), true);
assert.equal(aberta.recebimento, 'a_receber');

const lista = [antiga, aberta, { id: 3, recebimento: 'recebido', total: 4.005, itens: [] }];
assert.deepEqual(
  listarComprasAguardandoRecebimento(lista).map((c) => c.id),
  [2]
);
assert.deepEqual(
  listarComprasRecebidas(lista).map((c) => c.id),
  [1, 3]
);
assert.deepEqual(resumoComprasAguardandoRecebimento(lista), {
  quantidade: 1,
  valorTotal: 25.5,
});
assert.deepEqual(
  resumoComprasAguardandoRecebimento([
    { id: 4, recebimento: 'a_receber', total: 10.005, itens: [] },
    { id: 5, recebimento: 'a_receber', total: 10.005, itens: [] },
  ]),
  { quantidade: 2, valorTotal: 20.01 }
);

const item = {
  id: 1,
  nome: 'Cacau',
  tipo: 'MateriaPrima',
  quantidade: 2,
  unidade: 'kg',
  valorUnit: 40,
};

const legado = normalizeAppData({
  ...EMPTY_DATA,
  estoque: [{ ...item, id: 9, data: '2026-01-02' }],
  compras: [
    {
      id: 7,
      data: '2026-01-02',
      fornecedor: 'Sítio',
      formaPagamento: 'Pix',
      cartao: null,
      parcelas: 1,
      total: 80,
      itens: [item],
    },
  ],
});
assert.equal(legado.compras[0].recebimento, 'recebido');
assert.equal(legado.estoque.length, 1);
assert.equal(legado.estoque[0].quantidade, 2);

const pendente = normalizeAppData({
  ...EMPTY_DATA,
  compras: [
    {
      id: 8,
      data: '2026-02-01',
      fornecedor: 'Sítio',
      formaPagamento: 'Dinheiro',
      cartao: null,
      parcelas: 1,
      total: 80,
      recebimento: 'a_receber',
      itens: [item],
    },
  ],
});
assert.equal(pendente.compras[0].recebimento, 'a_receber');
assert.equal(pendente.estoque.length, 0);

console.log('ok: confirmação de recebimento da compra');
