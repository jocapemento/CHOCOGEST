import type { Compra, EstoqueItem, Producao, TipoItem, Venda } from '@/lib/types';

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

export function vendasDoProduto(vendas: Venda[], produto: string): VendaComProduto[] {
  const key = produto.toLowerCase();
  const result: VendaComProduto[] = [];

  for (const venda of vendas) {
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
  return agruparEstoque(estoque)
    .filter((s) => s.tipo === 'MateriaPrima' && s.quantidade > 0)
    .map((s) => s.nome)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function saldoIngrediente(estoque: EstoqueItem[], nome: string): SaldoEstoque | undefined {
  return agruparEstoque(estoque).find((s) => s.nome.toLowerCase() === nome.toLowerCase());
}

export function validarIngredientesProducao(estoque: EstoqueItem[], producao: Producao): string | null {
  const disponiveis = materiasPrimasDisponiveis(estoque);

  for (const ing of producao.ingredientes) {
    const saldo = saldoIngrediente(estoque, ing.nome);

    if (!saldo || saldo.tipo !== 'MateriaPrima' || saldo.quantidade <= 0) {
      const lista =
        disponiveis.length > 0
          ? `\n\nMatérias-primas no estoque:\n${disponiveis.map((n) => `  — ${n}`).join('\n')}`
          : '\n\nNenhuma matéria-prima com saldo no estoque.';
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

export function catalogoItensLancados(compras: Compra[], estoque: EstoqueItem[]): ItemCatalogo[] {
  const map = new Map<string, ItemCatalogo>();

  for (const compra of compras) {
    for (const item of compra.itens) {
      if (!item.nome.trim()) continue;
      map.set(item.nome.toLowerCase(), {
        nome: item.nome,
        tipo: item.tipo,
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
        tipo: item.tipo,
        unidade: item.unidade,
        valorUnit: item.valorUnit,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function totalEntradaIngredientes(
  ingredientes: Producao['ingredientes']
): { total: number; unidade: string } | null {
  if (ingredientes.length === 0) return null;

  const unidade = ingredientes[0].unidade ?? 'kg';
  for (const ing of ingredientes) {
    const u = ing.unidade ?? 'kg';
    if (u.toLowerCase() !== unidade.toLowerCase()) return null;
  }

  const total = ingredientes.reduce((acc, ing) => acc + ing.quantidade, 0);
  return { total, unidade };
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
  producao: Pick<Producao, 'ingredientes' | 'quantidade'>
): PerdaProducao | null {
  const entradaInfo = totalEntradaIngredientes(producao.ingredientes);
  if (!entradaInfo || entradaInfo.total <= 0) return null;

  const saida = arredondarQuantidade(producao.quantidade);
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
    const nome = p.produto.trim();
    if (nome) nomes.add(nome.toLowerCase());
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
    .filter((s) => nomes.has(s.nome.toLowerCase()))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export function filtrarLancamentosMateriaPrima(estoque: EstoqueItem[]): EstoqueItem[] {
  return estoque
    .filter((e) => e.quantidade > 0 && e.tipo === 'MateriaPrima')
    .sort((a, b) => (b.data ?? '').localeCompare(a.data ?? '') || b.id - a.id);
}

export function filtrarLancamentosProdutosGerados(
  estoque: EstoqueItem[],
  producoes: Producao[]
): EstoqueItem[] {
  const nomes = nomesProdutosGerados(producoes);
  return estoque
    .filter((e) => e.quantidade > 0 && nomes.has(e.nome.toLowerCase()))
    .sort((a, b) => (b.data ?? '').localeCompare(a.data ?? '') || b.id - a.id);
}

export function catalogoNomesProdutos(producoes: Producao[]): string[] {
  const map = new Map<string, string>();
  for (const p of producoes) {
    const nome = p.produto.trim();
    if (!nome) continue;
    const key = nome.toLowerCase();
    if (!map.has(key)) map.set(key, nome);
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

    const key = `${p.produto.toLowerCase()}|${perda.unidade.toLowerCase()}`;
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
        produto: p.produto,
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
  const nomes = new Set<string>();
  for (const p of producoes) {
    const nome = p.produto.trim();
    if (nome) nomes.add(nome.toLowerCase());
  }
  return agruparEstoque(estoque)
    .filter((s) => nomes.has(s.nome.toLowerCase()) && s.quantidade > 0)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}