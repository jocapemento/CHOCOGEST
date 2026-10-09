import {
  agruparEstoque,
  catalogoNomesProdutos,
  catalogoProdutosProduzidos,
  custoUltimaProducaoDoProduto,
  type SaldoEstoque,
} from '@/lib/estoque';
import { arredondarPreco, arredondarQuantidade } from '@/lib/format';
import { ultimoPrecoRegistrado } from '@/lib/preco-venda';
import type { AppData, EstoqueItem, PrecoGerado, Producao } from '@/lib/types';

export {
  calcularPrecoSugerido,
  historicoPrecosDoProduto,
  historicoPrecosOrdenado,
  nomeProdutoIgual,
  precoUnitarioParaVenda,
  ultimoPrecoRegistrado,
} from '@/lib/preco-venda';

export interface ResumoProdutoPrecificado {
  produto: string;
  unidade: string;
  quantidade: number;
  custoUnitario: number;
  margemLucro: number | null;
  precoSugerido: number | null;
  dataPreco: string | null;
  valorCustoTotal: number;
  valorVendaTotal: number | null;
  lucroPotencial: number | null;
}

export interface TotaisProdutosPrecificados {
  quantidadeProdutos: number;
  valorCustoTotal: number;
  valorVendaTotal: number;
  lucroPotencialTotal: number;
  comPrecoRegistrado: number;
  semPrecoRegistrado: number;
}

export interface ResumoPrecificacaoDashboard {
  itens: ResumoProdutoPrecificado[];
  totais: TotaisProdutosPrecificados;
}

/** Produto disponível no formulário de precificação (com ou sem estoque atual). */
export interface ProdutoParaPrecificacao {
  nome: string;
  unidade: string;
  custoUnitario: number;
  quantidade: number;
  origemCusto: 'estoque' | 'producao' | 'historico' | 'zero';
}

function arredondar(valor: number): number {
  return arredondarPreco(valor);
}

function custoUltimaProducao(
  producoes: Producao[],
  produto: string
): { custoUnitario: number; unidade: string } | null {
  return custoUltimaProducaoDoProduto(producoes, produto);
}

/**
 * Catálogo de produtos para precificar: estoque (ProdutoAcabado), produções
 * e produtos que já têm preço no histórico — mesmo com saldo zero.
 */
