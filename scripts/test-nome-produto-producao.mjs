/**
 * O nome digitado na produção não pode ser trocado por outro percentual.
 * Os lotes L1791682857704 e L1791682976989 voltam para Chocolate 60%.
 */
import assert from 'node:assert/strict';
import { corrigirNomeTrocadoDosLotes } from '../lib/corrigir-nome-producao.ts';
import {
  divergenciaPercentualProduto,
  nomeComPercentualDoIngrediente,
  sugestoesNomeProduto,
} from '../lib/nome-produto.ts';
import { normalizeAppData } from '../lib/storage.ts';
import { EMPTY_DATA } from '../lib/types.ts';

const CHOCO_60 = 'Chocolate 60% com Açúcar de Coco';
const CHOCO_70 = 'Chocolate 70% com Açúcar de Coco';
const BOMBOM_70 = 'Chocolate 70% com Açúcar de Coco Bombom';
const BOMBOM_60 = 'Chocolate 60% com Açúcar de Coco Bombom';
const KIT_70 = 'Chocolate 70% com Açúcar de Coco Kit Kat';
const KIT_60 = 'Chocolate 60% com Açúcar de Coco Kit Kat';
const LOTE_BOMBOM = 'L1791682857704';
const LOTE_KIT = 'L1791682976989';

assert.equal(nomeComPercentualDoIngrediente(BOMBOM_70, CHOCO_60), BOMBOM_60);
assert.equal(nomeComPercentualDoIngrediente(KIT_70, CHOCO_60), KIT_60);
assert.equal(nomeComPercentualDoIngrediente('Nibs', CHOCO_60), null);
assert.equal(nomeComPercentualDoIngrediente('Chocolate 70% ao leite', CHOCO_60), null);
assert.equal(nomeComPercentualDoIngrediente(BOMBOM_60, CHOCO_60), BOMBOM_60);

const sugestoes = sugestoesNomeProduto([BOMBOM_70, KIT_70, 'Nibs'], [CHOCO_60], '');
assert.equal(sugestoes[0], BOMBOM_60);
assert.equal(sugestoes[1], KIT_60);
assert.ok(sugestoes.indexOf(BOMBOM_60) < sugestoes.indexOf(BOMBOM_70));

const aoDigitar60 = sugestoesNomeProduto(
  [BOMBOM_70, KIT_70],
  [CHOCO_60],
  'Chocolate 60% com Açúcar de Coco Bombom'
);
assert.deepEqual(aoDigitar60, [BOMBOM_60]);

const aviso = divergenciaPercentualProduto(BOMBOM_70, [CHOCO_60]);
assert.equal(aviso?.percentualIngrediente, '60');
assert.equal(aviso?.percentualProduto, '70');
assert.equal(divergenciaPercentualProduto(BOMBOM_60, [CHOCO_60]), null);
assert.equal(divergenciaPercentualProduto('Nibs', ['Amêndoa Torrada']), null);

function lote({ id, lote, produto, quantidade, custo, data }) {
  return {
    id,
    data,
    lote,
    produto,
    quantidade,
    unidade: 'un',
    produtos: [{ nome: produto, quantidade, unidade: 'un', custoAlocado: custo }],
    ingredientes: [
      { nome: CHOCO_60, quantidade: 0.8, valorUnit: custo / 0.8, unidade: 'kg', tipo: 'ProdutoAcabado' },
    ],
    custoEstimado: custo,
  };
}

const custoBombom = 8.394;
const custoKit = 10.03;
const dataLote = '2026-10-11';

