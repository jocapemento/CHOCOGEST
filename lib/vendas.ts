import { quantidadeDisponivel } from '@/lib/estoque';
import type { EstoqueItem, ItemMovimentacao, StatusVenda, Venda } from '@/lib/types';

export const STATUS_VENDA_LABEL: Record<StatusVenda, string> = {
  em_processamento: 'Em processamento',
  concluida: 'Concluída',
};

export function isVendaConcluida(venda: Venda): boolean {
  return (venda.status ?? 'concluida') === 'concluida';
}

export function formatarItensVenda(itens: ItemMovimentacao[]): string {
  if (itens.length === 0) return '—';
  return itens.map((i) => `${i.nome} — ${i.quantidade} ${i.unidade}`).join('; ');
}

export function totalQuantidadeVenda(itens: ItemMovimentacao[]): number {
  return itens.reduce((acc, i) => acc + i.quantidade, 0);
}

export function validarEstoqueVenda(estoque: EstoqueItem[], venda: Venda): string | null {
  for (const item of venda.itens) {
    const disponivel = estoque
      .filter(
        (e) =>
          e.nome.toLowerCase() === item.nome.toLowerCase() &&
          e.tipo === item.tipo &&
          e.quantidade > 0
      )
      .reduce((acc, e) => acc + e.quantidade, 0);

    if (disponivel < item.quantidade) {
      const totalNome = quantidadeDisponivel(estoque, item.nome);
      return `Estoque insuficiente de "${item.nome}" (disponível: ${totalNome} ${item.unidade}, necessário: ${item.quantidade} ${item.unidade}).`;
    }
  }
  return null;
}

export interface ProdutoCompradoCliente {
  nome: string;
  quantidade: number;
  unidade: string;
  valorTotal: number;
}

export interface ResumoClienteVenda {
  cliente: string;
  vendasConcluidas: number;
  vendasEmProcessamento: number;
  quantidadeTotal: number;
  valorTotal: number;
  produtos: ProdutoCompradoCliente[];
}

export function rankingMelhoresClientes(vendas: Venda[]): ResumoClienteVenda[] {
  const map = new Map<string, ResumoClienteVenda>();

  for (const venda of vendas) {
    const cliente = venda.cliente.trim() || 'Sem nome';
    const key = cliente.toLowerCase();
    const concluida = isVendaConcluida(venda);

    let resumo = map.get(key);
    if (!resumo) {
      resumo = {
        cliente,
        vendasConcluidas: 0,
        vendasEmProcessamento: 0,
        quantidadeTotal: 0,
        valorTotal: 0,
        produtos: [],
      };
      map.set(key, resumo);
    }

    if (concluida) {
      resumo.vendasConcluidas += 1;
      resumo.valorTotal += venda.total;
      resumo.quantidadeTotal += totalQuantidadeVenda(venda.itens);

      for (const item of venda.itens) {
        const prodKey = item.nome.toLowerCase();
        const existente = resumo.produtos.find((p) => p.nome.toLowerCase() === prodKey);
        const valorItem = item.quantidade * item.valorUnit;
        if (existente) {
          existente.quantidade += item.quantidade;
          existente.valorTotal += valorItem;
        } else {
          resumo.produtos.push({
            nome: item.nome,
            quantidade: item.quantidade,
            unidade: item.unidade,
            valorTotal: valorItem,
          });
        }
      }
    } else {
      resumo.vendasEmProcessamento += 1;
    }
  }

  return Array.from(map.values())
    .map((r) => ({
      ...r,
      valorTotal: Math.round(r.valorTotal * 100) / 100,
      produtos: r.produtos
        .map((p) => ({ ...p, valorTotal: Math.round(p.valorTotal * 100) / 100 }))
        .sort((a, b) => b.valorTotal - a.valorTotal),
    }))
    .filter((r) => r.vendasConcluidas > 0 || r.vendasEmProcessamento > 0)
    .sort((a, b) => b.valorTotal - a.valorTotal || b.quantidadeTotal - a.quantidadeTotal);
}