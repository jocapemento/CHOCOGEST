import { ingredientesMassaProducao, produtosDaProducao } from './estoque';
import { numeroPercentual, textoPercentual } from './nome-produto';
import type { AppData, EstoqueItem, Producao, ProdutoGeradoProducao } from './types';

/**
 * Lotes lançados como Chocolate 60% e gravados como Chocolate 70%
 * porque a lista do navegador trocou o nome do produto.
 */
const CORRECOES_LOTE = [
  {
    lote: 'L1791682857704',
    de: 'Chocolate 70% com Açúcar de Coco Bombom',
    ingrediente: 'Chocolate 60% com Açúcar de Coco',
  },
  {
    lote: 'L1791682976989',
    de: 'Chocolate 70% com Açúcar de Coco Kit Kat',
    ingrediente: 'Chocolate 60% com Açúcar de Coco',
  },
] as const;

function chaveNome(nome: string): string {
  return nome
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/(\d+(?:[.,]\d+)?)\s*%/g, (_, n: string) => `${n.replace(',', '.')}%`)
    .replace(/\s+/g, ' ');
}

function nomeCorrigido(atual: string, de: string, percentual: string): string | null {
  if (chaveNome(atual) !== chaveNome(de)) return null;
  if (!textoPercentual(atual)) return null;
  return atual.replace(/\d+(?:[.,]\d+)?\s*%/, percentual);
}

function ingredienteConfere(producao: Producao, esperado: string): boolean {
  const chave = chaveNome(esperado);
  return ingredientesMassaProducao(producao.ingredientes).some((ing) => chaveNome(ing.nome) === chave);
}

function mesmoCusto(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.000001;
}

function unidadeIgual(a: string | undefined, b: string | undefined): boolean {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
}

function moverEstoqueDoProduto(
  estoque: EstoqueItem[],
  de: string,
  para: string,
  produto: ProdutoGeradoProducao,
  data: string
): EstoqueItem[] {
  const custoUnit =
    produto.quantidade > 0 ? (produto.custoAlocado ?? 0) / produto.quantidade : 0;
  const candidatos = estoque
    .map((item, index) => ({ item, index }))
    .filter(
      ({ item }) =>
        chaveNome(item.nome) === chaveNome(de) &&
        (item.data ?? '') === data &&
        unidadeIgual(item.unidade, produto.unidade) &&
        item.quantidade > 0 &&
        item.quantidade <= produto.quantidade + 0.0001
    );

  const porCusto =
    custoUnit > 0 ? candidatos.filter(({ item }) => mesmoCusto(item.valorUnit, custoUnit)) : [];
  const escolhidos =
    porCusto.length > 0
      ? porCusto
      : candidatos.filter(({ item }) => Math.abs(item.quantidade - produto.quantidade) < 0.001);

  if (escolhidos.length === 0) return estoque;
  if (porCusto.length === 0 && escolhidos.length !== 1) return estoque;

  const ordenados = [...escolhidos].sort((a, b) => {
    const aExato = Math.abs(a.item.quantidade - produto.quantidade) < 0.001 ? 0 : 1;
    const bExato = Math.abs(b.item.quantidade - produto.quantidade) < 0.001 ? 0 : 1;
    if (aExato !== bExato) return aExato - bExato;
    return b.item.id - a.item.id;
  });
  const renomear = new Set<number>();
  let restante = produto.quantidade;
  for (const candidato of ordenados) {
    if (restante <= 0.0001) break;
    if (candidato.item.quantidade - restante > 0.0001) continue;
    renomear.add(candidato.index);
    restante -= candidato.item.quantidade;
  }
  if (renomear.size === 0) return estoque;

  return estoque.map((item, index) => (renomear.has(index) ? { ...item, nome: para } : item));
}

function corrigirProducao(producao: Producao, de: string, percentual: string): Producao {
  const produtos = (producao.produtos ?? []).map((produto) => {
    const nome = nomeCorrigido(produto.nome, de, percentual);
    return nome ? { ...produto, nome } : produto;
  });
  const produtoLegado = nomeCorrigido(producao.produto, de, percentual);
  return {
    ...producao,
    produtos,
    produto: produtoLegado ?? producao.produto,
  };
}

function mesmaFamiliaDeNome(a: string, b: string): boolean {
  const semPercentual = (nome: string) => chaveNome(nome).replace(/\d+(?:[.,]\d+)?%/g, '%');
  return semPercentual(a) === semPercentual(b);
}

/** Corrige o nome gravado nesses lotes e a camada de estoque que eles geraram. */
export function corrigirNomeTrocadoDosLotes(data: AppData): AppData {
  let producoes = data.producoes;
  let estoque = data.estoque;

  for (const correcao of CORRECOES_LOTE) {
    const atual = producoes.find((producao) => producao.lote === correcao.lote);
    if (!atual || !ingredienteConfere(atual, correcao.ingrediente)) continue;

    const percentual = numeroPercentual(correcao.ingrediente);
    if (!percentual) continue;
    const pctTexto = `${percentual}%`;

    const precisaRenomear = produtosDaProducao(atual).some(
      (produto) => nomeCorrigido(produto.nome, correcao.de, pctTexto) != null
    );
    const corrigida = precisaRenomear ? corrigirProducao(atual, correcao.de, pctTexto) : atual;
    if (precisaRenomear) {
      producoes = producoes.map((producao) => (producao.id === atual.id ? corrigida : producao));
    }

    for (const produto of produtosDaProducao(corrigida)) {
      if (numeroPercentual(produto.nome) !== percentual) continue;
      if (!mesmaFamiliaDeNome(produto.nome, correcao.de)) continue;
      estoque = moverEstoqueDoProduto(estoque, correcao.de, produto.nome, produto, atual.data);
    }
  }

  if (producoes === data.producoes && estoque === data.estoque) return data;
  return { ...data, producoes, estoque };
}
