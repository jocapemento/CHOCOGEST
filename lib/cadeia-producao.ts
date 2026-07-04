/** Etapas da cadeia produtiva do cacau — produto gerado vira insumo da etapa seguinte. */
export interface EtapaCadeia {
  produto: string;
  ingredientesSugeridos: string[];
}

export const CADEIA_PRODUCAO_CACAU: EtapaCadeia[] = [
  {
    produto: 'Amêndoa Torrada',
    ingredientesSugeridos: ['Amendoa de Cacau', 'Amêndoa de Cacau'],
  },
  {
    produto: 'Nibs',
    ingredientesSugeridos: ['Amêndoa Torrada'],
  },
  {
    produto: 'Licor de Cacau',
    ingredientesSugeridos: ['Nibs'],
  },
  {
    produto: 'Chocolate 100%',
    ingredientesSugeridos: ['Licor de Cacau'],
  },
  {
    produto: 'Manteiga de Cacau',
    ingredientesSugeridos: ['Licor de Cacau'],
  },
  {
    produto: 'Chocolate em Pó',
    ingredientesSugeridos: ['Licor de Cacau'],
  },
];

export function etapaCadeia(produto: string): EtapaCadeia | undefined {
  const key = produto.trim().toLowerCase();
  return CADEIA_PRODUCAO_CACAU.find((e) => e.produto.toLowerCase() === key);
}

export function ingredientesSugeridosPara(produto: string): string[] {
  return etapaCadeia(produto)?.ingredientesSugeridos ?? [];
}

export function produtosDaCadeia(): string[] {
  return CADEIA_PRODUCAO_CACAU.map((e) => e.produto);
}

export function etapaAnterior(produto: string): EtapaCadeia | undefined {
  const key = produto.trim().toLowerCase();
  const idx = CADEIA_PRODUCAO_CACAU.findIndex((e) => e.produto.toLowerCase() === key);
  if (idx <= 0) return undefined;
  return CADEIA_PRODUCAO_CACAU[idx - 1];
}