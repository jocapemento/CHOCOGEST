/**
 * Entrega e pago em vendas.
 * Estoque baixa na Retirada ou Entregue. Recebimento só entra quando está pago.
 */
import assert from 'node:assert/strict';
import { normalizeAppData } from '../lib/storage.ts';
import { EMPTY_DATA } from '../lib/types.ts';
import {
  entregaAguardandoConfirmacao,
  isVendaFinalizada,
  isVendaPendente,
  listarVendasPendentes,
  normalizarEntregaVenda,
  normalizarPagoVenda,
  resumoAEntregar,
  resumoAReceber,
  statusPermitidoVenda,
  vendaBaixaEstoque,
  vendaLancaRecebimento,
  vendaReservaEstoque,
} from '../lib/vendas.ts';

function ok(cond, msg) {
  assert.equal(cond, true, msg);
}

ok(normalizarEntregaVenda(undefined, 'concluida') === 'entregue', 'concluída antiga conta como entregue');
ok(normalizarEntregaVenda(undefined, 'em_processamento') === 'a_entregar', 'pendente antiga conta como a entregar');
ok(normalizarEntregaVenda('retirada', 'concluida') === 'retirada', 'retirada explícita permanece');
ok(normalizarEntregaVenda('correio', 'concluida') === 'entregue', 'entrega inválida cai no padrão');

ok(normalizarPagoVenda(undefined, 'concluida') === 'pago', 'concluída antiga conta como paga');
ok(normalizarPagoVenda(undefined, 'em_processamento') === 'a_receber', 'pendente antiga fica a receber');
ok(normalizarPagoVenda('a_receber', 'concluida') === 'a_receber', 'a receber explícito permanece');
ok(normalizarPagoVenda('fiado', 'em_processamento') === 'a_receber', 'pago inválido cai no padrão');

const concluidaPaga = { status: 'concluida', entrega: 'retirada', pago: 'pago' };
const concluidaAberta = { status: 'concluida', entrega: 'a_entregar', pago: 'a_receber' };
const pendentePaga = { status: 'em_processamento', entrega: 'retirada', pago: 'pago' };
const pendenteAberta = { status: 'em_processamento', entrega: 'a_entregar', pago: 'a_receber' };

const entregueAReceber = { status: 'em_processamento', entrega: 'entregue', pago: 'a_receber' };

ok(vendaBaixaEstoque(concluidaPaga) && vendaLancaRecebimento(concluidaPaga), 'concluída paga: estoque e recebimento');
ok(!vendaBaixaEstoque(concluidaAberta) && !vendaLancaRecebimento(concluidaAberta), 'a entregar não baixa estoque, mesmo concluída');
ok(vendaBaixaEstoque(pendentePaga) && vendaLancaRecebimento(pendentePaga), 'retirada pendente: baixa estoque e lança recebimento');
ok(!vendaBaixaEstoque(pendenteAberta) && !vendaLancaRecebimento(pendenteAberta), 'a entregar e a receber: reserva, sem recebimento');
ok(vendaBaixaEstoque(entregueAReceber) && !vendaLancaRecebimento(entregueAReceber), 'entregue a receber: baixa estoque sem recebimento');
ok(vendaReservaEstoque(pendenteAberta) && !vendaReservaEstoque(entregueAReceber), 'só a entregar reserva');
ok(!vendaReservaEstoque(pendentePaga), 'retirada não reserva');

const resumo = resumoAReceber([
  { ...concluidaAberta, total: 80 },
  { ...pendenteAberta, total: 20.5 },
  { ...concluidaPaga, total: 100 },
  { ...pendentePaga, total: 40 },
]);
ok(resumo.quantidade === 2, 'a receber conta pendente e concluída em aberto');
ok(resumo.valorTotal === 100.5, 'valor em aberto soma só o que não foi pago');

ok(entregaAguardandoConfirmacao(concluidaAberta), 'concluída a entregar espera confirmação');
ok(entregaAguardandoConfirmacao(pendenteAberta), 'pendente a entregar espera confirmação');
ok(!entregaAguardandoConfirmacao(concluidaPaga), 'retirada não pede confirmação de entrega');
ok(!entregaAguardandoConfirmacao({ status: 'concluida', entrega: 'entregue' }), 'entregue já está confirmada');

const aEntregar = resumoAEntregar([
  { ...concluidaAberta, total: 80 },
  { ...pendenteAberta, total: 20.5 },
  { ...concluidaPaga, total: 100 },
  { status: 'concluida', entrega: 'entregue', pago: 'pago', total: 15 },
]);
ok(aEntregar.quantidade === 2, 'a entregar conta só quem ainda não confirmou');
ok(aEntregar.valorTotal === 100.5, 'valor a entregar soma as entregas em aberto');

