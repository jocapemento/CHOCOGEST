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
  Producao,
  TipoItem,
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
  agruparEstoque,
  catalogoItensLancados,
  catalogoProdutosProduzidos,
  quantidadeDisponivel,
  saldoIngrediente,
  totalVendidoProduto,
  validarIngredientesProducao,
  vendasDoProduto,
} from '@/lib/estoque';
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

function atualizarEstoqueVenda(estoque: EstoqueItem[], itens: ItemMovimentacao[]): EstoqueItem[] {
  const updated = estoque.map((e) => ({ ...e }));

  for (const item of itens) {
    let restante = item.quantidade;

    for (let i = 0; i < updated.length && restante > 0; i++) {
      if (updated[i].nome.toLowerCase() !== item.nome.toLowerCase() || updated[i].quantidade <= 0) {
        continue;
      }

      const baixa = Math.min(updated[i].quantidade, restante);
      updated[i] = { ...updated[i], quantidade: updated[i].quantidade - baixa };
      restante -= baixa;
    }
  }

  return updated.filter((e) => e.quantidade > 0);
}

function reverterEstoqueCompra(estoque: EstoqueItem[], itens: ItemMovimentacao[]): EstoqueItem[] {
  return atualizarEstoqueVenda(estoque, itens);
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
  ingredientes: Producao['ingredientes']
): ItemMovimentacao[] {
  return ingredientes.map((ing) => {
    const saldo = saldoIngrediente(estoque, ing.nome);
    return {
      id: 0,
      nome: ing.nome,
      tipo: 'MateriaPrima' as TipoItem,
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

function aplicarEfeitosProducao(estoque: EstoqueItem[], producao: Producao): EstoqueItem[] {
  let updated = estoque;
  for (const item of ingredientesProducaoParaItens(updated, producao.ingredientes)) {
    updated = atualizarEstoqueVenda(updated, [item]);
  }
  return atualizarEstoqueCompra(updated, [produtoProducaoParaItem(producao)], producao.data);
}

function reverterEfeitosProducao(estoque: EstoqueItem[], producao: Producao): EstoqueItem[] {
  const updated = atualizarEstoqueVenda(estoque, [produtoProducaoParaItem(producao)]);
  return atualizarEstoqueCompra(
    updated,
    ingredientesProducaoParaItens(updated, producao.ingredientes),
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
  itens: [] as ItemMovimentacao[],
};

const PRODUCAO_FORM_INICIAL = {
  data: todayISO(),
  lote: '',
  produto: '',
  quantidade: 1,
  unidade: 'un',
  ingredientes: [] as Array<{ nome: string; quantidade: number; valorUnit: number; unidade?: string }>,
};

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

// Shared UI
function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h2 className="text-2xl font-bold text-amber-100">{children}</h2>
      {action}
    </div>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[#4a3828] rounded-2xl p-6 border border-amber-800/50 ${className}`}>
      {children}
    </div>
  );
}

function Btn({
  children,
  onClick,
  variant = 'primary',
  className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  className?: string;
}) {
  const styles = {
    primary: 'bg-amber-600 hover:bg-amber-500 text-white',
    secondary: 'bg-amber-900/60 hover:bg-amber-800 text-amber-100 border border-amber-700',
    danger: 'bg-red-800 hover:bg-red-700 text-white',
  };
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
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
  'w-full bg-[#2c2118] border border-amber-700/60 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const chocolateBgStyle: React.CSSProperties = {
  backgroundImage: `linear-gradient(rgba(44, 33, 24, 0.92), rgba(44, 33, 24, 0.95)), url('${basePath}/chocolate-bg.jpeg')`,
};

export default function ChocoGest() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [hydrated, setHydrated] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Forms
  const [novoItem, setNovoItem] = useState({
    nome: '',
    tipo: 'MateriaPrima' as TipoItem,
    quantidade: 0,
    unidade: 'kg',
    valorUnit: 0,
    data: todayISO(),
  });
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

  // --- Handlers ---
  const adicionarItemEstoque = () => {
    if (!novoItem.nome.trim()) return alert('Informe o nome do item.');
    update((prev) => ({
      ...prev,
      estoque: [
        ...prev.estoque,
        { id: nextId(prev.estoque), ...novoItem, data: normalizeDateISO(novoItem.data) },
      ],
    }));
    setNovoItem({ nome: '', tipo: 'MateriaPrima', quantidade: 0, unidade: 'kg', valorUnit: 0, data: todayISO() });
  };

  const removerItemEstoque = (id: number) => {
    if (!confirm('Remover este item do estoque?')) return;
    update((prev) => ({ ...prev, estoque: prev.estoque.filter((e) => e.id !== id) }));
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

  const adicionarItemVenda = () => {
    const saldo = catalogoProdutosProduzidos(data.producoes, data.estoque).find(
      (e) => e.nome.toLowerCase() === itemVenda.nome.toLowerCase()
    );
    if (!saldo) return alert('Selecione um produto produzido com saldo disponível.');
    if (itemVenda.quantidade <= 0) return alert('Informe uma quantidade válida.');
    if (itemVenda.quantidade > saldo.quantidade) {
      return alert(`Quantidade indisponível. Saldo atual: ${saldo.quantidade} ${saldo.unidade}.`);
    }
    const item: ItemMovimentacao = {
      id: nextId(novaVenda.itens),
      nome: saldo.nome,
      tipo: saldo.tipo,
      quantidade: itemVenda.quantidade,
      unidade: saldo.unidade,
      valorUnit: itemVenda.valorUnit || saldo.valorUnit,
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
      const reverted = reverterEfeitosVenda(prev, venda);
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
      estoque: atualizarEstoqueVenda(prev.estoque, venda.itens),
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
      cliente: novaVenda.cliente,
      formaPagamento: novaVenda.formaPagamento,
      total,
      itens: novaVenda.itens,
    };

    update((prev) => {
      if (editando) {
        const antiga = prev.vendas.find((v) => v.id === vendaEditandoId);
        if (!antiga) return prev;

        let state = reverterEfeitosVenda(prev, antiga);
        state = aplicarEfeitosVenda(state, venda, dataOperacao);

        return {
          ...state,
          vendas: state.vendas.map((v) => (v.id === vendaEditandoId ? venda : v)),
        };
      }

      const state = aplicarEfeitosVenda(prev, venda, dataOperacao);
      return { ...state, vendas: [...state.vendas, venda] };
    });

    resetFormVenda();
    alert(editando ? 'Venda atualizada com sucesso!' : 'Venda registrada com sucesso!');
  };

  const adicionarIngrediente = () => {
    if (!ingredienteForm.nome.trim()) {
      return alert('Selecione um ingrediente do estoque.');
    }
    const item = saldoEstoque.find(
      (i) => i.nome === ingredienteForm.nome && i.tipo === 'MateriaPrima'
    );
    if (!item) {
      return alert('Ingrediente inválido. Selecione uma matéria-prima com saldo no estoque.');
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
        { ...ingredienteForm, unidade: item.unidade },
      ],
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
        const saldo = saldoIngrediente(data.estoque, i.nome);
        return { ...i, unidade: i.unidade ?? saldo?.unidade };
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
        estoque: reverterEfeitosProducao(prev.estoque, p),
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
      return alert('Informe uma quantidade válida.');
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
      if (antiga) estoqueBase = reverterEfeitosProducao(estoqueBase, antiga);
    }

    const erroIngredientes = validarIngredientesProducao(estoqueBase, producao);
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

        const estoque = aplicarEfeitosProducao(reverterEfeitosProducao(prev.estoque, antiga), producao);
        return {
          ...prev,
          estoque,
          producoes: prev.producoes.map((p) => (p.id === producaoEditandoId ? producao : p)),
        };
      }

      return {
        ...prev,
        estoque: aplicarEfeitosProducao(prev.estoque, producao),
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
  const valorEstoque = sumBy(saldoEstoque, (i) => i.quantidade * i.valorUnit);
  const lancamentosEstoque = [...data.estoque]
    .filter((e) => e.quantidade > 0)
    .sort((a, b) => {
      const dataCmp = (b.data ?? '').localeCompare(a.data ?? '');
      return dataCmp !== 0 ? dataCmp : b.id - a.id;
    });
  const saldoCaixa = calcSaldo(data.movimentosCaixa);
  const saldoBanco = calcSaldo(data.movimentosBanco);
  const valorPatrimonio = sumBy(data.patrimonio, (p) => p.valorAtual);
  const produtosAcabados = saldoEstoque.filter((e) => e.tipo === 'ProdutoAcabado');
  const produtoSelecionado = produtosAcabados.find((p) => p.nome === produtoPreco);
  const custoProduto = produtoSelecionado ? produtoSelecionado.valorUnit : 0;
  const precoSugerido = custoProduto * (1 + margemLucro / 100);

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-[#2c2118] flex items-center justify-center text-amber-200">
        Carregando ChocoGest...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-chocolate text-white" style={chocolateBgStyle}>
      <header className="bg-amber-950/90 backdrop-blur py-5 border-b border-amber-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="text-5xl">🍫</div>
            <div>
              <h1 className="text-3xl font-bold">ChocoGest</h1>
              <p className="text-amber-300 text-sm">Fábrica de Chocolate Bean-to-Bar • Bahia</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Btn onClick={() => exportBackup(data)}>📤 Exportar Backup</Btn>
            <Btn variant="secondary" onClick={() => fileInputRef.current?.click()}>
              📥 Importar Backup
            </Btn>
            <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImportBackup} />
            <Btn variant="secondary" onClick={() => gerarPdfDashboard(data)}>
              📄 PDF Resumo
            </Btn>
          </div>
        </div>
      </header>

      <div className="flex max-w-7xl mx-auto">
        <aside className="w-72 shrink-0 bg-[#3a2c22]/95 min-h-[calc(100vh-80px)] p-4 border-r border-amber-800 hidden lg:block">
          <nav className="space-y-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all ${
                  activeTab === tab.id
                    ? 'bg-amber-600 text-white shadow-lg'
                    : 'hover:bg-amber-900/60 text-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Mobile tabs */}
        <div className="lg:hidden w-full px-4 py-2 overflow-x-auto flex gap-2 border-b border-amber-800 bg-[#3a2c22]">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 px-3 py-2 rounded-lg text-xs ${
                activeTab === tab.id ? 'bg-amber-600' : 'bg-amber-900/40'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <main className="flex-1 p-6 lg:p-10 min-w-0">
          {/* DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div>
              <SectionTitle action={<Btn variant="secondary" onClick={() => gerarPdfDashboard(data)}>📄 PDF</Btn>}>
                Dashboard
              </SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
                {[
                  { label: 'Valor Estoque', value: formatCurrency(valorEstoque), icon: '📦' },
                  { label: 'Total Vendas', value: formatCurrency(sumBy(data.vendas, (v) => v.total)), icon: '🛒' },
                  { label: 'Saldo Caixa', value: formatCurrency(saldoCaixa), icon: '💰' },
                  { label: 'Saldo Banco', value: formatCurrency(saldoBanco), icon: '🏦' },
                  { label: 'Patrimônio', value: formatCurrency(valorPatrimonio), icon: '🏛️' },
                  { label: 'Compras', value: formatCurrency(sumBy(data.compras, (c) => c.total)), icon: '🚚' },
                  { label: 'Produções', value: data.producoes.length.toString(), icon: '🏭' },
                  { label: 'Itens Estoque', value: saldoEstoque.length.toString(), icon: '📋' },
                ].map((kpi) => (
                  <Card key={kpi.label}>
                    <div className="text-2xl mb-1">{kpi.icon}</div>
                    <div className="text-amber-300 text-sm">{kpi.label}</div>
                    <div className="text-xl font-bold text-amber-50">{kpi.value}</div>
                  </Card>
                ))}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <h3 className="font-semibold text-amber-200 mb-3">Últimas Vendas</h3>
                  {data.vendas.slice(-5).reverse().map((v) => (
                    <div key={v.id} className="flex justify-between py-2 border-b border-amber-800/30 text-sm">
                      <span>{formatDate(v.data)} — {v.cliente}</span>
                      <span className="text-amber-300">{formatCurrency(v.total)}</span>
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
                <h3 className="font-semibold mb-4 text-amber-200">Novo Item</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <DateField
                    label="Data da operação"
                    value={novoItem.data}
                    onChange={(data) => setNovoItem((p) => ({ ...p, data }))}
                  />
                  <Field label="Nome">
                    <input className={inputCls} value={novoItem.nome} onChange={(e) => setNovoItem((p) => ({ ...p, nome: e.target.value }))} />
                  </Field>
                  <Field label="Tipo">
                    <select className={inputCls} value={novoItem.tipo} onChange={(e) => setNovoItem((p) => ({ ...p, tipo: e.target.value as TipoItem }))}>
                      {TIPOS_ITEM.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </Field>
                  <Field label="Quantidade">
                    <input type="number" className={inputCls} value={novoItem.quantidade} onChange={(e) => setNovoItem((p) => ({ ...p, quantidade: +e.target.value }))} />
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
                </p>
                <Btn className="mt-4" onClick={adicionarItemEstoque}>Adicionar ao Estoque</Btn>
              </Card>
              <Card className="mb-6">
                <h4 className="text-amber-200 font-medium mb-4">Saldo disponível</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead>
                      <tr className="text-amber-300 border-b border-amber-700">
                        <th className="text-left py-2">Nome</th>
                        <th className="text-left py-2">Tipo</th>
                        <th className="text-right py-2">Qtd Total</th>
                        <th className="text-right py-2">Valor Médio</th>
                        <th className="text-right py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {saldoEstoque.map((item) => (
                        <tr key={item.nome} className="border-b border-amber-800/30">
                          <td className="py-2">{item.nome}</td>
                          <td className="py-2 text-amber-300">{item.tipo}</td>
                          <td className="py-2 text-right">{item.quantidade} {item.unidade}</td>
                          <td className="py-2 text-right">{formatCurrency(item.valorUnit)}</td>
                          <td className="py-2 text-right">{formatCurrency(item.quantidade * item.valorUnit)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold text-amber-100">
                        <td colSpan={4} className="py-3 text-right">Valor total em estoque:</td>
                        <td className="py-3 text-right">{formatCurrency(valorEstoque)}</td>
                      </tr>
                    </tfoot>
                  </table>
                  {saldoEstoque.length === 0 && <p className="text-amber-400/60 py-4">Nenhum saldo disponível.</p>}
                </div>
              </Card>
              <Card>
                <h4 className="text-amber-200 font-medium mb-4">Lançamentos</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead>
                      <tr className="text-amber-300 border-b border-amber-700">
                        <th className="text-left py-2">Data</th>
                        <th className="text-left py-2">Nome</th>
                        <th className="text-left py-2">Tipo</th>
                        <th className="text-right py-2">Qtd</th>
                        <th className="text-right py-2">Valor Unit.</th>
                        <th className="text-right py-2">Total</th>
                        <th className="py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lancamentosEstoque.map((item) => (
                        <tr key={item.id} className="border-b border-amber-800/30">
                          <td className="py-2 text-amber-300">{formatDate(item.data ?? '')}</td>
                          <td className="py-2">{item.nome}</td>
                          <td className="py-2 text-amber-300">{item.tipo}</td>
                          <td className="py-2 text-right">{item.quantidade} {item.unidade}</td>
                          <td className="py-2 text-right">{formatCurrency(item.valorUnit)}</td>
                          <td className="py-2 text-right">{formatCurrency(item.quantidade * item.valorUnit)}</td>
                          <td className="py-2 text-right">
                            <Btn variant="danger" onClick={() => removerItemEstoque(item.id)}>✕</Btn>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {lancamentosEstoque.length === 0 && <p className="text-amber-400/60 py-4">Nenhum lançamento registrado.</p>}
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
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead>
                      <tr className="text-amber-300 border-b border-amber-700">
                        <th className="text-left py-2">Data</th>
                        <th className="text-left py-2">Fornecedor</th>
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
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                  <Field label="Produto">
                    <select
                      className={inputCls}
                      value={itemVenda.nome}
                      onChange={(e) => {
                        const nome = e.target.value;
                        const saldo = produtosParaVenda.find((p) => p.nome === nome);
                        setItemVenda({
                          nome,
                          quantidade: 1,
                          valorUnit: saldo?.valorUnit ?? 0,
                        });
                      }}
                    >
                      <option value="">Selecione produto...</option>
                      {produtosParaVenda.map((e) => (
                        <option key={e.nome} value={e.nome}>
                          {e.nome} ({e.quantidade} {e.unidade})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Quantidade">
                    <input type="number" className={inputCls} value={itemVenda.quantidade} onChange={(e) => setItemVenda({ ...itemVenda, quantidade: +e.target.value })} />
                  </Field>
                  <Field label="Preço (R$)">
                    <input type="number" step="0.01" className={inputCls} value={itemVenda.valorUnit} onChange={(e) => setItemVenda({ ...itemVenda, valorUnit: +e.target.value })} />
                  </Field>
                </div>
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
              <Card>
                <h4 className="text-amber-200 font-medium mb-4">Histórico de vendas</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead>
                      <tr className="text-amber-300 border-b border-amber-700">
                        <th className="text-left py-2">Data</th>
                        <th className="text-left py-2">Cliente</th>
                        <th className="text-left py-2">Pagamento</th>
                        <th className="text-right py-2">Total</th>
                        <th className="text-right py-2 w-32">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.vendas.slice().reverse().map((v) => (
                        <tr
                          key={v.id}
                          className={`border-b border-amber-800/30 ${vendaEditandoId === v.id ? 'bg-amber-900/30' : ''}`}
                        >
                          <td className="py-2">{formatDate(v.data)}</td>
                          <td className="py-2">{v.cliente}</td>
                          <td className="py-2">{v.formaPagamento}</td>
                          <td className="py-2 text-right">{formatCurrency(v.total)}</td>
                          <td className="py-2 text-right whitespace-nowrap">
                            <Btn variant="secondary" onClick={() => editarVenda(v)}>Editar</Btn>
                            {' '}
                            <Btn variant="danger" onClick={() => removerVenda(v.id)}>Excluir</Btn>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {data.vendas.length === 0 && <p className="text-amber-400/60 py-4">Nenhuma venda registrada.</p>}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                  <DateField
                    label="Data da produção"
                    value={novaProducao.data}
                    onChange={(data) => setNovaProducao((p) => ({ ...p, data }))}
                  />
                  <Field label="Lote"><input className={inputCls} value={novaProducao.lote} onChange={(e) => setNovaProducao((p) => ({ ...p, lote: e.target.value }))} /></Field>
                  <Field label="Produto"><input className={inputCls} value={novaProducao.produto} onChange={(e) => setNovaProducao((p) => ({ ...p, produto: e.target.value }))} /></Field>
                  <Field label="Quantidade"><input type="number" className={inputCls} value={novaProducao.quantidade} onChange={(e) => setNovaProducao((p) => ({ ...p, quantidade: +e.target.value }))} /></Field>
                  <Field label="Unidade"><input className={inputCls} value={novaProducao.unidade} onChange={(e) => setNovaProducao((p) => ({ ...p, unidade: e.target.value }))} /></Field>
                </div>
                <h4 className="text-amber-200 mb-2">Ingredientes</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                  <Field label="Ingrediente">
                    <select className={inputCls} value={ingredienteForm.nome} onChange={(e) => {
                      const item = saldoEstoque.find((i) => i.nome === e.target.value);
                      setIngredienteForm({ nome: e.target.value, quantidade: 0, valorUnit: item?.valorUnit ?? 0 });
                    }}>
                      <option value="">Selecione...</option>
                      {saldoEstoque.filter((e) => e.tipo === 'MateriaPrima').map((e) => <option key={e.nome} value={e.nome}>{e.nome} ({e.quantidade} {e.unidade})</option>)}
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
                  <div className="mt-3 text-sm space-y-1">
                    {novaProducao.ingredientes.map((ing, idx) => (
                      <div key={idx} className="flex justify-between items-center text-amber-200 gap-2">
                        <span>{ing.nome}: {ing.quantidade} {ing.unidade ?? 'kg'} — {formatCurrency(ing.quantidade * ing.valorUnit)}</span>
                        <Btn variant="danger" className="px-2 py-1" onClick={() => removerIngredienteLista(idx)}>✕</Btn>
                      </div>
                    ))}
                  </div>
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
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead><tr className="text-amber-300 border-b border-amber-700">
                      <th className="text-left py-2">Data</th><th className="text-left py-2">Lote</th>
                      <th className="text-left py-2">Produto</th><th className="text-right py-2">Qtd</th>
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
            </div>
          )}

          {/* PRECIFICAÇÃO */}
          {activeTab === 'precificacao' && (
            <div>
              <SectionTitle>Precificação</SectionTitle>
              <Card>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <Field label="Produto Acabado">
                    <select className={inputCls} value={produtoPreco} onChange={(e) => setProdutoPreco(e.target.value)}>
                      <option value="">Selecione...</option>
                      {produtosAcabados.map((p) => <option key={p.nome} value={p.nome}>{p.nome}</option>)}
                    </select>
                  </Field>
                  <Field label="Margem de Lucro (%)">
                    <input type="number" className={inputCls} value={margemLucro} onChange={(e) => setMargemLucro(+e.target.value)} />
                  </Field>
                </div>
                {produtoSelecionado && (
                  <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-[#2c2118] rounded-xl p-4">
                      <div className="text-amber-300 text-sm">Custo Unitário</div>
                      <div className="text-2xl font-bold">{formatCurrency(custoProduto)}</div>
                    </div>
                    <div className="bg-[#2c2118] rounded-xl p-4">
                      <div className="text-amber-300 text-sm">Margem ({margemLucro}%)</div>
                      <div className="text-2xl font-bold">{formatCurrency(custoProduto * margemLucro / 100)}</div>
                    </div>
                    <div className="bg-amber-700/30 rounded-xl p-4 border border-amber-500">
                      <div className="text-amber-200 text-sm">Preço Sugerido</div>
                      <div className="text-3xl font-bold text-amber-50">{formatCurrency(precoSugerido)}</div>
                    </div>
                  </div>
                )}
                {produtosAcabados.length === 0 && (
                  <p className="mt-4 text-amber-400/60">Cadastre produtos acabados no estoque ou via produção.</p>
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
                <div className="overflow-x-auto">
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
                <div className="overflow-x-auto">
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
                <div className="overflow-x-auto">
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