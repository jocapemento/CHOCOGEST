/**
 * Lucro real: vendas concluídas, receita líquida e custo do que foi vendido.
 */
import assert from 'node:assert/strict';
import { demonstrarLucroVendas } from '../lib/lucro-vendas.ts';

function item(nome, quantidade, valorUnit, unidade = 'un') {
  return { id: 1, nome, tipo: 'ProdutoAcabado', quantidade, unidade, valorUnit };
}

function venda(id, itens, total, extra = {}) {
  return {
    id,
    data: '2026-11-01',
    cliente: 'Ana',
    formaPagamento: 'Pix',
    status: 'concluida',
    entrega: 'entregue',
    pago: 'pago',
    total,
    itens,
    ...extra,
  };
}

function producao(id, nome, quantidade, custo, unidade = 'un') {
  return {
    id,
    data: '2026-10-01',
    lote: `L${id}`,
    produto: nome,
    quantidade,
    unidade,
    produtos: [{ nome, quantidade, unidade, custoAlocado: custo }],
    ingredientes: [],
    custoEstimado: custo,
  };
}

function base(extra = {}) {
  return { vendas: [], producoes: [], compras: [], precosGerados: [], estoque: [], ...extra };
}

const vazio = demonstrarLucroVendas(base());
assert.equal(vazio.vendas, 0);
assert.equal(vazio.receita, 0);
assert.equal(vazio.custo, 0);
assert.equal(vazio.lucro, 0);
assert.equal(vazio.margem, null);
assert.equal(vazio.receitaSemCusto, 0);
assert.equal(vazio.itens.length, 0);

const vendido = demonstrarLucroVendas(
  base({
    producoes: [producao(1, 'Bombom', 10, 5)],
    vendas: [venda(1, [item('Bombom', 2, 2)], 4)],
  })
);
assert.equal(vendido.vendas, 1);
assert.equal(vendido.receita, 4);
assert.equal(vendido.custo, 1);
assert.equal(vendido.lucro, 3);
assert.equal(vendido.margem, 75);
assert.equal(vendido.itens[0].nome, 'Bombom');
assert.equal(vendido.itens[0].quantidade, 2);
assert.equal(vendido.itens[0].semCusto, false);

const comDesconto = demonstrarLucroVendas(
  base({
    producoes: [producao(1, 'Bombom', 10, 5)],
    vendas: [
      venda(1, [item('Bombom', 2, 2)], 2, { descontoTipo: 'percentual', desconto: 50 }),
    ],
  })
);
assert.equal(comDesconto.receita, 2);
assert.equal(comDesconto.custo, 1);
assert.equal(comDesconto.lucro, 1);
assert.equal(comDesconto.margem, 50);

const pendente = demonstrarLucroVendas(
  base({
    producoes: [producao(1, 'Bombom', 10, 5)],
    vendas: [
      venda(1, [item('Bombom', 2, 2)], 4),
      venda(2, [item('Bombom', 9, 50)], 450, {
        status: 'em_processamento',
        entrega: 'a_entregar',
        pago: 'a_receber',
      }),
      venda(3, [item('Bombom', 4, 10)], 40, {
        status: 'concluida',
        entrega: 'entregue',
        pago: 'a_receber',
      }),
    ],
  })
);
assert.equal(pendente.vendas, 1);
assert.equal(pendente.receita, 4);
assert.equal(pendente.itens[0].quantidade, 2);
assert.equal(pendente.lucro, 3);

const comprado = demonstrarLucroVendas(
  base({
    compras: [
      {
        id: 1,
        data: '2026-10-01',
        fornecedor: 'Sítio',
        formaPagamento: 'Pix',
        cartao: null,
        parcelas: 1,
        total: 5,
        recebimento: 'a_receber',
        itens: [item('Bombom', 10, 0.5)],
      },
    ],
    vendas: [venda(1, [item('Bombom', 2, 2)], 4)],
  })
);
assert.equal(comprado.custo, 1);
assert.equal(comprado.lucro, 3);
assert.equal(comprado.itens[0].semCusto, false);

const produzidoEComprado = demonstrarLucroVendas(
  base({
    producoes: [producao(1, 'Nibs', 2, 10, 'kg')],
    compras: [
      {
        id: 1,
        data: '2026-10-02',
        fornecedor: 'Sítio',
        formaPagamento: 'Pix',
        cartao: null,
        parcelas: 1,
        total: 6,
        recebimento: 'recebido',
        itens: [item('Nibs', 2, 3, 'kg')],
      },
    ],
    vendas: [venda(1, [item('Nibs', 1, 10, 'kg')], 10)],
  })
);
assert.equal(produzidoEComprado.custo, 4);
assert.equal(produzidoEComprado.lucro, 6);

const semCusto = demonstrarLucroVendas(
  base({
    vendas: [venda(1, [item('Bombom', 2, 2)], 4)],
    estoque: [
      { id: 1, nome: 'Bombom', tipo: 'ProdutoAcabado', quantidade: 3, unidade: 'un', valorUnit: 2 },
    ],
  })
);
assert.equal(semCusto.receita, 4);
assert.equal(semCusto.custo, 0);
assert.equal(semCusto.lucro, 4);
assert.equal(semCusto.receitaSemCusto, 4);
assert.equal(semCusto.itens[0].semCusto, true);