const dados = {
  ...EMPTY_DATA,
  estoque: [
    {
      id: 1,
      nome: CHOCO_60,
      tipo: 'ProdutoAcabado',
      quantidade: 3,
      unidade: 'kg',
      valorUnit: 40,
      data: '2026-10-01',
    },
    {
      id: 2,
      nome: BOMBOM_70,
      tipo: 'ProdutoAcabado',
      quantidade: 10,
      unidade: 'un',
      valorUnit: 0.2,
      data: '2026-08-01',
    },
    {
      id: 3,
      nome: BOMBOM_70,
      tipo: 'ProdutoAcabado',
      quantidade: 48,
      unidade: 'un',
      valorUnit: custoBombom / 48,
      data: dataLote,
    },
    {
      id: 4,
      nome: KIT_70,
      tipo: 'ProdutoAcabado',
      quantidade: 59,
      unidade: 'un',
      valorUnit: custoKit / 59,
      data: dataLote,
    },
    {
      id: 5,
      nome: BOMBOM_70,
      tipo: 'ProdutoAcabado',
      quantidade: 30,
      unidade: 'un',
      valorUnit: 0.5,
      data: dataLote,
    },
  ],
  producoes: [
    lote({
      id: 1,
      lote: LOTE_BOMBOM,
      produto: BOMBOM_70,
      quantidade: 48,
      custo: custoBombom,
      data: dataLote,
    }),
    lote({
      id: 2,
      lote: LOTE_KIT,
      produto: KIT_70,
      quantidade: 59,
      custo: custoKit,
      data: dataLote,
    }),
    lote({
      id: 3,
      lote: 'L100',
      produto: BOMBOM_70,
      quantidade: 12,
      custo: 3,
      data: '2026-09-01',
    }),
  ],
};

const corrigido = normalizeAppData(dados);
const bombom = corrigido.producoes.find((p) => p.lote === LOTE_BOMBOM);
const kit = corrigido.producoes.find((p) => p.lote === LOTE_KIT);
const outro = corrigido.producoes.find((p) => p.lote === 'L100');

assert.equal(bombom.produto, BOMBOM_60);
assert.equal(bombom.produtos[0].nome, BOMBOM_60);
assert.equal(bombom.quantidade, 48);
assert.equal(kit.produto, KIT_60);
assert.equal(kit.produtos[0].nome, KIT_60);
assert.equal(kit.quantidade, 59);
assert.equal(outro.produto, BOMBOM_70, 'outro lote de 70% permanece');

function saldo(nome) {
  return corrigido.estoque
    .filter((item) => item.nome === nome && item.quantidade > 0)
    .reduce((acc, item) => acc + item.quantidade, 0);
}

assert.equal(saldo(BOMBOM_60), 48);
assert.equal(saldo(KIT_60), 59);
assert.equal(saldo(BOMBOM_70), 40, 'estoque antigo de 70% permanece');
assert.equal(saldo(CHOCO_60), 3);

const deNovo = normalizeAppData(corrigido);
assert.equal(deNovo.producoes.find((p) => p.lote === LOTE_BOMBOM).produto, BOMBOM_60);
assert.equal(
  deNovo.estoque.filter((item) => item.nome === BOMBOM_60).reduce((acc, item) => acc + item.quantidade, 0),
  48
);

const parcial = corrigirNomeTrocadoDosLotes({
  ...EMPTY_DATA,
  estoque: [
    {
      id: 9,
      nome: BOMBOM_70,
      tipo: 'ProdutoAcabado',
      quantidade: 20,
      unidade: 'un',
      valorUnit: custoBombom / 48,
      data: dataLote,
    },
  ],
  producoes: [
    lote({
      id: 1,
      lote: LOTE_BOMBOM,
      produto: BOMBOM_70,
      quantidade: 48,
      custo: custoBombom,
      data: dataLote,
    }),
  ],
});
assert.equal(parcial.producoes[0].produto, BOMBOM_60);
assert.equal(parcial.estoque[0].nome, BOMBOM_60);
assert.equal(parcial.estoque[0].quantidade, 20);

const ingrediente70 = corrigirNomeTrocadoDosLotes({
  ...EMPTY_DATA,
  estoque: [
    {
      id: 1,
      nome: BOMBOM_70,
      tipo: 'ProdutoAcabado',
      quantidade: 48,
      unidade: 'un',
      valorUnit: custoBombom / 48,
      data: dataLote,
    },
  ],
  producoes: [
    {
      ...lote({
        id: 1,
        lote: LOTE_BOMBOM,
        produto: BOMBOM_70,
        quantidade: 48,
        custo: custoBombom,
        data: dataLote,
      }),
      ingredientes: [
        { nome: CHOCO_70, quantidade: 0.8, valorUnit: 40, unidade: 'kg', tipo: 'ProdutoAcabado' },
      ],
    },
  ],
});
assert.equal(ingrediente70.producoes[0].produto, BOMBOM_70);
assert.equal(ingrediente70.estoque[0].nome, BOMBOM_70);

console.log('nome do produto na produção: ok');