export function catalogoProdutosPrecificacao(
  estoque: EstoqueItem[],
  producoes: Producao[],
  precosGerados: PrecoGerado[]
): ProdutoParaPrecificacao[] {
  const saldo = agruparEstoque(estoque);
  const mapaSaldo = new Map<string, SaldoEstoque>();
  for (const s of saldo) {
    mapaSaldo.set(s.nome.toLowerCase(), s);
  }

  const nomes = new Map<string, string>(); // key lower -> display name

  for (const s of saldo) {
    if (s.tipo === 'ProdutoAcabado') {
      nomes.set(s.nome.toLowerCase(), s.nome);
    }
  }
  for (const nome of catalogoNomesProdutos(producoes)) {
    const key = nome.toLowerCase();
    if (!nomes.has(key)) nomes.set(key, nome);
  }
  for (const p of precosGerados) {
    const nome = p.produto.trim();
    if (!nome) continue;
    const key = nome.toLowerCase();
    if (!nomes.has(key)) nomes.set(key, nome);
  }

  return Array.from(nomes.entries())
    .map(([key, nome]) => {
      const s = mapaSaldo.get(key);
      const ultimoPreco = ultimoPrecoRegistrado(precosGerados, nome);
      const daProducao = custoUltimaProducao(producoes, nome);

      let custoUnitario = 0;
      let unidade = 'un';
      let origemCusto: ProdutoParaPrecificacao['origemCusto'] = 'zero';

      if (s && s.quantidade > 0 && s.valorUnit > 0) {
        custoUnitario = s.valorUnit;
        unidade = s.unidade;
        origemCusto = 'estoque';
      } else if (daProducao && daProducao.custoUnitario > 0) {
        custoUnitario = daProducao.custoUnitario;
        unidade = daProducao.unidade;
        origemCusto = 'producao';
      } else if (ultimoPreco && ultimoPreco.custoUnitario > 0) {
        custoUnitario = ultimoPreco.custoUnitario;
        unidade = ultimoPreco.unidade || daProducao?.unidade || s?.unidade || 'un';
        origemCusto = 'historico';
      } else {
        unidade = s?.unidade ?? daProducao?.unidade ?? ultimoPreco?.unidade ?? 'un';
        custoUnitario = s?.valorUnit ?? daProducao?.custoUnitario ?? ultimoPreco?.custoUnitario ?? 0;
      }

      return {
        nome,
        unidade,
        custoUnitario,
        quantidade: arredondarQuantidade(s?.quantidade ?? 0),
        origemCusto,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function totalizarProdutosPrecificados(
  estoque: AppData['estoque'],
  producoes: Producao[],
  precosGerados: PrecoGerado[]
): ResumoPrecificacaoDashboard {
  // Inclui saldo de tudo que saiu de produção, mesmo se o item for matéria-prima
  // da cadeia (Amêndoa Torrada). O card "Produtos gerados" continua filtrando isso.
  const saldos = catalogoProdutosProduzidos(producoes, estoque);
  const nomesCatalogo = catalogoNomesProdutos(producoes);

  const mapaSaldo = new Map<string, SaldoEstoque>();
  for (const s of saldos) {
    mapaSaldo.set(s.nome.toLowerCase(), s);
  }

  const nomes = new Set<string>();
  for (const nome of nomesCatalogo) nomes.add(nome.toLowerCase());
  for (const s of saldos) nomes.add(s.nome.toLowerCase());

  const itens: ResumoProdutoPrecificado[] = Array.from(nomes)
    .map((key) => {
      const saldo = mapaSaldo.get(key);
      const produto = saldo?.nome ?? nomesCatalogo.find((n) => n.toLowerCase() === key) ?? key;
      const ultimoPreco = ultimoPrecoRegistrado(precosGerados, produto);
      const quantidade = arredondarQuantidade(saldo?.quantidade ?? 0);
      const custoUnitario = saldo?.valorUnit ?? ultimoPreco?.custoUnitario ?? 0;
      const unidade = saldo?.unidade ?? ultimoPreco?.unidade ?? 'un';
      const precoSugerido = ultimoPreco?.precoSugerido ?? null;
      const valorCustoTotal = arredondar(quantidade * custoUnitario);
      const valorVendaTotal =
        precoSugerido !== null ? arredondar(quantidade * precoSugerido) : null;
      const lucroPotencial =
        valorVendaTotal !== null ? arredondar(valorVendaTotal - valorCustoTotal) : null;

      return {
        produto,
        unidade,
        quantidade,
        custoUnitario,
        margemLucro: ultimoPreco?.margemLucro ?? null,
        precoSugerido,
        dataPreco: ultimoPreco?.data ?? null,
        valorCustoTotal,
        valorVendaTotal,
        lucroPotencial,
      };
    })
    .filter((i) => i.quantidade > 0 || i.precoSugerido !== null)
    .sort((a, b) => a.produto.localeCompare(b.produto, 'pt-BR'));

  const comPreco = itens.filter((i) => i.precoSugerido !== null);
  const semPreco = itens.filter((i) => i.precoSugerido === null && i.quantidade > 0);

  const totais: TotaisProdutosPrecificados = {
    quantidadeProdutos: itens.filter((i) => i.quantidade > 0).length,
    valorCustoTotal: arredondar(sumBy(itens, (i) => i.valorCustoTotal)),
    valorVendaTotal: arredondar(sumBy(comPreco, (i) => i.valorVendaTotal ?? 0)),
    lucroPotencialTotal: arredondar(sumBy(comPreco, (i) => i.lucroPotencial ?? 0)),
    comPrecoRegistrado: comPreco.length,
    semPrecoRegistrado: semPreco.length,
  };

  return { itens, totais };
}

function sumBy<T>(items: T[], fn: (item: T) => number): number {
  return items.reduce((acc, item) => acc + fn(item), 0);
}