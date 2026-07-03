export function formatCurrency(value: number | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'R$\u00a00,00';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatUsd(value: number | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'US$\u00a00.00';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function brlParaUsd(valorBrl: number, cotacaoUsd: number): number | null {
  if (!Number.isFinite(valorBrl) || !Number.isFinite(cotacaoUsd) || cotacaoUsd <= 0) return null;
  return valorBrl / cotacaoUsd;
}

export function normalizeDateISO(date: string | undefined | null, fallback?: string): string {
  if (!date?.trim()) return fallback ?? todayISO();

  const trimmed = date.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const br = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (br) {
    const day = br[1].padStart(2, '0');
    const month = br[2].padStart(2, '0');
    const year = br[3];
    return `${year}-${month}-${day}`;
  }

  return fallback ?? trimmed;
}

export function formatDate(date: string): string {
  if (!date) return '—';

  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split('-');
    return `${d}/${m}/${y}`;
  }

  const br = date.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (br) {
    return `${br[1].padStart(2, '0')}/${br[2].padStart(2, '0')}/${br[3]}`;
  }

  return date;
}

const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function formatMesAno(mesISO: string): string {
  const [y, m] = mesISO.split('-');
  const idx = Number(m) - 1;
  if (!y || idx < 0 || idx > 11) return mesISO;
  return `${MESES_CURTOS[idx]}/${y}`;
}

export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function mesAtualISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function nextId(items: { id: number }[]): number {
  if (items.length === 0) return 1;
  return Math.max(...items.map((i) => i.id)) + 1;
}

export function sumBy<T>(items: T[], fn: (item: T) => number): number {
  return items.reduce((acc, item) => acc + fn(item), 0);
}