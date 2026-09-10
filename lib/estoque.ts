import { ehInsumoEnergia, ehMateriaPrimaCadeia, tipoEstoqueCadeia } from '@/lib/cadeia-producao';
import type {
  Compra,
  EstoqueItem,
  ItemMovimentacao,
  Producao,
  ProdutoGeradoProducao,
  TipoItem,
  Venda,
} from '@/lib/types';

export interface VendaComProduto {
  vendaId: number;
  data: string;
  cliente: string;
  quantidade: number;
}

export interface SaldoEstoque {
  nome: string;
  tipo: TipoItem;
  unidade: string;
  quantidade: number;
  valorUnit: number;
}

export function agruparEstoque(estoque: EstoqueItem[]): SaldoEstoque[] {
  const map = new Map<string, SaldoEstoque>();

  for (const item of estoque) {
    if (item.quantidade <= 0) continue;
    const key = item.nome.toLowerCase();
    const existing = map.get(key);

    if (existing) {
      const qtd = existing.quantidade + item.quantidade;
      const valorMedio =
        qtd > 0
          ? (existing.quantidade * existing.valorUnit + item.quantidade * item.valorUnit) / qtd
          : item.valorUnit;
      map.set(key, { ...existing, quantidade: qtd, valorUnit: valorMedio });
    } else {
      map.set(key, {
        nome: item.nome,
        tipo: item.tipo,
        unidade: item.unidade,
        quantidade: item.quantidade,
        valorUnit: item.valorUnit,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function quantidadeDisponivel(estoque: EstoqueItem[], nome: string): number {
  return estoque
    .filter((e) => e.nome.toLowerCase() === nome.toLowerCase() && e.quantidade > 0)
    .reduce((acc, e) => acc + e.quantidade, 0);
}

function compararLancamentosFifo(a: EstoqueItem, b: EstoqueItem): number {
  const dateCmp = (a.data ?? '').localeCompare(b.data ?? '');
  if (dateCmp !== 0) return dateCmp;
  return a.id - b.id;
}

/** Baixa quantidade do estoque pelo método FIFO (lançamento mais antigo primeiro). */
export function baixarEstoqueFifo(
  estoque: EstoqueItem[],
  itens: ItemMovimentacao[]
): EstoqueItem[] {
  const updated = estoque.map((e) => ({ ...e }));

  for (const item of itens) {
    let restante = item.quantidade;
    const nome = item.nome.toLowerCase();

    const indices = updated
      .map((entry, index) => ({ entry, index }))
      .filter(
        ({ entry }) =>
          entry.nome.toLowerCase() === nome &&
          entry.quantidade > 0 &&
          entry.tipo === item.tipo
      )
      .sort((a, b) => compararLancamentosFifo(a.entry, b.entry))
      .map(({ index }) => index);

    for (const index of indices) {
      if (restante <= 0) break;

      const baixa = Math.min(updated[index].quantidade, restante);
      updated[index] = { ...updated[index], quantidade: updated[index].quantidade - baixa };
      restante -= baixa;
    }
  }

  return updated.filter((e) => e.quantidade > 0);
}

export function vendasDoProduto(vendas: Venda[], produto: string): VendaComProduto[] {
  const key = produto.toLowerCase();
  const result: VendaComProduto[] = [];

  for (const venda of vendas) {
    if ((venda.status ?? 'concluida') !== 'concluida') continue;
    const quantidade = venda.itens
      .filter((i) => i.nome.toLowerCase() === key)
      .reduce((acc, i) => acc + i.quantidade, 0);
    if (quantidade > 0) {
      result.push({
        vendaId: venda.id,
        data: venda.data,
        cliente: venda.cliente,
        quantidade,
      });
    }
  }

  return result.sort((a, b) => b.data.localeCompare(a.data));
}

export function totalVendidoProduto(vendas: Venda[], produto: string): number {
  return vendasDoProduto(vendas, produto).reduce((acc, v) => acc + v.quantidade, 0);
}

export function materiasPrimasDisponiveis(estoque: EstoqueItem[]): string[] {
  return agruparEstoquePorNomeTipo(estoque)
    .filter((s) => s.tipo === 'MateriaPrima' && s.quantidade > 0)
    .map((s) => s.nome)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function agruparEstoquePorNomeTipo(estoque: EstoqueItem[]): SaldoEstoque[] {
  const map = new Map<string, SaldoEstoque>();

  for (const item of estoque) {
    if (item.quantidade <= 0) continue;
    const key = `${item.nome.toLowerCase()}|${item.tipo}`;
    const existing = map.get(key);

    if (existing) {
      const qtd = existing.quantidade + item.quantidade;
      const valorMedio =
        qtd > 0
          ? (existing.quantidade * existing.valorUnit + item.quantidade * item.valorUnit) / qtd
          : item.valorUnit;
      map.set(key, { ...existing, quantidade: qtd, valorUnit: valorMedio });
    } else {
      map.set(key, {
        nome: item.nome,
        tipo: item.tipo,
        unidade: item.unidade,
        quantidade: item.quantidade,
        valorUnit: item.valorUnit,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function saldoIngrediente(estoque: EstoqueItem[], nome: string): SaldoEstoque | undefined {
  return agruparEstoque(estoque).find((s) => s.nome.toLowerCase() === nome.toLowerCase());
}

export function resolverTipoIngredienteProducao(
  ingrediente: Producao['ingredientes'][number],
  producoes: Producao[]
): TipoItem {
  return tipoEstoqueCadeia(
    ingrediente.nome,
    ingrediente.tipo ??
      (isProdutoGerado(ingrediente.nome, producoes) ? 'ProdutoAcabado' : 'MateriaPrima')
  );
}

export function saldoIngredienteProducao(
  estoque: EstoqueItem[],
  nome: string,
  producoes: Producao[],
  tipo?: TipoItem
): SaldoEstoque | undefined {
  const tipoResolvido = tipoEstoqueCadeia(
    nome,
    tipo ?? (isProdutoGerado(nome, producoes) ? 'ProdutoAcabado' : 'MateriaPrima')
  );

  return agruparEstoquePorNomeTipo(estoque).find(
    (s) => s.nome.toLowerCase() === nome.toLowerCase() && s.tipo === tipoResolvido
  );
}

export interface IngredienteProducaoDisponivel extends SaldoEstoque {
  origem: 'compra' | 'producao' | 'energia';
}

const ORDEM_ORIGEM_INSUMO: Record<IngredienteProducaoDisponivel['origem'], number> = {
  compra: 0,
  producao: 1,
  energia: 2,
};

/** Energia (gás) entra no custo do lote, mas não na perda de massa. */
export function ehInsumoCustoProducao(ingrediente: {
  nome: string;
  tipo?: TipoItem;
}): boolean {
  if (ehInsumoEnergia(ingrediente.nome)) return true;
  return ingrediente.tipo === 'Energia';
}

export function ingredientesMassaProducao(
  ingredientes: Producao['ingredientes']
): Producao['ingredientes'] {
  return ingredientes.filter((ing) => !ehInsumoCustoProducao(ing));
}

export function insumosEnergiaProducao(
  ingredientes: Producao['ingredientes']
): Producao['ingredientes'] {
  return ingredientes.filter((ing) => ehInsumoCustoProducao(ing));
}

export function custoItensProducao(
  itens: Array<{ quantidade: number; valorUnit: number }>
): number {
  return itens.reduce((acc, i) => acc + i.quantidade * i.valorUnit, 0);
}

export function custoMassaProducao(ingredientes: Producao['ingredientes']): number {
  return custoItensProducao(ingredientesMassaProducao(ingredientes));
}

export function custoEnergiaProducao(ingredientes: Producao['ingredientes']): number {
  return custoItensProducao(insumosEnergiaProducao(ingredientes));
}

export function ingredientesProducaoDisponiveis(
  estoque: EstoqueItem[],
  producoes: Producao[]
): IngredienteProducaoDisponivel[] {
  const nomesProduzidos = nomesProdutosGerados(producoes);

  return agruparEstoquePorNomeTipo(estoque)
    .filter((s) => {
      if (s.quantidade <= 0) return false;
      if (s.tipo === 'MateriaPrima' || s.tipo === 'Energia') return true;
      return s.tipo === 'ProdutoAcabado' && nomesProduzidos.has(s.nome.toLowerCase());
    })
    .map((s) => ({
      ...s,
      origem:
        s.tipo === 'Energia'
          ? ('energia' as const)
          : s.tipo === 'ProdutoAcabado'
            ? ('producao' as const)
            : ('compra' as const),
    }))
    .sort((a, b) => {
      const origemCmp = ORDEM_ORIGEM_INSUMO[a.origem] - ORDEM_ORIGEM_INSUMO[b.origem];
      if (origemCmp !== 0) return origemCmp;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });
}

export function validarIngredientesProducao(
  estoque: EstoqueItem[],
  producao: Producao,
  producoes: Producao[]
): string | null {
  const disponiveis = ingredientesProducaoDisponiveis(estoque, producoes);

  for (const ing of producao.ingredientes) {
    const tipo = resolverTipoIngredienteProducao(ing, producoes);
    const saldo = saldoIngredienteProducao(estoque, ing.nome, producoes, tipo);

    if (!saldo || saldo.quantidade <= 0) {
      const lista =
        disponiveis.length > 0
          ? `\n\nIngredientes disponíveis:\n${disponiveis.map((d) => `  — ${d.nome}${d.origem === 'producao' ? ' (produzido)' : d.origem === 'energia' ? ' (gás)' : ''}`).join('\n')}`
          : '\n\nNenhum ingrediente com saldo no estoque.';
      return `Ingrediente "${ing.nome}" não existe no estoque.${lista}`;
    }

    if (ing.unidade && saldo.unidade.toLowerCase() !== ing.unidade.toLowerCase()) {
      return `Ingrediente "${ing.nome}": unidade "${ing.unidade}" não confere com o estoque ("${saldo.unidade}").`;
    }

    if (saldo.quantidade < ing.quantidade) {
      return `Ingrediente "${ing.nome}" insuficiente (disponível: ${saldo.quantidade} ${saldo.unidade}, necessário: ${ing.quantidade}${ing.unidade ? ` ${ing.unidade}` : ''}).`;
    }
  }

  return null;
}



export interface ItemCatalogo {
  nome: string;
  tipo: TipoItem;
  unidade: string;
  valorUnit: number;
}

const ITENS_CONHECIDOS_ESTOQUE: ItemCatalogo[] = [
  { nome: 'Amêndoa Torrada', tipo: 'MateriaPrima', unidade: 'kg', valorUnit: 0 },
  { nome: 'Gás de Cozinha', tipo: 'Energia', unidade: 'kg', valorUnit: 0 },
];

export function catalogoItensLancados(compras: Compra[], estoque: EstoqueItem[]): ItemCatalogo[] {
  const map = new Map<string, ItemCatalogo>();

  for (const compra of compras) {
    for (const item of compra.itens) {
      if (!item.nome.trim()) continue;
      map.set(item.nome.toLowerCase(), {
        nome: item.nome,
        tipo: tipoEstoqueCadeia(item.nome, item.tipo),
        unidade: item.unidade,
        valorUnit: item.valorUnit,
      });
    }
  }

  for (const item of agruparEstoque(estoque)) {
    const key = item.nome.toLowerCase();
    if (!map.has(key)) {
      map.set(key, {
        nome: item.nome,
        tipo: tipoEstoqueCadeia(item.nome, item.tipo),
        unidade: item.unidade,
        valorUnit: item.valorUnit,
      });
    }
  }

  for (const item of ITENS_CONHECIDOS_ESTOQUE) {
    const key = item.nome.toLowerCase();
    if (!map.has(key)) {
      map.set(key, item);
    } else {
      const existing = map.get(key)!;
      map.set(key, { ...existing, tipo: tipoEstoqueCadeia(existing.nome, existing.tipo) });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function totalEntradaIngredientes(
  ingredientes: Producao['ingredientes']
): { total: number; unidade: string } | null {
  const massa = ingredientesMassaProducao(ingredientes);
  if (massa.length === 0) return null;

  const unidade = massa[0].unidade ?? 'kg';
  for (const ing of massa) {
    const u = ing.unidade ?? 'kg';
    if (u.toLowerCase() !== unidade.toLowerCase()) return null;
  }

  const total = massa.reduce((acc, ing) => acc + ing.quantidade, 0);
  return { total, unidade };
}

/** Normaliza saídas de um lote: usa `produtos` ou cai no campo legado `produto`. */
export function produtosDaProducao(
  producao: Pick<Producao, 'produto' | 'quantidade' | 'unidade'> & {
    produtos?: ProdutoGeradoProducao[];
  }
): ProdutoGeradoProducao[] {
  if (Array.isArray(producao.produtos) && producao.produtos.length > 0) {
    return producao.produtos
      .map((p) => ({
        nome: (p.nome ?? '').trim(),
        quantidade: Number(p.quantidade) || 0,
        unidade: (p.unidade ?? 'kg').trim() || 'kg',
        custoAlocado: p.custoAlocado,
      }))
      .filter((p) => p.nome.length > 0);
  }

  const nome = (producao.produto ?? '').trim();
  if (!nome) return [];
  return [
    {
      nome,
      quantidade: Number(producao.quantidade) || 0,
      unidade: (producao.unidade ?? 'kg').trim() || 'kg',
    },
  ];
}

export function rotuloProdutosProducao(
  producao: Pick<Producao, 'produto' | 'quantidade' | 'unidade'> & {
    produtos?: ProdutoGeradoProducao[];
  }
): string {
  const produtos = produtosDaProducao(producao);
  if (produtos.length === 0) return producao.produto?.trim() || '—';
  return produtos.map((p) => p.nome).join(' + ');
}

export function totalSaidaProdutos(
  produtos: ProdutoGeradoProducao[]
): { total: number; unidade: string } | null {
  if (produtos.length === 0) return null;

  const unidade = produtos[0].unidade || 'kg';
  for (const p of produtos) {
    if ((p.unidade || 'kg').toLowerCase() !== unidade.toLowerCase()) return null;
  }

  const total = produtos.reduce((acc, p) => acc + p.quantidade, 0);
  return { total, unidade };
}

/** Rateia o custo total do lote (matéria-prima + gás) por massa entre os produtos de saída. */
export function alocarCustoEntreProdutos(
  custoTotal: number,
  produtos: ProdutoGeradoProducao[]
): ProdutoGeradoProducao[] {
  const saida = totalSaidaProdutos(produtos);
  const totalQtd = saida?.total ?? 0;

  if (totalQtd <= 0) {
    return produtos.map((p) => ({ ...p, custoAlocado: 0 }));
  }

  return produtos.map((p) => ({
    ...p,
    custoAlocado: arredondarQuantidade((custoTotal * p.quantidade) / totalQtd),
  }));
}

/** Espelha o 1º produto nos campos legados `produto`/`quantidade`/`unidade`. */
export function espelharCamposLegadoProducao(produtos: ProdutoGeradoProducao[]): {
  produto: string;
  quantidade: number;
  unidade: string;
} {
  const primeiro = produtos[0];
  if (!primeiro) {
    return { produto: '', quantidade: 0, unidade: 'kg' };
  }
  return {
    produto: primeiro.nome,
    quantidade: primeiro.quantidade,
    unidade: primeiro.unidade || 'kg',
  };
}

export function montarProducaoComProdutos(
  base: Omit<Producao, 'produto' | 'quantidade' | 'unidade' | 'produtos'> & {
    produtos: ProdutoGeradoProducao[];
  }
): Producao {
  const produtos = alocarCustoEntreProdutos(base.custoEstimado, base.produtos);
  const legado = espelharCamposLegadoProducao(produtos);
  return {
    ...base,
    ...legado,
    produtos,
  };
}

export interface PerdaProducao {
  entrada: number;
  unidade: string;
  saida: number;
  perdaQuantidade: number;
  perdaPercentual: number;
}

function arredondarQuantidade(valor: number): number {
  return Math.round(valor * 1000) / 1000;
}

export function calcularPerdaProducao(
  producao: Pick<Producao, 'ingredientes'> & {
    quantidade?: number;
    produto?: string;
    unidade?: string;
    produtos?: ProdutoGeradoProducao[];
  }
): PerdaProducao | null {
  const entradaInfo = totalEntradaIngredientes(producao.ingredientes);
  if (!entradaInfo || entradaInfo.total <= 0) return null;

  const produtos = produtosDaProducao({
    produto: producao.produto ?? '',
    quantidade: producao.quantidade ?? 0,
    unidade: producao.unidade ?? 'kg',
    produtos: producao.produtos,
  });
  const saidaInfo = totalSaidaProdutos(produtos);
  if (!saidaInfo) return null;

  const saida = arredondarQuantidade(saidaInfo.total);
  const perdaQuantidade = arredondarQuantidade(Math.max(0, entradaInfo.total - saida));
  const perdaPercentual =
    entradaInfo.total > 0
      ? arredondarQuantidade((perdaQuantidade / entradaInfo.total) * 100)
      : 0;

  return {
    entrada: entradaInfo.total,
    unidade: entradaInfo.unidade,
    saida,
    perdaQuantidade,
    perdaPercentual,
  };
}

export function nomesProdutosGerados(producoes: Producao[]): Set<string> {
  const nomes = new Set<string>();
  for (const p of producoes) {
    for (const prod of produtosDaProducao(p)) {
      const nome = prod.nome.trim();
      if (nome) nomes.add(nome.toLowerCase());
    }
  }
  return nomes;
}

export function isProdutoGerado(nome: string, producoes: Producao[]): boolean {
  return nomesProdutosGerados(producoes).has(nome.toLowerCase());
}

export function filtrarSaldoMateriaPrima(saldo: SaldoEstoque[]): SaldoEstoque[] {
  return saldo
    .filter((s) => s.tipo === 'MateriaPrima')
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function filtrarSaldoProdutosGerados(
  saldo: SaldoEstoque[],
  producoes: Producao[]
): SaldoEstoque[] {
  const nomes = nomesProdutosGerados(producoes);
  return saldo
    .filter(
      (s) =>
        s.tipo !== 'MateriaPrima' &&
        !ehMateriaPrimaCadeia(s.nome) &&
        nomes.has(s.nome.toLowerCase())
    )
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function filtrarLancamentosMateriaPrima(estoque: EstoqueItem[]): EstoqueItem[] {
  return estoque
    .filter((e) => e.quantidade > 0 && e.tipo === 'MateriaPrima')
    .sort((a, b) => (b.data ?? '').localeCompare(a.data ?? '') || b.id - a.id);
}

export function filtrarSaldoEnergia(saldo: SaldoEstoque[]): SaldoEstoque[] {
  return saldo
    .filter((s) => s.tipo === 'Energia')
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function filtrarLancamentosEnergia(estoque: EstoqueItem[]): EstoqueItem[] {
  return estoque
    .filter((e) => e.quantidade > 0 && e.tipo === 'Energia')
    .sort((a, b) => (b.data ?? '').localeCompare(a.data ?? '') || b.id - a.id);
}

export function filtrarLancamentosProdutosGerados(
  estoque: EstoqueItem[],
  producoes: Producao[]
): EstoqueItem[] {
  const nomes = nomesProdutosGerados(producoes);
  return estoque
    .filter(
      (e) =>
        e.quantidade > 0 &&
        e.tipo !== 'MateriaPrima' &&
        !ehMateriaPrimaCadeia(e.nome) &&
        nomes.has(e.nome.toLowerCase())
    )
    .sort((a, b) => (b.data ?? '').localeCompare(a.data ?? '') || b.id - a.id);
}

export function catalogoNomesProdutos(producoes: Producao[]): string[] {
  const map = new Map<string, string>();
  for (const p of producoes) {
    for (const prod of produtosDaProducao(p)) {
      const nome = prod.nome.trim();
      if (!nome) continue;
      const key = nome.toLowerCase();
      if (!map.has(key)) map.set(key, nome);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export interface TotalPerdaProduto {
  produto: string;
  unidade: string;
  lancamentos: number;
  entradaTotal: number;
  saidaTotal: number;
  perdaTotal: number;
  perdaPercentualMedia: number;
}

export function totalizarPerdasPorProduto(producoes: Producao[]): TotalPerdaProduto[] {
  const map = new Map<string, TotalPerdaProduto>();

  for (const p of producoes) {
    const perda = calcularPerdaProducao(p);
    if (!perda || perda.perdaQuantidade <= 0) continue;

    const rotulo = rotuloProdutosProducao(p);
    const key = `${rotulo.toLowerCase()}|${perda.unidade.toLowerCase()}`;
    const existing = map.get(key);

    if (existing) {
      const entradaTotal = existing.entradaTotal + perda.entrada;
      const saidaTotal = existing.saidaTotal + perda.saida;
      const perdaTotal = existing.perdaTotal + perda.perdaQuantidade;
      map.set(key, {
        ...existing,
        lancamentos: existing.lancamentos + 1,
        entradaTotal: arredondarQuantidade(entradaTotal),
        saidaTotal: arredondarQuantidade(saidaTotal),
        perdaTotal: arredondarQuantidade(perdaTotal),
        perdaPercentualMedia:
          entradaTotal > 0 ? arredondarQuantidade((perdaTotal / entradaTotal) * 100) : 0,
      });
    } else {
      map.set(key, {
        produto: rotulo,
        unidade: perda.unidade,
        lancamentos: 1,
        entradaTotal: perda.entrada,
        saidaTotal: perda.saida,
        perdaTotal: perda.perdaQuantidade,
        perdaPercentualMedia: perda.perdaPercentual,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.produto.localeCompare(b.produto, 'pt-BR'));
}

export function catalogoProdutosProduzidos(producoes: Producao[], estoque: EstoqueItem[]): SaldoEstoque[] {
  const nomes = nomesProdutosGerados(producoes);
  return agruparEstoque(estoque)
    .filter((s) => nomes.has(s.nome.toLowerCase()) && s.quantidade > 0)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Custo unitário da última produção que gerou o produto (considera multi-saída). */
export function custoUltimaProducaoDoProduto(
  producoes: Producao[],
  produto: string
): { custoUnitario: number; unidade: string } | null {
  const key = produto.trim().toLowerCase();
  if (!key) return null;

  const candidatas = producoes
    .map((p) => {
      const prod = produtosDaProducao(p).find((x) => x.nome.toLowerCase() === key);
      if (!prod || prod.quantidade <= 0) return null;
      const custo =
        prod.custoAlocado !== undefined && prod.custoAlocado !== null
          ? prod.custoAlocado
          : (() => {
              const saida = totalSaidaProdutos(produtosDaProducao(p));
              if (!saida || saida.total <= 0) return 0;
              return (p.custoEstimado * prod.quantidade) / saida.total;
            })();
      return {
        data: p.data,
        id: p.id,
        custoUnitario: prod.quantidade > 0 ? custo / prod.quantidade : 0,
        unidade: prod.unidade || 'kg',
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id);

  const ultima = candidatas[0];
  if (!ultima) return null;
  return {
    custoUnitario: Math.round(ultima.custoUnitario * 100) / 100,
    unidade: ultima.unidade,
  };
}