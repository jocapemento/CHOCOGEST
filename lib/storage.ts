import { AppData, EMPTY_DATA, STORAGE_KEYS } from './types';
import type {
  BancoModel,
  CartaoModel,
  Compra,
  EstoqueItem,
  MovimentoFinanceiro,
  PatrimonioItem,
  Producao,
  Venda,
} from './types';
import { todayISO } from './format';

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeEstoque(items: unknown[]): EstoqueItem[] {
  return items.map((raw, idx) => {
    const item = raw as Partial<EstoqueItem>;
    return {
      id: item.id ?? idx + 1,
      nome: item.nome ?? '',
      tipo: item.tipo ?? 'MateriaPrima',
      quantidade: asNumber(item.quantidade),
      unidade: item.unidade ?? 'un',
      valorUnit: asNumber(item.valorUnit),
      data: item.data,
    };
  });
}

function normalizePatrimonio(items: unknown[]): PatrimonioItem[] {
  return items.map((raw, idx) => {
    const item = raw as Partial<PatrimonioItem> & { valor?: number };
    const valorAquisicao = asNumber(item.valorAquisicao ?? item.valor);
    return {
      id: item.id ?? idx + 1,
      nome: item.nome ?? 'Sem nome',
      categoria: item.categoria ?? 'Outros',
      dataAquisicao: item.dataAquisicao ?? todayISO(),
      valorAquisicao,
      valorAtual: asNumber(item.valorAtual, valorAquisicao),
      depreciacaoAnual: asNumber(item.depreciacaoAnual),
      observacoes: item.observacoes,
    };
  });
}

function normalizeMovimentos(items: unknown[]): MovimentoFinanceiro[] {
  return items.map((raw, idx) => {
    const item = raw as Partial<MovimentoFinanceiro>;
    return {
      id: item.id ?? idx + 1,
      data: item.data ?? todayISO(),
      descricao: item.descricao ?? '',
      tipo: item.tipo === 'saida' ? 'saida' : 'entrada',
      valor: asNumber(item.valor),
      categoria: item.categoria ?? 'Outros',
      referencia: item.referencia,
      banco: item.banco,
    };
  });
}

function normalizeBancos(items: unknown[]): BancoModel[] {
  return items.map((raw, idx) => {
    const item = raw as Partial<BancoModel>;
    return {
      id: item.id ?? idx + 1,
      nome: item.nome ?? 'Banco',
      agencia: item.agencia,
      conta: item.conta,
    };
  });
}

function normalizeCartoes(items: unknown[]): CartaoModel[] {
  return items.map((raw, idx) => {
    const item = raw as Partial<CartaoModel>;
    return {
      id: item.id ?? idx + 1,
      nome: item.nome ?? 'Cartão',
      limite: item.limite !== undefined ? asNumber(item.limite) : undefined,
    };
  });
}

function normalizeCompras(items: unknown[]): Compra[] {
  return items.map((raw, idx) => {
    const item = raw as Partial<Compra>;
    return {
      id: item.id ?? idx + 1,
      data: item.data ?? todayISO(),
      fornecedor: item.fornecedor ?? '',
      formaPagamento: item.formaPagamento ?? 'Dinheiro',
      cartao: item.cartao ?? null,
      parcelas: asNumber(item.parcelas, 1),
      total: asNumber(item.total),
      itens: Array.isArray(item.itens) ? normalizeEstoque(item.itens) : [],
    };
  });
}

function normalizeVendas(items: unknown[]): Venda[] {
  return items.map((raw, idx) => {
    const item = raw as Partial<Venda>;
    return {
      id: item.id ?? idx + 1,
      data: item.data ?? todayISO(),
      cliente: item.cliente ?? '',
      formaPagamento: item.formaPagamento ?? 'Dinheiro',
      total: asNumber(item.total),
      itens: Array.isArray(item.itens) ? normalizeEstoque(item.itens) : [],
    };
  });
}

