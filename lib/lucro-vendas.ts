import { produtosDaProducao } from './estoque';
import { arredondarPreco, arredondarQuantidade } from './format';
import { isVendaFinalizada, subtotalItensVenda } from './vendas';
import type { AppData, EstoqueItem, PrecoGerado, Producao, Venda } from './types';

/**
 * Lucro das vendas concluídas.
 * A receita é o total líquido. O desconto não reduz o custo.
 * A média da produção vem primeiro e já inclui perda, gás e embalagem.
 * Compra do mesmo produto entra nessa média. Sem produção, usa a compra
 * e depois o custo da precificação. Preço de venda no estoque não vira custo.
 */
export interface ItemLucroVenda {
  nome: string;
  unidade: string;
  quantidade: number;
  receita: number;
  custo: number;
  lucro: number;
  /** Não havia custo de produção, compra, precificação nem estoque. */
  semCusto: boolean;
}

export interface DemonstracaoLucroVendas {
  /** Vendas com entrega e pagamento confirmados. */
  vendas: number;
  receita: number;
  custo: number;
  lucro: number;
  /** Lucro ÷ receita, em porcentagem com uma casa. Nulo se a receita é zero. */
  margem: number | null;
  itens: ItemLucroVenda[];
  /** Receita de produtos cujo custo não foi encontrado. Entra inteira no lucro. */
  receitaSemCusto: number;
}

type FontesLucro = Pick<AppData, 'vendas' | 'producoes' | 'compras' | 'precosGerados' | 'estoque'>;

interface FonteCusto {
  quantidade: number;
  custo: number;
}

function chaveNome(nome: string): string {
  return nome.trim().toLowerCase();
}

function chaveProduto(nome: string, unidade: string): string {
  return `${chaveNome(nome)}|${unidade.trim().toLowerCase()}`;
}

