import fs from 'fs';
import path from 'path';

const backupPath =
  process.argv[2] ??
  path.resolve('C:/Users/jocap/Downloads/ChocoBackup/chocogest-backup-2026-07-04.json');

const raw = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
const data = raw.data ?? raw;

function compararFifo(a, b) {
  const d = (a.data ?? '').localeCompare(b.data ?? '');
  return d !== 0 ? d : a.id - b.id;
}

function baixarFifo(estoque, itens) {
  const updated = estoque.map((e) => ({ ...e }));
  for (const item of itens) {
    let restante = item.quantidade;
    const nome = item.nome.toLowerCase();
    const indices = updated
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.nome.toLowerCase() === nome && entry.quantidade > 0)
      .sort((a, b) => compararFifo(a.entry, b.entry))
      .map(({ index }) => index);

    for (const index of indices) {
      if (restante <= 0) break;
      const baixa = Math.min(updated[index].quantidade, restante);
      updated[index].quantidade -= baixa;
      restante -= baixa;
    }
  }
  return updated.filter((e) => e.quantidade > 0);
}

function adicionar(estoque, itens, dataOp) {
  const updated = [...estoque];
  for (const item of itens) {
    updated.push({
      id: item.id ?? Date.now() + updated.length,
      nome: item.nome,
      tipo: item.tipo,
      quantidade: item.quantidade,
      unidade: item.unidade,
      valorUnit: item.valorUnit,
      data: dataOp,
    });
  }
  return updated;
}

// Reconstruir estoque a partir do zero seguindo ordem cronológica
const eventos = [];

for (const c of data.compras ?? []) {
  const itens = (c.itens ?? []).filter((i) => i.tipo !== 'Equipamento');
  if (itens.length > 0) {
    eventos.push({ tipo: 'compra', data: c.data, id: c.id, itens });
  }
}

for (const p of data.producoes ?? []) {
  eventos.push({
    tipo: 'producao',
    data: p.data,
    id: p.id,
    producao: p,
    baixa: (p.ingredientes ?? []).map((i) => ({
      nome: i.nome,
      quantidade: i.quantidade,
      tipo: 'MateriaPrima',
      unidade: i.unidade ?? 'kg',
      valorUnit: i.valorUnit,
    })),
    entrada: [
      {
        nome: p.produto,
        tipo: 'ProdutoAcabado',
        quantidade: p.quantidade,
        unidade: p.unidade,
        valorUnit: p.quantidade > 0 ? p.custoEstimado / p.quantidade : p.custoEstimado,
      },
    ],
  });
}

for (const v of data.vendas ?? []) {
  if ((v.itens ?? []).length > 0) {
    eventos.push({ tipo: 'venda', data: v.data, id: v.id, itens: v.itens });
  }
}

// Itens manuais do estoque que não vêm de compra (ex.: taxi, diversos)
const nomesCompra = new Set();
for (const c of data.compras ?? []) {
  for (const i of c.itens ?? []) nomesCompra.add(`${i.nome.toLowerCase()}|${c.data}`);
}

eventos.sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id);

let estoque = [];
for (const ev of eventos) {
  if (ev.tipo === 'compra') {
    estoque = adicionar(estoque, ev.itens, ev.data);
  } else if (ev.tipo === 'producao') {
    estoque = baixarFifo(estoque, ev.baixa);
    estoque = adicionar(estoque, ev.entrada, ev.data);
  } else if (ev.tipo === 'venda') {
    estoque = baixarFifo(estoque, ev.itens);
  }
}

// Preservar lançamentos manuais (não rastreados em compras/vendas/produções)
const estoqueAtual = data.estoque ?? [];
const estoqueRecalcIds = new Set(estoque.map((e) => `${e.nome}|${e.data}|${e.quantidade}`));

const manuais = estoqueAtual.filter((e) => {
  const fromCompra = (data.compras ?? []).some((c) =>
    (c.itens ?? []).some(
      (i) =>
        i.nome.toLowerCase() === e.nome.toLowerCase() &&
        i.tipo === e.tipo &&
        Math.abs(i.quantidade - e.quantidade) < 0.001 &&
        c.data === e.data
    )
  );
  const fromProducao = (data.producoes ?? []).some(
    (p) => p.produto.toLowerCase() === e.nome.toLowerCase() && p.data === e.data
  );
  return !fromCompra && !fromProducao && e.tipo !== 'ProdutoAcabado';
});

for (const m of manuais) {
  estoque.push({ ...m });
}

estoque.sort((a, b) => compararFifo(a, b));

console.log('\n=== SALDOS CORRIGIDOS (FIFO) ===\n');

const amendoa = estoque.filter((e) => e.nome.toLowerCase().includes('amendoa') || e.nome.toLowerCase().includes('amêndoa'));
for (const e of amendoa) {
  console.log(`  ${e.data} | ${e.nome} | ${e.quantidade} ${e.unidade} | R$ ${e.valorUnit.toFixed(2)}`);
}

const atual = estoqueAtual.filter((e) => e.quantidade > 0 && (e.nome.toLowerCase().includes('amendoa') || e.nome.toLowerCase().includes('amêndoa')));
console.log('\n=== SALDOS ATUAIS (backup) ===\n');
for (const e of atual.sort(compararFifo)) {
  console.log(`  ${e.data} | ${e.nome} | ${e.quantidade} ${e.unidade} | R$ ${e.valorUnit.toFixed(2)}`);
}

console.log('\n=== DIFERENÇA AMÊNDOA DE CACAU ===');
const antigoAtual = atual.find((e) => e.nome === 'Amendoa de Cacau' && e.data === '2026-05-12');
const recenteAtual = atual.find((e) => e.nome === 'Amendoa de Cacau' && e.data === '2026-06-17');
const antigoCorreto = amendoa.find((e) => e.nome === 'Amendoa de Cacau' && e.data === '2026-05-12');
const recenteCorreto = amendoa.find((e) => e.nome === 'Amendoa de Cacau' && e.data === '2026-06-17');

if (antigoAtual && antigoCorreto) {
  console.log(`  Compra 12/05: ${antigoAtual.quantidade} kg (atual) → ${antigoCorreto?.quantidade ?? 0} kg (correto FIFO)`);
}
if (recenteAtual && recenteCorreto) {
  console.log(`  Compra 17/06: ${recenteAtual.quantidade} kg (atual) → ${recenteCorreto?.quantidade ?? 0} kg (correto FIFO)`);
}