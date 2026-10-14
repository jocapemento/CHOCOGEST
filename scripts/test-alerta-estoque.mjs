/**
 * Estoque mínimo: alerta quando o saldo fica no valor definido ou abaixo,
 * inclusive item zerado. Um nome só tem um mínimo.
 */
import assert from 'node:assert/strict';
import {
  assinaturaItensBaixos,
  avaliarAlertasEstoque,
  itensEstoqueBaixo,
  normalizeAlertasEstoque,
} from '../lib/alerta-estoque.ts';
import { normalizeAppData, parseBackupFile } from '../lib/storage.ts';
import { EMPTY_DATA } from '../lib/types.ts';

const amendoa = {
  id: 1,
  nome: 'Amêndoa Torrada',
  tipo: 'MateriaPrima',
  quantidade: 3,
  unidade: 'kg',
  valorUnit: 40,
  data: '2026-10-01',
};
const nibsA = {
  id: 2,
  nome: 'Nibs',
  tipo: 'ProdutoAcabado',
  quantidade: 2,
  unidade: 'kg',
  valorUnit: 50,
  data: '2026-10-02',
};
const nibsB = {
  id: 3,
  nome: 'Nibs',
  tipo: 'ProdutoAcabado',
  quantidade: 3,
  unidade: 'kg',
  valorUnit: 60,
  data: '2026-10-03',
};

const alertas = [
  { id: 1, nome: 'Amêndoa Torrada', tipo: 'MateriaPrima', unidade: 'kg', minimo: 5 },
  { id: 2, nome: 'Nibs', tipo: 'ProdutoAcabado', unidade: 'kg', minimo: 4 },
  { id: 3, nome: 'Embalagem', tipo: 'Embalagem', unidade: 'un', minimo: 20 },
  { id: 4, nome: 'Gás de Cozinha', tipo: 'Energia', unidade: 'kg', minimo: 2 },
];

const estoque = [
  amendoa,
  nibsA,
  nibsB,
  {
    id: 5,
    nome: 'Gás de Cozinha',
    tipo: 'Energia',
    quantidade: 8,
    unidade: 'kg',
    valorUnit: 10,
    data: '2026-10-01',
  },
];

const situacao = avaliarAlertasEstoque(estoque, alertas);
const porNome = Object.fromEntries(situacao.map((item) => [item.nome, item]));

assert.equal(porNome['Amêndoa Torrada'].quantidade, 3);
assert.equal(porNome['Amêndoa Torrada'].baixo, true);
assert.equal(porNome.Nibs.quantidade, 5);
assert.equal(porNome.Nibs.baixo, false);
assert.equal(porNome.Embalagem.quantidade, 0);
assert.equal(porNome.Embalagem.baixo, true);
assert.equal(porNome['Gás de Cozinha'].baixo, false);

const baixos = itensEstoqueBaixo(estoque, alertas).map((item) => item.nome);
assert.deepEqual(baixos, ['Amêndoa Torrada', 'Embalagem']);

assert.equal(
  avaliarAlertasEstoque(
    [{ ...amendoa, quantidade: 5 }],
    [alertas[0]]
  )[0].baixo,
  true
);
assert.equal(
  avaliarAlertasEstoque(
    [{ ...amendoa, quantidade: 5.001 }],
    [alertas[0]]
  )[0].baixo,
  false
);

const assinatura = assinaturaItensBaixos(itensEstoqueBaixo(estoque, alertas));
const comMenosAmendoa = itensEstoqueBaixo(
  estoque.map((item) => (item.nome === 'Amêndoa Torrada' ? { ...item, quantidade: 1 } : item)),
  alertas
);
assert.equal(assinaturaItensBaixos(comMenosAmendoa), assinatura);

const normalizados = normalizeAlertasEstoque([
  { id: 4, nome: '  Nibs ', tipo: 'ProdutoAcabado', unidade: 'kg', minimo: 1 },
  { id: 4, nome: 'nibs', tipo: 'ProdutoAcabado', unidade: 'kg', minimo: 9 },
  { nome: 'Caixa', tipo: 'Embalagem', unidade: '', minimo: 3 },
  { id: 8, nome: 'Vazio', tipo: 'Outros', unidade: 'un', minimo: 0 },
  { id: 9, nome: '   ', tipo: 'Outros', unidade: 'un', minimo: 2 },
]);
assert.equal(normalizados.length, 2);
assert.equal(normalizados.find((item) => item.nome === 'nibs')?.minimo, 9);
assert.equal(normalizados.find((item) => item.nome === 'nibs')?.id, 4);
assert.equal(normalizados.find((item) => item.nome === 'Caixa')?.unidade, 'un');
assert.ok(normalizados.find((item) => item.nome === 'Caixa')?.id !== 4);

const dados = normalizeAppData({
  ...EMPTY_DATA,
  alertasEstoque: normalizados,
});
assert.equal(dados.alertasEstoque.length, 2);

const restaurado = parseBackupFile(
  JSON.stringify({ data: { ...EMPTY_DATA, alertasEstoque: null } })
);
assert.ok(restaurado);
assert.deepEqual(restaurado.alertasEstoque, []);

const antigo = parseBackupFile(JSON.stringify({ estoque: [amendoa] }));
assert.ok(antigo);
assert.deepEqual(antigo.alertasEstoque, []);
assert.equal(antigo.estoque[0].nome, 'Amêndoa Torrada');

console.log('alerta de estoque baixo ok');
