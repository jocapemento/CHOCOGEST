import fs from 'fs';

const file = process.argv[2];
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const data = raw.data ?? raw;

function quantidadeDisponivel(estoque, nome) {
  return estoque
    .filter((e) => e.nome.toLowerCase() === nome.toLowerCase() && e.quantidade > 0)
    .reduce((acc, e) => acc + e.quantidade, 0);
}

function vendasDoProduto(vendas, produto) {
  const key = produto.toLowerCase();
  const result = [];
  for (const venda of vendas) {
    const quantidade = venda.itens
      .filter((i) => i.nome.toLowerCase() === key)
      .reduce((acc, i) => acc + i.quantidade, 0);
    if (quantidade > 0) {
      result.push({ vendaId: venda.id, data: venda.data, cliente: venda.cliente, quantidade });
    }
  }
  return result;
}

const issues = [];
const estoque = data.estoque ?? [];
const vendas = data.vendas ?? [];
const producoes = data.producoes ?? [];

for (const p of producoes) {
  const disponivel = quantidadeDisponivel(estoque, p.produto);
  const vendasRel = vendasDoProduto(vendas, p.produto);
  const totalVendido = vendasRel.reduce((a, v) => a + v.quantidade, 0);

  if (disponivel < p.quantidade) {
    issues.push({
      tipo: 'producao_nao_reversivel',
      produto: p.produto,
      producaoId: p.id,
      qtdProducao: p.quantidade,
      disponivel,
      totalVendido,
      qtdVendas: vendasRel.length,
    });
  }

  for (const ing of p.ingredientes ?? []) {
    const existe = estoque.some(
      (e) => e.quantidade > 0 && e.nome.toLowerCase() === ing.nome.toLowerCase()
    );
    const materias = estoque
      .filter((e) => e.tipo === 'MateriaPrima' && e.quantidade > 0)
      .map((e) => e.nome);
    if (!existe) {
      issues.push({
        tipo: 'ingrediente_ausente_estoque',
        producaoId: p.id,
        ingredienteInformado: ing.nome,
        materiasDisponiveis: materias,
      });
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.data)) {
    issues.push({ tipo: 'data_producao_formato_invalido', producaoId: p.id, data: p.data });
  }
}

for (const p of producoes) {
  const temNoEstoque = quantidadeDisponivel(estoque, p.produto) > 0;
  const vendasRel = vendasDoProduto(vendas, p.produto);
  if (!temNoEstoque && vendasRel.length === 0) {
    issues.push({
      tipo: 'producao_sem_rastro_estoque',
      produto: p.produto,
      producaoId: p.id,
      explicacao: 'Produção registrada, mas produto não está no estoque e não há vendas.',
    });
  }
}

console.log(JSON.stringify({ issues, resumo: { producoes: producoes.length, vendas: vendas.length } }, null, 2));