import type { TipoItem } from '@/lib/types';

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
    produto: 'Casca',
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

/** Co-produtos gerados no mesmo lote a partir de um ingrediente. */
export const COPRODUTOS_POR_INGREDIENTE: Record<string, string[]> = {
  'amêndoa torrada': ['Nibs', 'Casca'],
  'amendoa torrada': ['Nibs', 'Casca'],
};

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

const ALIASES_MATERIA_PRIMA = new Set(['amêndoa torrada', 'amendoa torrada']);

function normalizarNomeItem(nome: string): string {
  return nome
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const ALIASES_ENERGIA = new Set([
  'gas',
  'gas de cozinha',
  'gas cozinha',
  'glp',
  'botijao',
  'botijao de gas',
  'botijao 13kg',
  'botijao p13',
  'gas glp',
]);

/** Gás de cozinha (GLP) e equivalentes — insumo de energia da produção. */
export function ehInsumoEnergia(nome: string): boolean {
  const key = normalizarNomeItem(nome);
  if (!key) return false;
  if (ALIASES_ENERGIA.has(key)) return true;
  if (key.includes('gas de cozinha') || key.includes('gas cozinha')) return true;
  if (/\bbotijao\b/.test(key)) return true;
  if (/\bglp\b/.test(key)) return true;
  return /^gas\b/.test(key);
}

/** Insumos da cadeia que entram no estoque como matéria-prima (compra ou torra). */
export function ehMateriaPrimaCadeia(nome: string): boolean {
  return ALIASES_MATERIA_PRIMA.has(nome.trim().toLowerCase());
}

/** Produtos da cadeia (ex.: Nibs) entram no estoque como produto gerado. */
export function ehProdutoGeradoCadeia(nome: string): boolean {
  const key = nome.trim().toLowerCase();
  if (!key || ehMateriaPrimaCadeia(key)) return false;
  return CADEIA_PRODUCAO_CACAU.some((e) => e.produto.toLowerCase() === key);
}

export function tipoEstoqueCadeia(nome: string, fallback: TipoItem = 'ProdutoAcabado'): TipoItem {
  if (ehMateriaPrimaCadeia(nome)) return 'MateriaPrima';
  if (ehProdutoGeradoCadeia(nome)) return 'ProdutoAcabado';
  if (ehInsumoEnergia(nome)) return 'Energia';
  return fallback ?? 'MateriaPrima';
}

/** Tipo imposto pela cadeia/insumo conhecido, ou null quando o usuário pode escolher. */
export function tipoCadeiaFixo(nome: string): TipoItem | null {
  if (ehMateriaPrimaCadeia(nome)) return 'MateriaPrima';
  if (ehProdutoGeradoCadeia(nome)) return 'ProdutoAcabado';
  if (ehInsumoEnergia(nome)) return 'Energia';
  return null;
}

export function etapaAnterior(produto: string): EtapaCadeia | undefined {
  const key = produto.trim().toLowerCase();
  const idx = CADEIA_PRODUCAO_CACAU.findIndex((e) => e.produto.toLowerCase() === key);
  if (idx <= 0) return undefined;
  return CADEIA_PRODUCAO_CACAU[idx - 1];
}

/** Produtos da cadeia que usam algum dos ingredientes informados. */
export function produtosSugeridosParaIngredientes(nomesIngredientes: string[]): string[] {
  const keys = new Set(nomesIngredientes.map((n) => n.trim().toLowerCase()).filter(Boolean));
  if (keys.size === 0) return [];

  const map = new Map<string, string>();

  for (const nomeIng of keys) {
    const coprodutos = COPRODUTOS_POR_INGREDIENTE[nomeIng];
    if (coprodutos) {
      for (const p of coprodutos) map.set(p.toLowerCase(), p);
    }
  }

  for (const etapa of CADEIA_PRODUCAO_CACAU) {
    const match = etapa.ingredientesSugeridos.some((ing) => keys.has(ing.trim().toLowerCase()));
    if (match) map.set(etapa.produto.toLowerCase(), etapa.produto);
  }

  return Array.from(map.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** Sugestão de co-produtos para preencher o lote de uma vez. */
export function coprodutosSugeridosParaIngredientes(nomesIngredientes: string[]): string[] {
  const map = new Map<string, string>();
  for (const nome of nomesIngredientes) {
    const key = nome.trim().toLowerCase();
    const lista = COPRODUTOS_POR_INGREDIENTE[key];
    if (!lista) continue;
    for (const p of lista) map.set(p.toLowerCase(), p);
  }
  return Array.from(map.values());
}

export interface LinhaProdutoSaida {
  nome: string;
  quantidade: number;
  unidade: string;
}

/**
 * Se o insumo gera co-produtos (Amêndoa Torrada → Nibs + Casca), preenche as linhas
 * de saída — sem sobrescrever produtos que o usuário já digitou fora da sugestão.
 */
export function preencherProdutosComCoprodutos(
  atuais: LinhaProdutoSaida[],
  nomesIngredientes: string[],
  unidade: string
): LinhaProdutoSaida[] {
  const sugeridos = coprodutosSugeridosParaIngredientes(nomesIngredientes);
  if (sugeridos.length === 0) {
    return atuais.length > 0 ? atuais : [{ nome: '', quantidade: 0, unidade }];
  }

  const comNome = atuais.filter((p) => p.nome.trim());
  const sugeridosKey = new Set(sugeridos.map((n) => n.toLowerCase()));
  const soVazios = comNome.length === 0;
  const soSugeridos = comNome.every((p) => sugeridosKey.has(p.nome.trim().toLowerCase()));
  if (!soVazios && !soSugeridos) return atuais;

  const existentes = new Map(comNome.map((p) => [p.nome.trim().toLowerCase(), p] as const));
  return sugeridos.map((nome) => {
    const prev = existentes.get(nome.toLowerCase());
    return prev
      ? { ...prev, nome, unidade: prev.unidade || unidade }
      : { nome, quantidade: 0, unidade };
  });
}
