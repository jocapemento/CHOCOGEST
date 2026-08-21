import type { CartaoModel, Compra, QuitacaoCartao } from './types';
import { normalizeDateISO } from './format';

export const CARTAO_NAO_IDENTIFICADO = 'Não identificado';

export interface ParcelaMensalCartao {
  cartao: string;
  mes: string;
  valor: number;
}

export interface CompraCartaoDetalhe {
  id: number;
  data: string;
  fornecedor: string;
  cartao: string;
  parcelas: number;
  total: number;
  valorParcela: number;
  mesInicial: string | null;
  mesFinal: string | null;
}

function semAcento(valor: string): string {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function isPagamentoCartao(forma: string | null | undefined): boolean {
  const n = semAcento(forma ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return n === 'cartao' || n === 'credito' || n === 'cartao de credito' || n === 'cartao credito';
}

export function nomesCartaoIguais(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
}

/** Usa o nome cadastrado quando houver correspondência (trim/caixa). */
export function nomeCartaoDaCompra(compra: Compra, cartoes: CartaoModel[] = []): string | null {
  const salvo = compra.cartao?.trim();
  if (salvo) {
    const match = cartoes.find((c) => nomesCartaoIguais(c.nome, salvo));
    return (match?.nome ?? salvo).trim();
  }
  if (cartoes.length === 1) return cartoes[0].nome.trim() || cartoes[0].nome;
  if (cartoes.length === 0) return CARTAO_NAO_IDENTIFICADO;
  return CARTAO_NAO_IDENTIFICADO;
}

export function resolverCartaoPorId(cartoes: CartaoModel[], cartaoId: number): CartaoModel | undefined {
  return cartoes.find((c) => c.id === cartaoId) ?? cartoes[0];
}

function parseDataCompra(data: string): { year: number; month: number } | null {
  const iso = normalizeDateISO(data, '');
  const match = iso.match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || year < 1 || month < 1 || month > 12) return null;
  return { year, month };
}

/** Soma meses a partir do mês/ano da data da compra (1ª parcela = mês inicial). */
export function mesParcelaCompra(dataCompra: string, indiceParcela: number): string | null {
  const inicio = parseDataCompra(dataCompra);
  if (!inicio || indiceParcela < 0) return null;

  const totalMeses = inicio.year * 12 + (inicio.month - 1) + indiceParcela;
  const year = Math.floor(totalMeses / 12);
  const month = (totalMeses % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

function distribuirValorParcelas(total: number, parcelas: number): number[] {
  const centavosTotal = Math.round(total * 100);
  const base = Math.floor(centavosTotal / parcelas);
  const resto = centavosTotal - base * parcelas;
  const valores = Array.from({ length: parcelas }, () => base / 100);
  if (parcelas > 0) {
    valores[parcelas - 1] += resto / 100;
  }
  return valores;
}

export function calcularParcelasMensais(
  compras: Compra[],
  cartoes: CartaoModel[] = []
): ParcelaMensalCartao[] {
  const map = new Map<string, number>();

  for (const compra of compras) {
    if (!isPagamentoCartao(compra.formaPagamento)) continue;
    const cartao = nomeCartaoDaCompra(compra, cartoes);
    if (!cartao) continue;
    if (!parseDataCompra(compra.data)) continue;

    const parcelas = Math.max(1, Math.floor(compra.parcelas) || 1);
    const valoresParcela = distribuirValorParcelas(compra.total, parcelas);

    for (let i = 0; i < parcelas; i++) {
      const mes = mesParcelaCompra(compra.data, i);
      if (!mes) continue;
      const key = `${cartao}\0${mes}`;
      map.set(key, (map.get(key) ?? 0) + valoresParcela[i]);
    }
  }

  return Array.from(map.entries())
    .map(([key, valor]) => {
      const [cartao, mes] = key.split('\0');
      return { cartao, mes, valor };
    })
    .sort((a, b) => a.mes.localeCompare(b.mes) || a.cartao.localeCompare(b.cartao, 'pt-BR'));
}

export function listarComprasCartao(
  compras: Compra[],
  cartoes: CartaoModel[] = []
): CompraCartaoDetalhe[] {
  const detalhes: CompraCartaoDetalhe[] = [];

  for (const compra of compras) {
    if (!isPagamentoCartao(compra.formaPagamento)) continue;
    const cartao = nomeCartaoDaCompra(compra, cartoes);
    if (!cartao) continue;

    const parcelas = Math.max(1, Math.floor(compra.parcelas) || 1);
    const valoresParcela = distribuirValorParcelas(compra.total, parcelas);

    detalhes.push({
      id: compra.id,
      data: compra.data,
      fornecedor: compra.fornecedor,
      cartao,
      parcelas,
      total: compra.total,
      valorParcela: valoresParcela[0] ?? 0,
      mesInicial: mesParcelaCompra(compra.data, 0),
      mesFinal: mesParcelaCompra(compra.data, parcelas - 1),
    });
  }

  return detalhes.sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id);
}

/** Cartões cadastrados + nomes órfãos que aparecem nas parcelas (ex.: Não identificado). */
export function cartoesParaExibicao(
  cartoes: CartaoModel[],
  parcelas: ParcelaMensalCartao[]
): CartaoModel[] {
  const cadastrados = cartoes.map((c) => ({ ...c, nome: c.nome.trim() || c.nome }));
  const conhecidos = new Set(cadastrados.map((c) => c.nome.trim().toLowerCase()));
  const extras = [...new Set(parcelas.map((p) => p.cartao))]
    .filter((nome) => nome.trim() && !conhecidos.has(nome.trim().toLowerCase()))
    .map((nome, idx) => ({ id: -idx - 1, nome }));
  return [...cadastrados, ...extras];
}

export function mesesComParcelas(parcelas: ParcelaMensalCartao[]): string[] {
  return [...new Set(parcelas.map((p) => p.mes))].sort();
}

export function valorParcelaNoMes(
  parcelas: ParcelaMensalCartao[],
  mes: string,
  cartao: string
): number {
  return parcelas
    .filter((p) => p.mes === mes && nomesCartaoIguais(p.cartao, cartao))
    .reduce((acc, p) => acc + p.valor, 0);
}

export function totalParcelasCartao(parcelas: ParcelaMensalCartao[], cartao: string): number {
  return parcelas
    .filter((p) => nomesCartaoIguais(p.cartao, cartao))
    .reduce((acc, p) => acc + p.valor, 0);
}

export function totalParcelasMes(parcelas: ParcelaMensalCartao[], mes: string): number {
  return parcelas.filter((p) => p.mes === mes).reduce((acc, p) => acc + p.valor, 0);
}

export function gastoTotalCartao(compras: Compra[], cartao: string, cartoes: CartaoModel[] = []): number {
  return compras.reduce((acc, compra) => {
    if (!isPagamentoCartao(compra.formaPagamento)) return acc;
    const nome = nomeCartaoDaCompra(compra, cartoes);
    if (!nome || !nomesCartaoIguais(nome, cartao)) return acc;
    return acc + compra.total;
  }, 0);
}

/** Preenche o cartão em compras no cartão sem nome, quando dá para identificar. */
export function vincularCartaoNasCompras(compras: Compra[], cartoes: CartaoModel[]): Compra[] {
  return compras.map((compra) => {
    if (!isPagamentoCartao(compra.formaPagamento)) return compra;
    const nome = nomeCartaoDaCompra(compra, cartoes);
    if (!nome || nome === CARTAO_NAO_IDENTIFICADO) return compra;
    if (nomesCartaoIguais(compra.cartao, nome)) return compra;
    return { ...compra, cartao: nome };
  });
}

export function arredondarDinheiro(valor: number): number {
  return Math.round((Number(valor) || 0) * 100) / 100;
}

export function totalQuitadoCompra(quitacoes: QuitacaoCartao[], compraId: number): number {
  return arredondarDinheiro(
    quitacoes.filter((q) => q.compraId === compraId).reduce((acc, q) => acc + q.valor, 0)
  );
}

export type StatusEmprestimoCartao = 'em_aberto' | 'parcial' | 'quitado';

export const STATUS_EMPRESTIMO_LABEL: Record<StatusEmprestimoCartao, string> = {
  em_aberto: 'Em aberto',
  parcial: 'Parcial',
  quitado: 'Quitado',
};

export interface EmprestimoCartao {
  compraId: number;
  data: string;
  fornecedor: string;
  cartao: string;
  parcelas: number;
  valorParcela: number;
  total: number;
  pago: number;
  saldo: number;
  status: StatusEmprestimoCartao;
  mesInicial: string | null;
  mesFinal: string | null;
}

export function statusEmprestimo(total: number, pago: number): StatusEmprestimoCartao {
  const saldo = arredondarDinheiro(total - pago);
  if (saldo <= 0) return 'quitado';
  if (pago > 0) return 'parcial';
  return 'em_aberto';
}

export function listarEmprestimosCartao(
  compras: Compra[],
  quitacoes: QuitacaoCartao[],
  cartoes: CartaoModel[] = []
): EmprestimoCartao[] {
  const emprestimos: EmprestimoCartao[] = [];

  for (const compra of compras) {
    if (!isPagamentoCartao(compra.formaPagamento)) continue;
    const cartao = nomeCartaoDaCompra(compra, cartoes);
    if (!cartao) continue;

    const parcelas = Math.max(1, Math.floor(compra.parcelas) || 1);
    const valoresParcela = distribuirValorParcelas(compra.total, parcelas);
    const total = arredondarDinheiro(compra.total);
    const pago = Math.min(total, totalQuitadoCompra(quitacoes, compra.id));
    const saldo = arredondarDinheiro(Math.max(0, total - pago));

    emprestimos.push({
      compraId: compra.id,
      data: compra.data,
      fornecedor: compra.fornecedor,
      cartao,
      parcelas,
      valorParcela: valoresParcela[0] ?? 0,
      total,
      pago,
      saldo,
      status: statusEmprestimo(total, pago),
      mesInicial: mesParcelaCompra(compra.data, 0),
      mesFinal: mesParcelaCompra(compra.data, parcelas - 1),
    });
  }

  return emprestimos.sort((a, b) => {
    const rank = (s: StatusEmprestimoCartao) => (s === 'quitado' ? 1 : 0);
    const r = rank(a.status) - rank(b.status);
    if (r !== 0) return r;
    return b.data.localeCompare(a.data) || b.compraId - a.compraId;
  });
}

export function saldoDevedorCartao(emprestimos: EmprestimoCartao[], cartao: string): number {
  return arredondarDinheiro(
    emprestimos
      .filter((e) => nomesCartaoIguais(e.cartao, cartao))
      .reduce((acc, e) => acc + e.saldo, 0)
  );
}

export function totalEmprestadoCartao(emprestimos: EmprestimoCartao[], cartao: string): number {
  return arredondarDinheiro(
    emprestimos
      .filter((e) => nomesCartaoIguais(e.cartao, cartao))
      .reduce((acc, e) => acc + e.total, 0)
  );
}

export function totalQuitadoCartao(emprestimos: EmprestimoCartao[], cartao: string): number {
  return arredondarDinheiro(
    emprestimos
      .filter((e) => nomesCartaoIguais(e.cartao, cartao))
      .reduce((acc, e) => acc + e.pago, 0)
  );
}

export function saldoDevedorTotal(emprestimos: EmprestimoCartao[]): number {
  return arredondarDinheiro(emprestimos.reduce((acc, e) => acc + e.saldo, 0));
}

export function totalEmprestadoGeral(emprestimos: EmprestimoCartao[]): number {
  return arredondarDinheiro(emprestimos.reduce((acc, e) => acc + e.total, 0));
}

/**
 * Parcelas ainda em aberto: quitações abatem as parcelas mais antigas de cada empréstimo.
 */
export function calcularParcelasEmAberto(
  compras: Compra[],
  quitacoes: QuitacaoCartao[],
  cartoes: CartaoModel[] = []
): ParcelaMensalCartao[] {
  const map = new Map<string, number>();

  for (const compra of compras) {
    if (!isPagamentoCartao(compra.formaPagamento)) continue;
    const cartao = nomeCartaoDaCompra(compra, cartoes);
    if (!cartao) continue;
    if (!parseDataCompra(compra.data)) continue;

    const parcelas = Math.max(1, Math.floor(compra.parcelas) || 1);
    const valoresParcela = distribuirValorParcelas(compra.total, parcelas);
    let restantePago = totalQuitadoCompra(quitacoes, compra.id);

    for (let i = 0; i < parcelas; i++) {
      const original = valoresParcela[i];
      const aplicado = Math.min(restantePago, original);
      restantePago = arredondarDinheiro(restantePago - aplicado);
      const devido = arredondarDinheiro(original - aplicado);
      if (devido <= 0) continue;
      const mes = mesParcelaCompra(compra.data, i);
      if (!mes) continue;
      const key = `${cartao}\0${mes}`;
      map.set(key, arredondarDinheiro((map.get(key) ?? 0) + devido));
    }
  }

  return Array.from(map.entries())
    .map(([key, valor]) => {
      const [cartao, mes] = key.split('\0');
      return { cartao, mes, valor };
    })
    .sort((a, b) => a.mes.localeCompare(b.mes) || a.cartao.localeCompare(b.cartao, 'pt-BR'));
}

export function referenciaQuitacao(id: number): string {
  return `quitacao-${id}`;
}
