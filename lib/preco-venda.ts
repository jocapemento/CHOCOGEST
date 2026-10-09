import { arredondarPreco } from './format';
import type { PrecoGerado } from './types';

export function nomeProdutoIgual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Histórico completo, mais recente primeiro. */
export function historicoPrecosOrdenado(precosGerados: PrecoGerado[]): PrecoGerado[] {
  return [...precosGerados].sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id);
}

export function historicoPrecosDoProduto(
  precosGerados: PrecoGerado[],
  produto: string
): PrecoGerado[] {
  if (!produto.trim()) return historicoPrecosOrdenado(precosGerados);
  return historicoPrecosOrdenado(precosGerados).filter((p) =>
    nomeProdutoIgual(p.produto, produto)
  );
}

export function ultimoPrecoRegistrado(
  precosGerados: PrecoGerado[],
  produto: string
): PrecoGerado | undefined {
  return historicoPrecosDoProduto(precosGerados, produto)[0];
}

/** Preço que a Precificação exibe e grava: custo com a margem, em centavos. */
export function calcularPrecoSugerido(custoUnitario: number, margemLucro: number): number {
  const custo = Number(custoUnitario);
  const margem = Number(margemLucro);
  if (!Number.isFinite(custo) || !Number.isFinite(margem)) return 0;
  return arredondarPreco(custo * (1 + margem / 100));
}

/**
 * Preço unitário da venda. Usa o último preço da Precificação, em centavos,
 * para coincidir com o valor exibido (R$ 0,50 e não 0,49854).
 */
export function precoUnitarioParaVenda(
  precosGerados: PrecoGerado[],
  produto: string,
  custoUnitario = 0
): { valor: number; origem: 'precificacao' | 'custo'; registro?: PrecoGerado } {
  const registro = ultimoPrecoRegistrado(precosGerados, produto);
  if (registro && registro.precoSugerido > 0) {
    return {
      valor: arredondarPreco(registro.precoSugerido),
      origem: 'precificacao',
      registro,
    };
  }
  return { valor: arredondarPreco(custoUnitario), origem: 'custo' };
}
