import { arredondarQuantidade, formatQuantidadeUnidade } from './format';

/** Unidade de estoque quando o produto é contado em unidades (barras, tabletes). */
export const UNIDADE_FRACIONADA = 'un';

const UNIDADES_CONTAGEM = new Set([
  'un',
  'uns',
  'und',
  'unidade',
  'unidades',
  'pc',
  'pç',
  'peca',
  'pecas',
  'peça',
  'peças',
]);

/** Produto contado por unidade, sem peso. */
export function ehUnidadeContagem(unidade: string | undefined | null): boolean {
  return UNIDADES_CONTAGEM.has(chaveUnidade(unidade ?? ''));
}

const GRAMAS_POR_UNIDADE: Record<string, number> = {
  mg: 0.001,
  g: 1,
  gr: 1,
  grama: 1,
  gramas: 1,
  kg: 1000,
  quilo: 1000,
  quilos: 1000,
  quilograma: 1000,
  quilogramas: 1000,
};

export type ProdutoComMassa = {
  quantidade: number;
  unidade: string;
  /** Massa total, quando `quantidade` já está em unidades. */
  massa?: number;
  unidadeMassa?: string;
  /** Peso de cada unidade, ex.: 15. */
  pesoUnidade?: number;
  /** Unidade desse peso: g ou kg. */
  unidadePeso?: string;
};

function chaveUnidade(unidade: string): string {
  return unidade
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Fator para converter a unidade de massa em gramas. `null` se não for massa. */
export function gramasPorUnidade(unidade: string): number | null {
  const fator = GRAMAS_POR_UNIDADE[chaveUnidade(unidade)];
  return fator ?? null;
}

/**
 * Converte um peso total em quantidade de unidades.
 * 1 kg com barras de 15 g → 66.667 un.
 */
export function unidadesFracionadas(
  massa: number,
  unidadeMassa: string,
  pesoUnidade: number,
  unidadePeso: string
): number | null {
  if (!(massa > 0) || !(pesoUnidade > 0)) return null;
  const fatorMassa = gramasPorUnidade(unidadeMassa);
  const fatorPeso = gramasPorUnidade(unidadePeso);
  if (fatorMassa == null || fatorPeso == null) return null;
  const unidades = (massa * fatorMassa) / (pesoUnidade * fatorPeso);
  if (!Number.isFinite(unidades) || unidades <= 0) return null;
  const arredondado = arredondarQuantidade(unidades);
  return arredondado > 0 ? arredondado : null;
}

/** Peso na perda. Produto em unidades não entra. */
export function quantidadeParaPerda(
  produto: ProdutoComMassa
): { quantidade: number; unidade: string } | null {
  if (ehUnidadeContagem(produto.unidade)) return null;
  return massaRegistrada(produto);
}

/**
 * Base do rateio de custo.
 * Lote novo em unidades usa a quantidade. Lote antigo com massa registrada segue o peso.
 */
export function quantidadeParaRateio(produto: ProdutoComMassa): { quantidade: number; unidade: string } {
  if (ehUnidadeContagem(produto.unidade) && !(Number(produto.massa) > 0)) {
    return { quantidade: produto.quantidade, unidade: 'un' };
  }
  return massaRegistrada(produto);
}

/** Massa usada na perda e no rateio. Sem fracionamento, é a própria quantidade. */
export function massaRegistrada(produto: ProdutoComMassa): { quantidade: number; unidade: string } {
  const unidadeMassa = (produto.unidadeMassa ?? '').trim();
  if (produto.massa != null && produto.massa > 0 && unidadeMassa) {
    return { quantidade: produto.massa, unidade: unidadeMassa };
  }
  return {
    quantidade: produto.quantidade,
    unidade: (produto.unidade || 'kg').trim() || 'kg',
  };
}

export function produtoFoiFracionado(produto: ProdutoComMassa): boolean {
  return (
    produto.pesoUnidade != null &&
    produto.pesoUnidade > 0 &&
    produto.massa != null &&
    produto.massa > 0 &&
    !!(produto.unidadeMassa ?? '').trim()
  );
}

/** Quantidade do estoque. Produto em unidades não traz o peso. */
export function descreverQuantidadeFracionada(produto: ProdutoComMassa): string {
  return formatQuantidadeUnidade(produto.quantidade, produto.unidade);
}