ok(!isVendaFinalizada(concluidaAberta), 'concluída a entregar e a receber não está finalizada');
ok(isVendaPendente(concluidaAberta), 'concluída com pendência continua pendente');
ok(isVendaPendente(pendentePaga), 'pendente paga e retirada continua pendente');
ok(
  isVendaFinalizada({ status: 'concluida', entrega: 'entregue', pago: 'pago' }),
  'entregue e paga está finalizada'
);
ok(
  isVendaFinalizada({ status: 'concluida', entrega: 'retirada', pago: 'pago' }),
  'retirada e paga está finalizada'
);

const lista = listarVendasPendentes([
  { ...concluidaAberta, id: 1, data: '2026-07-03' },
  { ...pendentePaga, id: 2, data: '2026-07-02' },
  { status: 'concluida', entrega: 'retirada', pago: 'pago', id: 3, data: '2026-07-04' },
  { status: 'concluida', entrega: 'entregue', pago: 'a_receber', id: 4, data: '2026-07-01' },
]);
ok(lista.map((v) => v.id).join(',') === '1,2,4', 'pendentes incluem entrega ou pagamento em aberto');

ok(
  statusPermitidoVenda({ entrega: 'a_entregar', pago: 'pago' }, 'concluida') === 'em_processamento',
  'não conclui com entrega pendente'
);
ok(
  statusPermitidoVenda({ entrega: 'retirada', pago: 'a_receber' }, 'concluida') === 'em_processamento',
  'não conclui com pagamento pendente'
);
ok(
  statusPermitidoVenda({ entrega: 'retirada', pago: 'pago' }, 'concluida') === 'concluida',
  'conclui quando entrega e pagamento estão confirmados'
);
ok(
  statusPermitidoVenda({ entrega: 'entregue', pago: 'a_receber' }, 'concluida', true) === 'concluida',
  'venda já concluída com pendência antiga mantém o status gravado'
);

function vendaNibs(parcial) {
  return {
    id: 1,
    data: '2026-07-01',
    cliente: 'Ana',
    formaPagamento: 'Pix',
    status: 'em_processamento',
    entrega: 'entregue',
    pago: 'a_receber',
    total: 20,
    itens: [
      { id: 1, nome: 'Nibs', tipo: 'ProdutoAcabado', quantidade: 2, unidade: 'un', valorUnit: 10 },
    ],
    ...parcial,
  };
}

function estoqueNibs(quantidade) {
  return [
    {
      id: 1,
      nome: 'Nibs',
      tipo: 'ProdutoAcabado',
      quantidade,
      unidade: 'un',
      valorUnit: 5,
    },
  ];
}

function saldoNibs(data) {
  return data.estoque.find((item) => item.nome === 'Nibs')?.quantidade ?? 0;
}

const entregueAntiga = normalizeAppData({
  ...EMPTY_DATA,
  estoque: estoqueNibs(10),
  vendas: [vendaNibs()],
});
ok(entregueAntiga.vendas[0].estoqueBaixado === true, 'entrega antiga sem flag passa a contar como baixada');
ok(saldoNibs(entregueAntiga) === 8, 'entrega antiga baixa 2 un do estoque');

const deNovo = normalizeAppData(entregueAntiga);
ok(saldoNibs(deNovo) === 8, 'carregar de novo não baixa outra vez');

const aEntregarNova = normalizeAppData({
  ...EMPTY_DATA,
  estoque: estoqueNibs(10),
  vendas: [vendaNibs({ entrega: 'a_entregar' })],
});
ok(aEntregarNova.vendas[0].estoqueBaixado === false, 'a entregar não marca baixa');
ok(saldoNibs(aEntregarNova) === 10, 'a entregar não mexe no estoque');

const concluidaJaBaixada = normalizeAppData({
  ...EMPTY_DATA,
  estoque: estoqueNibs(8),
  vendas: [vendaNibs({ status: 'concluida', entrega: 'entregue', pago: 'pago' })],
});
ok(concluidaJaBaixada.vendas[0].estoqueBaixado === true, 'concluída antiga conta como estoque já baixado');
ok(saldoNibs(concluidaJaBaixada) === 8, 'concluída antiga não baixa de novo');

const retiradaPendente = normalizeAppData({
  ...EMPTY_DATA,
  estoque: estoqueNibs(10),
  vendas: [vendaNibs({ entrega: 'retirada' })],
});
ok(saldoNibs(retiradaPendente) === 8, 'retirada pendente também baixa o estoque');

console.log('OK — entrega e pago em vendas');
