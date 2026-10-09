/**
 * Entrega e pago em vendas (espelha lib/vendas.ts).
 * Estoque baixa na concluída. Recebimento só entra quando está pago.
 */

function normalizarEntregaVenda(entrega, status) {
  if (entrega === 'retirada' || entrega === 'a_entregar' || entrega === 'entregue') return entrega;
  return status === 'em_processamento' ? 'a_entregar' : 'entregue';
}

function normalizarPagoVenda(pago, status) {
  if (pago === 'pago' || pago === 'a_receber') return pago;
  return status === 'em_processamento' ? 'a_receber' : 'pago';
}

function isVendaConcluida(venda) {
  return (venda.status ?? 'concluida') === 'concluida';
}

function isVendaPaga(venda) {
  return normalizarPagoVenda(venda.pago, venda.status) === 'pago';
}

function vendaBaixaEstoque(venda) {
  return isVendaConcluida(venda);
}

function vendaLancaRecebimento(venda) {
  return isVendaPaga(venda);
}

function entregaAguardandoConfirmacao(venda) {
  return normalizarEntregaVenda(venda.entrega, venda.status) === 'a_entregar';
}

function vendaTemPendenciaConfirmacao(venda) {
  return entregaAguardandoConfirmacao(venda) || !isVendaPaga(venda);
}

function isVendaFinalizada(venda) {
  return isVendaConcluida(venda) && !vendaTemPendenciaConfirmacao(venda);
}

function isVendaPendente(venda) {
  return !isVendaFinalizada(venda);
}

function statusPermitidoVenda(venda, statusDesejado, jaEraConcluida = false) {
  if (statusDesejado !== 'concluida') return 'em_processamento';
  if (!vendaTemPendenciaConfirmacao({ ...venda, status: statusDesejado })) return 'concluida';
  return jaEraConcluida ? 'concluida' : 'em_processamento';
}

function listarVendasPendentes(vendas) {
  return vendas.filter(isVendaPendente);
}

function resumoAEntregar(vendas) {
  const abertas = vendas.filter((v) => entregaAguardandoConfirmacao(v));
  return {
    quantidade: abertas.length,
    valorTotal: Math.round(abertas.reduce((acc, v) => acc + v.total, 0) * 100) / 100,
  };
}

function resumoAReceber(vendas) {
  const abertas = vendas.filter((v) => !isVendaPaga(v));
  return {
    quantidade: abertas.length,
    valorTotal: Math.round(abertas.reduce((acc, v) => acc + v.total, 0) * 100) / 100,
  };
}

function assert(cond, msg) {
  if (!cond) {
    console.error('FALHOU:', msg);
    process.exit(1);
  }
}

assert(normalizarEntregaVenda(undefined, 'concluida') === 'entregue', 'concluída antiga conta como entregue');
assert(normalizarEntregaVenda(undefined, 'em_processamento') === 'a_entregar', 'pendente antiga conta como a entregar');
assert(normalizarEntregaVenda('retirada', 'concluida') === 'retirada', 'retirada explícita permanece');
assert(normalizarEntregaVenda('correio', 'concluida') === 'entregue', 'entrega inválida cai no padrão');

assert(normalizarPagoVenda(undefined, 'concluida') === 'pago', 'concluída antiga conta como paga');
assert(normalizarPagoVenda(undefined, 'em_processamento') === 'a_receber', 'pendente antiga fica a receber');
assert(normalizarPagoVenda('a_receber', 'concluida') === 'a_receber', 'a receber explícito permanece');
assert(normalizarPagoVenda('fiado', 'em_processamento') === 'a_receber', 'pago inválido cai no padrão');

const concluidaPaga = { status: 'concluida', entrega: 'retirada', pago: 'pago' };
const concluidaAberta = { status: 'concluida', entrega: 'a_entregar', pago: 'a_receber' };
const pendentePaga = { status: 'em_processamento', entrega: 'retirada', pago: 'pago' };
const pendenteAberta = { status: 'em_processamento', entrega: 'a_entregar', pago: 'a_receber' };

