export function formatCurrency(value: number | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'R$\u00a00,00';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatDate(date: string): string {
  if (!date) return '—';
  const [y, m, d] = date.split('-');
  if (!y || !m || !d) return date;
  return `${d}/${m}/${y}`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nextId(items: { id: number }[]): number {
  if (items.length === 0) return 1;
  return Math.max(...items.map((i) => i.id)) + 1;
}

export function sumBy<T>(items: T[], fn: (item: T) => number): number {
  return items.reduce((acc, item) => acc + fn(item), 0);
}