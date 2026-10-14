/**
 * No campo Cliente, a digitação lista nomes já usados nas vendas.
 */
import assert from 'node:assert/strict';
import { sugestoesCliente } from '../lib/vendas.ts';

function venda(id, data, cliente) {
  return {
    id,
    data,
    cliente,
    formaPagamento: 'Pix',
    status: 'concluida',
    entrega: 'entregue',
    pago: 'pago',
    total: 10,
    itens: [],
  };
}

const vendas = [
  venda(1, '2026-01-01', 'maria'),
  venda(2, '2026-06-01', 'Maria Silva'),
  venda(3, '2026-03-01', 'Marcos Andrade'),
  venda(4, '2026-02-01', 'José Pereira'),
  venda(5, '2026-04-01', '  Ana  '),
  venda(6, '2026-01-15', 'Maria'),
  venda(7, '2026-05-01', 'maria'),
  venda(8, '2026-04-02', ''),
];

assert.deepEqual(sugestoesCliente(vendas, ''), []);
assert.deepEqual(sugestoesCliente(vendas, '   '), []);
assert.deepEqual(sugestoesCliente(vendas, 'mar'), ['Marcos Andrade', 'maria', 'Maria Silva']);
assert.deepEqual(sugestoesCliente(vendas, 'silva'), ['Maria Silva']);
assert.deepEqual(sugestoesCliente(vendas, 'jose'), ['José Pereira']);
assert.deepEqual(sugestoesCliente(vendas, 'José'), ['José Pereira']);
assert.deepEqual(sugestoesCliente(vendas, 'Ana'), []);
assert.deepEqual(sugestoesCliente(vendas, 'ana'), []);
assert.deepEqual(sugestoesCliente(vendas, 'xyz'), []);

const grafia = [
  venda(1, '2026-01-01', 'maria silva'),
  venda(2, '2026-08-01', 'Maria Silva'),
];
assert.deepEqual(sugestoesCliente(grafia, 'sil'), ['Maria Silva']);

console.log('sugestões de cliente ok');