assert(vendaBaixaEstoque(concluidaPaga) && vendaLancaRecebimento(concluidaPaga), 'concluída paga: estoque e recebimento');
assert(vendaBaixaEstoque(concluidaAberta) && !vendaLancaRecebimento(concluidaAberta), 'concluída a receber: só estoque');
assert(!vendaBaixaEstoque(pendentePaga) && vendaLancaRecebimento(pendentePaga), 'pendente paga: só recebimento');
assert(!vendaBaixaEstoque(pendenteAberta) && !vendaLancaRecebimento(pendenteAberta), 'pendente a receber: nem estoque nem recebimento');

const resumo = resumoAReceber([
  { ...concluidaAberta, total: 80 },
  { ...pendenteAberta, total: 20.5 },
  { ...concluidaPaga, total: 100 },
  { ...pendentePaga, total: 40 },
]);
assert(resumo.quantidade === 2, 'a receber conta pendente e concluída em aberto');
assert(resumo.valorTotal === 100.5, 'valor em aberto soma só o que não foi pago');

assert(entregaAguardandoConfirmacao(concluidaAberta), 'concluída a entregar espera confirmação');
assert(entregaAguardandoConfirmacao(pendenteAberta), 'pendente a entregar espera confirmação');
assert(!entregaAguardandoConfirmacao(concluidaPaga), 'retirada não pede confirmação de entrega');
assert(!entregaAguardandoConfirmacao({ status: 'concluida', entrega: 'entregue' }), 'entregue já está confirmada');

const aEntregar = resumoAEntregar([
  { ...concluidaAberta, total: 80 },
  { ...pendenteAberta, total: 20.5 },
  { ...concluidaPaga, total: 100 },
  { status: 'concluida', entrega: 'entregue', pago: 'pago', total: 15 },
]);
assert(aEntregar.quantidade === 2, 'a entregar conta só quem ainda não confirmou');
assert(aEntregar.valorTotal === 100.5, 'valor a entregar soma as entregas em aberto');

assert(!isVendaFinalizada(concluidaAberta), 'concluída a entregar e a receber não está finalizada');
assert(isVendaPendente(concluidaAberta), 'concluída com pendência continua pendente');
assert(isVendaPendente(pendentePaga), 'pendente paga e retirada continua pendente');
assert(
  isVendaFinalizada({ status: 'concluida', entrega: 'entregue', pago: 'pago' }),
  'entregue e paga está finalizada'
);
assert(
  isVendaFinalizada({ status: 'concluida', entrega: 'retirada', pago: 'pago' }),
  'retirada e paga está finalizada'
);

const lista = listarVendasPendentes([
  { ...concluidaAberta, id: 1 },
  { ...pendentePaga, id: 2 },
  { status: 'concluida', entrega: 'retirada', pago: 'pago', id: 3 },
  { status: 'concluida', entrega: 'entregue', pago: 'a_receber', id: 4 },
]);
assert(lista.map((v) => v.id).join(',') === '1,2,4', 'pendentes incluem entrega ou pagamento em aberto');

assert(
  statusPermitidoVenda({ entrega: 'a_entregar', pago: 'pago' }, 'concluida') === 'em_processamento',
  'não conclui com entrega pendente'
);
assert(
  statusPermitidoVenda({ entrega: 'retirada', pago: 'a_receber' }, 'concluida') === 'em_processamento',
  'não conclui com pagamento pendente'
);
assert(
  statusPermitidoVenda({ entrega: 'retirada', pago: 'pago' }, 'concluida') === 'concluida',
  'conclui quando entrega e pagamento estão confirmados'
);
assert(
  statusPermitidoVenda({ entrega: 'entregue', pago: 'a_receber' }, 'concluida', true) === 'concluida',
  'venda já concluída com pendência antiga mantém o status gravado'
);

console.log('OK — entrega e pago em vendas');
