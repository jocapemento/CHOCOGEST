import type { Compra } from '@/lib/types';

export interface ParcelaMensalCartao {
  cartao: string;
  mes: string;
  valor: number;
}

function parseDataCompra(data: string): { year: number; month: number } | null {
  const [yearStr, monthStr] = data.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!year || !month || month < 1 || month > 12) return null;
  return { year, month };
}

/** Soma meses a partir do mês/ano da data da compra (1ª parcela = mês inicial). */
export function mesParcelaCompra(dataCompra: string, indiceParcela: number): string | null {
  const inicio = parseDataCompra(dataCompra);
  if (!inicio || indiceParcela < 0) return null;

  const totalMeses = inicio.year * 12 + (inicio.month - 1) + indiceParcela;
  const year = Math.floor(totalMeses / 12);
  const month = (totalMeses % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

function distribuirValorParcelas(total: number, parcelas: number): number[] {
  const centavosTotal = Math.round(total * 100);
  const base = Math.floor(centavosTotal / parcelas);
  const resto = centavosTotal - base * parcelas;
  const valores = Array.from({ length: parcelas }, () => base / 100);
  if (parcelas > 0) {
    valores[parcelas - 1] += resto / 100;
  }
  return valores;
}

export function calcularParcelasMensais(compras: Compra[]): ParcelaMensalCartao[] {
  const map = new Map<string, number>();

  for (const compra of compras) {
    if (compra.formaPagamento !== 'Cartao' || !compra.cartao?.trim()) continue;
    if (!parseDataCompra(compra.data)) continue;

    const parcelas = Math.max(1, Math.floor(compra.parcelas) || 1);
    const valoresParcela = distribuirValorParcelas(compra.total, parcelas);

    for (let i = 0; i < parcelas; i++) {
      const mes = mesParcelaCompra(compra.data, i);
      if (!mes) continue;
      const key = `${compra.cartao}\0${mes}`;
      map.set(key, (map.get(key) ?? 0) + valoresParcela[i]);
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