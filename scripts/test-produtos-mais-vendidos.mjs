/** Ranking de produtos mais vendidos (espelha lib/vendas.ts). */

function arredondarQuantidade(valor) {
  return Math.round(Number(valor) * 1000) / 1000;
}

function arredondarDinheiroVenda(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function subtotalItensVenda(itens) {
  return arredondarDinheiroVenda(itens.reduce((acc, i) => acc + i.quantidade * i.valorUnit, 0));
}

function isVendaConcluida(venda) {
  return (venda.status ?? 'concluida') === 'concluida';
}

function rankingProdutosMaisVendidos(vendas) {
  const map = new Map();

  for (const venda of vendas) {
    const concluida = isVendaConcluida(venda);
    const clienteKey = (venda.cliente.trim() || 'Sem nome').toLowerCase();
    const subtotal = subtotalItensVenda(venda.itens);
    const ratio = subtotal > 0 ? venda.total / subtotal : 1;
    const produtosNaVenda = new Set();

    for (const item of venda.itens) {
      const nome = item.nome.trim();
      if (!nome) continue;
      const key = nome.toLowerCase();
      let resumo = map.get(key);
      if (!resumo) {
        resumo = {
          nome,
          unidade: item.unidade,
          quantidadeTotal: 0,
          valorTotal: 0,
          vendasConcluidas: 0,
          vendasEmProcessamento: 0,
          ultimaVenda: null,
          clientesSet: new Set(),
        };
        map.set(key, resumo);
      }

      if (!resumo.ultimaVenda || venda.data > resumo.ultimaVenda) {
        resumo.ultimaVenda = venda.data;
      }

      if (concluida) {
        resumo.quantidadeTotal += item.quantidade;
        resumo.valorTotal += item.quantidade * item.valorUnit * ratio;
        resumo.clientesSet.add(clienteKey);
        if (!produtosNaVenda.has(key)) {
          resumo.vendasConcluidas += 1;
          produtosNaVenda.add(key);
        }
      } else if (!produtosNaVenda.has(key)) {
        resumo.vendasEmProcessamento += 1;
        produtosNaVenda.add(key);
      }
    }
  }

  return Array.from(map.values())
    .map(({ clientesSet, ...r }) => ({
      ...r,
      clientes: clientesSet.size,
      quantidadeTotal: arredondarQuantidade(r.quantidadeTotal),
      valorTotal: Math.round(r.valorTotal * 100) / 100,
    }))
    .filter((r) => r.vendasConcluidas > 0 || r.vendasEmProcessamento > 0)
    .sort(
      (a, b) =>
        b.quantidadeTotal - a.quantidadeTotal ||
        b.valorTotal - a.valorTotal ||
        a.nome.localeCompare(b.nome, 'pt-BR')
    );
}

const fails = [];
function assert(cond, msg) {
  if (!cond) fails.push(msg);
}

assert(rankingProdutosMaisVendidos([]).length === 0, 'sem vendas, ranking vazio');

const vendas = [
  {
    id: 1,
    data: '2026-09-01',
    cliente: 'Ana',
    status: 'concluida',
    total: 200,
    itens: [
      { nome: 'Nibs', quantidade: 2, unidade: 'kg', valorUnit: 80 },
      { nome: 'Casca', quantidade: 1, unidade: 'kg', valorUnit: 40 },
    ],
  },
  {
    id: 2,
    data: '2026-09-10',
    cliente: 'Bruno',
    status: 'concluida',
    total: 160,
    itens: [{ nome: 'nibs', quantidade: 2, unidade: 'kg', valorUnit: 80 }],
  },
  {
    id: 3,
    data: '2026-09-12',
    cliente: 'Ana',
    status: 'em_processamento',
    total: 80,
    itens: [{ nome: 'Nibs', quantidade: 1, unidade: 'kg', valorUnit: 80 }],
  },
  {
    id: 4,
    data: '2026-09-15',
    cliente: 'Carla',
    status: 'em_processamento',
    total: 50,
    itens: [{ nome: 'Chocolate 70%', quantidade: 0.5, unidade: 'kg', valorUnit: 100 }],
  },
];

const ranking = rankingProdutosMaisVendidos(vendas);
assert(ranking[0].nome === 'Nibs', 'Nibs é o mais vendido');
assert(ranking[0].quantidadeTotal === 4, 'Nibs 2+2 kg nas concluídas');
assert(ranking[0].valorTotal === 320, 'Nibs R$ 160 + R$ 160');
assert(ranking[0].vendasConcluidas === 2, 'Nibs em 2 vendas concluídas');
assert(ranking[0].vendasEmProcessamento === 1, 'Nibs tem 1 pedido pendente');
assert(ranking[0].clientes === 2, 'Nibs comprado por Ana e Bruno');
assert(ranking[0].ultimaVenda === '2026-09-12', 'última ocorrência do Nibs (inclui pendente)');
assert(ranking[1].nome === 'Casca', 'Casca em segundo');
assert(ranking[1].quantidadeTotal === 1, 'Casca 1 kg');
assert(ranking[1].clientes === 1, 'Casca só Ana');
assert(ranking.find((p) => p.nome === 'Chocolate 70%')?.vendasConcluidas === 0, 'chocolate só pendente');
assert(ranking.find((p) => p.nome === 'Chocolate 70%')?.quantidadeTotal === 0, 'pendente não soma quantidade');

const comDesconto = rankingProdutosMaisVendidos([
  {
    id: 1,
    data: '2026-09-01',
    cliente: 'Ana',
    status: 'concluida',
    total: 90,
    itens: [{ nome: 'Nibs', quantidade: 1, unidade: 'kg', valorUnit: 100 }],
  },
]);
assert(comDesconto[0].valorTotal === 90, 'desconto no total da venda entra no ranking do produto');

const duasLinhasMesmaVenda = rankingProdutosMaisVendidos([
  {
    id: 1,
    data: '2026-09-01',
    cliente: 'Ana',
    status: 'concluida',
    total: 240,
    itens: [
      { nome: 'Nibs', quantidade: 1, unidade: 'kg', valorUnit: 80 },
      { nome: 'Nibs', quantidade: 2, unidade: 'kg', valorUnit: 80 },
    ],
  },
]);
assert(duasLinhasMesmaVenda[0].quantidadeTotal === 3, 'soma linhas iguais na mesma venda');
assert(duasLinhasMesmaVenda[0].vendasConcluidas === 1, 'mesma venda conta uma vez');

if (fails.length) {
  console.error('FALHOU:\n' + fails.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}

console.log('✓ Ranking de produtos mais vendidos');
