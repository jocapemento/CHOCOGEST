import type { Compra } from '@/lib/types';

export interface ParcelaMensalCartao {
  cartao: string;
  mes: string;
  valor: number;
}

export function calcularParcelasMensais(compras: Compra[]): ParcelaMensalCartao[] {
  const map = new Map<string, number>();

  for (const compra of compras) {
    if (compra.formaPagamento !== 'Cartao' || !compra.cartao?.trim()) continue;

    const parcelas = Math.max(1, Math.floor(compra.parcelas) || 1);
    const valorParcela = compra.total / parcelas;
    const [yearStr, monthStr] = compra.data.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    if (!year || !month) continue;

    for (let i = 0; i < parcelas; i++) {
      const date = new Date(year, month - 1 + i, 1);
      const mes = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const key = `${compra.cartao}\0${mes}`;
      map.set(key, (map.get(key) ?? 0) + valorParcela);
    }
  }

  return Array.from(map.entries())
    .map(([key, valor]) => {
      const [cartao, mes] = key.split('\0');
      return { cartao, mes, valor };
    })
    .sort((a, b) => a.mes.localeCompare(b.mes) || a.cartao.localeCompare(b.cartao, 'pt-BR'));
}

export function mesesComParcelas(parcelas: ParcelaMensalCartao[]): string[] {
  return [...new Set(parcelas.map((p) => p.mes))].sort();
}

export function valorParcelaNoMes(
  parcelas: ParcelaMensalCartao[],
  mes: string,
  cartao: string
): number {
  return parcelas
    .filter((p) => p.mes === mes && p.cartao === cartao)
    .reduce((acc, p) => acc + p.valor, 0);
}

export function totalParcelasCartao(parcelas: ParcelaMensalCartao[], cartao: string): number {
  return parcelas.filter((p) => p.cartao === cartao).reduce((acc, p) => acc + p.valor, 0);
}

export function totalParcelasMes(parcelas: ParcelaMensalCartao[], mes: string): number {
  return parcelas.filter((p) => p.mes === mes).reduce((acc, p) => acc + p.valor, 0);
}