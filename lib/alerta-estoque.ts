import { agruparEstoque } from '@/lib/estoque';
import { arredondarQuantidade } from '@/lib/format';
import type { AlertaEstoqueMinimo, EstoqueItem, TipoItem } from '@/lib/types';
import { tipoEstoqueCadeia } from '@/lib/cadeia-producao';

export interface SituacaoEstoqueMinimo {
  id: number;
  nome: string;
  tipo: TipoItem;
  unidade: string;
  minimo: number;
  quantidade: number;
  /** Saldo no mínimo definido ou abaixo dele. */
  baixo: boolean;
}

function chaveNome(nome: string): string {
  return nome.trim().toLowerCase();
}

/**
 * Um alerta por nome. Mínimo zero ou negativo não alerta e é descartado.
 * O último registro do mesmo nome prevalece.
 */
export function normalizeAlertasEstoque(items: unknown): AlertaEstoqueMinimo[] {
  if (!Array.isArray(items)) return [];

  const porNome = new Map<string, AlertaEstoqueMinimo>();
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Partial<AlertaEstoqueMinimo>;
    const nome = (item.nome ?? '').trim();
    if (!nome) continue;
    const minimo = arredondarQuantidade(Number(item.minimo));
    if (!(minimo > 0)) continue;
    const unidade = (item.unidade ?? '').trim() || 'un';
    porNome.set(chaveNome(nome), {
      id: typeof item.id === 'number' && item.id > 0 ? item.id : 0,
      nome,
      tipo: tipoEstoqueCadeia(nome, item.tipo ?? 'MateriaPrima'),
      unidade,
      minimo,
    });
  }

  const ids = new Set<number>();
  let seq = 1;
  const reservar = (preferido: number) => {
    let id = preferido > 0 && !ids.has(preferido) ? preferido : seq;
    while (ids.has(id)) id += 1;
    ids.add(id);
    if (id >= seq) seq = id + 1;
    return id;
  };

  return Array.from(porNome.values())
    .map((alerta) => ({ ...alerta, id: reservar(alerta.id) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Compara cada mínimo com o saldo agrupado pelo nome, o mesmo da tela de Estoque. */
export function avaliarAlertasEstoque(
  estoque: EstoqueItem[],
  alertas: AlertaEstoqueMinimo[]
): SituacaoEstoqueMinimo[] {
  const saldos = agruparEstoque(estoque);

  return alertas
    .map((alerta) => {
      const saldo = saldos.find((item) => chaveNome(item.nome) === chaveNome(alerta.nome));
      const quantidade = saldo?.quantidade ?? 0;
      return {
        id: alerta.id,
        nome: alerta.nome,
        tipo: alerta.tipo,
        unidade: saldo?.unidade || alerta.unidade,
        minimo: alerta.minimo,
        quantidade,
        baixo: quantidade <= alerta.minimo,
      };
    })
    .sort((a, b) => {
      if (a.baixo !== b.baixo) return a.baixo ? -1 : 1;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });
}

export function itensEstoqueBaixo(
  estoque: EstoqueItem[],
  alertas: AlertaEstoqueMinimo[]
): SituacaoEstoqueMinimo[] {
  return avaliarAlertasEstoque(estoque, alertas).filter((item) => item.baixo);
}

/** Identifica quais itens estão baixos. A quantidade não entra, para não reabrir o popup a cada lançamento. */
export function assinaturaItensBaixos(itens: Array<{ nome: string; tipo: TipoItem }>): string {
  return itens
    .map((item) => `${chaveNome(item.nome)}|${item.tipo}`)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .join('\n');
}
