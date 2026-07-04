export type TipoItem =
  | 'MateriaPrima'
  | 'ProdutoAcabado'
  | 'Equipamento'
  | 'Energia'
  | 'Agua'
  | 'Embalagem'
  | 'Transporte'
  | 'Outros';

export interface EstoqueItem {
  id: number;
  nome: string;
  tipo: TipoItem;
  quantidade: number;
  unidade: string;
  valorUnit: number;
  data?: string;
}

export interface ItemMovimentacao {
  id: number;
  nome: string;
  tipo: TipoItem;
  quantidade: number;
  unidade: string;
  valorUnit: number;
}

export interface Compra {
  id: number;
  data: string;
  fornecedor: string;
  formaPagamento: string;
  cartao: string | null;
  parcelas: number;
  total: number;
  itens: ItemMovimentacao[];
}

export interface Venda {
  id: number;
  data: string;
  cliente: string;
  formaPagamento: string;
  total: number;
  itens: ItemMovimentacao[];
}

export interface Producao {
  id: number;
  data: string;
  lote: string;
  produto: string;
  quantidade: number;
  unidade: string;
  ingredientes: Array<{
    nome: string;
    quantidade: number;
    valorUnit: number;
    unidade?: string;
    /** MateriaPrima (compra) ou ProdutoAcabado (etapa anterior da produção). */
    tipo?: TipoItem;
  }>;
  custoEstimado: number;
  /** Perda calculada: entrada − saída (mesma unidade). */
  quantidadePerdida?: number;
  /** Perda percentual calculada a partir da entrada e da saída. */
  percentualPerda?: number;
}

export interface CartaoModel {
  id: number;
  nome: string;
  limite?: number;
}

export interface BancoModel {
  id: number;
  nome: string;
  agencia?: string;
  conta?: string;
}

export interface PatrimonioItem {
  id: number;
  nome: string;
  categoria: string;
  dataAquisicao: string;
  valorAquisicao: number;
  valorAtual: number;
  depreciacaoAnual: number;
  observacoes?: string;
}

export interface MovimentoFinanceiro {
  id: number;
  data: string;
  descricao: string;
  tipo: 'entrada' | 'saida';
  valor: number;
  categoria: string;
  referencia?: string;
  banco?: string;
}

export interface PrecoGerado {
  id: number;
  data: string;
  produto: string;
  unidade: string;
  custoUnitario: number;
  margemLucro: number;
  precoSugerido: number;
}

export interface AppData {
  estoque: EstoqueItem[];
  compras: Compra[];
  vendas: Venda[];
  producoes: Producao[];
  cartoes: CartaoModel[];
  bancos: BancoModel[];
  patrimonio: PatrimonioItem[];
  movimentosCaixa: MovimentoFinanceiro[];
  movimentosBanco: MovimentoFinanceiro[];
  precosGerados: PrecoGerado[];
}

export const TIPOS_ITEM: TipoItem[] = [
  'MateriaPrima',
  'ProdutoAcabado',
  'Equipamento',
  'Energia',
  'Agua',
  'Embalagem',
  'Transporte',
  'Outros',
];

export const STORAGE_KEYS = {
  estoque: 'chocogest_estoque',
  compras: 'chocogest_compras',
  vendas: 'chocogest_vendas',
  producoes: 'chocogest_producoes',
  cartoes: 'chocogest_cartoes',
  bancos: 'chocogest_bancos',
  patrimonio: 'chocogest_patrimonio',
  caixa: 'chocogest_caixa',
  banco: 'chocogest_banco',
  precos: 'chocogest_precos',
} as const;

export const EMPTY_DATA: AppData = {
  estoque: [],
  compras: [],
  vendas: [],
  producoes: [],
  cartoes: [{ id: 1, nome: 'Cartão Principal', limite: 5000 }],
  bancos: [{ id: 1, nome: 'Banco Principal' }],
  patrimonio: [],
  movimentosCaixa: [],
  movimentosBanco: [],
  precosGerados: [],
};