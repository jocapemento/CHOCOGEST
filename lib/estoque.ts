import type { Compra, EstoqueItem, TipoItem } from '@/lib/types';

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