const estoqueDeCusto = demonstrarLucroVendas(
  base({
    vendas: [venda(1, [item('Bombom', 2, 2)], 4)],
    estoque: [
      { id: 1, nome: 'Bombom', tipo: 'ProdutoAcabado', quantidade: 3, unidade: 'un', valorUnit: 2 },
      { id: 2, nome: 'Bombom', tipo: 'ProdutoAcabado', quantidade: 4, unidade: 'un', valorUnit: 0.5 },
    ],
  })
);
assert.equal(estoqueDeCusto.custo, 1);
assert.equal(estoqueDeCusto.lucro, 3);
assert.equal(estoqueDeCusto.itens[0].semCusto, false);

const pelaPrecificacao = demonstrarLucroVendas(
  base({
    precosGerados: [
      {
        id: 1,
        data: '2026-09-01',
        produto: 'Bombom',
        unidade: 'un',
        custoUnitario: 9,
        margemLucro: 10,
        precoSugerido: 9.9,
      },
      {
        id: 2,
        data: '2026-10-01',
        produto: 'Bombom',
        unidade: 'un',
        custoUnitario: 0.5,
        margemLucro: 300,
        precoSugerido: 2,
      },
    ],
    estoque: [
      { id: 1, nome: 'Bombom', tipo: 'ProdutoAcabado', quantidade: 4, unidade: 'un', valorUnit: 9 },
    ],
    vendas: [venda(1, [item('Bombom', 2, 2)], 4)],
  })
);
assert.equal(pelaPrecificacao.custo, 1);
assert.equal(pelaPrecificacao.lucro, 3);

const producaoGanhaDoEstoque = demonstrarLucroVendas(
  base({
    producoes: [producao(1, 'Bombom', 10, 5)],
    estoque: [
      { id: 1, nome: 'Bombom', tipo: 'ProdutoAcabado', quantidade: 2, unidade: 'un', valorUnit: 2 },
    ],
    vendas: [venda(1, [item('Bombom', 2, 2)], 4)],
  })
);
assert.equal(producaoGanhaDoEstoque.custo, 1);
assert.equal(producaoGanhaDoEstoque.lucro, 3);

const legado = demonstrarLucroVendas(
  base({
    producoes: [
      {
        id: 1,
        data: '2026-10-01',
        lote: 'L1',
        produto: 'Nibs',
        quantidade: 10,
        unidade: 'kg',
        produtos: [],
        ingredientes: [],
        custoEstimado: 50,
      },
    ],
    vendas: [venda(1, [item('Nibs', 2, 10, 'kg')], 20)],
  })
);
assert.equal(legado.custo, 10);
assert.equal(legado.lucro, 10);

const outraUnidade = demonstrarLucroVendas(
  base({
    producoes: [producao(1, 'Nibs', 10, 100, 'kg')],
    vendas: [venda(1, [item('Nibs', 2, 2, 'un')], 4)],
  })
);
assert.equal(outraUnidade.custo, 0);
assert.equal(outraUnidade.itens[0].semCusto, true);
assert.equal(outraUnidade.receitaSemCusto, 4);

const dois = demonstrarLucroVendas(
  base({
    producoes: [producao(1, 'Bombom', 10, 5), producao(2, 'Barra', 4, 8)],
    vendas: [
      venda(1, [item('Bombom', 2, 2)], 4),
      venda(2, [item('Barra', 1, 10)], 10),
    ],
  })
);
assert.equal(dois.receita, 14);
assert.equal(dois.custo, 3);
assert.equal(dois.lucro, 11);
assert.deepEqual(
  dois.itens.map((linha) => linha.nome),
  ['Barra', 'Bombom']
);
assert.equal(dois.itens[0].lucro, 8);
assert.equal(dois.itens[1].lucro, 3);

const nibsECha = demonstrarLucroVendas(
  base({
    producoes: [
      {
        id: 1,
        data: '2026-10-01',
        lote: 'L1',
        produto: 'Nibs',
        quantidade: 7,
        unidade: 'kg',
        produtos: [
          { nome: 'Nibs', quantidade: 7, unidade: 'kg', custoAlocado: 100 },
          { nome: 'Chá de Cacau', quantidade: 2, unidade: 'kg', custoAlocado: 20 },
        ],
        ingredientes: [],
        custoEstimado: 100,
      },
    ],
    vendas: [
      venda(1, [item('Nibs', 1, 20, 'kg'), item('Chá de Cacau', 1, 15, 'kg')], 35),
    ],
  })
);
assert.equal(nibsECha.receita, 35);
assert.equal(nibsECha.custo, 24.29);
assert.equal(nibsECha.itens[0].nome, 'Nibs');
assert.equal(nibsECha.itens[0].custo, 14.29);
assert.equal(nibsECha.itens[1].nome, 'Chá de Cacau');
assert.equal(nibsECha.itens[1].custo, 10);

const abaixoDoCusto = demonstrarLucroVendas(
  base({
    producoes: [producao(1, 'Bombom', 10, 5)],
    vendas: [venda(1, [item('Bombom', 2, 0.1)], 0.2)],
  })
);
assert.equal(abaixoDoCusto.receita, 0.2);
assert.equal(abaixoDoCusto.custo, 1);
assert.equal(abaixoDoCusto.lucro, -0.8);
assert.equal(abaixoDoCusto.margem, -400);

console.log('✓ Lucro real usa a receita líquida e o custo do que foi vendido');
