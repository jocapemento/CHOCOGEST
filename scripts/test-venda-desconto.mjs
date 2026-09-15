/**
 * Cálculo de desconto em vendas (espelha lib/vendas.ts).
 */

function arredondarDinheiroVenda(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function subtotalItensVenda(itens) {
  return arredondarDinheiroVenda(itens.reduce((acc, i) => acc + i.quantidade * i.valorUnit, 0));
}

function valorDescontoAplicado(subtotal, descontoTipo, desconto) {
  const sub = arredondarDinheiroVenda(subtotal);
  const raw = Number(desconto);
  if (descontoTipo !== 'percentual' && descontoTipo !== 'valor') return 0;
  if (!Number.isFinite(raw) || raw <= 0 || sub <= 0) return 0;
  if (descontoTipo === 'percentual') {
    const pct = Math.min(100, raw);
    return arredondarDinheiroVenda(sub * (pct / 100));
  }
  return Math.min(sub, arredondarDinheiroVenda(raw));
}

function totalLiquidoVenda(itens, descontoTipo, desconto) {
  const subtotal = subtotalItensVenda(itens);
  return arredondarDinheiroVenda(subtotal - valorDescontoAplicado(subtotal, descontoTipo, desconto));
}

const itens = [
  { quantidade: 2, valorUnit: 50 },
  { quantidade: 1, valorUnit: 20 },
];

console.assert(subtotalItensVenda(itens) === 120, 'subtotal 120');
console.assert(totalLiquidoVenda(itens, '', 10) === 120, 'sem tipo ignora valor');
console.assert(totalLiquidoVenda(itens, 'percentual', 0) === 120, 'zero não aplica');
console.assert(valorDescontoAplicado(120, 'percentual', 10) === 12, '10% de 120 = 12');
console.assert(totalLiquidoVenda(itens, 'percentual', 10) === 108, 'total 108');
console.assert(valorDescontoAplicado(120, 'valor', 15.5) === 15.5, 'desconto R$ 15,50');
console.assert(totalLiquidoVenda(itens, 'valor', 15.5) === 104.5, 'total 104,50');
console.assert(valorDescontoAplicado(120, 'percentual', 100) === 120, '100% zera');
console.assert(totalLiquidoVenda(itens, 'percentual', 100) === 0, 'total zero');
console.assert(valorDescontoAplicado(120, 'valor', 999) === 120, 'valor não passa do subtotal');
console.assert(valorDescontoAplicado(120, 'percentual', 150) === 120, 'percentual capado em 100');
console.assert(valorDescontoAplicado(33.33, 'percentual', 10) === 3.33, 'arredonda centavos');
console.assert(totalLiquidoVenda([{ quantidade: 1, valorUnit: 33.33 }], 'percentual', 10) === 30, '33.33 - 3.33');

console.log('OK — desconto em vendas');
