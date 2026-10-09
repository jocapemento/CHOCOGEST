/**
 * Devolver uma venda reposição o custo de produção, não o preço de venda.
 * Camada que já voltou pelo preço de venda não entra na média da produção.
 */
import assert from 'node:assert/strict';
import {
  corrigirCustosDevolvidosComoPreco,
  custoParaReporEstoque,
} from '../lib/custo-reposicao.ts';

const CUSTO_BOMBOM = 41.986 / 240.019;
const PRECO_BOMBOM = 0.49854428191101535;

function base(extra) {
  return {
    estoque: [],
    compras: [],
    vendas: [],
    producoes: [],
    cartoes: [],
    bancos: [],
    patrimonio: [],
    movimentosCaixa: [],
    movimentosBanco: [],
    precosGerados: [],
    quitacoesCartao: [],
    ...extra,
  };
}

const producaoBombom = {
  id: 31,
  data: '2026-09-28',
  lote: 'L1',
  produto: 'Chocolate 70% com Açúcar de Coco Bombom',
  quantidade: 240.019,
  unidade: 'un',
  produtos: [
    {
      nome: 'Chocolate 70% com Açúcar de Coco Bombom',
      quantidade: 240.019,
      unidade: 'un',
      custoAlocado: 41.986,
      massa: 1.004,
      unidadeMassa: 'kg',
      pesoUnidade: 4.183,
      unidadePeso: 'g',
    },
  ],
  ingredientes: [
    {
      nome: 'Chocolate 70% com Açúcar de Coco',
      quantidade: 1.004,
      valorUnit: 37.098,
      unidade: 'kg',
      tipo: 'ProdutoAcabado',
    },
  ],
  custoEstimado: 41.986392,
};

const dados = base({
  precosGerados: [
    {
      id: 1,
      data: '2026-09-28',
      produto: 'Chocolate 70% com Açúcar de Coco Bombom',
      unidade: 'un',
      custoUnitario: CUSTO_BOMBOM,
      margemLucro: 185,
      precoSugerido: PRECO_BOMBOM,
    },
    {
      id: 2,
      data: '2026-09-14',
      produto: 'Chocolate 70% com Açúcar de Coco',
      unidade: 'kg',
      custoUnitario: 37.098,
      margemLucro: 258.5,
      precoSugerido: 132.99633,
    },
  ],
  vendas: [
    {
      id: 10,
      data: '2026-09-29',
      cliente: 'Rita',
      formaPagamento: 'Dinheiro',
      status: 'concluida',
      total: 19.94,
      itens: [
        {
          id: 1,
          nome: 'Chocolate 70% com Açúcar de Coco Bombom',
          tipo: 'ProdutoAcabado',
          quantidade: 40,
          unidade: 'un',
          valorUnit: PRECO_BOMBOM,
        },
      ],
    },
  ],
  producoes: [
    {
      id: 27,
      data: '2026-09-14',
      lote: 'L0',
      produto: 'Chocolate 70% com Açúcar de Coco',
      quantidade: 13,
      unidade: 'kg',
      produtos: [
        {
          nome: 'Chocolate 70% com Açúcar de Coco',
          quantidade: 13,
          unidade: 'kg',
          custoAlocado: 482.274,
        },
      ],
      ingredientes: [],
      custoEstimado: 482.27435115954523,
    },
    producaoBombom,
    {
      id: 37,
      data: '2026-10-09',
      lote: 'L2',
      produto: 'Pct10 - Chocolate 70% com Açúcar de Coco Bombom',
      quantidade: 2,
      unidade: 'un',
      produtos: [
        {
          nome: 'Pct10 - Chocolate 70% com Açúcar de Coco Bombom',
          quantidade: 2,
          unidade: 'un',
          custoAlocado: 5.379,
        },
      ],
      ingredientes: [
        {
          nome: 'Chocolate 70% com Açúcar de Coco Bombom',
          quantidade: 20,
          valorUnit: 0.2501791482876098,
          unidade: 'un',
          tipo: 'ProdutoAcabado',
        },
        {
          nome: 'Sacos Metalizados Adesivados 8x10+3cm Aliança',
          quantidade: 2,
          valorUnit: 0.1879,
          unidade: 'und',
          tipo: 'Embalagem',
        },
      ],
      custoEstimado: 5.379382965752196,
    },
  ],
  estoque: [
    {
      id: 1,
      nome: 'Chocolate 70% com Açúcar de Coco',
      tipo: 'ProdutoAcabado',
      quantidade: 5.97,
      unidade: 'kg',
      valorUnit: 37.098,
      data: '2026-09-14',
    },
    {
      id: 2,
      nome: 'Chocolate 70% com Açúcar de Coco',
      tipo: 'ProdutoAcabado',
      quantidade: 0.03,
      unidade: 'kg',
      valorUnit: 132.99633,
      data: '2026-10-05',
    },
    {
      id: 3,
      nome: 'Chocolate 70% com Açúcar de Coco Bombom',
      tipo: 'ProdutoAcabado',
      quantidade: 112.019,
      unidade: 'un',
      valorUnit: CUSTO_BOMBOM,
      data: '2026-09-28',
    },
    {
      id: 4,
      nome: 'Chocolate 70% com Açúcar de Coco Bombom',
      tipo: 'ProdutoAcabado',
      quantidade: 40,
      unidade: 'un',
      valorUnit: PRECO_BOMBOM,
      data: '2026-09-29',
    },
    {
      id: 5,
      nome: 'Pct10 - Chocolate 70% com Açúcar de Coco Bombom',
      tipo: 'ProdutoAcabado',
      quantidade: 2,
      unidade: 'un',
      valorUnit: 2.6895,
      data: '2026-10-09',
    },
  ],
});

