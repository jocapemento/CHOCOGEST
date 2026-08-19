/** Compra no cartão é empréstimo; pagamento é quitação. */

function arredondarDinheiro(valor) {
  return Math.round((Number(valor) || 0) * 100) / 100;
}

function statusEmprestimo(total, pago) {
  const saldo = arredondarDinheiro(total - pago);
  if (saldo <= 0) return 'quitado';
  if (pago > 0) return 'parcial';
  return 'em_aberto';
}

function totalQuitadoCompra(quitacoes, compraId) {
  return arredondarDinheiro(
    quitacoes.filter((q) => q.compraId === compraId).reduce((acc, q) => acc + q.valor, 0)
  );
}

function distribuirValorParcelas(total, parcelas) {
  const centavosTotal = Math.round(total * 100);
  const base = Math.floor(centavosTotal / parcelas);
  const resto = centavosTotal - base * parcelas;
  const valores = Array.from({ length: parcelas }, () => base / 100);
  if (parcelas > 0) valores[parcelas - 1] += resto / 100;
  return valores;
}

function parcelasEmAberto(total, n, pago) {
  const valores = distribuirValorParcelas(total, n);
  let restantePago = pago;
  const devidos = [];
  for (const original of valores) {
    const aplicado = Math.min(restantePago, original);
    restantePago = arredondarDinheiro(restantePago - aplicado);
    const devido = arredondarDinheiro(original - aplicado);
    devidos.push(devido);
  }
  return devidos;
}

const fails = [];
function assert(cond, msg) {
  if (!cond) fails.push(msg);
}

const total = 6000;
const n = 6;
assert(statusEmprestimo(total, 0) === 'em_aberto', 'sem pagamento: em aberto');
assert(statusEmprestimo(total, 1000) === 'parcial', 'pagamento parcial');
assert(statusEmprestimo(total, 6000) === 'quitado', 'pagamento total: quitado');

const quits = [
  { compraId: 10, valor: 1000 },
  { compraId: 10, valor: 500 },
  { compraId: 11, valor: 200 },
];
assert(totalQuitadoCompra(quits, 10) === 1500, 'soma quitações do empréstimo');
assert(arredondarDinheiro(total - 1500) === 4500, 'saldo = total − quitado');

const devidos = parcelasEmAberto(6000, 6, 1000);
assert(devidos[0] === 0, '1ª parcela quitada');
assert(devidos[1] === 1000, '2ª parcela ainda devida');
assert(devidos.filter((v) => v > 0).length === 5, 'restam 5 parcelas');

const devidosParcial = parcelasEmAberto(6000, 6, 1500);
assert(devidosParcial[0] === 0, '1ª quitada');
assert(devidosParcial[1] === 500, '2ª parcialmente quitada');

if (fails.length) {
  console.error('FALHOU:\n' + fails.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}

console.log('✓ Empréstimo no cartão e quitação (saldo e parcelas em aberto)');