function numero(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function somarFonte(mapa: Map<string, FonteCusto>, chave: string, quantidade: number, custo: number) {
  if (!(quantidade > 0) || !(custo > 0)) return;
  const atual = mapa.get(chave) ?? { quantidade: 0, custo: 0 };
  atual.quantidade += quantidade;
  atual.custo += custo;
  mapa.set(chave, atual);
}

function mediaFonte(fontes: Array<FonteCusto | undefined>): number | null {
  let quantidade = 0;
  let custo = 0;
  for (const fonte of fontes) {
    if (!fonte || !(fonte.quantidade > 0) || !(fonte.custo > 0)) continue;
    quantidade += fonte.quantidade;
    custo += fonte.custo;
  }
  if (!(quantidade > 0) || !(custo > 0)) return null;
  return custo / quantidade;
}

function custosDaProducao(producao: Producao): Array<{ chave: string; quantidade: number; custo: number }> {
  const produtos = produtosDaProducao(producao);
  const comCusto = produtos.filter((produto) => numero(produto.custoAlocado) > 0 && produto.quantidade > 0);
  if (comCusto.length > 0) {
    return comCusto.map((produto) => ({
      chave: chaveProduto(produto.nome, produto.unidade),
      quantidade: produto.quantidade,
      custo: numero(produto.custoAlocado),
    }));
  }

  const unico = produtos.length === 1 ? produtos[0] : undefined;
  const custoLote = numero(producao.custoEstimado);
  if (!unico || !(unico.quantidade > 0) || !(custoLote > 0)) return [];
  return [
    {
      chave: chaveProduto(unico.nome, unico.unidade),
      quantidade: unico.quantidade,
      custo: custoLote,
    },
  ];
}

function mapaProducao(producoes: Producao[]): Map<string, FonteCusto> {
  const mapa = new Map<string, FonteCusto>();
  for (const producao of producoes) {
    for (const saida of custosDaProducao(producao)) {
      somarFonte(mapa, saida.chave, saida.quantidade, saida.custo);
    }
  }
  return mapa;
}

function mapaCompras(compras: AppData['compras']): Map<string, FonteCusto> {
  const mapa = new Map<string, FonteCusto>();
  for (const compra of compras) {
    for (const item of compra.itens) {
      const nome = item.nome.trim();
      const quantidade = numero(item.quantidade);
      const valorUnit = numero(item.valorUnit);
      if (!nome || !(quantidade > 0) || !(valorUnit > 0)) continue;
      somarFonte(mapa, chaveProduto(nome, item.unidade ?? ''), quantidade, quantidade * valorUnit);
    }
  }
  return mapa;
}

function mapaPrecos(precos: PrecoGerado[]): Map<string, number> {
  const escolhido = new Map<string, PrecoGerado>();
  for (const preco of precos) {
    if (!(numero(preco.custoUnitario) > 0) || !preco.produto.trim()) continue;
    const chave = chaveProduto(preco.produto, preco.unidade ?? '');
    const atual = escolhido.get(chave);
    if (!atual || preco.data > atual.data || (preco.data === atual.data && preco.id >= atual.id)) {
      escolhido.set(chave, preco);
    }
  }
  const mapa = new Map<string, number>();
  for (const [chave, preco] of escolhido) mapa.set(chave, numero(preco.custoUnitario));
  return mapa;
}

function parecePrecoDeVenda(valor: number, precos: number[]): boolean {
  if (!(valor > 0)) return false;
  return precos.some((preco) => {
    if (!(preco > 0)) return false;
    const diff = Math.abs(valor - preco);
    return diff <= 0.01 || diff / preco <= 0.01;
  });
}

function precosDeVendaConhecidos(
  chave: string,
  precosGerados: PrecoGerado[],
  vendas: Venda[]
): number[] {
  const valores: number[] = [];
  for (const preco of precosGerados) {
    if (chaveProduto(preco.produto, preco.unidade ?? '') === chave && numero(preco.precoSugerido) > 0) {
      valores.push(numero(preco.precoSugerido));
    }
  }
  for (const venda of vendas) {
    for (const item of venda.itens) {
      if (chaveProduto(item.nome, item.unidade ?? '') === chave && numero(item.valorUnit) > 0) {
        valores.push(numero(item.valorUnit));
      }
    }
  }
  return valores;
}

function custoDoEstoque(
  chave: string,
  estoque: EstoqueItem[],
  precosVenda: number[]
): number | null {
  const camadas = estoque.filter((item) => {
    const valor = numero(item.valorUnit);
    return (
      numero(item.quantidade) > 0 &&
      chaveProduto(item.nome, item.unidade ?? '') === chave &&
      valor > 0 &&
      !parecePrecoDeVenda(valor, precosVenda)
    );
  });
  const quantidade = camadas.reduce((acc, item) => acc + numero(item.quantidade), 0);
  if (!(quantidade > 0)) return null;
  const valor = camadas.reduce((acc, item) => acc + numero(item.quantidade) * numero(item.valorUnit), 0);
  return valor > 0 ? valor / quantidade : null;
}

function custoUnitarioDoProduto(
  chave: string,
  producao: Map<string, FonteCusto>,
  compras: Map<string, FonteCusto>,
  precos: Map<string, number>,
  estoque: EstoqueItem[],
  precosGerados: PrecoGerado[],
  vendas: Venda[]
): number | null {
  const daOrigem = mediaFonte([producao.get(chave), compras.get(chave)]);
  if (daOrigem != null && daOrigem > 0) return daOrigem;
  const daPrecificacao = precos.get(chave);
  if (daPrecificacao != null && daPrecificacao > 0) return daPrecificacao;
  return custoDoEstoque(chave, estoque, precosDeVendaConhecidos(chave, precosGerados, vendas));
}

export function formatarMargemLucro(margem: number | null): string {
  if (margem === null || !Number.isFinite(margem)) return '—';
  const texto = margem.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
  return `${texto}%`;
}

export function demonstrarLucroVendas(data: FontesLucro): DemonstracaoLucroVendas {
  const producao = mapaProducao(data.producoes);
  const compras = mapaCompras(data.compras);
  const precos = mapaPrecos(data.precosGerados);

  interface Acumulado {
    nome: string;
    unidade: string;
    quantidade: number;
    receita: number;
    custo: number;
    semCusto: boolean;
  }

  const mapa = new Map<string, Acumulado>();
  let vendas = 0;

  for (const venda of data.vendas) {
    if (!isVendaFinalizada(venda)) continue;
    vendas += 1;
    const subtotal = subtotalItensVenda(venda.itens);
    const ratio = subtotal > 0 ? numero(venda.total) / subtotal : 1;

    for (const item of venda.itens) {
      const nome = item.nome.trim();
      const quantidade = numero(item.quantidade);
      if (!nome || !(quantidade > 0)) continue;
      const unidade = (item.unidade ?? '').trim() || 'un';
      const chave = chaveProduto(nome, unidade);
      const atual = mapa.get(chave) ?? {
        nome,
        unidade,
        quantidade: 0,
        receita: 0,
        custo: 0,
        semCusto: false,
      };
      const unitario = custoUnitarioDoProduto(
        chave,
        producao,
        compras,
        precos,
        data.estoque,
        data.precosGerados,
        data.vendas
      );
      atual.quantidade += quantidade;
      atual.receita += quantidade * numero(item.valorUnit) * ratio;
      atual.semCusto = unitario == null;
      if (unitario != null) atual.custo += quantidade * unitario;
      mapa.set(chave, atual);
    }
  }

  const itens = Array.from(mapa.values())
    .map((item) => {
      const receita = arredondarPreco(item.receita);
      const custo = item.semCusto ? 0 : arredondarPreco(item.custo);
      return {
        nome: item.nome,
        unidade: item.unidade,
        quantidade: arredondarQuantidade(item.quantidade),
        receita,
        custo,
        lucro: arredondarPreco(receita - custo),
        semCusto: item.semCusto,
      };
    })
    .sort(
      (a, b) => b.lucro - a.lucro || a.nome.localeCompare(b.nome, 'pt-BR')
    );

  const receita = arredondarPreco(itens.reduce((acc, item) => acc + item.receita, 0));
  const custo = arredondarPreco(itens.reduce((acc, item) => acc + item.custo, 0));
  const lucro = arredondarPreco(receita - custo);
  const receitaSemCusto = arredondarPreco(
    itens.filter((item) => item.semCusto).reduce((acc, item) => acc + item.receita, 0)
  );

  return {
    vendas,
    receita,
    custo,
    lucro,
    margem: receita > 0 ? Math.round((lucro / receita) * 1000) / 10 : null,
    itens,
    receitaSemCusto,
  };
}
