import { arredondarQuantidade } from './format';
import { massaRegistrada } from './fracionar-massa';
import type {
  AppData,
  EstoqueItem,
  ItemMovimentacao,
  PrecoGerado,
  Producao,
  ProdutoGeradoProducao,
  Venda,
} from './types';

/**
 * Editar ou excluir uma venda concluída devolve o item ao estoque.
 * O valor da linha é o preço de venda. Regravar esse preço como custo
 * puxa a média para cima e a produção seguinte fica cara demais.
 */
const FOLGA_ACIMA_DO_CUSTO = 1.05;

function chave(nome: string): string {
  return nome.trim().toLowerCase();
}

function proximo(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  if (diff <= 1e-6) return true;
  const base = Math.max(Math.abs(a), Math.abs(b));
  return base > 0 && diff / base <= 1e-6;
}

function afastadoDoCusto(valor: number, custo: number): boolean {
  if (!(custo > 0)) return true;
  return Math.abs(valor - custo) / custo > FOLGA_ACIMA_DO_CUSTO - 1;
}

interface CustosDoProduto {
  custos: number[];
  medio: number;
}

function custosDosProdutos(producoes: Producao[]): Map<string, CustosDoProduto> {
  const acc = new Map<string, { custo: number; qtd: number; custos: number[] }>();

  for (const producao of producoes) {
    const saidas =
      Array.isArray(producao.produtos) && producao.produtos.length > 0
        ? producao.produtos
        : producao.produto
          ? [
              {
                nome: producao.produto,
                quantidade: producao.quantidade,
                custoAlocado: producao.custoEstimado,
              },
            ]
          : [];

    for (const saida of saidas) {
      const nome = (saida.nome ?? '').trim();
      const qtd = Number(saida.quantidade) || 0;
      const custo = Number(saida.custoAlocado);
      if (!nome || qtd <= 0 || !(custo > 0)) continue;
      const key = chave(nome);
      const atual = acc.get(key) ?? { custo: 0, qtd: 0, custos: [] };
      atual.custo += custo;
      atual.qtd += qtd;
      atual.custos.push(custo / qtd);
      acc.set(key, atual);
    }
  }

  const mapa = new Map<string, CustosDoProduto>();
  for (const [key, item] of acc) {
    if (item.qtd > 0) mapa.set(key, { custos: item.custos, medio: item.custo / item.qtd });
  }
  return mapa;
}

function precosDeVendaAfastados(
  nome: string,
  precosGerados: PrecoGerado[],
  vendas: Venda[],
  custos: number[]
): number[] {
  const key = chave(nome);
  const valores: number[] = [];

  for (const preco of precosGerados) {
    if (chave(preco.produto) === key && preco.precoSugerido > 0) valores.push(preco.precoSugerido);
  }
  for (const venda of vendas) {
    for (const item of venda.itens) {
      if (chave(item.nome) === key && item.valorUnit > 0) valores.push(item.valorUnit);
    }
  }

  return valores.filter((valor) => custos.every((custo) => afastadoDoCusto(valor, custo)));
}

function ehPrecoDeVenda(valor: number, precos: number[]): boolean {
  return precos.some((preco) => proximo(valor, preco));
}

function mediaCamadasDeCusto(
  estoque: EstoqueItem[],
  nome: string,
  precosAfastados: number[]
): number | null {
  const key = chave(nome);
  const camadas = estoque.filter(
    (item) =>
      item.quantidade > 0 &&
      chave(item.nome) === key &&
      !ehPrecoDeVenda(item.valorUnit, precosAfastados)
  );
  const qtd = camadas.reduce((acc, item) => acc + item.quantidade, 0);
  if (qtd <= 0) return null;
  const valor = camadas.reduce((acc, item) => acc + item.quantidade * item.valorUnit, 0);
  return valor / qtd;
}

/** Custo para devolver ao estoque. Não usa o preço de venda da linha. */
export function custoParaReporEstoque(
  item: Pick<ItemMovimentacao, 'nome' | 'valorUnit'>,
  data: Pick<AppData, 'estoque' | 'producoes' | 'precosGerados' | 'vendas'>
): number {
  const info = custosDosProdutos(data.producoes).get(chave(item.nome));
  const custos = info?.custos ?? [];
  const precos = precosDeVendaAfastados(item.nome, data.precosGerados, data.vendas, custos);
  const dasCamadas = mediaCamadasDeCusto(data.estoque, item.nome, precos);
  if (dasCamadas != null && dasCamadas > 0) return dasCamadas;
  if (info && info.medio > 0) return info.medio;
  return item.valorUnit;
}

