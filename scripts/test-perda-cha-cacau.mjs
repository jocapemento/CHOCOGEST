/**
 * Na quebra da amêndoa, a perda entra no Nibs.
 * O Chá de Cacau fica com o custo unitário da matéria-prima.
 */
import assert from 'node:assert/strict';
import { produtoMantemCustoSemPerda, preencherProdutosComCoprodutos } from '../lib/cadeia-producao.ts';
import {
  alocarCustoEntreProdutos,
  calcularPerdaProducao,
  loteConsideraPerda,
  totalizarPerdasPorProduto,
} from '../lib/estoque.ts';

assert.equal(produtoMantemCustoSemPerda('Chá de Cacau'), true);
assert.equal(produtoMantemCustoSemPerda('cha de cacau'), true);
assert.equal(produtoMantemCustoSemPerda('Casca'), true);
assert.equal(produtoMantemCustoSemPerda('Nibs'), false);

const umaLinha = preencherProdutosComCoprodutos(
  [{ nome: '', quantidade: 0, unidade: 'kg' }],
  ['Amêndoa Torrada'],
  'kg'
);
assert.equal(umaLinha.length, 1);
assert.equal(umaLinha[0].nome, 'Nibs');

const comNibs = preencherProdutosComCoprodutos(
  [{ nome: 'Nibs', quantidade: 10, unidade: 'kg' }],
  ['Amêndoa Torrada'],
  'kg'
);
assert.equal(comNibs.length, 1);
assert.equal(comNibs[0].nome, 'Nibs');

const segundaLinha = preencherProdutosComCoprodutos(
  [
    { nome: 'Nibs', quantidade: 7, unidade: 'kg' },
    { nome: '', quantidade: 0, unidade: 'kg' },
  ],
  ['Amêndoa Torrada'],
  'kg'
);
assert.equal(segundaLinha[0].nome, 'Nibs');
assert.equal(segundaLinha[1].nome, 'Chá de Cacau');
assert.equal(segundaLinha[0].quantidade, 7);

const ingredientes = [
  { nome: 'Amêndoa Torrada', quantidade: 10, valorUnit: 10, unidade: 'kg', tipo: 'MateriaPrima' },
  { nome: 'Gás de Cozinha', quantidade: 0.5, valorUnit: 12, unidade: 'kg', tipo: 'Energia' },
];
const custoTotal = 10 * 10 + 0.5 * 12;

const alocado = alocarCustoEntreProdutos(
  custoTotal,
  [
    { nome: 'Nibs', quantidade: 7, unidade: 'kg' },
    { nome: 'Chá de Cacau', quantidade: 2, unidade: 'kg' },
  ],
  { ingredientes }
);

assert.equal(alocado[1].custoAlocado, 20, 'chá fica com 2 kg × R$ 10');
assert.equal(alocado[0].custoAlocado, 106, 'nibs leva o custo inteiro: a perda inclui o peso da casca');

const perda = calcularPerdaProducao({
  ingredientes,
  produtos: [
    { nome: 'Nibs', quantidade: 7, unidade: 'kg' },
    { nome: 'Chá de Cacau', quantidade: 2, unidade: 'kg' },
  ],
});
assert.equal(perda?.perdaQuantidade, 3, 'perda = sobra + peso da casca');
assert.equal(perda?.saida, 7, 'saída da perda é o Nibs');
assert.equal(perda?.pesoCasca, 2);
assert.equal(perda?.saidaTotal, 9);
assert.equal(
  loteConsideraPerda([
    { nome: 'Nibs', quantidade: 7, unidade: 'kg' },
    { nome: 'Chá de Cacau', quantidade: 2, unidade: 'kg' },
  ]),
  true
);

const soCha = alocarCustoEntreProdutos(
  100,
  [{ nome: 'Chá de Cacau', quantidade: 2, unidade: 'kg' }],
  { ingredientes: [{ nome: 'Amêndoa Torrada', quantidade: 10, valorUnit: 10, unidade: 'kg', tipo: 'MateriaPrima' }] }
);
assert.equal(soCha[0].custoAlocado, 20, 'chá sozinho não absorve a perda');
assert.equal(
  loteConsideraPerda([{ nome: 'Chá de Cacau', quantidade: 2, unidade: 'kg' }]),
  false
);

const soNibs = alocarCustoEntreProdutos(
  100,
  [{ nome: 'Nibs', quantidade: 7, unidade: 'kg' }],
  { ingredientes: [{ nome: 'Amêndoa Torrada', quantidade: 10, valorUnit: 10, unidade: 'kg', tipo: 'MateriaPrima' }] }
);
assert.equal(soNibs[0].custoAlocado, 100, 'lote só de Nibs continua com o custo inteiro');

const casca = alocarCustoEntreProdutos(
  100,
  [
    { nome: 'Nibs', quantidade: 7, unidade: 'kg' },
    { nome: 'Casca', quantidade: 2, unidade: 'kg' },
  ],
  { ingredientes: [{ nome: 'Amêndoa Torrada', quantidade: 10, valorUnit: 10, unidade: 'kg', tipo: 'MateriaPrima' }] }
);
assert.equal(casca[1].custoAlocado, 20);
assert.equal(casca[0].custoAlocado, 100, 'o peso da casca permanece no valor do Nibs');

const totais = totalizarPerdasPorProduto([
  {
    id: 1,
    data: '2026-08-08',
    lote: 'L1',
    produto: 'Nibs',
    quantidade: 7,
    unidade: 'kg',
    produtos: [
      { nome: 'Nibs', quantidade: 7, unidade: 'kg', custoAlocado: 86 },
      { nome: 'Chá de Cacau', quantidade: 2, unidade: 'kg', custoAlocado: 20 },
    ],
    ingredientes,
    custoEstimado: custoTotal,
    quantidadePerdida: 1,
    percentualPerda: 10,
  },
  {
    id: 2,
    data: '2026-08-08',
    lote: 'L2',
    produto: 'Chá de Cacau',
    quantidade: 2,
    unidade: 'kg',
    produtos: [{ nome: 'Chá de Cacau', quantidade: 2, unidade: 'kg', custoAlocado: 20 }],
    ingredientes: [{ nome: 'Amêndoa Torrada', quantidade: 10, valorUnit: 10, unidade: 'kg', tipo: 'MateriaPrima' }],
    custoEstimado: 100,
    quantidadePerdida: 8,
    percentualPerda: 80,
  },
]);

assert.equal(totais.length, 1);
assert.equal(totais[0].produto, 'Nibs');
assert.equal(totais[0].perdaTotal, 3);
assert.equal(totais[0].saidaTotal, 7);

console.log('✓ Perda fica no Nibs; Chá de Cacau permanece com o custo da matéria-prima');
