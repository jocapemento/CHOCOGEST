import { quantidadeDisponivel } from '@/lib/estoque';
import type { EstoqueItem, ItemMovimentacao, StatusVenda, Venda } from '@/lib/types';

export const STATUS_VENDA_LABEL: Record<StatusVenda, string> = {
  em_processamento: 'Pendente',
  concluida: 'Concluída',
};

export function isVendaConcluida(venda: Venda): boolean {
  return (venda.status ?? 'concluida') === 'concluida';
}

export function isVendaPendente(venda: Venda): boolean {
  return !isVendaConcluida(venda);
}

export function formatarItensVenda(itens: ItemMovimentacao[]): string {
  if (itens.length === 0) return '—';
  return itens.map((i) => `${i.nome} — ${i.quantidade} ${i.unidade}`).join('; ');
}

export function totalQuantidadeVenda(itens: ItemMovimentacao[]): number {
  return itens.reduce((acc, i) => acc + i.quantidade, 0);
}

/** Vendas com status pendente (em processamento), mais recentes primeiro. */
export function listarVendasPendentes(vendas: Venda[]): Venda[] {
  return vendas
    .filter(isVendaPendente)
    .slice()
    .sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id);
}

export interface ResumoVendasPendentes {
  quantidade: number;
  valorTotal: number;
  clientes: number;
  itensReservados: number;
}

export function resumoVendasPendentes(vendas: Venda[]): ResumoVendasPendentes {
  const pendentes = listarVendasPendentes(vendas);
  const clientes = new Set(pendentes.map((v) => v.cliente.trim().toLowerCase()).filter(Boolean));
  return {
    quantidade: pendentes.length,
    valorTotal: Math.round(sumBy(pendentes, (v) => v.total) * 100) / 100,
    clientes: clientes.size,
    itensReservados: Math.round(sumBy(pendentes, (v) => totalQuantidadeVenda(v.itens)) * 1000) / 1000,
  };
}

export interface ProdutoReservadoPendente {
  nome: string;
  unidade: string;
  quantidade: number;
  valorTotal: number;
  pedidos: number;
}

/**
 * Quantidade reservada por vendas pendentes (não baixam estoque ainda).
 * `ignorarVendaId` exclui a venda em edição para não reservar em dobro.
 */
export function quantidadeReservadaProduto(
  vendas: Venda[],
  produto: string,
  ignorarVendaId?: number | null
): number {
  const key = produto.trim().toLowerCase();
  if (!key) return 0;

  let total = 0;
  for (const venda of vendas) {
    if (!isVendaPendente(venda)) continue;
    if (ignorarVendaId != null && venda.id === ignorarVendaId) continue;
    for (const item of venda.itens) {
      if (item.nome.toLowerCase() === key) {
        total += item.quantidade;
      }
    }
  }
  return total;
}

/** Saldo físico no estoque menos reservas de vendas pendentes. */
export function saldoLivreParaVenda(
  estoque: EstoqueItem[],
  vendas: Venda[],
  produto: string,
  ignorarVendaId?: number | null
): number {
  const fisico = quantidadeDisponivel(estoque, produto);
  const reservado = quantidadeReservadaProduto(vendas, produto, ignorarVendaId);
  return Math.max(0, Math.round((fisico - reservado) * 1000) / 1000);
}

/** Demanda por produto nas vendas pendentes (relação de reservas). */
export function produtosReservadosPendentes(vendas: Venda[]): ProdutoReservadoPendente[] {
  const map = new Map<string, ProdutoReservadoPendente>();

  for (const venda of listarVendasPendentes(vendas)) {
    for (const item of venda.itens) {
      const key = item.nome.toLowerCase();
      const existente = map.get(key);
      const valorItem = item.quantidade * item.valorUnit;
      if (existente) {
        existente.quantidade += item.quantidade;
        existente.valorTotal += valorItem;
        existente.pedidos += 1;
      } else {
        map.set(key, {
          nome: item.nome,
          unidade: item.unidade,
          quantidade: item.quantidade,
          valorTotal: valorItem,
          pedidos: 1,
        });
      }
    }
  }

  return Array.from(map.values())
    .map((p) => ({
      ...p,
      quantidade: Math.round(p.quantidade * 1000) / 1000,
      valorTotal: Math.round(p.valorTotal * 100) / 100,
    }))
    .sort((a, b) => b.quantidade - a.quantidade || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/**
 * Valida estoque para concluir venda (baixa física).
 * Considera apenas o saldo físico atual — reservas de outros pedidos pendentes
 * não reduzem o estoque ainda; use `validarReservaVendaPendente` para pedidos.
 */
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

/**
 * Valida se um pedido pendente cabe no saldo livre
 * (estoque físico − outras reservas pendentes).
 */
export function validarReservaVendaPendente(
  estoque: EstoqueItem[],
  vendas: Venda[],
  venda: Venda,
  ignorarVendaId?: number | null
): string | null {
  for (const item of venda.itens) {
    const livre = saldoLivreParaVenda(estoque, vendas, item.nome, ignorarVendaId);
    if (livre < item.quantidade) {
      const fisico = quantidadeDisponivel(estoque, item.nome);
      const reservado = quantidadeReservadaProduto(vendas, item.nome, ignorarVendaId);
      return (
        `Saldo insuficiente para reservar "${item.nome}" ` +
        `(livre: ${livre} ${item.unidade}, em estoque: ${fisico}, já reservado em outras vendas pendentes: ${reservado}, ` +
        `necessário: ${item.quantidade} ${item.unidade}).`
      );
    }
  }
  return null;
}

function sumBy<T>(items: T[], fn: (item: T) => number): number {
  return items.reduce((acc, item) => acc + fn(item), 0);
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
        vendasEmProcessamento: 0, // pedidos pendentes
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