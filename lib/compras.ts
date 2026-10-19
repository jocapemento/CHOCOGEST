import type { Compra, RecebimentoCompra } from '@/lib/types';

export const RECEBIMENTO_COMPRA_OPCOES: RecebimentoCompra[] = ['a_receber', 'recebido'];

export const RECEBIMENTO_COMPRA_LABEL: Record<RecebimentoCompra, string> = {
  a_receber: 'A receber',
  recebido: 'Recebido',
};

/** Compra antiga sem o campo já entrou no estoque no registro. */
export function normalizarRecebimentoCompra(recebimento: unknown): RecebimentoCompra {
  if (recebimento === 'a_receber' || recebimento === 'recebido') return recebimento;
  return 'recebido';
}

export function recebimentoDaCompra(compra: Pick<Compra, 'recebimento'>): RecebimentoCompra {
  return normalizarRecebimentoCompra(compra.recebimento);
}

/** Estoque e patrimônio só entram com o recebimento confirmado. */
export function compraLancaEstoque(compra: Pick<Compra, 'recebimento'>): boolean {
  return recebimentoDaCompra(compra) === 'recebido';
}

export function compraAguardandoRecebimento(compra: Pick<Compra, 'recebimento'>): boolean {
  return recebimentoDaCompra(compra) === 'a_receber';
}

export function compraAposConfirmarRecebimento<T extends Pick<Compra, 'recebimento'>>(compra: T): T {
  return { ...compra, recebimento: 'recebido' };
}

export function listarComprasAguardandoRecebimento(compras: Compra[]): Compra[] {
  return compras.filter(compraAguardandoRecebimento);
}

export function listarComprasRecebidas(compras: Compra[]): Compra[] {
  return compras.filter(compraLancaEstoque);
}

export function resumoComprasAguardandoRecebimento(compras: Compra[]): {
  quantidade: number;
  valorTotal: number;
} {
  const abertas = listarComprasAguardandoRecebimento(compras);
  const valorTotal = Math.round(abertas.reduce((acc, compra) => acc + compra.total, 0) * 100) / 100;
  return { quantidade: abertas.length, valorTotal };
}