function alocarCusto(
  custoTotal: number,
  produtos: ProdutoGeradoProducao[]
): ProdutoGeradoProducao[] {
  const partes = produtos.map((produto) => massaRegistrada(produto));
  if (partes.length === 0) return produtos;
  const unidade = partes[0].unidade || 'kg';
  const mesma = partes.every(
    (parte) => (parte.unidade || 'kg').toLowerCase() === unidade.toLowerCase()
  );
  const total = mesma ? partes.reduce((acc, parte) => acc + parte.quantidade, 0) : 0;
  if (total <= 0) return produtos.map((produto) => ({ ...produto, custoAlocado: 0 }));
  return produtos.map((produto, idx) => ({
    ...produto,
    custoAlocado: arredondarQuantidade((custoTotal * partes[idx].quantidade) / total),
  }));
}

function custoLimpoDoProduto(
  nome: string,
  estoque: EstoqueItem[],
  info: CustosDoProduto,
  precosGerados: PrecoGerado[],
  vendas: Venda[]
): number {
  const precos = precosDeVendaAfastados(nome, precosGerados, vendas, info.custos);
  return mediaCamadasDeCusto(estoque, nome, precos) ?? info.medio;
}

/**
 * Tira do estoque o preço de venda que voltou numa edição de venda
 * e refaz o lote que usou essa média inflada.
 */
export function corrigirCustosDevolvidosComoPreco(data: AppData): AppData {
  const mapa = custosDosProdutos(data.producoes);
  const trocasDeSaida: Array<{ nome: string; antigo: number; novo: number }> = [];

  const producoes = data.producoes.map((producao) => {
    let mudou = false;
    const ingredientes = producao.ingredientes.map((ing) => {
      const info = mapa.get(chave(ing.nome));
      if (!info || info.custos.length === 0) return ing;
      const teto = Math.max(...info.custos) * FOLGA_ACIMA_DO_CUSTO;
      if (!(ing.valorUnit > teto)) return ing;
      const precos = precosDeVendaAfastados(ing.nome, data.precosGerados, data.vendas, info.custos);
      const temCamadaNoPreco = data.estoque.some(
        (item) =>
          item.quantidade > 0 &&
          chave(item.nome) === chave(ing.nome) &&
          ehPrecoDeVenda(item.valorUnit, precos)
      );
      if (!temCamadaNoPreco && !ehPrecoDeVenda(ing.valorUnit, precos)) return ing;
      mudou = true;
      return { ...ing, valorUnit: custoLimpoDoProduto(ing.nome, data.estoque, info, data.precosGerados, data.vendas) };
    });
    if (!mudou) return producao;

    const custoEstimado = ingredientes.reduce((acc, ing) => acc + ing.quantidade * ing.valorUnit, 0);
    const produtosAntigos = producao.produtos ?? [];
    const produtos = alocarCusto(custoEstimado, produtosAntigos);
    produtosAntigos.forEach((antigo, idx) => {
      const novo = produtos[idx];
      if (!antigo || !novo || antigo.quantidade <= 0) return;
      const vuAntigo =
        antigo.custoAlocado != null && antigo.custoAlocado > 0
          ? antigo.custoAlocado / antigo.quantidade
          : 0;
      const vuNovo = novo.quantidade > 0 ? (novo.custoAlocado ?? 0) / novo.quantidade : 0;
      if (vuAntigo > 0 && !proximo(vuAntigo, vuNovo)) {
        trocasDeSaida.push({ nome: antigo.nome, antigo: vuAntigo, novo: vuNovo });
      }
    });

    return { ...producao, ingredientes, custoEstimado, produtos };
  });

  let estoque = data.estoque.map((item) => {
    const troca = trocasDeSaida.find(
      (itemTroca) => chave(itemTroca.nome) === chave(item.nome) && proximo(item.valorUnit, itemTroca.antigo)
    );
    if (!troca) return item;
    return { ...item, valorUnit: troca.novo };
  });

  const mapaCorrigido = custosDosProdutos(producoes);
  estoque = estoque.map((item) => {
    if (item.quantidade <= 0) return item;
    const info = mapaCorrigido.get(chave(item.nome));
    if (!info) return item;
    const precos = precosDeVendaAfastados(item.nome, data.precosGerados, data.vendas, info.custos);
    if (!ehPrecoDeVenda(item.valorUnit, precos)) return item;
    const custo = mediaCamadasDeCusto(estoque, item.nome, precos) ?? info.medio;
    if (!(custo > 0) || proximo(item.valorUnit, custo)) return item;
    return { ...item, valorUnit: custo };
  });

  return { ...data, producoes, estoque };
}