function normalizeProducoes(items: unknown[]): Producao[] {
  return items.map((raw, idx) => {
    const item = raw as Partial<Producao>;
    return {
      id: item.id ?? idx + 1,
      data: item.data ?? todayISO(),
      lote: item.lote ?? '',
      produto: item.produto ?? '',
      quantidade: asNumber(item.quantidade, 1),
      unidade: item.unidade ?? 'un',
      ingredientes: Array.isArray(item.ingredientes)
        ? item.ingredientes.map((ing) => ({
            nome: ing.nome ?? '',
            quantidade: asNumber(ing.quantidade),
            valorUnit: asNumber(ing.valorUnit),
          }))
        : [],
      custoEstimado: asNumber(item.custoEstimado),
    };
  });
}

export function normalizeAppData(data: AppData): AppData {
  return {
    estoque: normalizeEstoque(data.estoque),
    compras: normalizeCompras(data.compras),
    vendas: normalizeVendas(data.vendas),
    producoes: normalizeProducoes(data.producoes),
    cartoes: normalizeCartoes(data.cartoes),
    bancos: normalizeBancos(data.bancos),
    patrimonio: normalizePatrimonio(data.patrimonio),
    movimentosCaixa: normalizeMovimentos(data.movimentosCaixa),
    movimentosBanco: normalizeMovimentos(data.movimentosBanco),
  };
}

export function loadAppData(): AppData {
  const data: AppData = { ...EMPTY_DATA };

  const loaders: Array<{ key: keyof typeof STORAGE_KEYS; field: keyof AppData }> = [
    { key: 'estoque', field: 'estoque' },
    { key: 'compras', field: 'compras' },
    { key: 'vendas', field: 'vendas' },
    { key: 'producoes', field: 'producoes' },
    { key: 'cartoes', field: 'cartoes' },
    { key: 'bancos', field: 'bancos' },
    { key: 'patrimonio', field: 'patrimonio' },
    { key: 'caixa', field: 'movimentosCaixa' },
    { key: 'banco', field: 'movimentosBanco' },
  ];

  for (const { key, field } of loaders) {
    const saved = localStorage.getItem(STORAGE_KEYS[key]);
    if (!saved) continue;
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (data as any)[field] = parsed;
      }
    } catch {
      console.warn(`ChocoGest: dados corrompidos em ${STORAGE_KEYS[key]}`);
    }
  }

  if (data.cartoes.length === 0) {
    data.cartoes = [...EMPTY_DATA.cartoes];
  }

  if (data.bancos.length === 0) {
    data.bancos = [...EMPTY_DATA.bancos];
  }

  return normalizeAppData(data);
}

export function saveAppData(data: AppData): void {
  localStorage.setItem(STORAGE_KEYS.estoque, JSON.stringify(data.estoque));
  localStorage.setItem(STORAGE_KEYS.compras, JSON.stringify(data.compras));
  localStorage.setItem(STORAGE_KEYS.vendas, JSON.stringify(data.vendas));
  localStorage.setItem(STORAGE_KEYS.producoes, JSON.stringify(data.producoes));
  localStorage.setItem(STORAGE_KEYS.cartoes, JSON.stringify(data.cartoes));
  localStorage.setItem(STORAGE_KEYS.bancos, JSON.stringify(data.bancos));
  localStorage.setItem(STORAGE_KEYS.patrimonio, JSON.stringify(data.patrimonio));
  localStorage.setItem(STORAGE_KEYS.caixa, JSON.stringify(data.movimentosCaixa));
  localStorage.setItem(STORAGE_KEYS.banco, JSON.stringify(data.movimentosBanco));
}

export function exportBackup(data: AppData): void {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    app: 'ChocoGest',
    data,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chocogest-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseBackupFile(content: string): AppData | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed?.data && typeof parsed.data === 'object') {
      return normalizeAppData({ ...EMPTY_DATA, ...parsed.data });
    }
    if (parsed?.estoque) {
      return normalizeAppData({ ...EMPTY_DATA, ...parsed });
    }
    return null;
  } catch {
    return null;
  }
}