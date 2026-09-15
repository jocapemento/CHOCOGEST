/** Quantidade: no máximo 3 dígitos na fração. */

function arredondarQuantidade(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000) / 1000;
}

function formatQuantidade(valor) {
  const n = arredondarQuantidade(Number(valor));
  return n.toLocaleString('en-US', {
    useGrouping: false,
    maximumFractionDigits: 3,
    minimumFractionDigits: 0,
  });
}

function formatQuantidadeUnidade(quantidade, unidade) {
  const q = formatQuantidade(quantidade);
  const u = (unidade ?? '').trim();
  return u ? `${q} ${u}` : q;
}

const fails = [];
function assert(cond, msg) {
  if (!cond) fails.push(msg);
}

assert(arredondarQuantidade(12.5) === 12.5, '12.5 permanece 12.5');
assert(arredondarQuantidade(12.5000000001) === 12.5, 'lixo de ponto flutuante some');
assert(arredondarQuantidade(8.333333333) === 8.333, 'mais de 3 casas arredonda');
assert(arredondarQuantidade(1.2345) === 1.235, '1.2345 arredonda para 1.235');
assert(arredondarQuantidade(0.1 + 0.2) === 0.3, '0.1+0.2 vira 0.3');
assert(formatQuantidade(12.5) === '12.5', 'exibe 12.5');
assert(formatQuantidade(12.5000000001) === '12.5', 'não mostra 12.5000000001');
assert(formatQuantidade(8.333333333) === '8.333', 'exibe no máximo 3 casas');
assert(formatQuantidade(8) === '8', 'inteiro sem fração');
assert(formatQuantidade(1.23) === '1.23', 'duas casas se mantêm');
assert(formatQuantidadeUnidade(12.5, 'kg') === '12.5 kg', 'quantidade + unidade');
assert(formatQuantidadeUnidade(8.333333333, 'kg') === '8.333 kg', 'unidade com 3 casas');

if (fails.length) {
  console.error('FALHOU:\n' + fails.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}

console.log('✓ Quantidade limitada a 3 dígitos na fração');
