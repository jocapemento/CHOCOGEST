import {
  agruparEstoque,
  catalogoNomesProdutos,
  filtrarSaldoProdutosGerados,
  type SaldoEstoque,
} from '@/lib/estoque';
import type { AppData, PrecoGerado, Producao } from '@/lib/types';

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

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export function ultimoPrecoRegistrado(
  precosGerados: PrecoGerado[],
  produto: string
): PrecoGerado | undefined {
  return precosGerados
    .filter((p) => p.produto.toLowerCase() === produto.toLowerCase())
    .sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id)[0];
}

/** Preço unitário para venda: prioriza o último preço registrado em Precificação. */
export function precoUnitarioParaVenda(
  precosGerados: PrecoGerado[],
  produto: string,
  custoUnitario = 0
): { valor: number; origem: 'precificacao' | 'custo'; registro?: PrecoGerado } {
  const registro = ultimoPrecoRegistrado(precosGerados, produto);
  if (registro && registro.precoSugerido > 0) {
    return { valor: registro.precoSugerido, origem: 'precificacao', registro };
  }
  return { valor: custoUnitario, origem: 'custo' };
}

export function totalizarProdutosPrecificados(
  estoque: AppData['estoque'],
  producoes: Producao[],
  precosGerados: PrecoGerado[]
): ResumoPrecificacaoDashboard {
  const saldoEstoque = agruparEstoque(estoque);
  const saldos = filtrarSaldoProdutosGerados(saldoEstoque, producoes);
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
      const quantidade = saldo?.quantidade ?? 0;
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