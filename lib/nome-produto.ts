/** Nome de produto da produção: percentual do cacau e sugestões a partir do ingrediente. */

function normalizarNome(nome: string): string {
  return nome
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/(\d+(?:[.,]\d+)?)\s*%/g, (_, n: string) => `${n.replace(',', '.')}%`)
    .replace(/\s+/g, ' ');
}

/** Número do primeiro percentual do nome, sem o símbolo. "60%" e "60,0 %" viram "60". */
export function numeroPercentual(nome: string): string | null {
  const match = nome.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (!match) return null;
  const n = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return String(n);
}

/** Texto do percentual como aparece no nome, sem espaço antes do %. */
export function textoPercentual(nome: string): string | null {
  const match = nome.match(/\d+(?:[.,]\d+)?\s*%/);
  if (!match) return null;
  return match[0].replace(/\s+/g, '');
}

/** Família do nome, com o percentual trocado por um marcador. */
function chaveFamilia(nome: string): string {
  return normalizarNome(nome).replace(/\d+(?:[.,]\d+)?%/g, '%');
}

function mesmaFamilia(produto: string, ingrediente: string): boolean {
  const base = chaveFamilia(ingrediente);
  const alvo = chaveFamilia(produto);
  if (!base || !alvo || !base.includes('%') || !alvo.includes('%')) return false;
  if (alvo === base) return true;
  return alvo.startsWith(`${base} `);
}

/**
 * Se o produto do catálogo é o mesmo chocolate com outro percentual,
 * devolve o nome com o percentual do ingrediente.
 * "Chocolate 70% … Bombom" + ingrediente 60% → "Chocolate 60% … Bombom".
 */
export function nomeComPercentualDoIngrediente(
  produto: string,
  ingrediente: string
): string | null {
  const pctIng = textoPercentual(ingrediente);
  if (!pctIng || !textoPercentual(produto)) return null;
  if (!mesmaFamilia(produto, ingrediente)) return null;
  return produto.replace(/\d+(?:[.,]\d+)?\s*%/, pctIng);
}

export function divergenciaPercentualProduto(
  produto: string,
  ingredientes: string[]
): {
  ingrediente: string;
  percentualIngrediente: string;
  percentualProduto: string;
} | null {
  const pctProduto = numeroPercentual(produto);
  if (!pctProduto) return null;

  const comPercentual = ingredientes
    .map((nome) => ({ nome: nome.trim(), pct: numeroPercentual(nome) }))
    .filter((item): item is { nome: string; pct: string } => Boolean(item.nome) && item.pct != null);
  if (comPercentual.length === 0) return null;
  if (comPercentual.some((item) => item.pct === pctProduto)) return null;

  return {
    ingrediente: comPercentual[0].nome,
    percentualIngrediente: comPercentual[0].pct,
    percentualProduto: pctProduto,
  };
}

/**
 * Sugestões do campo de produto. Nomes alinhados ao percentual do ingrediente
 * vêm primeiro. O texto digitado não é reescrito: a lista só filtra.
 */
export function sugestoesNomeProduto(
  catalogo: string[],
  ingredientes: string[],
  texto: string
): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  const adicionar = (nome: string) => {
    const limpo = nome.trim();
    if (!limpo) return;
    const key = normalizarNome(limpo);
    if (vistos.has(key)) return;
    vistos.add(key);
    saida.push(limpo);
  };

  const ingredientesComPercentual = ingredientes.filter((nome) => numeroPercentual(nome));
  for (const ingrediente of ingredientesComPercentual) {
    for (const nome of catalogo) {
      const ajustado = nomeComPercentualDoIngrediente(nome, ingrediente);
      if (ajustado) adicionar(ajustado);
    }
  }
  for (const nome of catalogo) adicionar(nome);

  const filtro = normalizarNome(texto);
  const filtrados = filtro
    ? saida.filter((nome) => normalizarNome(nome).includes(filtro))
    : saida;
  return filtrados.slice(0, 8);
}
