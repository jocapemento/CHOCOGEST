import fs from 'fs';
import path from 'path';

const backupPath =
  process.argv[2] ??
  path.resolve('C:/Users/jocap/Downloads/ChocoBackup/chocogest-backup-2026-07-04.json');

const raw = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
const data = raw.data ?? raw;

function agruparEstoque(estoque) {
  const map = new Map();
  for (const item of estoque) {
    if (item.quantidade <= 0) continue;
    const key = item.nome.toLowerCase();
    const existing = map.get(key);
    if (existing) {
      const qtd = existing.quantidade + item.quantidade;
      const valorMedio =
        qtd > 0
          ? (existing.quantidade * existing.valorUnit + item.quantidade * item.valorUnit) / qtd
          : item.valorUnit;
      map.set(key, { ...existing, quantidade: qtd, valorUnit: valorMedio });
    } else {
      map.set(key, { ...item });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

function fmtBrl(v) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const estoque = data.estoque ?? [];
const compras = data.compras ?? [];
const producoes = data.producoes ?? [];
const vendas = data.vendas ?? [];

const saldos = agruparEstoque(estoque);
const materias = saldos.filter((s) => s.tipo === 'MateriaPrima');
const produtos = saldos.filter((s) => s.tipo === 'ProdutoAcabado');
const outros = saldos.filter((s) => s.tipo !== 'MateriaPrima' && s.tipo !== 'ProdutoAcabado');

const lancamentos = estoque
  .filter((e) => e.quantidade > 0)
  .sort((a, b) => (a.data ?? '').localeCompare(b.data ?? '') || a.id - b.id);

console.log(`\n=== CONFERÊNCIA DE SALDOS ===`);
console.log(`Backup: ${path.basename(backupPath)}`);
console.log(`Exportado em: ${raw.exportedAt ?? 'desconhecido'}\n`);

console.log('--- SALDOS CONSOLIDADOS ---\n');

function printGrupo(titulo, itens) {
  if (itens.length === 0) return;
  console.log(`[${titulo}]`);
  for (const item of itens) {
    const total = item.quantidade * item.valorUnit;
    console.log(
      `  ${item.nome}: ${item.quantidade} ${item.unidade} × ${fmtBrl(item.valorUnit)} = ${fmtBrl(total)}`
    );
  }
  console.log('');
}

printGrupo('Matérias-primas', materias);
printGrupo('Produtos acabados', produtos);
printGrupo('Outros', outros);

const totalGeral = saldos.reduce((acc, s) => acc + s.quantidade * s.valorUnit, 0);
console.log(`Valor total em estoque: ${fmtBrl(totalGeral)}\n`);

console.log('--- LANÇAMENTOS POR DATA (FIFO) ---\n');
for (const item of lancamentos) {
  console.log(
    `  ${item.data ?? 's/data'} | id ${item.id} | ${item.nome} | ${item.quantidade} ${item.unidade} | ${fmtBrl(item.valorUnit)} | ${item.tipo}`
  );
}

// Amêndoa / produção — foco do bug FIFO
const nomesFoco = ['amendoa de cacau', 'amêndoa torrada', 'amendoa torrada'];
const comprasAmendoa = [];
for (const c of compras) {
  for (const item of c.itens ?? []) {
    if (nomesFoco.some((n) => item.nome.toLowerCase().includes('amendoa') || item.nome.toLowerCase().includes('amêndoa'))) {
      comprasAmendoa.push({
        compraId: c.id,
        data: c.data,
        fornecedor: c.fornecedor,
        nome: item.nome,
        quantidade: item.quantidade,
        unidade: item.unidade,
        valorUnit: item.valorUnit,
      });
    }
  }
}

const producoesAmendoa = producoes.filter((p) =>
  p.produto.toLowerCase().includes('amêndoa') || p.produto.toLowerCase().includes('amendoa')
);

if (comprasAmendoa.length > 0 || producoesAmendoa.length > 0) {
  console.log('\n--- HISTÓRICO AMÊNDOA (compras e produções) ---\n');

  console.log('Compras:');
  for (const c of comprasAmendoa.sort((a, b) => a.data.localeCompare(b.data))) {
    console.log(
      `  ${c.data} | Compra #${c.compraId} | ${c.fornecedor} | ${c.nome}: ${c.quantidade} ${c.unidade} @ ${fmtBrl(c.valorUnit)}`
    );
  }

  console.log('\nProduções:');
  for (const p of producoesAmendoa.sort((a, b) => a.data.localeCompare(b.data))) {
    const ings = (p.ingredientes ?? [])
      .map((i) => `${i.nome} ${i.quantidade}${i.unidade ? ' ' + i.unidade : ''}`)
      .join(', ');
    console.log(
      `  ${p.data} | ${p.produto} (${p.lote}) | saída: ${p.quantidade} ${p.unidade} | entrada: ${ings}`
    );
  }

  console.log('\nLançamentos atuais no estoque (amêndoa):');
  const lancAmendoa = lancamentos.filter((e) =>
    e.nome.toLowerCase().includes('amendoa') || e.nome.toLowerCase().includes('amêndoa')
  );
  for (const e of lancAmendoa) {
    console.log(
      `  ${e.data} | id ${e.id} | ${e.nome} | ${e.quantidade} ${e.unidade} | ${fmtBrl(e.valorUnit)}`
    );
  }
}

// Inconsistências
const issues = [];

for (const p of producoes) {
  const disp = estoque
    .filter((e) => e.nome.toLowerCase() === p.produto.toLowerCase() && e.quantidade > 0)
    .reduce((a, e) => a + e.quantidade, 0);
  const vendido = vendas
    .flatMap((v) => v.itens)
    .filter((i) => i.nome.toLowerCase() === p.produto.toLowerCase())
    .reduce((a, i) => a + i.quantidade, 0);

  if (disp < p.quantidade && vendido < p.quantidade - disp) {
    issues.push(
      `Produção #${p.id} (${p.produto}): estoque ${disp} < produzido ${p.quantidade}, vendido ${vendido}`
    );
  }
}

// Verificar se baixa antiga (LIFO) pode ter afetado amêndoa
const lancCacau = lancamentos.filter((e) => e.nome.toLowerCase() === 'amendoa de cacau');
if (lancCacau.length >= 2) {
  const ordenados = [...lancCacau].sort((a, b) => (a.data ?? '').localeCompare(b.data ?? '') || a.id - b.id);
  const maisAntigo = ordenados[0];
  const maisRecente = ordenados[ordenados.length - 1];
  if (maisAntigo.quantidade > maisRecente.quantidade) {
    issues.push(
      `Amendoa de Cacau: lançamento mais antigo (${maisAntigo.data}, ${maisAntigo.quantidade} kg) tem MAIS saldo que o mais recente (${maisRecente.data}, ${maisRecente.quantidade} kg) — pode indicar baixa fora do FIFO`
    );
  } else if (maisRecente.quantidade < maisAntigo.quantidade && producoesAmendoa.length > 0) {
    issues.push(
      `Amendoa de Cacau: lançamento recente (${maisRecente.data}) foi consumido antes do antigo (${maisAntigo.data}) — saldo inconsistente com FIFO`
    );
  }
}

if (issues.length > 0) {
  console.log('\n--- POSSÍVEIS INCONSISTÊNCIAS ---\n');
  for (const i of issues) console.log(`  ⚠ ${i}`);
} else {
  console.log('\n--- INCONSISTÊNCIAS ---\n  Nenhuma inconsistência grave detectada no backup.');
}

console.log('\n--- RESUMO ---');
console.log(`  Lançamentos ativos: ${lancamentos.length}`);
console.log(`  Itens distintos: ${saldos.length}`);
console.log(`  Compras: ${compras.length} | Vendas: ${vendas.length} | Produções: ${producoes.length}`);