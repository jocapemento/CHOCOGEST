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

console.log('OK — entrega e pago em vendas');
