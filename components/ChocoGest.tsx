'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type {
  AppData,
  BancoModel,
  CartaoModel,
  Compra,
  EstoqueItem,
  ItemMovimentacao,
  MovimentoFinanceiro,
  PatrimonioItem,
  PrecoGerado,
  Producao,
  TipoItem,
  StatusVenda,
  Venda,
} from '@/lib/types';
import { EMPTY_DATA, TIPOS_ITEM } from '@/lib/types';
import { loadAppData, saveAppData, exportBackup, parseBackupFile } from '@/lib/storage';
import {
  calcularParcelasMensais,
  mesesComParcelas,
  totalParcelasCartao,
  totalParcelasMes,
  valorParcelaNoMes,
} from '@/lib/cartoes';
import {
  CADEIA_PRODUCAO_CACAU,
  ingredientesSugeridosPara,
  produtosDaCadeia,
} from '@/lib/cadeia-producao';
import {
  agruparEstoque,
  baixarEstoqueFifo,
  calcularPerdaProducao,
  catalogoItensLancados,
  catalogoNomesProdutos,
  catalogoProdutosProduzidos,
  filtrarLancamentosMateriaPrima,
  filtrarLancamentosProdutosGerados,
  filtrarSaldoMateriaPrima,
  filtrarSaldoProdutosGerados,
  ingredientesProducaoDisponiveis,
  quantidadeDisponivel,
  resolverTipoIngredienteProducao,
  saldoIngrediente,
  saldoIngredienteProducao,
  totalEntradaIngredientes,
  totalizarPerdasPorProduto,
  totalVendidoProduto,
  validarIngredientesProducao,
  vendasDoProduto,
} from '@/lib/estoque';
import {
  catalogoProdutosPrecificacao,
  historicoPrecosDoProduto,
  historicoPrecosOrdenado,
  nomeProdutoIgual,
  precoUnitarioParaVenda,
  totalizarProdutosPrecificados,
} from '@/lib/precificacao';
import {
  isVendaConcluida,
  listarVendasPendentes,
  produtosReservadosPendentes,
  rankingMelhoresClientes,
  resumoVendasPendentes,
  saldoLivreParaVenda,
  STATUS_VENDA_LABEL,
  validarEstoqueVenda,
  validarReservaVendaPendente,
} from '@/lib/vendas';
import {
  brlParaUsd,
  formatCurrency,
  formatDate,
  formatMesAno,
  formatUsd,
  mesAtualISO,
  nextId,
  normalizeDateISO,
  sumBy,
  todayISO,
} from '@/lib/format';
import {
  gerarPdfCompras,
  gerarPdfDashboard,
  gerarPdfEstoque,
  gerarPdfFinanceiro,
  gerarPdfPatrimonio,
  gerarPdfVendas,
} from '@/lib/pdf-reports';

const TABS = [
  { id: 'dashboard', label: '📊 Dashboard' },
  { id: 'estoque', label: '📦 Estoque' },
  { id: 'compras', label: '🚚 Compras' },
  { id: 'vendas', label: '🛒 Vendas' },
  { id: 'producao', label: '🏭 Produção' },
  { id: 'precificacao', label: '📈 Precificação' },
  { id: 'cartoes', label: '💳 Cartões' },
  { id: 'caixa', label: '💰 Caixa' },
  { id: 'banco', label: '🏦 Banco' },
  { id: 'patrimonio', label: '🏛️ Patrimônio' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function calcSaldo(movimentos: MovimentoFinanceiro[]) {
  const entradas = sumBy(movimentos.filter((m) => m.tipo === 'entrada'), (m) => m.valor);
  const saidas = sumBy(movimentos.filter((m) => m.tipo === 'saida'), (m) => m.valor);
  return entradas - saidas;
}

function calcSaldoBanco(movimentos: MovimentoFinanceiro[], bancoNome: string) {
  const doBanco = movimentos.filter((m) => m.banco === bancoNome);
  return calcSaldo(doBanco);
}

function registrarMovimento(
  movimentos: MovimentoFinanceiro[],
  mov: Omit<MovimentoFinanceiro, 'id'>
): MovimentoFinanceiro[] {
  return [...movimentos, { ...mov, id: nextId(movimentos) }];
}

function compraItensParaPatrimonio(
  itens: ItemMovimentacao[],
  patrimonio: PatrimonioItem[],
  dataAquisicao: string,
  fornecedor: string,
  compraId: number
): PatrimonioItem[] {
  const equipamentos = itens.filter((i) => i.tipo === 'Equipamento');
  if (equipamentos.length === 0) return [];

  let nextPatrimonioId = nextId(patrimonio);
  const novos: PatrimonioItem[] = [];

  for (const item of equipamentos) {
    const valorTotal = item.quantidade * item.valorUnit;
    if (!item.nome.trim() || valorTotal <= 0) continue;

    const nome =
      item.quantidade > 1
        ? `${item.nome} (${item.quantidade} ${item.unidade})`
        : item.nome;

    novos.push({
      id: nextPatrimonioId++,
      nome,
      categoria: 'Equipamento',
      dataAquisicao,
      valorAquisicao: valorTotal,
      valorAtual: valorTotal,
      depreciacaoAnual: 10,
      observacoes: `Compra #${compraId} — ${fornecedor}`,
    });
  }

  return novos;
}

function atualizarEstoqueCompra(
  estoque: EstoqueItem[],
  itens: ItemMovimentacao[],
  dataOperacao?: string
): EstoqueItem[] {
  const updated = [...estoque];
  const data = dataOperacao ?? todayISO();

  for (const item of itens) {
    updated.push({
      id: nextId(updated),
      nome: item.nome,
      tipo: item.tipo,
      quantidade: item.quantidade,
      unidade: item.unidade,
      valorUnit: item.valorUnit,
      data,
    });
  }

  return updated;
}

function reverterEstoqueCompra(estoque: EstoqueItem[], itens: ItemMovimentacao[]): EstoqueItem[] {
  return baixarEstoqueFifo(estoque, itens);
}

function removerPatrimonioCompra(patrimonio: PatrimonioItem[], compraId: number): PatrimonioItem[] {
  const marker = `Compra #${compraId}`;
  return patrimonio.filter((p) => !p.observacoes?.includes(marker));
}

function removerMovimentosCompra(
  movCaixa: MovimentoFinanceiro[],
  movBanco: MovimentoFinanceiro[],
  compraId: number
) {
  const ref = `compra-${compraId}`;
  return {
    movCaixa: movCaixa.filter((m) => m.referencia !== ref),
    movBanco: movBanco.filter((m) => m.referencia !== ref),
  };
}

function aplicarMovimentoCompra(
  movCaixa: MovimentoFinanceiro[],
  movBanco: MovimentoFinanceiro[],
  compra: Compra,
  total: number,
  dataOperacao: string,
  bancoPadrao?: string
) {
  const desc = `Compra: ${compra.fornecedor}`;
  let caixa = movCaixa;
  let banco = movBanco;

  if (compra.formaPagamento === 'Dinheiro') {
    caixa = registrarMovimento(caixa, {
      data: dataOperacao,
      descricao: desc,
      tipo: 'saida',
      valor: total,
      categoria: 'Compras',
      referencia: `compra-${compra.id}`,
    });
  } else if (compra.formaPagamento === 'Pix' || compra.formaPagamento === 'Transferencia') {
    banco = registrarMovimento(banco, {
      data: dataOperacao,
      descricao: desc,
      tipo: 'saida',
      valor: total,
      categoria: 'Compras',
      referencia: `compra-${compra.id}`,
      banco: bancoPadrao,
    });
  }

  return { movCaixa: caixa, movBanco: banco };
}

function reverterEfeitosCompra(prev: AppData, compra: Compra): AppData {
  const itensEstoque = compra.itens.filter((i) => i.tipo !== 'Equipamento');
  const { movCaixa, movBanco } = removerMovimentosCompra(
    prev.movimentosCaixa,
    prev.movimentosBanco,
    compra.id
  );

  return {
    ...prev,
    estoque: reverterEstoqueCompra(prev.estoque, itensEstoque),
    patrimonio: removerPatrimonioCompra(prev.patrimonio, compra.id),
    movimentosCaixa: movCaixa,
    movimentosBanco: movBanco,
  };
}

const COMPRA_FORM_INICIAL = {
  data: todayISO(),
  fornecedor: '',
  formaPagamento: 'Cartao',
  cartaoId: 1,
  parcelas: 1,
  itens: [] as ItemMovimentacao[],
};

function removerMovimentosVenda(
  movCaixa: MovimentoFinanceiro[],
  movBanco: MovimentoFinanceiro[],
  vendaId: number
) {
  const ref = `venda-${vendaId}`;
  return {
    movCaixa: movCaixa.filter((m) => m.referencia !== ref),
    movBanco: movBanco.filter((m) => m.referencia !== ref),
  };
}

function aplicarMovimentoVenda(
  movCaixa: MovimentoFinanceiro[],
  movBanco: MovimentoFinanceiro[],
  venda: Venda,
  total: number,
  dataOperacao: string,
  bancoPadrao?: string
) {
  const desc = `Venda: ${venda.cliente}`;
  let caixa = movCaixa;
  let banco = movBanco;

  if (venda.formaPagamento === 'Dinheiro') {
    caixa = registrarMovimento(caixa, {
      data: dataOperacao,
      descricao: desc,
      tipo: 'entrada',
      valor: total,
      categoria: 'Vendas',
      referencia: `venda-${venda.id}`,
    });
  } else {
    banco = registrarMovimento(banco, {
      data: dataOperacao,
      descricao: desc,
      tipo: 'entrada',
      valor: total,
      categoria: 'Vendas',
      referencia: `venda-${venda.id}`,
      banco: bancoPadrao,
    });
  }

  return { movCaixa: caixa, movBanco: banco };
}

function reverterEfeitosVenda(prev: AppData, venda: Venda): AppData {
  const { movCaixa, movBanco } = removerMovimentosVenda(
    prev.movimentosCaixa,
    prev.movimentosBanco,
    venda.id
  );

  return {
    ...prev,
    estoque: atualizarEstoqueCompra(prev.estoque, venda.itens),
    movimentosCaixa: movCaixa,
    movimentosBanco: movBanco,
  };
}

function ingredientesProducaoParaItens(
  estoque: EstoqueItem[],
  ingredientes: Producao['ingredientes'],
  producoes: Producao[]
): ItemMovimentacao[] {
  return ingredientes.map((ing) => {
    const tipo = resolverTipoIngredienteProducao(ing, producoes);
    const saldo = saldoIngredienteProducao(estoque, ing.nome, producoes, tipo);
    return {
      id: 0,
      nome: ing.nome,
      tipo,
      quantidade: ing.quantidade,
      unidade: ing.unidade ?? saldo?.unidade ?? 'kg',
      valorUnit: ing.valorUnit,
    };
  });
}

function produtoProducaoParaItem(producao: Producao): ItemMovimentacao {
  const custoUnit =
    producao.quantidade > 0 ? producao.custoEstimado / producao.quantidade : producao.custoEstimado;
  return {
    id: 0,
    nome: producao.produto,
    tipo: 'ProdutoAcabado',
    quantidade: producao.quantidade,
    unidade: producao.unidade,
    valorUnit: custoUnit,
  };
}

function aplicarEfeitosProducao(
  estoque: EstoqueItem[],
  producao: Producao,
  producoes: Producao[]
): EstoqueItem[] {
  let updated = estoque;
  for (const item of ingredientesProducaoParaItens(updated, producao.ingredientes, producoes)) {
    updated = baixarEstoqueFifo(updated, [item]);
  }
  return atualizarEstoqueCompra(updated, [produtoProducaoParaItem(producao)], producao.data);
}

function reverterEfeitosProducao(
  estoque: EstoqueItem[],
  producao: Producao,
  producoes: Producao[]
): EstoqueItem[] {
  const updated = baixarEstoqueFifo(estoque, [produtoProducaoParaItem(producao)]);
  return atualizarEstoqueCompra(
    updated,
    ingredientesProducaoParaItens(updated, producao.ingredientes, producoes),
    producao.data
  );
}

function podeReverterProducao(estoque: EstoqueItem[], producao: Producao): boolean {
  return quantidadeDisponivel(estoque, producao.produto) >= producao.quantidade;
}

function formatarMensagemBloqueioProducao(
  producao: Producao,
  estoque: EstoqueItem[],
  vendas: Venda[],
  acao: 'excluir' | 'editar'
): string {
  const disponivel = quantidadeDisponivel(estoque, producao.produto);
  const vendasRelacionadas = vendasDoProduto(vendas, producao.produto);
  const totalVendido = totalVendidoProduto(vendas, producao.produto);
  const faltam = Math.max(0, producao.quantidade - disponivel);

  const linhas = [
    `Não é possível ${acao} esta produção: o estoque de "${producao.produto}" não cobre a reversão.`,
    '',
    `• Nesta produção: ${producao.quantidade} ${producao.unidade}`,
    `• Disponível no estoque: ${disponivel}`,
    `• Faltam para desfazer: ${faltam}`,
  ];

  if (totalVendido > 0) {
    linhas.push(`• Total vendido: ${totalVendido}`);
  }

  if (vendasRelacionadas.length > 0) {
    linhas.push('', 'Vendas que consumiram este produto:');
    for (const v of vendasRelacionadas.slice(0, 6)) {
      linhas.push(
        `  — Venda #${v.vendaId} (${formatDate(v.data)}): ${v.quantidade} un. — ${v.cliente}`
      );
    }
    if (vendasRelacionadas.length > 6) {
      linhas.push(`  … e mais ${vendasRelacionadas.length - 6} venda(s).`);
    }
    linhas.push('', 'Para desfazer completamente, exclua ou edite essas vendas em Vendas primeiro.');
  } else if (disponivel < producao.quantidade) {
    linhas.push(
      '',
      'Não há vendas registradas deste produto. Verifique outras produções do mesmo nome ou lançamentos no estoque.'
    );
  }

  if (acao === 'excluir') {
    linhas.push(
      '',
      'Na próxima confirmação você pode excluir apenas o registro (sem alterar estoque nem vendas).'
    );
  }

  return linhas.join('\n');
}

const VENDA_FORM_INICIAL = {
  data: todayISO(),
  cliente: '',
  formaPagamento: 'Dinheiro',
  status: 'concluida' as StatusVenda,
  itens: [] as ItemMovimentacao[],
};

const ITEM_ESTOQUE_FORM_INICIAL = {
  nome: '',
  tipo: 'MateriaPrima' as TipoItem,
  quantidade: 0,
  unidade: 'kg',
  valorUnit: 0,
  data: todayISO(),
};

const PRODUCAO_FORM_INICIAL = {
  data: todayISO(),
  lote: '',
  produto: '',
  quantidade: 0,
  unidade: 'kg',
  ingredientes: [] as Array<{
    nome: string;
    quantidade: number;
    valorUnit: number;
    unidade?: string;
    tipo?: TipoItem;
  }>,
};

function unidadeSugeridaProduto(producoes: Producao[], nome: string): string | undefined {
  const registro = producoes.find((p) => p.produto.toLowerCase() === nome.toLowerCase());
  return registro?.unidade;
}

const MOV_CAIXA_FORM_INICIAL = {
  data: todayISO(),
  descricao: '',
  tipo: 'entrada' as 'entrada' | 'saida',
  valor: 0,
  categoria: 'Operacional',
};

const MOV_BANCO_FORM_INICIAL = {
  data: todayISO(),
  descricao: '',
  tipo: 'entrada' as 'entrada' | 'saida',
  valor: 0,
  categoria: 'Operacional',
  bancoId: 1,
};

// Shared UI — alvos de toque e tipografia pensados para smartphone (ver globals.css)
function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6">
      <h2 className="text-xl sm:text-2xl font-bold text-amber-100">{children}</h2>
      {action ? <div className="flex flex-wrap gap-2 shrink-0">{action}</div> : null}
    </div>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`bg-[#4a3828]/80 backdrop-blur rounded-2xl p-4 sm:p-6 border border-amber-800/50 ${className}`}
    >
      {children}
    </div>
  );
}

