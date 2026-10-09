/**
 * Testes rápidos da relação de vendas pendentes (lógica espelhada de lib/vendas.ts).
 */

function isVendaConcluida(v) {
  return (v.status ?? 'concluida') === 'concluida';
}
function isVendaPendente(v) {
  return !isVendaConcluida(v);
}
function listarVendasPendentes(vendas) {
  return vendas
    .filter(isVendaPendente)
    .slice()
    .sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id);
}
function quantidadeReservadaProduto(vendas, produto, ignorarVendaId) {
  const key = produto.trim().toLowerCase();
  let total = 0;
  for (const venda of vendas) {
    if (!isVendaPendente(venda)) continue;
    if (ignorarVendaId != null && venda.id === ignorarVendaId) continue;
    for (const item of venda.itens) {
      if (item.nome.toLowerCase() === key) total += item.quantidade;
    }
  }
  return total;
}
function saldoLivreParaVenda(fisico, vendas, produto, ignorarVendaId) {
  return Math.max(0, fisico - quantidadeReservadaProduto(vendas, produto, ignorarVendaId));
}

const vendas = [
  {
    id: 1,
    data: '2026-07-01',
    cliente: 'A',
    status: 'em_processamento',
    total: 100,
    itens: [{ nome: 'Nibs', quantidade: 3, unidade: 'kg', valorUnit: 10 }],
  },
  {
    id: 2,
    data: '2026-07-02',
    cliente: 'B',
    status: 'em_processamento',
    total: 80,
    itens: [{ nome: 'Nibs', quantidade: 2, unidade: 'kg', valorUnit: 10 }],
  },
  {
    id: 3,
    data: '2026-07-03',
    cliente: 'C',
    status: 'concluida',
    total: 50,
    itens: [{ nome: 'Nibs', quantidade: 1, unidade: 'kg', valorUnit: 10 }],
  },
];

const pend = listarVendasPendentes(vendas);
console.assert(pend.length === 2, 'deve listar 2 pendentes');
console.assert(pend[0].id === 2, 'mais recente primeiro');
console.assert(quantidadeReservadaProduto(vendas, 'Nibs') === 5, 'reserva total 5');
console.assert(quantidadeReservadaProduto(vendas, 'Nibs', 1) === 2, 'ignora venda 1');
console.assert(saldoLivreParaVenda(10, vendas, 'Nibs') === 5, 'livre 10-5=5');
console.assert(saldoLivreParaVenda(4, vendas, 'Nibs') === 0, 'livre não negativo');
console.log('OK — relação de vendas pendentes');