const custoReposto = custoParaReporEstoque(
  { nome: 'Chocolate 70% com Açúcar de Coco Bombom', valorUnit: PRECO_BOMBOM },
  dados
);
assert.ok(Math.abs(custoReposto - CUSTO_BOMBOM) < 1e-9, `reposição ${custoReposto}`);

const corrigido = corrigirCustosDevolvidosComoPreco(dados);
const bombom = corrigido.estoque.filter((item) => item.nome.endsWith('Bombom') && !item.nome.startsWith('Pct'));
assert.ok(bombom.every((item) => Math.abs(item.valorUnit - CUSTO_BOMBOM) < 1e-9), 'bombom no custo');

const chocolate = corrigido.estoque.filter((item) => item.nome === 'Chocolate 70% com Açúcar de Coco');
assert.ok(chocolate.every((item) => item.valorUnit === 37.098), 'chocolate no custo do lote');

const pacoteProd = corrigido.producoes.find((item) => item.id === 37);
const custoPacote = 20 * CUSTO_BOMBOM + 2 * 0.1879;
assert.ok(Math.abs(pacoteProd.custoEstimado - custoPacote) < 1e-9, `custo do pacote ${pacoteProd.custoEstimado}`);
assert.equal(pacoteProd.ingredientes[1].valorUnit, 0.1879);
const pacoteEstoque = corrigido.estoque.find((item) => item.nome.startsWith('Pct10'));
assert.ok(Math.abs(pacoteEstoque.valorUnit - 3.874 / 2) < 1e-9, `estoque do pacote ${pacoteEstoque.valorUnit}`);

const deNovo = corrigirCustosDevolvidosComoPreco(corrigido);
assert.equal(deNovo.producoes.find((item) => item.id === 37).custoEstimado, pacoteProd.custoEstimado);
assert.equal(deNovo.estoque.find((item) => item.id === 4).valorUnit, CUSTO_BOMBOM);

const chocolateQuase = base({
  producoes: dados.producoes,
  precosGerados: dados.precosGerados,
  vendas: [],
  estoque: dados.estoque,
});
chocolateQuase.producoes = [
  ...dados.producoes.filter((item) => item.id !== 37),
  {
    ...producaoBombom,
    id: 34,
    ingredientes: [
      { nome: 'Chocolate 70% com Açúcar de Coco', quantidade: 1, valorUnit: 37.509, unidade: 'kg' },
    ],
    custoEstimado: 37.509,
    produtos: [{ nome: 'Outro', quantidade: 1, unidade: 'kg', custoAlocado: 37.509 }],
  },
];
const quase = corrigirCustosDevolvidosComoPreco(chocolateQuase);
const loteQuase = quase.producoes.find((item) => item.id === 34);
assert.equal(loteQuase.ingredientes[0].valorUnit, 37.509);

console.log('custo devolução venda ok');