function Btn({
  children,
  onClick,
  variant = 'primary',
  className = '',
  type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  className?: string;
  type?: 'button' | 'submit' | 'reset';
}) {
  const styles = {
    primary: 'bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white',
    secondary:
      'bg-amber-900/60 hover:bg-amber-800 active:bg-amber-950 text-amber-100 border border-amber-700',
    danger: 'bg-red-800 hover:bg-red-700 active:bg-red-900 text-white',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      className={`touch-target inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="text-amber-200/80 text-sm mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <input type="date" className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

const inputCls =
  'w-full min-h-[44px] bg-[#2c2118] border border-amber-700/60 rounded-xl px-3 py-2.5 text-base sm:text-sm text-white focus:outline-none focus:border-amber-500';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const chocolateBgStyle: React.CSSProperties = {
  backgroundImage: `linear-gradient(rgba(44, 33, 24, 0.55), rgba(44, 33, 24, 0.65)), url('${basePath}/chocolate-bg.jpeg')`,
};

export default function ChocoGest() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [hydrated, setHydrated] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Forms
  const [novoItem, setNovoItem] = useState({ ...ITEM_ESTOQUE_FORM_INICIAL });
  const [estoqueEditandoId, setEstoqueEditandoId] = useState<number | null>(null);
  const [novaCompra, setNovaCompra] = useState({ ...COMPRA_FORM_INICIAL });
  const [compraEditandoId, setCompraEditandoId] = useState<number | null>(null);
  const [itemCompra, setItemCompra] = useState({
    nome: '',
    tipo: 'MateriaPrima' as TipoItem,
    quantidade: 1,
    unidade: 'kg',
    valorUnit: 0,
  });
  const [novaVenda, setNovaVenda] = useState({ ...VENDA_FORM_INICIAL });
  const [vendaEditandoId, setVendaEditandoId] = useState<number | null>(null);
  const [itemVenda, setItemVenda] = useState({
    nome: '',
    quantidade: 1,
    valorUnit: 0,
  });
  const [novaProducao, setNovaProducao] = useState({ ...PRODUCAO_FORM_INICIAL });
  const [producaoEditandoId, setProducaoEditandoId] = useState<number | null>(null);
  const [ingredienteForm, setIngredienteForm] = useState({ nome: '', quantidade: 0, valorUnit: 0 });
  const [novoCartao, setNovoCartao] = useState({ nome: '', limite: 0 });
  const [cotacaoDolar, setCotacaoDolar] = useState(0);
  const [novoPatrimonio, setNovoPatrimonio] = useState({
    nome: '',
    categoria: 'Equipamento',
    dataAquisicao: todayISO(),
    valorAquisicao: 0,
    valorAtual: 0,
    depreciacaoAnual: 10,
    observacoes: '',
  });
  const [movCaixa, setMovCaixa] = useState({ ...MOV_CAIXA_FORM_INICIAL });
  const [movCaixaEditandoId, setMovCaixaEditandoId] = useState<number | null>(null);
  const [movBanco, setMovBanco] = useState({ ...MOV_BANCO_FORM_INICIAL });
  const [movBancoEditandoId, setMovBancoEditandoId] = useState<number | null>(null);
  const [novoBanco, setNovoBanco] = useState({ nome: '', agencia: '', conta: '' });
  const [margemLucro, setMargemLucro] = useState(40);
  const [produtoPreco, setProdutoPreco] = useState('');
  const [dataPreco, setDataPreco] = useState(todayISO());

  useEffect(() => {
    const loaded = loadAppData();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratação única do localStorage no mount
    setData(loaded);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveAppData(data);
  }, [data, hydrated]);

  const update = useCallback((fn: (prev: AppData) => AppData) => setData(fn), []);

  const resumoPerdaProducao = useMemo(
    () =>
      calcularPerdaProducao({
        ingredientes: novaProducao.ingredientes,
        quantidade: novaProducao.quantidade,
      }),
    [novaProducao.ingredientes, novaProducao.quantidade]
  );

  const catalogoProdutosProducao = useMemo(() => {
    const map = new Map<string, string>();
    for (const nome of produtosDaCadeia()) {
      map.set(nome.toLowerCase(), nome);
    }
    for (const nome of catalogoNomesProdutos(data.producoes)) {
      const key = nome.toLowerCase();
      if (!map.has(key)) map.set(key, nome);
    }
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [data.producoes]);

  const totalPerdasPorProduto = useMemo(
    () => totalizarPerdasPorProduto(data.producoes),
    [data.producoes]
  );

  const produtosParaVenda = useMemo(
    () => catalogoProdutosProduzidos(data.producoes, data.estoque),
    [data.producoes, data.estoque]
  );

  const catalogoItensCompra = useMemo(
    () => catalogoItensLancados(data.compras, data.estoque),
    [data.compras, data.estoque]
  );
  const parcelasMensais = useMemo(() => calcularParcelasMensais(data.compras), [data.compras]);
  const mesesParcelas = useMemo(() => mesesComParcelas(parcelasMensais), [parcelasMensais]);
  const mesAtual = mesAtualISO();
  const ingredientesDisponiveis = useMemo(
    () => ingredientesProducaoDisponiveis(data.estoque, data.producoes),
    [data.estoque, data.producoes]
  );
  const ingredientesSugeridos = useMemo(
    () => ingredientesSugeridosPara(novaProducao.produto),
    [novaProducao.produto]
  );

  // --- Handlers ---
  const resetFormEstoque = () => {
    setNovoItem({ ...ITEM_ESTOQUE_FORM_INICIAL, data: todayISO() });
    setEstoqueEditandoId(null);
  };

  const editarItemEstoque = (item: EstoqueItem) => {
    setNovoItem({
      nome: item.nome,
      tipo: item.tipo,
      quantidade: item.quantidade,
      unidade: item.unidade,
      valorUnit: item.valorUnit,
      data: normalizeDateISO(item.data ?? todayISO()),
    });
    setEstoqueEditandoId(item.id);
  };

  const cancelarEdicaoEstoque = () => {
    resetFormEstoque();
  };

  const salvarItemEstoque = () => {
    if (!novoItem.nome.trim()) return alert('Informe o nome do item.');
    if (novoItem.quantidade <= 0) return alert('Informe uma quantidade maior que zero.');
    if (novoItem.valorUnit < 0) return alert('O valor unitário não pode ser negativo.');

    const dataOperacao = normalizeDateISO(novoItem.data);
    const editando = estoqueEditandoId !== null;

    update((prev) => {
      if (editando) {
        return {
          ...prev,
          estoque: prev.estoque.map((e) =>
            e.id === estoqueEditandoId
              ? {
                  ...e,
                  nome: novoItem.nome.trim(),
                  tipo: novoItem.tipo,
                  quantidade: novoItem.quantidade,
                  unidade: novoItem.unidade,
                  valorUnit: novoItem.valorUnit,
                  data: dataOperacao,
                }
              : e
          ),
        };
      }

      return {
        ...prev,
        estoque: [
          ...prev.estoque,
          { id: nextId(prev.estoque), ...novoItem, nome: novoItem.nome.trim(), data: dataOperacao },
        ],
      };
    });

    resetFormEstoque();
    alert(editando ? 'Lançamento atualizado com sucesso!' : 'Item adicionado ao estoque!');
  };

  const removerItemEstoque = (id: number) => {
    if (!confirm('Remover este item do estoque?')) return;
    update((prev) => ({ ...prev, estoque: prev.estoque.filter((e) => e.id !== id) }));
    if (estoqueEditandoId === id) {
      resetFormEstoque();
    }
  };

  const preencherItemCompra = (nome: string) => {
    const item = catalogoItensCompra.find((i) => i.nome.toLowerCase() === nome.toLowerCase());
    if (item) {
      setItemCompra({
        nome: item.nome,
        tipo: item.tipo,
        quantidade: itemCompra.quantidade || 1,
        unidade: item.unidade,
        valorUnit: item.valorUnit,
      });
      return;
    }
    setItemCompra({ ...itemCompra, nome });
  };

  const adicionarItemCompra = () => {
    if (!itemCompra.nome.trim()) {
      return alert('Informe o nome do item antes de adicionar.');
    }
    setNovaCompra((p) => {
      const item: ItemMovimentacao = {
        id: nextId(p.itens),
        ...itemCompra,
      };
      return { ...p, itens: [...p.itens, item] };
    });
    setItemCompra({ nome: '', tipo: 'MateriaPrima', quantidade: 1, unidade: 'kg', valorUnit: 0 });
  };

  const removerItemCompraLista = (id: number) => {
    setNovaCompra((p) => ({ ...p, itens: p.itens.filter((i) => i.id !== id) }));
  };

  const resetFormCompra = () => {
    setNovaCompra({ ...COMPRA_FORM_INICIAL, data: todayISO() });
    setItemCompra({ nome: '', tipo: 'MateriaPrima', quantidade: 1, unidade: 'kg', valorUnit: 0 });
    setCompraEditandoId(null);
  };

  const cancelarEdicaoCompra = () => {
    resetFormCompra();
  };

  const editarCompra = (compra: Compra) => {
    const cartao = data.cartoes.find((c) => c.nome === compra.cartao);
    setNovaCompra({
      data: normalizeDateISO(compra.data),
      fornecedor: compra.fornecedor,
      formaPagamento: compra.formaPagamento,
      cartaoId: cartao?.id ?? data.cartoes[0]?.id ?? 1,
      parcelas: compra.parcelas,
      itens: compra.itens.map((i) => ({ ...i })),
    });
    setCompraEditandoId(compra.id);
    setItemCompra({ nome: '', tipo: 'MateriaPrima', quantidade: 1, unidade: 'kg', valorUnit: 0 });
  };

  const removerCompra = (id: number) => {
    if (
      !confirm(
        'Remover este lançamento de compra? O estoque, patrimônio e movimentos financeiros serão ajustados.'
      )
    ) {
      return;
    }

    update((prev) => {
      const compra = prev.compras.find((c) => c.id === id);
      if (!compra) return prev;
      const reverted = reverterEfeitosCompra(prev, compra);
      return { ...reverted, compras: reverted.compras.filter((c) => c.id !== id) };
    });

    if (compraEditandoId === id) {
      resetFormCompra();
    }
  };

  const aplicarEfeitosCompra = (prev: AppData, compra: Compra, dataOperacao: string) => {
    const itensEstoque = compra.itens.filter((i) => i.tipo !== 'Equipamento');
    const novosPatrimonio = compraItensParaPatrimonio(
      compra.itens,
      prev.patrimonio,
      dataOperacao,
      compra.fornecedor,
      compra.id
    );
    const { movCaixa, movBanco } = aplicarMovimentoCompra(
      prev.movimentosCaixa,
      prev.movimentosBanco,
      compra,
      compra.total,
      dataOperacao,
      prev.bancos[0]?.nome
    );

    return {
      ...prev,
      estoque: atualizarEstoqueCompra(prev.estoque, itensEstoque, dataOperacao),
      patrimonio: [...prev.patrimonio, ...novosPatrimonio],
      movimentosCaixa: movCaixa,
      movimentosBanco: movBanco,
    };
  };

  const registrarCompra = () => {
    const fornecedor = novaCompra.fornecedor.trim();
    const itens: ItemMovimentacao[] = [...novaCompra.itens];

    if (itemCompra.nome.trim()) {
      itens.push({ id: nextId(itens), ...itemCompra });
    }

    if (!fornecedor) {
      return alert('Informe o nome do fornecedor.');
    }
    if (itens.length === 0) {
      return alert(
        'Adicione pelo menos um item à compra.\n\nPreencha Nome, Qtd e Valor abaixo — o item será incluído ao clicar em "Registrar Compra" ou em "+ Item".'
      );
    }

    const total = sumBy(itens, (i) => i.quantidade * i.valorUnit);
    const cartao = data.cartoes.find((c) => c.id === novaCompra.cartaoId);
    const dataOperacao = normalizeDateISO(novaCompra.data);
    const editando = compraEditandoId !== null;

    const compra: Compra = {
      id: editando ? compraEditandoId : nextId(data.compras),
      data: dataOperacao,
      fornecedor,
      formaPagamento: novaCompra.formaPagamento,
      cartao: novaCompra.formaPagamento === 'Cartao' ? (cartao?.nome ?? null) : null,
      parcelas: novaCompra.parcelas,
      total,
      itens,
    };

    update((prev) => {
      if (editando) {
        const antiga = prev.compras.find((c) => c.id === compraEditandoId);
        if (!antiga) return prev;

        let state = reverterEfeitosCompra(prev, antiga);
        state = aplicarEfeitosCompra(state, compra, dataOperacao);

        return {
          ...state,
          compras: state.compras.map((c) => (c.id === compraEditandoId ? compra : c)),
        };
      }

      const state = aplicarEfeitosCompra(prev, compra, dataOperacao);
      return { ...state, compras: [...state.compras, compra] };
    });

    const qtdEquipamento = itens.filter((i) => i.tipo === 'Equipamento').length;

    resetFormCompra();
    alert(
      editando
        ? 'Compra atualizada com sucesso!'
        : qtdEquipamento > 0
          ? `Compra registrada! ${qtdEquipamento} equipamento(s) adicionado(s) ao Patrimônio.`
          : 'Compra registrada com sucesso!'
    );
  };

  const resolverValorUnitarioVenda = (nome: string, precoInformado: number, custoUnitario: number) => {
    if (precoInformado > 0) return precoInformado;
    return precoUnitarioParaVenda(data.precosGerados, nome, custoUnitario).valor;
  };

  const adicionarItemVenda = () => {
    const saldo = catalogoProdutosProduzidos(data.producoes, data.estoque).find(
      (e) => e.nome.toLowerCase() === itemVenda.nome.toLowerCase()
    );
    if (!saldo) return alert('Selecione um produto produzido com saldo disponível.');
    if (itemVenda.quantidade <= 0) return alert('Informe uma quantidade válida.');

    // Já no formulário + reservas de outras vendas pendentes
    const qtdJaNoForm = novaVenda.itens
      .filter((i) => i.nome.toLowerCase() === saldo.nome.toLowerCase())
      .reduce((acc, i) => acc + i.quantidade, 0);
    const livre = saldoLivreParaVenda(data.estoque, data.vendas, saldo.nome, vendaEditandoId);
    const disponivel = Math.max(0, livre - qtdJaNoForm);

    if (itemVenda.quantidade > disponivel) {
      return alert(
        `Quantidade indisponível para "${saldo.nome}". ` +
          `Saldo livre: ${disponivel} ${saldo.unidade} ` +
          `(estoque ${saldo.quantidade}${qtdJaNoForm > 0 ? `, já no pedido ${qtdJaNoForm}` : ''}). ` +
          `Considere as reservas de vendas pendentes.`
      );
    }
    const valorUnit = resolverValorUnitarioVenda(saldo.nome, itemVenda.valorUnit, saldo.valorUnit);
    if (valorUnit <= 0) {
      return alert(
        `Informe o preço de venda ou registre "${saldo.nome}" na aba Precificação antes de vender.`
      );
    }
    const item: ItemMovimentacao = {
      id: nextId(novaVenda.itens),
      nome: saldo.nome,
      tipo: saldo.tipo,
      quantidade: itemVenda.quantidade,
      unidade: saldo.unidade,
      valorUnit,
    };
    setNovaVenda((p) => ({ ...p, itens: [...p.itens, item] }));
    setItemVenda({ nome: '', quantidade: 1, valorUnit: 0 });
  };

  const removerItemVendaLista = (id: number) => {
    setNovaVenda((p) => ({ ...p, itens: p.itens.filter((i) => i.id !== id) }));
  };

  const resetFormVenda = () => {
    setNovaVenda({ ...VENDA_FORM_INICIAL, data: todayISO() });
    setItemVenda({ nome: '', quantidade: 1, valorUnit: 0 });
    setVendaEditandoId(null);
  };

  const cancelarEdicaoVenda = () => {
    resetFormVenda();
  };

  const editarVenda = (venda: Venda) => {
    setNovaVenda({
      data: normalizeDateISO(venda.data),
      cliente: venda.cliente,
      formaPagamento: venda.formaPagamento,
      status: venda.status ?? 'concluida',
      itens: venda.itens.map((i) => ({ ...i })),
    });
    setVendaEditandoId(venda.id);
    setItemVenda({ nome: '', quantidade: 1, valorUnit: 0 });
  };

  const removerVenda = (id: number) => {
    if (
      !confirm(
        'Remover este lançamento de venda? O estoque e os movimentos financeiros serão ajustados.'
      )
    ) {
      return;
    }

    update((prev) => {
      const venda = prev.vendas.find((v) => v.id === id);
      if (!venda) return prev;
      const reverted = isVendaConcluida(venda) ? reverterEfeitosVenda(prev, venda) : prev;
      return { ...reverted, vendas: reverted.vendas.filter((v) => v.id !== id) };
    });

    if (vendaEditandoId === id) {
      resetFormVenda();
    }
  };

  const aplicarEfeitosVenda = (prev: AppData, venda: Venda, dataOperacao: string) => {
    const { movCaixa, movBanco } = aplicarMovimentoVenda(
      prev.movimentosCaixa,
      prev.movimentosBanco,
      venda,
      venda.total,
      dataOperacao,
      prev.bancos[0]?.nome
    );

    return {
      ...prev,
      estoque: baixarEstoqueFifo(prev.estoque, venda.itens),
      movimentosCaixa: movCaixa,
      movimentosBanco: movBanco,
    };
  };

  const registrarVenda = () => {
    if (!novaVenda.cliente.trim() || novaVenda.itens.length === 0) {
      return alert('Preencha cliente e adicione itens.');
    }
    const total = sumBy(novaVenda.itens, (i) => i.quantidade * i.valorUnit);
    const dataOperacao = normalizeDateISO(novaVenda.data);
    const editando = vendaEditandoId !== null;

    const venda: Venda = {
      id: editando ? vendaEditandoId : nextId(data.vendas),
      data: dataOperacao,
      cliente: novaVenda.cliente.trim(),
      formaPagamento: novaVenda.formaPagamento,
      status: novaVenda.status,
      total,
      itens: novaVenda.itens,
    };

    let estoqueBase = data.estoque;
    if (editando) {
      const antiga = data.vendas.find((v) => v.id === vendaEditandoId);
      if (antiga && isVendaConcluida(antiga)) {
        estoqueBase = reverterEfeitosVenda(data, antiga).estoque;
      }
    }
    if (isVendaConcluida(venda)) {
      const erro = validarEstoqueVenda(estoqueBase, venda);
      if (erro) return alert(erro);
    } else {
      const erroReserva = validarReservaVendaPendente(
        estoqueBase,
        data.vendas,
        venda,
        editando ? vendaEditandoId : null
      );
      if (erroReserva) return alert(erroReserva);
    }

    update((prev) => {
      if (editando) {
        const antiga = prev.vendas.find((v) => v.id === vendaEditandoId);
        if (!antiga) return prev;

        let state = isVendaConcluida(antiga) ? reverterEfeitosVenda(prev, antiga) : prev;
        state = {
          ...state,
          vendas: state.vendas.map((v) => (v.id === vendaEditandoId ? venda : v)),
        };
        if (isVendaConcluida(venda)) {
          state = aplicarEfeitosVenda(state, venda, dataOperacao);
        }
        return state;
      }

      let state: AppData = { ...prev, vendas: [...prev.vendas, venda] };
      if (isVendaConcluida(venda)) {
        state = aplicarEfeitosVenda(state, venda, dataOperacao);
      }
      return state;
    });

    resetFormVenda();
    alert(
      editando
        ? 'Venda atualizada com sucesso!'
        : isVendaConcluida(venda)
          ? 'Venda concluída e registrada!'
          : 'Venda pendente registrada (estoque reservado, sem baixa financeira).'
    );
  };

  const concluirVenda = (id: number) => {
    const venda = data.vendas.find((v) => v.id === id);
    if (!venda || isVendaConcluida(venda)) return;

    const vendaConcluida: Venda = { ...venda, status: 'concluida' };
    const erro = validarEstoqueVenda(data.estoque, vendaConcluida);
    if (erro) return alert(erro);

    if (!confirm(`Concluir venda para ${venda.cliente}? O estoque será baixado e o financeiro atualizado.`)) {
      return;
    }

    update((prev) => {
      const atual = prev.vendas.find((v) => v.id === id);
      if (!atual || isVendaConcluida(atual)) return prev;
      const concluida: Venda = { ...atual, status: 'concluida' };
      let state = aplicarEfeitosVenda(prev, concluida, concluida.data);
      return {
        ...state,
        vendas: state.vendas.map((v) => (v.id === id ? concluida : v)),
      };
    });
  };

  const adicionarIngrediente = () => {
    if (!ingredienteForm.nome.trim()) {
      return alert('Selecione um ingrediente do estoque.');
    }
    const item = ingredientesDisponiveis.find((i) => i.nome === ingredienteForm.nome);
    if (!item) {
      return alert(
        'Ingrediente inválido. Selecione uma matéria-prima ou produto intermediário com saldo no estoque.'
      );
    }
    if (ingredienteForm.quantidade <= 0) {
      return alert('Informe uma quantidade válida.');
    }
    if (ingredienteForm.quantidade > item.quantidade) {
      return alert(
        `Quantidade indisponível. Saldo de "${item.nome}": ${item.quantidade} ${item.unidade}.`
      );
    }
    setNovaProducao((p) => ({
      ...p,
      ingredientes: [
        ...p.ingredientes,
        { ...ingredienteForm, unidade: item.unidade, tipo: item.tipo },
      ],
      unidade: p.ingredientes.length === 0 ? item.unidade : p.unidade,
    }));
    setIngredienteForm({ nome: '', quantidade: 0, valorUnit: 0 });
  };

  const removerIngredienteLista = (idx: number) => {
    setNovaProducao((p) => ({
      ...p,
      ingredientes: p.ingredientes.filter((_, i) => i !== idx),
    }));
  };

  const resetFormProducao = () => {
    setNovaProducao({ ...PRODUCAO_FORM_INICIAL, data: todayISO() });
    setIngredienteForm({ nome: '', quantidade: 0, valorUnit: 0 });
    setProducaoEditandoId(null);
  };

  const cancelarEdicaoProducao = () => {
    resetFormProducao();
  };

  const editarProducao = (producao: Producao) => {
    setNovaProducao({
      data: normalizeDateISO(producao.data),
      lote: producao.lote,
      produto: producao.produto,
      quantidade: producao.quantidade,
      unidade: producao.unidade,
      ingredientes: producao.ingredientes.map((i) => {
        const tipo = resolverTipoIngredienteProducao(i, data.producoes);
        const saldo = saldoIngredienteProducao(data.estoque, i.nome, data.producoes, tipo);
        return { ...i, unidade: i.unidade ?? saldo?.unidade, tipo };
      }),
    });
    setProducaoEditandoId(producao.id);
    setIngredienteForm({ nome: '', quantidade: 0, valorUnit: 0 });
  };

  const removerProducao = (id: number) => {
    const producao = data.producoes.find((p) => p.id === id);
    if (!producao) return;

    if (!podeReverterProducao(data.estoque, producao)) {
      alert(formatarMensagemBloqueioProducao(producao, data.estoque, data.vendas, 'excluir'));
      if (
        !confirm(
          'Excluir apenas o registro de produção?\n\nO estoque e as vendas NÃO serão alterados. Use quando o produto já foi vendido ou consumido.'
        )
      ) {
        return;
      }

      update((prev) => ({
        ...prev,
        producoes: prev.producoes.filter((x) => x.id !== id),
      }));

      if (producaoEditandoId === id) {
        resetFormProducao();
      }
      return;
    }

    if (
      !confirm(
        'Remover este lançamento de produção? Os ingredientes serão devolvidos ao estoque e o produto acabado será removido.'
      )
    ) {
      return;
    }

    update((prev) => {
      const p = prev.producoes.find((x) => x.id === id);
      if (!p) return prev;
      return {
        ...prev,
        estoque: reverterEfeitosProducao(prev.estoque, p, prev.producoes),
        producoes: prev.producoes.filter((x) => x.id !== id),
      };
    });

    if (producaoEditandoId === id) {
      resetFormProducao();
    }
  };

  const registrarProducao = () => {
    if (!novaProducao.produto.trim() || novaProducao.ingredientes.length === 0) {
      return alert('Preencha produto e ingredientes.');
    }
    if (novaProducao.quantidade <= 0) {
      return alert('Informe a quantidade do produto gerado.');
    }

    const perdaCalculada = calcularPerdaProducao({
      ingredientes: novaProducao.ingredientes,
      quantidade: novaProducao.quantidade,
    });
    if (!perdaCalculada) {
      return alert(
        'Não foi possível calcular a perda. Lance a matéria-prima e use a mesma unidade em todos os ingredientes.'
      );
    }
    if (novaProducao.quantidade > perdaCalculada.entrada) {
      return alert(
        `A quantidade produzida (${novaProducao.quantidade} ${perdaCalculada.unidade}) não pode ser maior que a matéria-prima lançada (${perdaCalculada.entrada} ${perdaCalculada.unidade}).`
      );
    }
    if (novaProducao.unidade.trim().toLowerCase() !== perdaCalculada.unidade.toLowerCase()) {
      return alert(
        `A unidade do produto ("${novaProducao.unidade}") deve ser a mesma da matéria-prima ("${perdaCalculada.unidade}").`
      );
    }

    const custoEstimado = sumBy(
      novaProducao.ingredientes,
      (i) => i.quantidade * i.valorUnit
    );
    const editando = producaoEditandoId !== null;
    const producao: Producao = {
      id: editando ? producaoEditandoId : nextId(data.producoes),
      data: normalizeDateISO(novaProducao.data),
      lote: novaProducao.lote || `L${Date.now()}`,
      produto: novaProducao.produto,
      quantidade: novaProducao.quantidade,
      unidade: novaProducao.unidade,
      ingredientes: novaProducao.ingredientes,
      custoEstimado,
      quantidadePerdida: perdaCalculada.perdaQuantidade,
      percentualPerda: perdaCalculada.perdaPercentual,
    };

    if (editando) {
      const antiga = data.producoes.find((p) => p.id === producaoEditandoId);
      if (antiga && !podeReverterProducao(data.estoque, antiga)) {
        return alert(formatarMensagemBloqueioProducao(antiga, data.estoque, data.vendas, 'editar'));
      }
    }

    let estoqueBase = data.estoque;
    if (editando) {
      const antiga = data.producoes.find((p) => p.id === producaoEditandoId);
      if (antiga) estoqueBase = reverterEfeitosProducao(estoqueBase, antiga, data.producoes);
    }

    const erroIngredientes = validarIngredientesProducao(estoqueBase, producao, data.producoes);
    if (erroIngredientes) return alert(erroIngredientes);

    const saldoProduto = saldoIngrediente(estoqueBase, producao.produto);
    if (
      saldoProduto &&
      saldoProduto.unidade.toLowerCase() !== producao.unidade.trim().toLowerCase()
    ) {
      return alert(
        `Unidade "${producao.unidade}" não confere com o estoque existente de "${producao.produto}" (${saldoProduto.unidade}).`
      );
    }

    update((prev) => {
      if (editando) {
        const antiga = prev.producoes.find((p) => p.id === producaoEditandoId);
        if (!antiga) return prev;

        const estoque = aplicarEfeitosProducao(
          reverterEfeitosProducao(prev.estoque, antiga, prev.producoes),
          producao,
          prev.producoes
        );
        return {
          ...prev,
          estoque,
          producoes: prev.producoes.map((p) => (p.id === producaoEditandoId ? producao : p)),
        };
      }

      return {
        ...prev,
        estoque: aplicarEfeitosProducao(prev.estoque, producao, prev.producoes),
        producoes: [...prev.producoes, producao],
      };
    });

    resetFormProducao();
    alert(editando ? 'Produção atualizada com sucesso!' : 'Produção registrada!');
  };

  const adicionarCartao = () => {
    if (!novoCartao.nome.trim()) return;
    update((prev) => ({
      ...prev,
      cartoes: [...prev.cartoes, { id: nextId(prev.cartoes), ...novoCartao }],
    }));
    setNovoCartao({ nome: '', limite: 0 });
  };

  const removerCartao = (id: number) => {
    if (!confirm('Remover cartão?')) return;
    update((prev) => ({ ...prev, cartoes: prev.cartoes.filter((c) => c.id !== id) }));
  };

  const adicionarPatrimonio = () => {
    if (!novoPatrimonio.nome.trim()) {
      return alert('Informe o nome do bem patrimonial.');
    }
    const valorAquisicao = Number(novoPatrimonio.valorAquisicao) || 0;
    const valorAtual = Number(novoPatrimonio.valorAtual) || valorAquisicao;
    if (valorAquisicao <= 0 && valorAtual <= 0) {
      return alert('Informe o valor de aquisição ou o valor atual.');
    }
    update((prev) => ({
      ...prev,
      patrimonio: [
        ...prev.patrimonio,
        {
          id: nextId(prev.patrimonio),
          ...novoPatrimonio,
          valorAquisicao: valorAquisicao || valorAtual,
          valorAtual,
        },
      ],
    }));
    setNovoPatrimonio({
      nome: '',
      categoria: 'Equipamento',
      dataAquisicao: todayISO(),
      valorAquisicao: 0,
      valorAtual: 0,
      depreciacaoAnual: 10,
      observacoes: '',
    });
  };

  const removerPatrimonio = (id: number) => {
    if (!confirm('Remover bem patrimonial?')) return;
    update((prev) => ({ ...prev, patrimonio: prev.patrimonio.filter((p) => p.id !== id) }));
  };

  const resetFormMovCaixa = () => {
    setMovCaixa({ ...MOV_CAIXA_FORM_INICIAL, data: todayISO() });
    setMovCaixaEditandoId(null);
  };

  const editarMovCaixa = (mov: MovimentoFinanceiro) => {
    if (mov.referencia) {
      return alert('Lançamentos automáticos de Compras/Vendas devem ser alterados na origem.');
    }
    setMovCaixa({
      data: normalizeDateISO(mov.data),
      descricao: mov.descricao,
      tipo: mov.tipo,
      valor: mov.valor,
      categoria: mov.categoria,
    });
    setMovCaixaEditandoId(mov.id);
  };

  const removerMovCaixa = (mov: MovimentoFinanceiro) => {
    if (mov.referencia) {
      return alert('Lançamentos automáticos de Compras/Vendas devem ser removidos na origem.');
    }
    if (!confirm('Remover este lançamento de caixa?')) return;
    update((prev) => ({
      ...prev,
      movimentosCaixa: prev.movimentosCaixa.filter((m) => m.id !== mov.id),
    }));
    if (movCaixaEditandoId === mov.id) {
      resetFormMovCaixa();
    }
  };

  const registrarMovCaixa = () => {
    if (!movCaixa.descricao.trim() || movCaixa.valor <= 0) return alert('Preencha descrição e valor.');
    const dataOperacao = normalizeDateISO(movCaixa.data);
    const editando = movCaixaEditandoId !== null;

    const movimento: Omit<MovimentoFinanceiro, 'id'> = {
      data: dataOperacao,
      descricao: movCaixa.descricao.trim(),
      tipo: movCaixa.tipo,
      valor: movCaixa.valor,
      categoria: movCaixa.categoria,
    };

    update((prev) => {
      if (editando) {
        return {
          ...prev,
          movimentosCaixa: prev.movimentosCaixa.map((m) =>
            m.id === movCaixaEditandoId ? { ...movimento, id: movCaixaEditandoId } : m
          ),
        };
      }
      return {
        ...prev,
        movimentosCaixa: registrarMovimento(prev.movimentosCaixa, movimento),
      };
    });

    resetFormMovCaixa();
    alert(editando ? 'Lançamento atualizado!' : 'Lançamento registrado!');
  };

  const resetFormMovBanco = () => {
    setMovBanco({ ...MOV_BANCO_FORM_INICIAL, data: todayISO(), bancoId: data.bancos[0]?.id ?? 1 });
    setMovBancoEditandoId(null);
  };

  const adicionarBanco = () => {
    if (!novoBanco.nome.trim()) return alert('Informe o nome do banco.');
    update((prev) => ({
      ...prev,
      bancos: [...prev.bancos, { id: nextId(prev.bancos), ...novoBanco }],
    }));
    setNovoBanco({ nome: '', agencia: '', conta: '' });
  };

  const removerBanco = (id: number) => {
    const banco = data.bancos.find((b) => b.id === id);
    if (!banco) return;
    const temMovimentos = data.movimentosBanco.some((m) => m.banco === banco.nome);
    if (temMovimentos) {
      return alert('Não é possível remover: existem lançamentos vinculados a este banco.');
    }
    if (!confirm(`Remover o banco "${banco.nome}"?`)) return;
    update((prev) => ({ ...prev, bancos: prev.bancos.filter((b) => b.id !== id) }));
    if (movBanco.bancoId === id) {
      setMovBanco((p) => ({ ...p, bancoId: data.bancos.find((b) => b.id !== id)?.id ?? 1 }));
    }
  };

  const editarMovBanco = (mov: MovimentoFinanceiro) => {
    if (mov.referencia) {
      return alert('Lançamentos automáticos de Compras/Vendas devem ser alterados na origem.');
    }
    const banco = data.bancos.find((b) => b.nome === mov.banco);
    setMovBanco({
      data: normalizeDateISO(mov.data),
      descricao: mov.descricao,
      tipo: mov.tipo,
      valor: mov.valor,
      categoria: mov.categoria,
      bancoId: banco?.id ?? data.bancos[0]?.id ?? 1,
    });
    setMovBancoEditandoId(mov.id);
  };

  const removerMovBanco = (mov: MovimentoFinanceiro) => {
    if (mov.referencia) {
      return alert('Lançamentos automáticos de Compras/Vendas devem ser removidos na origem.');
    }
    if (!confirm('Remover este lançamento bancário?')) return;
    update((prev) => ({
      ...prev,
      movimentosBanco: prev.movimentosBanco.filter((m) => m.id !== mov.id),
    }));
    if (movBancoEditandoId === mov.id) {
      resetFormMovBanco();
    }
  };

  const registrarMovBanco = () => {
    if (!movBanco.descricao.trim() || movBanco.valor <= 0) return alert('Preencha descrição e valor.');
    const banco = data.bancos.find((b) => b.id === movBanco.bancoId);
    if (!banco) return alert('Selecione um banco cadastrado.');
    const dataOperacao = normalizeDateISO(movBanco.data);
    const editando = movBancoEditandoId !== null;

    const movimento: Omit<MovimentoFinanceiro, 'id'> = {
      data: dataOperacao,
      descricao: movBanco.descricao.trim(),
      tipo: movBanco.tipo,
      valor: movBanco.valor,
      categoria: movBanco.categoria,
      banco: banco.nome,
    };

    update((prev) => {
      if (editando) {
        return {
          ...prev,
          movimentosBanco: prev.movimentosBanco.map((m) =>
            m.id === movBancoEditandoId ? { ...movimento, id: movBancoEditandoId } : m
          ),
        };
      }
      return {
        ...prev,
        movimentosBanco: registrarMovimento(prev.movimentosBanco, movimento),
      };
    });

    resetFormMovBanco();
    alert(editando ? 'Lançamento atualizado!' : 'Lançamento registrado!');
  };

  const registrarPreco = () => {
    const nome = produtoPreco.trim();
    if (!nome) {
      return alert('Selecione um produto acabado.');
    }
    const produtoInfo = produtosParaPrecificacao.find((p) => nomeProdutoIgual(p.nome, nome));
    if (!produtoInfo) {
      return alert('Produto não encontrado. Produza o item ou registre-o no estoque.');
    }
    if (margemLucro < 0) {
      return alert('Informe uma margem de lucro válida.');
    }

    const custo = produtoInfo.custoUnitario;
    const preco = custo * (1 + margemLucro / 100);

    update((prev) => {
      const registro: PrecoGerado = {
        id: nextId(prev.precosGerados),
        data: normalizeDateISO(dataPreco),
        produto: produtoInfo.nome,
        unidade: produtoInfo.unidade,
        custoUnitario: custo,
        margemLucro,
        precoSugerido: preco,
      };
      return {
        ...prev,
        precosGerados: [...prev.precosGerados, registro],
      };
    });

    alert(`Preço de ${produtoInfo.nome} registrado: ${formatCurrency(preco)}`);
  };

  const removerPreco = (id: number) => {
    if (!confirm('Remover este registro de preço?')) return;
    update((prev) => ({
      ...prev,
      precosGerados: prev.precosGerados.filter((p) => p.id !== id),
    }));
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      const parsed = parseBackupFile(content);
      if (!parsed) return alert('Arquivo de backup inválido.');
      if (!confirm('Importar backup? Os dados atuais serão substituídos.')) return;
      setData(parsed);
      alert('Backup importado com sucesso!');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Derived
  const saldoEstoque = agruparEstoque(data.estoque);
  const saldoMateriaPrima = filtrarSaldoMateriaPrima(saldoEstoque);
  const saldoProdutosGerados = filtrarSaldoProdutosGerados(saldoEstoque, data.producoes);
  const valorMateriaPrima = sumBy(saldoMateriaPrima, (i) => i.quantidade * i.valorUnit);
  const valorProdutosGerados = sumBy(saldoProdutosGerados, (i) => i.quantidade * i.valorUnit);
  const valorEstoque = valorMateriaPrima + valorProdutosGerados;
  const lancamentosMateriaPrima = filtrarLancamentosMateriaPrima(data.estoque);
  const lancamentosProdutosGerados = filtrarLancamentosProdutosGerados(data.estoque, data.producoes);
  const saldoCaixa = calcSaldo(data.movimentosCaixa);
  const saldoBanco = calcSaldo(data.movimentosBanco);
  const valorPatrimonio = sumBy(data.patrimonio, (p) => p.valorAtual);
  const produtosParaPrecificacao = catalogoProdutosPrecificacao(
    data.estoque,
    data.producoes,
    data.precosGerados
  );
  const produtoSelecionado = produtosParaPrecificacao.find((p) =>
    nomeProdutoIgual(p.nome, produtoPreco)
  );
  const custoProduto = produtoSelecionado ? produtoSelecionado.custoUnitario : 0;
  const precoSugerido = custoProduto * (1 + margemLucro / 100);

  /** Histórico completo — nunca esconde precificações anteriores ao filtrar o formulário. */
  const precosExibidos = historicoPrecosOrdenado(data.precosGerados);
  const precosDoProdutoSelecionado = produtoPreco
    ? historicoPrecosDoProduto(data.precosGerados, produtoPreco)
    : [];
  const ultimoPrecoProduto = precosDoProdutoSelecionado[0];

  const resumoPrecificacaoDashboard = useMemo(
    () => totalizarProdutosPrecificados(data.estoque, data.producoes, data.precosGerados),
    [data.estoque, data.producoes, data.precosGerados]
  );

  const rankingClientes = useMemo(() => rankingMelhoresClientes(data.vendas), [data.vendas]);
  const vendasPendentes = useMemo(() => listarVendasPendentes(data.vendas), [data.vendas]);
  const resumoPendentes = useMemo(() => resumoVendasPendentes(data.vendas), [data.vendas]);
  const reservasPendentes = useMemo(() => produtosReservadosPendentes(data.vendas), [data.vendas]);
  const vendasConcluidas = useMemo(
    () =>
      data.vendas
        .filter(isVendaConcluida)
        .slice()
        .sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id),
    [data.vendas]
  );

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-[#2c2118] flex items-center justify-center text-amber-200">
        Carregando ChocoGest...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-chocolate text-white safe-bottom" style={chocolateBgStyle}>
      {/* Header + abas mobile sticky (critério: navegação sempre acessível no telefone) */}
      <header className="bg-amber-950/90 backdrop-blur border-b border-amber-700 sticky top-0 z-20 pt-[var(--safe-top)]">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <img
              src={`${basePath}/Logo.jpeg`}
              alt="Logo ChocoGest"
              className="h-10 sm:h-14 w-auto object-contain rounded-lg shrink-0"
            />
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl font-bold truncate">ChocoGest</h1>
              <p className="text-amber-300 text-xs sm:text-sm hidden sm:block truncate">
                Fábrica Bean-to-Bar • Bahia
              </p>
            </div>
          </div>
          <div className="flex gap-1.5 sm:gap-2 flex-wrap justify-end shrink-0">
            <Btn onClick={() => exportBackup(data)} className="!px-2.5 sm:!px-4 text-xs sm:text-sm">
              <span className="sm:hidden" aria-hidden>
                📤
              </span>
              <span className="hidden sm:inline">📤 Exportar Backup</span>
              <span className="sm:hidden sr-only">Exportar Backup</span>
            </Btn>
            <Btn
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              className="!px-2.5 sm:!px-4 text-xs sm:text-sm"
            >
              <span className="sm:hidden" aria-hidden>
                📥
              </span>
              <span className="hidden sm:inline">📥 Importar Backup</span>
              <span className="sm:hidden sr-only">Importar Backup</span>
            </Btn>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportBackup}
            />
            <Btn
              variant="secondary"
              onClick={() => gerarPdfDashboard(data)}
              className="!px-2.5 sm:!px-4 text-xs sm:text-sm"
            >
              <span className="sm:hidden" aria-hidden>
                📄
              </span>
              <span className="hidden sm:inline">📄 PDF Resumo</span>
              <span className="sm:hidden sr-only">PDF Resumo</span>
            </Btn>
          </div>
        </div>

        {/* Abas horizontais no mobile/tablet; sticky junto ao header */}
        <nav
          className="lg:hidden tabs-scroll px-3 pb-2.5 border-t border-amber-800/50 bg-[#3a2c22]/80"
          aria-label="Módulos"
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`touch-target shrink-0 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-amber-600 text-white shadow'
                  : 'bg-amber-900/40 text-amber-100/90 active:bg-amber-800/60'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex flex-col lg:flex-row max-w-7xl mx-auto items-stretch lg:items-start w-full">
        <aside className="w-72 shrink-0 self-start sticky top-20 z-[5] max-h-[calc(100vh-5rem)] overflow-y-auto overscroll-contain bg-[#3a2c22]/70 backdrop-blur p-4 border-r border-amber-800 hidden lg:block">
          <nav className="space-y-1" aria-label="Módulos">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`touch-target w-full text-left px-4 py-3 rounded-xl text-sm transition-all ${
                  activeTab === tab.id
                    ? 'bg-amber-600 text-white shadow-lg'
                    : 'hover:bg-amber-900/60 active:bg-amber-900/80 text-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="flex-1 p-3 sm:p-6 lg:p-10 min-w-0 w-full">
          {/* DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div>
              <SectionTitle action={<Btn variant="secondary" onClick={() => gerarPdfDashboard(data)}>📄 PDF</Btn>}>
                Dashboard
              </SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
                {[
                  { label: 'Matéria-Prima', value: formatCurrency(valorMateriaPrima), icon: '🌰', detalhe: `${saldoMateriaPrima.length} itens` },
                  { label: 'Produtos Gerados', value: formatCurrency(valorProdutosGerados), icon: '🍫', detalhe: `${saldoProdutosGerados.length} itens` },
                  {
                    label: 'Valor Potencial Venda',
                    value: formatCurrency(resumoPrecificacaoDashboard.totais.valorVendaTotal),
                    icon: '🏷️',
                    detalhe: `${resumoPrecificacaoDashboard.totais.comPrecoRegistrado} com preço`,
                  },
                  {
                    label: 'Lucro Potencial',
                    value: formatCurrency(resumoPrecificacaoDashboard.totais.lucroPotencialTotal),
                    icon: '📈',
                    detalhe: 'estoque × preço sugerido',
                  },
                  {
                    label: 'Total Vendas',
                    value: formatCurrency(
                      sumBy(data.vendas.filter((v) => isVendaConcluida(v)), (v) => v.total)
                    ),
                    icon: '🛒',
                    detalhe: 'vendas concluídas',
                  },
                  {
                    label: 'Vendas Pendentes',
                    value: formatCurrency(resumoPendentes.valorTotal),
                    icon: '⏳',
                    detalhe:
                      resumoPendentes.quantidade > 0
                        ? `${resumoPendentes.quantidade} pedido(s) · ${resumoPendentes.itensReservados} un. reservadas`
                        : 'nenhum pedido pendente',
                  },
                  { label: 'Saldo Caixa', value: formatCurrency(saldoCaixa), icon: '💰' },
                  { label: 'Saldo Banco', value: formatCurrency(saldoBanco), icon: '🏦' },
                  { label: 'Patrimônio', value: formatCurrency(valorPatrimonio), icon: '🏛️' },
                  { label: 'Compras', value: formatCurrency(sumBy(data.compras, (c) => c.total)), icon: '🚚' },
                  { label: 'Produções', value: data.producoes.length.toString(), icon: '🏭' },
                ].map((kpi) => (
                  <Card key={kpi.label}>
                    <div className="text-2xl mb-1">{kpi.icon}</div>
                    <div className="text-amber-300 text-sm">{kpi.label}</div>
                    <div className="text-xl font-bold text-amber-50">{kpi.value}</div>
                    {'detalhe' in kpi && kpi.detalhe && (
                      <div className="text-xs text-amber-400/70 mt-1">{kpi.detalhe}</div>
                    )}
                  </Card>
                ))}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <Card>
                  <h3 className="font-semibold text-amber-200 mb-3">Matérias-primas em estoque</h3>
                  {saldoMateriaPrima.length > 0 ? (
                    <div className="space-y-2 text-sm">
                      {saldoMateriaPrima.map((item) => (
                        <div key={item.nome} className="flex justify-between py-2 border-b border-amber-800/30">
                          <span>{item.nome}</span>
                          <span className="text-amber-300">
                            {item.quantidade} {item.unidade} — {formatCurrency(item.quantidade * item.valorUnit)}
                          </span>
                        </div>
                      ))}
                      <div className="flex justify-between pt-2 font-semibold text-amber-100">
                        <span>Total</span>
                        <span>{formatCurrency(valorMateriaPrima)}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-amber-400/60 text-sm">Nenhuma matéria-prima em estoque.</p>
                  )}
                </Card>
                <Card>
                  <h3 className="font-semibold text-amber-200 mb-3">Produtos gerados em estoque</h3>
                  {saldoProdutosGerados.length > 0 ? (
                    <div className="space-y-2 text-sm">
                      {saldoProdutosGerados.map((item) => (
                        <div key={item.nome} className="flex justify-between py-2 border-b border-amber-800/30">
                          <span>{item.nome}</span>
                          <span className="text-amber-300">
                            {item.quantidade} {item.unidade} — {formatCurrency(item.quantidade * item.valorUnit)}
                          </span>
                        </div>
                      ))}
                      <div className="flex justify-between pt-2 font-semibold text-amber-100">
                        <span>Total</span>
                        <span>{formatCurrency(valorProdutosGerados)}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-amber-400/60 text-sm">Nenhum produto gerado em estoque.</p>
                  )}
                </Card>
              </div>

              <Card className="mb-8">
                <h3 className="font-semibold text-amber-200 mb-1">
                  Produtos produzidos — estoque e precificação
                </h3>
                <p className="text-amber-400/70 text-xs mb-4">
                  Preços da aba Precificação. Produtos sem preço registrado aparecem apenas com custo.
                </p>
                {resumoPrecificacaoDashboard.itens.length > 0 ? (
                  <div className="table-scroll">
                    <table className="w-full text-sm min-w-[900px]">
                      <thead>
                        <tr className="text-amber-300 border-b border-amber-700">
                          <th className="text-left py-2">Produto</th>
                          <th className="text-right py-2">Qtd</th>
                          <th className="text-right py-2">Custo un.</th>
                          <th className="text-right py-2">Margem</th>
                          <th className="text-right py-2">Preço sug.</th>
                          <th className="text-right py-2">Total custo</th>
                          <th className="text-right py-2">Total venda</th>
                          <th className="text-right py-2">Lucro pot.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resumoPrecificacaoDashboard.itens.map((item) => (
                          <tr key={item.produto} className="border-b border-amber-800/30">
                            <td className="py-2">
                              {item.produto}
                              {item.dataPreco && (
                                <span className="block text-xs text-amber-400/60">
                                  Preço em {formatDate(item.dataPreco)}
                                </span>
                              )}
                            </td>
                            <td className="py-2 text-right">
                              {item.quantidade > 0 ? `${item.quantidade} ${item.unidade}` : '—'}
                            </td>
                            <td className="py-2 text-right">
                              {item.custoUnitario > 0 ? formatCurrency(item.custoUnitario) : '—'}
                            </td>
                            <td className="py-2 text-right">
                              {item.margemLucro !== null ? `${item.margemLucro}%` : '—'}
                            </td>
                            <td className="py-2 text-right font-medium text-amber-100">
                              {item.precoSugerido !== null ? formatCurrency(item.precoSugerido) : '—'}
                            </td>
                            <td className="py-2 text-right">
                              {item.valorCustoTotal > 0 ? formatCurrency(item.valorCustoTotal) : '—'}
                            </td>
                            <td className="py-2 text-right">
                              {item.valorVendaTotal !== null ? formatCurrency(item.valorVendaTotal) : '—'}
                            </td>
                            <td className="py-2 text-right text-emerald-300/90">
                              {item.lucroPotencial !== null ? formatCurrency(item.lucroPotencial) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="font-bold text-amber-100 border-t border-amber-700">
                          <td className="py-3">Totalização</td>
                          <td className="py-3 text-right text-xs font-normal text-amber-400/80">
                            {resumoPrecificacaoDashboard.totais.quantidadeProdutos} prod.
                          </td>
                          <td colSpan={3} className="py-3" />
                          <td className="py-3 text-right">
                            {formatCurrency(resumoPrecificacaoDashboard.totais.valorCustoTotal)}
                          </td>
                          <td className="py-3 text-right">
                            {formatCurrency(resumoPrecificacaoDashboard.totais.valorVendaTotal)}
                          </td>
                          <td className="py-3 text-right text-emerald-300">
                            {formatCurrency(resumoPrecificacaoDashboard.totais.lucroPotencialTotal)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <p className="text-amber-400/60 text-sm py-2">
                    Nenhum produto produzido com estoque ou preço registrado. Registre produções e
                    precifique na aba Precificação.
                  </p>
                )}
                {resumoPrecificacaoDashboard.totais.semPrecoRegistrado > 0 && (
                  <p className="text-amber-400/70 text-xs mt-3">
                    {resumoPrecificacaoDashboard.totais.semPrecoRegistrado} produto(s) em estoque sem
                    preço registrado — total de venda parcial até precificar todos.
                  </p>
                )}
              </Card>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <h3 className="font-semibold text-amber-200 mb-3">Últimas Vendas</h3>
                  {data.vendas.slice(-5).reverse().map((v) => (
                    <div key={v.id} className="py-2 border-b border-amber-800/30 text-sm">
                      <div className="flex justify-between gap-2">
                        <span>
                          {formatDate(v.data)} — {v.cliente}{' '}
                          <span className="text-xs text-amber-400/70">
                            ({STATUS_VENDA_LABEL[v.status ?? 'concluida']})
                          </span>
                        </span>
                        <span className="text-amber-300 shrink-0">{formatCurrency(v.total)}</span>
                      </div>
                      {v.itens.length > 0 && (
                        <p className="text-xs text-amber-400/70 mt-1">
                          {v.itens.map((i) => `${i.nome} ${i.quantidade}${i.unidade}`).join(', ')}
                        </p>
                      )}
                    </div>
                  ))}
                  {data.vendas.length === 0 && <p className="text-amber-400/60 text-sm">Nenhuma venda registrada.</p>}
                </Card>
                <Card>
                  <h3 className="font-semibold text-amber-200 mb-3">Últimas Produções</h3>
                  {data.producoes.slice(-5).reverse().map((p) => (
                    <div key={p.id} className="flex justify-between py-2 border-b border-amber-800/30 text-sm">
                      <span>{formatDate(p.data)} — {p.produto} ({p.lote})</span>
                      <span className="text-amber-300">{formatCurrency(p.custoEstimado)}</span>
                    </div>
                  ))}
                  {data.producoes.length === 0 && <p className="text-amber-400/60 text-sm">Nenhuma produção registrada.</p>}
                </Card>
              </div>
            </div>
          )}

          {/* ESTOQUE */}
          {activeTab === 'estoque' && (
            <div>
              <SectionTitle action={<Btn variant="secondary" onClick={() => gerarPdfEstoque(data)}>📄 PDF</Btn>}>
                Estoque
              </SectionTitle>
              <Card className="mb-6">
                <h3 className="font-semibold mb-4 text-amber-200">
                  {estoqueEditandoId !== null ? 'Editar lançamento' : 'Novo Item'}
                </h3>
                {estoqueEditandoId !== null && (
                  <p className="text-amber-300 text-sm mb-4">
                    Editando lançamento #{estoqueEditandoId}
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <DateField
                    label="Data da operação"
                    value={novoItem.data}
                    onChange={(data) => setNovoItem((p) => ({ ...p, data }))}
                  />
                  <Field label="Nome">
                    <input className={inputCls} value={novoItem.nome} onChange={(e) => setNovoItem((p) => ({ ...p, nome: e.target.value }))} />
                  </Field>
                  <Field label="Categoria">
                    <select className={inputCls} value={novoItem.tipo} onChange={(e) => setNovoItem((p) => ({ ...p, tipo: e.target.value as TipoItem }))}>
                      {TIPOS_ITEM.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Quantidade">
                    <input type="number" step="0.001" className={inputCls} value={novoItem.quantidade} onChange={(e) => setNovoItem((p) => ({ ...p, quantidade: +e.target.value }))} />
                  </Field>
                  <Field label="Unidade">
                    <input className={inputCls} value={novoItem.unidade} onChange={(e) => setNovoItem((p) => ({ ...p, unidade: e.target.value }))} />
                  </Field>
                  <Field label="Valor Unitário (R$)">
                    <input type="number" step="0.01" className={inputCls} value={novoItem.valorUnit} onChange={(e) => setNovoItem((p) => ({ ...p, valorUnit: +e.target.value }))} />
                  </Field>
                </div>
                <p className="text-amber-400/70 text-xs mt-2">
                  Cada inclusão gera um lançamento na lista. O saldo disponível é a soma dos lançamentos por item.
                  {estoqueEditandoId !== null && ' Use Editar na tabela abaixo para corrigir quantidades de lançamentos existentes.'}
                </p>
                <div className="flex flex-wrap gap-2 mt-4">
                  <Btn onClick={salvarItemEstoque}>
                    {estoqueEditandoId !== null ? 'Salvar alterações' : 'Adicionar ao Estoque'}
                  </Btn>
                  {estoqueEditandoId !== null && (
                    <Btn variant="secondary" onClick={cancelarEdicaoEstoque}>Cancelar</Btn>
                  )}
                </div>
              </Card>
              <Card className="mb-6">
                <h4 className="text-amber-200 font-medium mb-4">Saldo — Matérias-primas</h4>
                <div className="table-scroll">
                  <table className="w-full text-sm min-w-[520px]">
                    <thead>
                      <tr className="text-amber-300 border-b border-amber-700">
                        <th className="text-left py-2">Nome</th>
                        <th className="text-right py-2">Qtd Total</th>
                        <th className="text-right py-2">Valor Médio</th>
                        <th className="text-right py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {saldoMateriaPrima.map((item) => (
                        <tr key={item.nome} className="border-b border-amber-800/30">
                          <td className="py-2">{item.nome}</td>
                          <td className="py-2 text-right">{item.quantidade} {item.unidade}</td>
                          <td className="py-2 text-right">{formatCurrency(item.valorUnit)}</td>
                          <td className="py-2 text-right">{formatCurrency(item.quantidade * item.valorUnit)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold text-amber-100">
                        <td colSpan={3} className="py-3 text-right">Total matérias-primas:</td>
                        <td className="py-3 text-right">{formatCurrency(valorMateriaPrima)}</td>
                      </tr>
                    </tfoot>
                  </table>
                  {saldoMateriaPrima.length === 0 && (
                    <p className="text-amber-400/60 py-4">Nenhuma matéria-prima em estoque.</p>
                  )}
                </div>
              </Card>
              <Card className="mb-6">
                <h4 className="text-amber-200 font-medium mb-4">Saldo — Produtos gerados</h4>
                <div className="table-scroll">
                  <table className="w-full text-sm min-w-[520px]">
                    <thead>
                      <tr className="text-amber-300 border-b border-amber-700">
                        <th className="text-left py-2">Nome</th>
                        <th className="text-right py-2">Qtd Total</th>
                        <th className="text-right py-2">Valor Médio</th>
                        <th className="text-right py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {saldoProdutosGerados.map((item) => (
                        <tr key={item.nome} className="border-b border-amber-800/30">
                          <td className="py-2">{item.nome}</td>
                          <td className="py-2 text-right">{item.quantidade} {item.unidade}</td>
                          <td className="py-2 text-right">{formatCurrency(item.valorUnit)}</td>
                          <td className="py-2 text-right">{formatCurrency(item.quantidade * item.valorUnit)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold text-amber-100">
                        <td colSpan={3} className="py-3 text-right">Total produtos gerados:</td>
                        <td className="py-3 text-right">{formatCurrency(valorProdutosGerados)}</td>
                      </tr>
                    </tfoot>
                  </table>
                  {saldoProdutosGerados.length === 0 && (
                    <p className="text-amber-400/60 py-4">
                      Nenhum produto gerado em estoque. Registre produções para aparecer aqui.
                    </p>
                  )}
                </div>
                <p className="text-amber-400/70 text-xs mt-3">
                  Valor total operacional: <strong>{formatCurrency(valorEstoque)}</strong>
                </p>
              </Card>
              <Card className="mb-6">
                <h4 className="text-amber-200 font-medium mb-4">Lançamentos — Matérias-primas</h4>
                <div className="table-scroll">
                  <table className="w-full text-sm min-w-[600px]">
                    <thead>
                      <tr className="text-amber-300 border-b border-amber-700">
                        <th className="text-left py-2">Data</th>
                        <th className="text-left py-2">Nome</th>
                        <th className="text-right py-2">Qtd</th>
                        <th className="text-right py-2">Valor Unit.</th>
                        <th className="text-right py-2">Total</th>
                        <th className="py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lancamentosMateriaPrima.map((item) => (
                        <tr
                          key={item.id}
                          className={`border-b border-amber-800/30 ${estoqueEditandoId === item.id ? 'bg-amber-900/30' : ''}`}
                        >
                          <td className="py-2 text-amber-300">{formatDate(item.data ?? '')}</td>
                          <td className="py-2">{item.nome}</td>
                          <td className="py-2 text-right">{item.quantidade} {item.unidade}</td>
                          <td className="py-2 text-right">{formatCurrency(item.valorUnit)}</td>
                          <td className="py-2 text-right">{formatCurrency(item.quantidade * item.valorUnit)}</td>
                          <td className="py-2 text-right">
                            <div className="flex justify-end gap-2">
                              <Btn variant="secondary" onClick={() => editarItemEstoque(item)}>Editar</Btn>
                              <Btn variant="danger" onClick={() => removerItemEstoque(item.id)}>✕</Btn>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {lancamentosMateriaPrima.length === 0 && (
                    <p className="text-amber-400/60 py-4">Nenhum lançamento de matéria-prima.</p>
                  )}
                </div>
              </Card>
              <Card>
                <h4 className="text-amber-200 font-medium mb-4">Lançamentos — Produtos gerados</h4>
                <div className="table-scroll">
                  <table className="w-full text-sm min-w-[600px]">
                    <thead>
                      <tr className="text-amber-300 border-b border-amber-700">
                        <th className="text-left py-2">Data</th>
                        <th className="text-left py-2">Nome</th>
                        <th className="text-right py-2">Qtd</th>
                        <th className="text-right py-2">Valor Unit.</th>
                        <th className="text-right py-2">Total</th>
                        <th className="py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lancamentosProdutosGerados.map((item) => (
                        <tr
                          key={item.id}
                          className={`border-b border-amber-800/30 ${estoqueEditandoId === item.id ? 'bg-amber-900/30' : ''}`}
                        >
                          <td className="py-2 text-amber-300">{formatDate(item.data ?? '')}</td>
                          <td className="py-2">{item.nome}</td>
                          <td className="py-2 text-right">{item.quantidade} {item.unidade}</td>
                          <td className="py-2 text-right">{formatCurrency(item.valorUnit)}</td>
                          <td className="py-2 text-right">{formatCurrency(item.quantidade * item.valorUnit)}</td>
                          <td className="py-2 text-right">
                            <div className="flex justify-end gap-2">
                              <Btn variant="secondary" onClick={() => editarItemEstoque(item)}>Editar</Btn>
                              <Btn variant="danger" onClick={() => removerItemEstoque(item.id)}>✕</Btn>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {lancamentosProdutosGerados.length === 0 && (
                    <p className="text-amber-400/60 py-4">Nenhum lançamento de produto gerado.</p>
                  )}
                </div>
              </Card>
            </div>
          )}

          {/* COMPRAS */}
          {activeTab === 'compras' && (
            <div>
              <SectionTitle action={<Btn variant="secondary" onClick={() => gerarPdfCompras(data)}>📄 PDF</Btn>}>Compras</SectionTitle>
              <Card className="mb-6">
                {compraEditandoId !== null && (
                  <p className="text-amber-300 text-sm mb-4">
                    Editando compra #{compraEditandoId}
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                  <DateField
                    label="Data da compra"
                    value={novaCompra.data}
                    onChange={(data) => setNovaCompra((p) => ({ ...p, data }))}
                  />
                  <Field label="Fornecedor">
                    <input
                      className={inputCls}
                      value={novaCompra.fornecedor}
                      onChange={(e) => setNovaCompra((p) => ({ ...p, fornecedor: e.target.value }))}
                    />
                  </Field>
                  <Field label="Forma de Pagamento">
                    <select
                      className={inputCls}
                      value={novaCompra.formaPagamento}
                      onChange={(e) => setNovaCompra((p) => ({ ...p, formaPagamento: e.target.value }))}
                    >
                      <option>Dinheiro</option><option>Cartao</option><option>Pix</option><option>Transferencia</option>
                    </select>
                  </Field>
                  {novaCompra.formaPagamento === 'Cartao' && (
                    <>
                      <Field label="Cartão">
                        <select className={inputCls} value={novaCompra.cartaoId} onChange={(e) => setNovaCompra((p) => ({ ...p, cartaoId: +e.target.value }))}>
                          {data.cartoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </select>
                      </Field>
                      <Field label="Parcelas">
                        <input type="number" min={1} className={inputCls} value={novaCompra.parcelas} onChange={(e) => setNovaCompra((p) => ({ ...p, parcelas: +e.target.value }))} />
                      </Field>
                    </>
                  )}
                </div>
                <h4 className="text-amber-200 mb-1">Itens da compra</h4>
                <p className="text-amber-400/70 text-xs mb-2">
                  Preencha os campos abaixo. Use &quot;+ Item&quot; para adicionar vários, ou &quot;Registrar Compra&quot; para incluir o item atual automaticamente.
                  Itens do tipo <strong>Equipamento</strong> vão para o Patrimônio (não para o Estoque).
                </p>
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-3">
                  <input
                    placeholder="Nome"
                    list="itens-compra-cadastrados"
                    className={inputCls}
                    value={itemCompra.nome}
                    onChange={(e) => preencherItemCompra(e.target.value)}
                  />
                  <datalist id="itens-compra-cadastrados">
                    {catalogoItensCompra.map((item) => (
                      <option key={item.nome} value={item.nome} />
                    ))}
                  </datalist>
                  <select className={inputCls} value={itemCompra.tipo} onChange={(e) => setItemCompra({ ...itemCompra, tipo: e.target.value as TipoItem })}>
                    {TIPOS_ITEM.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input type="number" placeholder="Qtd" className={inputCls} value={itemCompra.quantidade} onChange={(e) => setItemCompra({ ...itemCompra, quantidade: +e.target.value })} />
                  <input placeholder="Un" className={inputCls} value={itemCompra.unidade} onChange={(e) => setItemCompra({ ...itemCompra, unidade: e.target.value })} />
                  <input type="number" step="0.01" placeholder="R$" className={inputCls} value={itemCompra.valorUnit} onChange={(e) => setItemCompra({ ...itemCompra, valorUnit: +e.target.value })} />
                </div>
                <Btn variant="secondary" onClick={adicionarItemCompra}>+ Item</Btn>
                {novaCompra.itens.length > 0 && (
                  <div className="mt-4 text-sm space-y-1">
                    {novaCompra.itens.map((i) => (
                      <div key={i.id} className="flex justify-between items-center text-amber-200 gap-2">
                        <span>{i.nome} — {i.quantidade} {i.unidade}</span>
                        <div className="flex items-center gap-2">
                          <span>{formatCurrency(i.quantidade * i.valorUnit)}</span>
                          <Btn variant="danger" className="px-2 py-1" onClick={() => removerItemCompraLista(i.id)}>✕</Btn>
                        </div>
                      </div>
                    ))}
                    <div className="font-bold pt-2">Total: {formatCurrency(sumBy(novaCompra.itens, (i) => i.quantidade * i.valorUnit))}</div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 mt-4">
                  <Btn onClick={registrarCompra}>
                    {compraEditandoId !== null ? 'Salvar alterações' : 'Registrar Compra'}
                  </Btn>
                  {compraEditandoId !== null && (
                    <Btn variant="secondary" onClick={cancelarEdicaoCompra}>Cancelar</Btn>
                  )}
                </div>
              </Card>
              <Card>
                <h4 className="text-amber-200 font-medium mb-4">Histórico de compras</h4>
                <div className="table-scroll">
                  <table className="w-full text-sm min-w-[800px]">
                    <thead>
                      <tr className="text-amber-300 border-b border-amber-700">
                        <th className="text-left py-2">Data</th>
                        <th className="text-left py-2">Fornecedor</th>
                        <th className="text-left py-2">Itens</th>
                        <th className="text-left py-2">Pagamento</th>
                        <th className="text-right py-2">Total</th>
                        <th className="text-right py-2 w-32">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.compras.slice().reverse().map((c) => (
                        <tr
                          key={c.id}
                          className={`border-b border-amber-800/30 ${compraEditandoId === c.id ? 'bg-amber-900/30' : ''}`}
                        >
                          <td className="py-2">{formatDate(c.data)}</td>
                          <td className="py-2">{c.fornecedor}</td>
                          <td className="py-2 text-amber-200/90">
                            {c.itens.length > 0 ? (
                              <div className="space-y-1">
                                {c.itens.map((i) => (
                                  <div key={i.id}>
                                    {i.nome} — {i.quantidade} {i.unidade}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-2">{c.formaPagamento}{c.cartao ? ` (${c.cartao})` : ''}</td>
                          <td className="py-2 text-right">{formatCurrency(c.total)}</td>
                          <td className="py-2 text-right whitespace-nowrap">
                            <Btn variant="secondary" onClick={() => editarCompra(c)}>Editar</Btn>
                            {' '}
                            <Btn variant="danger" onClick={() => removerCompra(c.id)}>Excluir</Btn>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {data.compras.length === 0 && <p className="text-amber-400/60 py-4">Nenhuma compra registrada.</p>}
              </Card>
            </div>
          )}

          {/* VENDAS */}
          {activeTab === 'vendas' && (
            <div>
              <SectionTitle action={<Btn variant="secondary" onClick={() => gerarPdfVendas(data)}>📄 PDF</Btn>}>Vendas</SectionTitle>
              <Card className="mb-6">
                {vendaEditandoId !== null && (
                  <p className="text-amber-300 text-sm mb-4">
                    Editando venda #{vendaEditandoId}
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                  <DateField
                    label="Data da venda"
                    value={novaVenda.data}
                    onChange={(data) => setNovaVenda((p) => ({ ...p, data }))}
                  />
                  <Field label="Cliente">
                    <input className={inputCls} value={novaVenda.cliente} onChange={(e) => setNovaVenda((p) => ({ ...p, cliente: e.target.value }))} />
                  </Field>
                  <Field label="Pagamento">
                    <select className={inputCls} value={novaVenda.formaPagamento} onChange={(e) => setNovaVenda((p) => ({ ...p, formaPagamento: e.target.value }))}>
                      <option>Dinheiro</option><option>Pix</option><option>Cartao</option><option>Transferencia</option>
                    </select>
                  </Field>
                  <Field label="Status">
                    <select
                      className={inputCls}
                      value={novaVenda.status}
                      onChange={(e) =>
                        setNovaVenda((p) => ({ ...p, status: e.target.value as StatusVenda }))
                      }
                    >
                      <option value="em_processamento">{STATUS_VENDA_LABEL.em_processamento}</option>
                      <option value="concluida">{STATUS_VENDA_LABEL.concluida}</option>
                    </select>
                  </Field>
                </div>
                <p className="text-amber-400/70 text-xs mb-3">
                  <strong>Pendente:</strong> entra na relação de vendas pendentes, reserva o produto no
                  saldo livre e não baixa estoque nem financeiro.{' '}
                  <strong>Concluída:</strong> baixa estoque e lança recebimento ao salvar.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                  <Field label="Produto">
                    <select
                      className={inputCls}
                      value={itemVenda.nome}
                      onChange={(e) => {
                        const nome = e.target.value;
                        const saldo = produtosParaVenda.find((p) => p.nome === nome);
                        const preco = nome
                          ? precoUnitarioParaVenda(
                              data.precosGerados,
                              nome,
                              saldo?.valorUnit ?? 0
                            )
                          : null;
                        setItemVenda({
                          nome,
                          quantidade: 1,
                          valorUnit: preco?.valor ?? 0,
                        });
                      }}
                    >
                      <option value="">Selecione produto...</option>
                      {produtosParaVenda.map((e) => {
                        const preco = precoUnitarioParaVenda(data.precosGerados, e.nome, e.valorUnit);
                        const livre = saldoLivreParaVenda(
                          data.estoque,
                          data.vendas,
                          e.nome,
                          vendaEditandoId
                        );
                        const precoLabel =
                          preco.origem === 'precificacao'
                            ? formatCurrency(preco.valor)
                            : `${formatCurrency(e.valorUnit)} (custo)`;
                        return (
                          <option key={e.nome} value={e.nome}>
                            {e.nome} — livre {livre}/{e.quantidade} {e.unidade} — {precoLabel}
                          </option>
                        );
                      })}
                    </select>
                  </Field>
                  <Field label="Quantidade">
                    <input type="number" className={inputCls} value={itemVenda.quantidade} onChange={(e) => setItemVenda({ ...itemVenda, quantidade: +e.target.value })} />
                  </Field>
                  <Field label="Preço (R$)">
                    <input type="number" step="0.01" className={inputCls} value={itemVenda.valorUnit} onChange={(e) => setItemVenda({ ...itemVenda, valorUnit: +e.target.value })} />
                  </Field>
                </div>
                {itemVenda.nome && (() => {
                  const saldo = produtosParaVenda.find((p) => p.nome === itemVenda.nome);
                  const preco = precoUnitarioParaVenda(
                    data.precosGerados,
                    itemVenda.nome,
                    saldo?.valorUnit ?? 0
                  );
                  if (preco.origem === 'precificacao' && preco.registro) {
                    return (
                      <p className="text-amber-300/80 text-xs mb-3">
                        Preço da Precificação: <strong>{formatCurrency(preco.valor)}</strong> por{' '}
                        {preco.registro.unidade} (registrado em {formatDate(preco.registro.data)},
                        margem {preco.registro.margemLucro}%)
                      </p>
                    );
                  }
                  return (
                    <p className="text-amber-400/70 text-xs mb-3">
                      Sem preço em Precificação para <strong>{itemVenda.nome}</strong>. Usando custo
                      de estoque ({formatCurrency(saldo?.valorUnit ?? 0)}) — registre o preço na aba
                      Precificação.
                    </p>
                  );
                })()}
                {produtosParaVenda.length === 0 && (
                  <p className="text-amber-400/60 text-sm mb-3">
                    Nenhum produto de Produção com saldo. Registre uma produção primeiro.
                  </p>
                )}
                <Btn variant="secondary" onClick={adicionarItemVenda}>+ Item</Btn>
                {novaVenda.itens.length > 0 && (
                  <div className="mt-4 text-sm space-y-1">
                    {novaVenda.itens.map((i) => (
                      <div key={i.id} className="flex justify-between items-center text-amber-200 gap-2">
                        <span>{i.nome} × {i.quantidade}</span>
                        <div className="flex items-center gap-2">
                          <span>{formatCurrency(i.quantidade * i.valorUnit)}</span>
                          <Btn variant="danger" className="px-2 py-1" onClick={() => removerItemVendaLista(i.id)}>✕</Btn>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-2 mt-4">
                  <Btn onClick={registrarVenda}>
                    {vendaEditandoId !== null ? 'Salvar alterações' : 'Registrar Venda'}
                  </Btn>
                  {vendaEditandoId !== null && (
                    <Btn variant="secondary" onClick={cancelarEdicaoVenda}>Cancelar</Btn>
                  )}
                </div>
              </Card>
              {/* Relação de vendas pendentes */}
              <Card className="mb-6 border border-amber-600/40">
                <h4 className="text-amber-200 font-medium mb-1">Relação de vendas pendentes</h4>
                <p className="text-amber-400/70 text-xs mb-4">
                  Pedidos com status <strong>Pendente</strong>: reservam saldo livre do produto e só
                  baixam estoque/financeiro ao concluir.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                  <div className="bg-[#2c2118] rounded-xl p-3">
                    <div className="text-amber-400/70 text-xs">Pedidos</div>
                    <div className="text-xl font-bold text-amber-100">{resumoPendentes.quantidade}</div>
                  </div>
                  <div className="bg-[#2c2118] rounded-xl p-3">
                    <div className="text-amber-400/70 text-xs">Valor pendente</div>
                    <div className="text-xl font-bold text-amber-100">
                      {formatCurrency(resumoPendentes.valorTotal)}
                    </div>
                  </div>
                  <div className="bg-[#2c2118] rounded-xl p-3">
                    <div className="text-amber-400/70 text-xs">Clientes</div>
                    <div className="text-xl font-bold text-amber-100">{resumoPendentes.clientes}</div>
                  </div>
                  <div className="bg-[#2c2118] rounded-xl p-3">
                    <div className="text-amber-400/70 text-xs">Qtd. reservada</div>
                    <div className="text-xl font-bold text-amber-100">{resumoPendentes.itensReservados}</div>
                  </div>
                </div>

                {reservasPendentes.length > 0 && (
                  <div className="mb-5">
                    <h5 className="text-amber-300 text-sm font-medium mb-2">
                      Reservas por produto (relação com estoque)
                    </h5>
                    <div className="table-scroll">
                      <table className="w-full text-sm min-w-[520px]">
                        <thead>
                          <tr className="text-amber-300 border-b border-amber-700">
                            <th className="text-left py-2">Produto</th>
                            <th className="text-right py-2">Reservado</th>
                            <th className="text-right py-2">Estoque</th>
                            <th className="text-right py-2">Livre</th>
                            <th className="text-right py-2">Pedidos</th>
                            <th className="text-right py-2">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reservasPendentes.map((r) => {
                            const estoqueFisico = quantidadeDisponivel(data.estoque, r.nome);
                            const livre = Math.max(0, estoqueFisico - r.quantidade);
                            return (
                              <tr key={r.nome} className="border-b border-amber-800/30">
                                <td className="py-2">{r.nome}</td>
                                <td className="py-2 text-right text-amber-200">
                                  {r.quantidade} {r.unidade}
                                </td>
                                <td className="py-2 text-right">
                                  {estoqueFisico} {r.unidade}
                                </td>
                                <td
                                  className={`py-2 text-right font-medium ${
                                    livre <= 0 ? 'text-red-300' : 'text-emerald-200'
                                  }`}
                                >
                                  {livre} {r.unidade}
                                </td>
                                <td className="py-2 text-right">{r.pedidos}</td>
                                <td className="py-2 text-right">{formatCurrency(r.valorTotal)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {vendasPendentes.length > 0 ? (
                  <div className="table-scroll">
                    <table className="w-full text-sm min-w-[960px]">
                      <thead>
                        <tr className="text-amber-300 border-b border-amber-700">
                          <th className="text-left py-2">Data</th>
                          <th className="text-left py-2">Cliente</th>
                          <th className="text-left py-2">Itens reservados</th>
                          <th className="text-left py-2">Pagamento</th>
                          <th className="text-right py-2">Total</th>
                          <th className="text-right py-2 min-w-[200px]">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vendasPendentes.map((v) => (
                          <tr
                            key={v.id}
                            className={`border-b border-amber-800/30 bg-amber-950/20 ${
                              vendaEditandoId === v.id ? 'bg-amber-900/40' : ''
                            }`}
                          >
                            <td className="py-2">{formatDate(v.data)}</td>
                            <td className="py-2 font-medium">{v.cliente}</td>
                            <td className="py-2 text-amber-200/90">
                              {v.itens.length > 0 ? (
                                <div className="space-y-1">
                                  {v.itens.map((i) => (
                                    <div key={i.id}>
                                      {i.nome} — {i.quantidade} {i.unidade}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="py-2">{v.formaPagamento}</td>
                            <td className="py-2 text-right font-semibold text-amber-100">
                              {formatCurrency(v.total)}
                            </td>
                            <td className="py-2 text-right whitespace-nowrap">
                              <div className="flex flex-wrap justify-end gap-1">
                                <Btn variant="primary" onClick={() => concluirVenda(v.id)}>
                                  Concluir
                                </Btn>
                                <Btn variant="secondary" onClick={() => editarVenda(v)}>
                                  Editar
                                </Btn>
                                <Btn variant="danger" onClick={() => removerVenda(v.id)}>
                                  Excluir
                                </Btn>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="font-bold text-amber-100 border-t border-amber-700">
                          <td colSpan={4} className="py-3 text-right">
                            Total pendente
                          </td>
                          <td className="py-3 text-right">
                            {formatCurrency(resumoPendentes.valorTotal)}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <p className="text-amber-400/60 py-2">
                    Nenhuma venda pendente. Use o status <strong>Pendente</strong> no formulário para
                    reservar produtos sem baixar estoque.
                  </p>
                )}
              </Card>

              <Card className="mb-6">
                <h4 className="text-amber-200 font-medium mb-1">Histórico de vendas concluídas</h4>
                <p className="text-amber-400/70 text-xs mb-4">
                  Vendas já finalizadas (estoque baixado e financeiro lançado).
                </p>
                <div className="table-scroll">
                  <table className="w-full text-sm min-w-[960px]">
                    <thead>
                      <tr className="text-amber-300 border-b border-amber-700">
                        <th className="text-left py-2">Data</th>
                        <th className="text-left py-2">Cliente</th>
                        <th className="text-left py-2">Itens</th>
                        <th className="text-left py-2">Status</th>
                        <th className="text-left py-2">Pagamento</th>
                        <th className="text-right py-2">Total</th>
                        <th className="text-right py-2 min-w-[160px]">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vendasConcluidas.map((v) => (
                        <tr
                          key={v.id}
                          className={`border-b border-amber-800/30 ${vendaEditandoId === v.id ? 'bg-amber-900/30' : ''}`}
                        >
                          <td className="py-2">{formatDate(v.data)}</td>
                          <td className="py-2">{v.cliente}</td>
                          <td className="py-2 text-amber-200/90">
                            {v.itens.length > 0 ? (
                              <div className="space-y-1">
                                {v.itens.map((i) => (
                                  <div key={i.id}>
                                    {i.nome} — {i.quantidade} {i.unidade}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-2">
                            <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-emerald-900/50 text-emerald-200">
                              {STATUS_VENDA_LABEL.concluida}
                            </span>
                          </td>
                          <td className="py-2">{v.formaPagamento}</td>
                          <td className="py-2 text-right">{formatCurrency(v.total)}</td>
                          <td className="py-2 text-right whitespace-nowrap">
                            <div className="flex flex-wrap justify-end gap-1">
                              <Btn variant="secondary" onClick={() => editarVenda(v)}>
                                Editar
                              </Btn>
                              <Btn variant="danger" onClick={() => removerVenda(v.id)}>
                                Excluir
                              </Btn>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {vendasConcluidas.length === 0 && (
                  <p className="text-amber-400/60 py-4">Nenhuma venda concluída ainda.</p>
                )}
              </Card>

              <Card>
                <h4 className="text-amber-200 font-medium mb-1">Melhores clientes</h4>
                <p className="text-amber-400/70 text-xs mb-4">
                  Ranking por valor total de vendas concluídas (quantidade e produtos comprados).
                  Pedidos pendentes aparecem como contagem extra.
                </p>
                {rankingClientes.length > 0 ? (
                  <div className="table-scroll">
                    <table className="w-full text-sm min-w-[800px]">
                      <thead>
                        <tr className="text-amber-300 border-b border-amber-700">
                          <th className="text-left py-2">#</th>
                          <th className="text-left py-2">Cliente</th>
                          <th className="text-right py-2">Vendas</th>
                          <th className="text-right py-2">Qtd total</th>
                          <th className="text-left py-2">Produtos comprados</th>
                          <th className="text-right py-2">Valor total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rankingClientes.map((c, idx) => (
                          <tr key={c.cliente} className="border-b border-amber-800/30">
                            <td className="py-2 text-amber-400/80">{idx + 1}</td>
                            <td className="py-2 font-medium">{c.cliente}</td>
                            <td className="py-2 text-right">
                              {c.vendasConcluidas}
                              {c.vendasEmProcessamento > 0 && (
                                <span className="block text-xs text-amber-400/70">
                                  +{c.vendasEmProcessamento} pendente{c.vendasEmProcessamento > 1 ? 's' : ''}
                                </span>
                              )}
                            </td>
                            <td className="py-2 text-right">{c.quantidadeTotal}</td>
                            <td className="py-2 text-amber-200/90">
                              <div className="space-y-1">
                                {c.produtos.map((p) => (
                                  <div key={p.nome}>
                                    {p.nome} — {p.quantidade} {p.unidade} ({formatCurrency(p.valorTotal)})
                                  </div>
                                ))}
                              </div>
                            </td>
                            <td className="py-2 text-right font-semibold text-amber-100">
                              {formatCurrency(c.valorTotal)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="font-bold text-amber-100 border-t border-amber-700">
                          <td colSpan={5} className="py-3 text-right">
                            Total vendas concluídas
                          </td>
                          <td className="py-3 text-right">
                            {formatCurrency(
                              sumBy(
                                data.vendas.filter((v) => isVendaConcluida(v)),
                                (v) => v.total
                              )
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <p className="text-amber-400/60 py-2">
                    Nenhuma venda concluída ainda para montar o ranking de clientes.
                  </p>
                )}
              </Card>
            </div>
          )}

          {/* PRODUÇÃO */}
          {activeTab === 'producao' && (
            <div>
              <SectionTitle>Produção</SectionTitle>
              <Card className="mb-6">
                {producaoEditandoId !== null && (
                  <p className="text-amber-300 text-sm mb-4">
                    Editando produção #{producaoEditandoId}
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  <DateField
                    label="Data da produção"
                    value={novaProducao.data}
                    onChange={(data) => setNovaProducao((p) => ({ ...p, data }))}
                  />
                  <Field label="Lote">
                    <input
                      className={inputCls}
                      value={novaProducao.lote}
                      onChange={(e) => setNovaProducao((p) => ({ ...p, lote: e.target.value }))}
                    />
                  </Field>
                </div>

                <div className="mb-4 p-3 rounded-lg bg-amber-950/40 border border-amber-800/50 text-sm text-amber-300/90">
                  <p className="font-medium text-amber-200 mb-1">Cadeia produtiva do cacau</p>
                  <p className="text-xs leading-relaxed">
                    {CADEIA_PRODUCAO_CACAU.map((e) => e.produto).join(' → ')}
                    {' → '}outros chocolates (com ingredientes adicionais)
                  </p>
                </div>

                <h4 className="text-amber-200 mb-2">1. Ingredientes (entrada)</h4>
                <p className="text-amber-400/70 text-xs mb-3">
                  Use matérias-primas compradas ou produtos intermediários já produzidos (ex.: Amêndoa Torrada para fazer Nibs).
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                  <Field label="Ingrediente">
                    <select className={inputCls} value={ingredienteForm.nome} onChange={(e) => {
                      const item = ingredientesDisponiveis.find((i) => i.nome === e.target.value);
                      setIngredienteForm({ nome: e.target.value, quantidade: 0, valorUnit: item?.valorUnit ?? 0 });
                    }}>
                      <option value="">Selecione...</option>
                      {ingredientesDisponiveis.some((e) => e.origem === 'compra') && (
                        <optgroup label="Matérias-primas (compras)">
                          {ingredientesDisponiveis
                            .filter((e) => e.origem === 'compra')
                            .map((e) => (
                              <option key={`mp-${e.nome}`} value={e.nome}>
                                {e.nome} ({e.quantidade} {e.unidade})
                              </option>
                            ))}
                        </optgroup>
                      )}
                      {ingredientesDisponiveis.some((e) => e.origem === 'producao') && (
                        <optgroup label="Produtos intermediários (produção)">
                          {ingredientesDisponiveis
                            .filter((e) => e.origem === 'producao')
                            .map((e) => (
                              <option key={`pi-${e.nome}`} value={e.nome}>
                                {e.nome} ({e.quantidade} {e.unidade})
                              </option>
                            ))}
                        </optgroup>
                      )}
                    </select>
                  </Field>
                  <Field label="Quantidade">
                    <input type="number" className={inputCls} value={ingredienteForm.quantidade} onChange={(e) => setIngredienteForm({ ...ingredienteForm, quantidade: +e.target.value })} />
                  </Field>
                  <Field label="Valor Unitário (R$)">
                    <input type="number" step="0.01" className={inputCls} value={ingredienteForm.valorUnit} onChange={(e) => setIngredienteForm({ ...ingredienteForm, valorUnit: +e.target.value })} />
                  </Field>
                </div>
                <Btn variant="secondary" onClick={adicionarIngrediente}>+ Ingrediente</Btn>
                {novaProducao.ingredientes.length > 0 && (
                  <div className="mt-3 text-sm space-y-1 mb-6">
                    {novaProducao.ingredientes.map((ing, idx) => (
                      <div key={idx} className="flex justify-between items-center text-amber-200 gap-2">
                        <span>
                          {ing.nome}
                          {ing.tipo === 'ProdutoAcabado' ? ' (intermediário)' : ''}: {ing.quantidade}{' '}
                          {ing.unidade ?? 'kg'} — {formatCurrency(ing.quantidade * ing.valorUnit)}
                        </span>
                        <Btn variant="danger" className="px-2 py-1" onClick={() => removerIngredienteLista(idx)}>✕</Btn>
                      </div>
                    ))}
                  </div>
                )}

                <h4 className="text-amber-200 mb-2">2. Produto gerado (saída)</h4>
                {ingredientesSugeridos.length > 0 && (
                  <p className="text-amber-400/80 text-xs mb-3">
                    Ingredientes sugeridos para <strong>{novaProducao.produto || 'este produto'}</strong>:{' '}
                    {ingredientesSugeridos.join(', ')}. Outros ingredientes também podem ser adicionados.
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                  <Field label="Produto">
                    <input
                      list="catalogo-produtos-producao"
                      className={inputCls}
                      value={novaProducao.produto}
                      onChange={(e) => {
                        const nome = e.target.value;
                        const unidade = unidadeSugeridaProduto(data.producoes, nome);
                        setNovaProducao((p) => ({
                          ...p,
                          produto: nome,
                          unidade: unidade ?? p.unidade,
                        }));
                      }}
                      placeholder="Selecione ou digite um produto"
                    />
                    <datalist id="catalogo-produtos-producao">
                      {catalogoProdutosProducao.map((nome) => (
                        <option key={nome} value={nome} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label="Quantidade produzida">
                    <input
                      type="number"
                      step="0.001"
                      min={0}
                      className={inputCls}
                      value={novaProducao.quantidade || ''}
                      onChange={(e) =>
                        setNovaProducao((p) => ({ ...p, quantidade: +e.target.value }))
                      }
                    />
                  </Field>
                  <Field label="Unidade">
                    <input
                      className={inputCls}
                      value={novaProducao.unidade}
                      onChange={(e) => setNovaProducao((p) => ({ ...p, unidade: e.target.value }))}
                    />
                  </Field>
                </div>

                {resumoPerdaProducao && novaProducao.quantidade > 0 && (
                  <p className="text-sm text-amber-300/90 mb-4 bg-amber-950/40 border border-amber-800/50 rounded-lg px-3 py-2">
                    Entrada: <strong>{resumoPerdaProducao.entrada} {resumoPerdaProducao.unidade}</strong>
                    {' → '}
                    Saída: <strong>{resumoPerdaProducao.saida} {resumoPerdaProducao.unidade}</strong>
                    {' — '}
                    Perda: <strong>{resumoPerdaProducao.perdaQuantidade} {resumoPerdaProducao.unidade}</strong>
                    {' '}({resumoPerdaProducao.perdaPercentual}%)
                  </p>
                )}
                {novaProducao.ingredientes.length > 0 &&
                  !totalEntradaIngredientes(novaProducao.ingredientes) && (
                    <p className="text-sm text-amber-400 mb-4">
                      Para calcular a perda, todos os ingredientes devem usar a mesma unidade.
                    </p>
                  )}

                <div className="flex flex-wrap gap-3 mt-4">
                  <Btn onClick={registrarProducao}>
                    {producaoEditandoId !== null ? 'Salvar alterações' : 'Registrar Produção'}
                  </Btn>
                  {producaoEditandoId !== null && (
                    <Btn variant="secondary" onClick={cancelarEdicaoProducao}>Cancelar</Btn>
                  )}
                </div>
              </Card>
              <Card>
                <div className="table-scroll">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead><tr className="text-amber-300 border-b border-amber-700">
                      <th className="text-left py-2">Data</th><th className="text-left py-2">Lote</th>
                      <th className="text-left py-2">Produto</th><th className="text-right py-2">Qtd</th>
                      <th className="text-right py-2">Perda</th>
                      <th className="text-right py-2">Custo</th>
                      <th className="text-right py-2 w-32">Ações</th>
                    </tr></thead>
                    <tbody>
                      {data.producoes.slice().reverse().map((p) => (
                        <tr
                          key={p.id}
                          className={`border-b border-amber-800/30 ${producaoEditandoId === p.id ? 'bg-amber-900/30' : ''}`}
                        >
                          <td className="py-2">{formatDate(p.data)}</td>
                          <td className="py-2">{p.lote}</td>
                          <td className="py-2">{p.produto}</td>
                          <td className="py-2 text-right">{p.quantidade} {p.unidade}</td>
                          <td className="py-2 text-right text-amber-300/80">
                            {p.quantidadePerdida && p.quantidadePerdida > 0 ? (
                              <>
                                {p.percentualPerda ?? 0}%
                                <span className="block text-xs text-amber-400/60">
                                  −{p.quantidadePerdida} {p.unidade}
                                </span>
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-2 text-right">{formatCurrency(p.custoEstimado)}</td>
                          <td className="py-2 text-right whitespace-nowrap">
                            <Btn variant="secondary" onClick={() => editarProducao(p)}>Editar</Btn>
                            {' '}
                            <Btn variant="danger" onClick={() => removerProducao(p.id)}>Excluir</Btn>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {data.producoes.length === 0 && <p className="text-amber-400/60 py-4">Nenhuma produção registrada.</p>}
              </Card>

              <Card className="mt-6">
                <h3 className="text-lg font-semibold text-amber-200 mb-4">Totalização de perdas por produto</h3>
                {totalPerdasPorProduto.length > 0 ? (
                  <div className="table-scroll">
                    <table className="w-full text-sm min-w-[560px]">
                      <thead>
                        <tr className="text-amber-300 border-b border-amber-700">
                          <th className="text-left py-2">Produto</th>
                          <th className="text-right py-2">Lançamentos</th>
                          <th className="text-right py-2">Entrada total</th>
                          <th className="text-right py-2">Saída total</th>
                          <th className="text-right py-2">Perda total</th>
                          <th className="text-right py-2">Perda média</th>
                        </tr>
                      </thead>
                      <tbody>
                        {totalPerdasPorProduto.map((item) => (
                          <tr key={`${item.produto}-${item.unidade}`} className="border-b border-amber-800/30">
                            <td className="py-2">{item.produto}</td>
                            <td className="py-2 text-right">{item.lancamentos}</td>
                            <td className="py-2 text-right">{item.entradaTotal} {item.unidade}</td>
                            <td className="py-2 text-right">{item.saidaTotal} {item.unidade}</td>
                            <td className="py-2 text-right text-amber-300/80">
                              −{item.perdaTotal} {item.unidade}
                            </td>
                            <td className="py-2 text-right">{item.perdaPercentualMedia}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-amber-400/60 py-2">
                    Nenhuma perda registrada ainda. Lance matéria-prima e produto gerado para o sistema calcular.
                  </p>
                )}
              </Card>
            </div>
          )}

          {/* PRECIFICAÇÃO */}
          {activeTab === 'precificacao' && (
            <div>
              <SectionTitle>Precificação</SectionTitle>
              <Card className="mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <Field label="Produto Acabado">
                    <select className={inputCls} value={produtoPreco} onChange={(e) => setProdutoPreco(e.target.value)}>
                      <option value="">Selecione...</option>
                      {produtosParaPrecificacao.map((p) => (
                        <option key={p.nome} value={p.nome}>
                          {p.nome}
                          {p.quantidade > 0 ? ` (${p.quantidade} ${p.unidade})` : ' (sem estoque)'}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Margem de Lucro (%)">
                    <input type="number" className={inputCls} value={margemLucro} onChange={(e) => setMargemLucro(+e.target.value)} />
                  </Field>
                  <DateField
                    label="Data do registro"
                    value={dataPreco}
                    onChange={setDataPreco}
                  />
                </div>
                {produtoSelecionado && (
                  <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-[#2c2118] rounded-xl p-4">
                      <div className="text-amber-300 text-sm">Custo Unitário</div>
                      <div className="text-2xl font-bold">{formatCurrency(custoProduto)}</div>
                      <div className="text-xs text-amber-400/70 mt-1">
                        por {produtoSelecionado.unidade}
                        {produtoSelecionado.origemCusto === 'producao' && ' · da produção'}
                        {produtoSelecionado.origemCusto === 'historico' && ' · do histórico'}
                        {produtoSelecionado.origemCusto === 'estoque' && ' · do estoque'}
                      </div>
                    </div>
                    <div className="bg-[#2c2118] rounded-xl p-4">
                      <div className="text-amber-300 text-sm">Margem ({margemLucro}%)</div>
                      <div className="text-2xl font-bold">{formatCurrency(custoProduto * margemLucro / 100)}</div>
                    </div>
                    <div className="bg-amber-700/30 rounded-xl p-4 border border-amber-500">
                      <div className="text-amber-200 text-sm">Preço Sugerido</div>
                      <div className="text-3xl font-bold text-amber-50">{formatCurrency(precoSugerido)}</div>
                      <div className="text-xs text-amber-200/70 mt-1">por {produtoSelecionado.unidade}</div>
                    </div>
                  </div>
                )}
                {ultimoPrecoProduto && produtoPreco && (
                  <p className="mt-4 text-sm text-amber-300/80">
                    Último preço registrado para <strong>{produtoPreco}</strong>:{' '}
                    <strong>{formatCurrency(ultimoPrecoProduto.precoSugerido)}</strong> em{' '}
                    {formatDate(ultimoPrecoProduto.data)} (margem {ultimoPrecoProduto.margemLucro}%)
                    {precosDoProdutoSelecionado.length > 1 && (
                      <> · {precosDoProdutoSelecionado.length} registros no histórico</>
                    )}
                  </p>
                )}
                <div className="mt-4">
                  <Btn onClick={registrarPreco}>Registrar preço</Btn>
                </div>
                {produtosParaPrecificacao.length === 0 && (
                  <p className="mt-4 text-amber-400/60">Cadastre produtos acabados no estoque ou via produção.</p>
                )}
              </Card>

              <Card>
                <h3 className="text-lg font-semibold text-amber-200 mb-1">
                  Histórico de preços gerados
                </h3>
                <p className="text-amber-400/70 text-sm mb-4">
                  Todas as precificações anteriores ficam registradas aqui
                  {produtoPreco
                    ? ` (registros de ${produtoPreco} destacados).`
                    : '.'}
                </p>
                {precosExibidos.length > 0 ? (
                  <div className="table-scroll">
                    <table className="w-full text-sm min-w-[640px]">
                      <thead>
                        <tr className="text-amber-300 border-b border-amber-700">
                          <th className="text-left py-2">Data</th>
                          <th className="text-left py-2">Produto</th>
                          <th className="text-right py-2">Custo</th>
                          <th className="text-right py-2">Margem</th>
                          <th className="text-right py-2">Preço</th>
                          <th className="text-right py-2 w-24">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {precosExibidos.map((p) => {
                          const destacado =
                            !!produtoPreco && nomeProdutoIgual(p.produto, produtoPreco);
                          return (
                            <tr
                              key={p.id}
                              className={`border-b border-amber-800/30 ${
                                destacado ? 'bg-amber-900/35' : ''
                              }`}
                            >
                              <td className="py-2">{formatDate(p.data)}</td>
                              <td className="py-2">{p.produto}</td>
                              <td className="py-2 text-right">
                                {formatCurrency(p.custoUnitario)}
                                <span className="text-xs text-amber-400/60"> /{p.unidade}</span>
                              </td>
                              <td className="py-2 text-right">{p.margemLucro}%</td>
                              <td className="py-2 text-right font-semibold text-amber-100">
                                {formatCurrency(p.precoSugerido)}
                              </td>
                              <td className="py-2 text-right">
                                <Btn variant="danger" className="px-2 py-1" onClick={() => removerPreco(p.id)}>
                                  Excluir
                                </Btn>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-amber-400/60 py-2">
                    Nenhum preço registrado ainda. Calcule e clique em &quot;Registrar preço&quot;.
                  </p>
                )}
              </Card>
            </div>
          )}

          {/* CARTÕES */}
          {activeTab === 'cartoes' && (
            <div>
              <SectionTitle>Cartões de Crédito</SectionTitle>
              <Card className="mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Nome do Cartão"><input className={inputCls} value={novoCartao.nome} onChange={(e) => setNovoCartao({ ...novoCartao, nome: e.target.value })} /></Field>
                  <Field label="Limite (R$)"><input type="number" className={inputCls} value={novoCartao.limite} onChange={(e) => setNovoCartao({ ...novoCartao, limite: +e.target.value })} /></Field>
                </div>
                <Btn className="mt-4" onClick={adicionarCartao}>Adicionar Cartão</Btn>
              </Card>
              <Card className="mb-4">
                <Field label="Cotação do dólar (R$)">
                  <input
                    type="number"
                    step="0.0001"
                    min={0}
                    className={`${inputCls} max-w-xs`}
                    value={cotacaoDolar || ''}
                    onChange={(e) => setCotacaoDolar(+e.target.value)}
                    placeholder="Ex: 5.50"
                  />
                </Field>
                <p className="text-amber-400/60 text-sm mt-2">
                  Usada para converter o total parcelado de cada cartão em dólar.
                </p>
              </Card>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                {data.cartoes.map((c: CartaoModel) => {
                  const gastoCartao = sumBy(
                    data.compras.filter((comp) => comp.cartao === c.nome),
                    (comp) => comp.total
                  );
                  const parcelaMesAtual = valorParcelaNoMes(parcelasMensais, mesAtual, c.nome);
                  const totalParcelado = totalParcelasCartao(parcelasMensais, c.nome);
                  return (
                    <Card key={c.id}>
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="text-lg font-bold">{c.nome}</div>
                          <div className="text-amber-300 text-sm">Limite: {formatCurrency(c.limite ?? 0)}</div>
                          <div className="text-amber-300 text-sm">Gasto total: {formatCurrency(gastoCartao)}</div>
                          <div className="text-amber-300 text-sm">
                            Parcela em {formatMesAno(mesAtual)}: {formatCurrency(parcelaMesAtual)}
                          </div>
                          <div className="text-amber-300 text-sm">Total parcelado: {formatCurrency(totalParcelado)}</div>
                          {cotacaoDolar > 0 && (
                            <div className="text-amber-200 text-sm mt-1">
                              Em dólar: {formatUsd(brlParaUsd(totalParcelado, cotacaoDolar) ?? 0)}
                            </div>
                          )}
                        </div>
                        <Btn variant="danger" onClick={() => removerCartao(c.id)}>✕</Btn>
                      </div>
                    </Card>
                  );
                })}
              </div>
              <Card>
                <h4 className="text-amber-200 font-medium mb-4">Soma das parcelas por cartão e por mês</h4>
                <div className="table-scroll">
                  <table className="w-full text-sm min-w-[480px]">
                    <thead>
                      <tr className="text-amber-300 border-b border-amber-700">
                        <th className="text-left py-2">Mês</th>
                        {data.cartoes.map((c) => (
                          <th key={c.id} className="text-right py-2">{c.nome}</th>
                        ))}
                        <th className="text-right py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mesesParcelas.map((mes) => (
                        <tr
                          key={mes}
                          className={`border-b border-amber-800/30 ${mes === mesAtual ? 'bg-amber-900/30' : ''}`}
                        >
                          <td className="py-2">{formatMesAno(mes)}</td>
                          {data.cartoes.map((c) => {
                            const valor = valorParcelaNoMes(parcelasMensais, mes, c.nome);
                            return (
                              <td key={c.id} className="py-2 text-right text-amber-200">
                                {valor > 0 ? formatCurrency(valor) : '—'}
                              </td>
                            );
                          })}
                          <td className="py-2 text-right font-medium">{formatCurrency(totalParcelasMes(parcelasMensais, mes))}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold text-amber-100 border-t border-amber-700">
                        <td className="py-3">Total por cartão</td>
                        {data.cartoes.map((c) => (
                          <td key={c.id} className="py-3 text-right">
                            {formatCurrency(totalParcelasCartao(parcelasMensais, c.nome))}
                          </td>
                        ))}
                        <td className="py-3 text-right">
                          {formatCurrency(sumBy(parcelasMensais, (p) => p.valor))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {mesesParcelas.length === 0 && (
                  <p className="text-amber-400/60 py-4">Nenhuma compra parcelada no cartão registrada.</p>
                )}
              </Card>
            </div>
          )}

          {/* CAIXA */}
          {activeTab === 'caixa' && (
            <div>
              <SectionTitle action={<Btn variant="secondary" onClick={() => gerarPdfFinanceiro(data, 'caixa')}>📄 PDF</Btn>}>
                Caixa — Saldo: {formatCurrency(saldoCaixa)}
              </SectionTitle>
              <Card className="mb-6">
                {movCaixaEditandoId !== null && (
                  <p className="text-amber-300 text-sm mb-4">Editando lançamento #{movCaixaEditandoId}</p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  <DateField
                    label="Data do movimento"
                    value={movCaixa.data}
                    onChange={(data) => setMovCaixa((p) => ({ ...p, data }))}
                  />
                  <Field label="Descrição"><input className={inputCls} value={movCaixa.descricao} onChange={(e) => setMovCaixa((p) => ({ ...p, descricao: e.target.value }))} /></Field>
                  <Field label="Tipo">
                    <select className={inputCls} value={movCaixa.tipo} onChange={(e) => setMovCaixa((p) => ({ ...p, tipo: e.target.value as 'entrada' | 'saida' }))}>
                      <option value="entrada">Entrada</option><option value="saida">Saída</option>
                    </select>
                  </Field>
                  <Field label="Valor (R$)"><input type="number" step="0.01" className={inputCls} value={movCaixa.valor} onChange={(e) => setMovCaixa((p) => ({ ...p, valor: +e.target.value }))} /></Field>
                  <Field label="Categoria"><input className={inputCls} value={movCaixa.categoria} onChange={(e) => setMovCaixa((p) => ({ ...p, categoria: e.target.value }))} /></Field>
                </div>
                <div className="flex flex-wrap gap-2 mt-4">
                  <Btn onClick={registrarMovCaixa}>
                    {movCaixaEditandoId !== null ? 'Salvar alterações' : 'Registrar Movimento'}
                  </Btn>
                  {movCaixaEditandoId !== null && (
                    <Btn variant="secondary" onClick={resetFormMovCaixa}>Cancelar</Btn>
                  )}
                </div>
              </Card>
              <Card>
                <h4 className="text-amber-200 font-medium mb-4">Histórico de lançamentos</h4>
                <div className="table-scroll">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead>
                      <tr className="text-amber-300 border-b border-amber-700">
                        <th className="text-left py-2">Data</th>
                        <th className="text-left py-2">Descrição</th>
                        <th className="text-left py-2">Tipo</th>
                        <th className="text-right py-2">Valor</th>
                        <th className="text-right py-2 w-32">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.movimentosCaixa.slice().reverse().map((m) => (
                        <tr
                          key={m.id}
                          className={`border-b border-amber-800/30 ${movCaixaEditandoId === m.id ? 'bg-amber-900/30' : ''}`}
                        >
                          <td className="py-2">{formatDate(m.data)}</td>
                          <td className="py-2">
                            {m.descricao}
                            {m.referencia && <span className="text-amber-500/70 text-xs ml-1">(auto)</span>}
                          </td>
                          <td className={`py-2 ${m.tipo === 'entrada' ? 'text-green-400' : 'text-red-400'}`}>
                            {m.tipo === 'entrada' ? '↑ Entrada' : '↓ Saída'}
                          </td>
                          <td className="py-2 text-right">{formatCurrency(m.valor)}</td>
                          <td className="py-2 text-right whitespace-nowrap">
                            {!m.referencia ? (
                              <>
                                <Btn variant="secondary" onClick={() => editarMovCaixa(m)}>Editar</Btn>
                                {' '}
                                <Btn variant="danger" onClick={() => removerMovCaixa(m)}>Excluir</Btn>
                              </>
                            ) : (
                              <span className="text-amber-500/60 text-xs">Compras/Vendas</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {/* BANCO */}
          {activeTab === 'banco' && (
            <div>
              <SectionTitle action={<Btn variant="secondary" onClick={() => gerarPdfFinanceiro(data, 'banco')}>📄 PDF</Btn>}>
                Banco — Saldo: {formatCurrency(saldoBanco)}
              </SectionTitle>
              <Card className="mb-6">
                <h4 className="text-amber-200 font-medium mb-4">Cadastro de banco</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Field label="Nome do banco">
                    <input className={inputCls} value={novoBanco.nome} onChange={(e) => setNovoBanco((p) => ({ ...p, nome: e.target.value }))} />
                  </Field>
                  <Field label="Agência">
                    <input className={inputCls} value={novoBanco.agencia} onChange={(e) => setNovoBanco((p) => ({ ...p, agencia: e.target.value }))} />
                  </Field>
                  <Field label="Conta">
                    <input className={inputCls} value={novoBanco.conta} onChange={(e) => setNovoBanco((p) => ({ ...p, conta: e.target.value }))} />
                  </Field>
                </div>
                <Btn className="mt-4" onClick={adicionarBanco}>Adicionar Banco</Btn>
              </Card>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                {data.bancos.map((b: BancoModel) => (
                  <Card key={b.id}>
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-lg font-bold">{b.nome}</div>
                        {b.agencia && <div className="text-amber-300 text-sm">Agência: {b.agencia}</div>}
                        {b.conta && <div className="text-amber-300 text-sm">Conta: {b.conta}</div>}
                        <div className="text-amber-300 text-sm mt-1">
                          Saldo: {formatCurrency(calcSaldoBanco(data.movimentosBanco, b.nome))}
                        </div>
                      </div>
                      <Btn variant="danger" onClick={() => removerBanco(b.id)}>✕</Btn>
                    </div>
                  </Card>
                ))}
              </div>
              <Card className="mb-6">
                {movBancoEditandoId !== null && (
                  <p className="text-amber-300 text-sm mb-4">Editando lançamento #{movBancoEditandoId}</p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <DateField
                    label="Data do movimento"
                    value={movBanco.data}
                    onChange={(data) => setMovBanco((p) => ({ ...p, data }))}
                  />
                  <Field label="Banco">
                    <select
                      className={inputCls}
                      value={movBanco.bancoId}
                      onChange={(e) => setMovBanco((p) => ({ ...p, bancoId: +e.target.value }))}
                    >
                      {data.bancos.map((b) => (
                        <option key={b.id} value={b.id}>{b.nome}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Descrição">
                    <input className={inputCls} value={movBanco.descricao} onChange={(e) => setMovBanco((p) => ({ ...p, descricao: e.target.value }))} />
                  </Field>
                  <Field label="Tipo">
                    <select className={inputCls} value={movBanco.tipo} onChange={(e) => setMovBanco((p) => ({ ...p, tipo: e.target.value as 'entrada' | 'saida' }))}>
                      <option value="entrada">Entrada</option><option value="saida">Saída</option>
                    </select>
                  </Field>
                  <Field label="Valor (R$)">
                    <input type="number" step="0.01" className={inputCls} value={movBanco.valor} onChange={(e) => setMovBanco((p) => ({ ...p, valor: +e.target.value }))} />
                  </Field>
                  <Field label="Categoria">
                    <input className={inputCls} value={movBanco.categoria} onChange={(e) => setMovBanco((p) => ({ ...p, categoria: e.target.value }))} />
                  </Field>
                </div>
                <div className="flex flex-wrap gap-2 mt-4">
                  <Btn onClick={registrarMovBanco}>
                    {movBancoEditandoId !== null ? 'Salvar alterações' : 'Registrar Movimento'}
                  </Btn>
                  {movBancoEditandoId !== null && (
                    <Btn variant="secondary" onClick={resetFormMovBanco}>Cancelar</Btn>
                  )}
                </div>
              </Card>
              <Card>
                <h4 className="text-amber-200 font-medium mb-4">Histórico de lançamentos</h4>
                <div className="table-scroll">
                  <table className="w-full text-sm min-w-[720px]">
                    <thead>
                      <tr className="text-amber-300 border-b border-amber-700">
                        <th className="text-left py-2">Data</th>
                        <th className="text-left py-2">Banco</th>
                        <th className="text-left py-2">Descrição</th>
                        <th className="text-left py-2">Tipo</th>
                        <th className="text-right py-2">Valor</th>
                        <th className="text-right py-2 w-32">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.movimentosBanco.slice().reverse().map((m) => (
                        <tr
                          key={m.id}
                          className={`border-b border-amber-800/30 ${movBancoEditandoId === m.id ? 'bg-amber-900/30' : ''}`}
                        >
                          <td className="py-2">{formatDate(m.data)}</td>
                          <td className="py-2 text-amber-300">{m.banco ?? '—'}</td>
                          <td className="py-2">
                            {m.descricao}
                            {m.referencia && <span className="text-amber-500/70 text-xs ml-1">(auto)</span>}
                          </td>
                          <td className={`py-2 ${m.tipo === 'entrada' ? 'text-green-400' : 'text-red-400'}`}>
                            {m.tipo === 'entrada' ? '↑ Entrada' : '↓ Saída'}
                          </td>
                          <td className="py-2 text-right">{formatCurrency(m.valor)}</td>
                          <td className="py-2 text-right whitespace-nowrap">
                            {!m.referencia ? (
                              <>
                                <Btn variant="secondary" onClick={() => editarMovBanco(m)}>Editar</Btn>
                                {' '}
                                <Btn variant="danger" onClick={() => removerMovBanco(m)}>Excluir</Btn>
                              </>
                            ) : (
                              <span className="text-amber-500/60 text-xs">Compras/Vendas</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {data.movimentosBanco.length === 0 && (
                  <p className="text-amber-400/60 py-4">Nenhum lançamento bancário registrado.</p>
                )}
              </Card>
            </div>
          )}

          {/* PATRIMÔNIO */}
          {activeTab === 'patrimonio' && (
            <div>
              <SectionTitle action={<Btn variant="secondary" onClick={() => gerarPdfPatrimonio(data)}>📄 PDF</Btn>}>
                Patrimônio — Total: {formatCurrency(valorPatrimonio)}
              </SectionTitle>
              <Card className="mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Field label="Nome do Bem"><input className={inputCls} value={novoPatrimonio.nome} onChange={(e) => setNovoPatrimonio({ ...novoPatrimonio, nome: e.target.value })} /></Field>
                  <Field label="Categoria">
                    <select className={inputCls} value={novoPatrimonio.categoria} onChange={(e) => setNovoPatrimonio({ ...novoPatrimonio, categoria: e.target.value })}>
                      <option>Equipamento</option><option>Imóvel</option><option>Veículo</option><option>Mobiliário</option><option>Outros</option>
                    </select>
                  </Field>
                  <Field label="Data de Aquisição"><input type="date" className={inputCls} value={novoPatrimonio.dataAquisicao} onChange={(e) => setNovoPatrimonio({ ...novoPatrimonio, dataAquisicao: e.target.value })} /></Field>
                  <Field label="Valor de Aquisição (R$)">
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      className={inputCls}
                      value={novoPatrimonio.valorAquisicao || ''}
                      onChange={(e) => {
                        const valor = +e.target.value;
                        setNovoPatrimonio((p) => ({
                          ...p,
                          valorAquisicao: valor,
                          valorAtual: p.valorAtual > 0 ? p.valorAtual : valor,
                        }));
                      }}
                    />
                  </Field>
                  <Field label="Valor Atual (R$)">
                    <input type="number" step="0.01" min={0} className={inputCls} value={novoPatrimonio.valorAtual || ''} onChange={(e) => setNovoPatrimonio((p) => ({ ...p, valorAtual: +e.target.value }))} />
                  </Field>
                  <Field label="Depreciação Anual (%)"><input type="number" className={inputCls} value={novoPatrimonio.depreciacaoAnual} onChange={(e) => setNovoPatrimonio({ ...novoPatrimonio, depreciacaoAnual: +e.target.value })} /></Field>
                </div>
                <Field label="Observações">
                  <textarea className={`${inputCls} mt-1`} rows={2} value={novoPatrimonio.observacoes} onChange={(e) => setNovoPatrimonio({ ...novoPatrimonio, observacoes: e.target.value })} />
                </Field>
                <Btn className="mt-4" onClick={adicionarPatrimonio}>Adicionar Bem</Btn>
              </Card>
              <Card>
                <table className="w-full text-sm">
                  <thead><tr className="text-amber-300 border-b border-amber-700">
                    <th className="text-left py-2">Bem</th><th className="text-left py-2">Categoria</th>
                    <th className="text-left py-2">Aquisição</th><th className="text-right py-2">Valor Atual</th><th className="py-2"></th>
                  </tr></thead>
                  <tbody>
                    {data.patrimonio.map((p: PatrimonioItem) => (
                      <tr key={p.id} className="border-b border-amber-800/30">
                        <td className="py-2">{p.nome}</td>
                        <td className="py-2 text-amber-300">{p.categoria}</td>
                        <td className="py-2">{formatDate(p.dataAquisicao)}</td>
                        <td className="py-2 text-right">{formatCurrency(p.valorAtual)}</td>
                        <td className="py-2 text-right"><Btn variant="danger" onClick={() => removerPatrimonio(p.id)}>✕</Btn></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-bold text-amber-100">
                      <td colSpan={3} className="py-3 text-right">Total Patrimônio:</td>
                      <td className="py-3 text-right">{formatCurrency(valorPatrimonio)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
                {data.patrimonio.length === 0 && <p className="text-amber-400/60 py-4">Nenhum bem cadastrado.</p>}
              </Card>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}