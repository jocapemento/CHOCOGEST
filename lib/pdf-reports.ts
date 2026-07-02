import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { agruparEstoque } from './estoque';
import type { AppData } from './types';
import { formatCurrency, formatDate, sumBy } from './format';

function addHeader(doc: jsPDF, title: string) {
  doc.setFillColor(120, 53, 15);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text('ChocoGest', 14, 12);
  doc.setFontSize(11);
  doc.text('Fábrica Bean-to-Bar • Bahia', 14, 20);
  doc.setFontSize(14);
  doc.text(title, 14, 38);
  doc.setTextColor(60, 40, 30);
  doc.setFontSize(9);
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 14, 46);
}

function savePdf(doc: jsPDF, filename: string) {
  doc.save(filename);
}

export function gerarPdfEstoque(data: AppData) {
  const doc = new jsPDF();
  addHeader(doc, 'Relatório de Estoque');

  const saldo = agruparEstoque(data.estoque);
  const lancamentos = [...data.estoque]
    .filter((e) => e.quantidade > 0)
    .sort((a, b) => (b.data ?? '').localeCompare(a.data ?? '') || b.id - a.id);

  const saldoRows = saldo.map((item) => [
    item.nome,
    item.tipo,
    `${item.quantidade} ${item.unidade}`,
    formatCurrency(item.valorUnit),
    formatCurrency(item.quantidade * item.valorUnit),
  ]);

  const totalSaldo = sumBy(saldo, (i) => i.quantidade * i.valorUnit);

  autoTable(doc, {
    startY: 52,
    head: [['Item', 'Tipo', 'Qtd Total', 'Valor Médio', 'Total']],
    body: saldoRows,
    foot: [['', '', '', 'Valor total em estoque', formatCurrency(totalSaldo)]],
    theme: 'grid',
    headStyles: { fillColor: [180, 83, 9] },
    footStyles: { fillColor: [254, 243, 199], textColor: [60, 40, 30], fontStyle: 'bold' },
  });

  const lancamentoRows = lancamentos.map((item) => [
    formatDate(item.data ?? ''),
    item.nome,
    item.tipo,
    `${item.quantidade} ${item.unidade}`,
    formatCurrency(item.valorUnit),
    formatCurrency(item.quantidade * item.valorUnit),
  ]);

  autoTable(doc, {
    startY: (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY
      ? (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14
      : 52,
    head: [['Data', 'Item', 'Tipo', 'Quantidade', 'Valor Unit.', 'Total']],
    body: lancamentoRows,
    theme: 'grid',
    headStyles: { fillColor: [120, 53, 15] },
  });

  savePdf(doc, `estoque-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function gerarPdfCompras(data: AppData) {
  const doc = new jsPDF();
  addHeader(doc, 'Relatório de Compras');

  const rows = data.compras.map((c) => [
    formatDate(c.data),
    c.fornecedor,
    c.formaPagamento,
    c.itens.length.toString(),
    formatCurrency(c.total),
  ]);

  const total = sumBy(data.compras, (c) => c.total);

  autoTable(doc, {
    startY: 52,
    head: [['Data', 'Fornecedor', 'Pagamento', 'Itens', 'Total']],
    body: rows,
    foot: [['', '', '', 'Total', formatCurrency(total)]],
    theme: 'grid',
    headStyles: { fillColor: [180, 83, 9] },
    footStyles: { fillColor: [254, 243, 199], textColor: [60, 40, 30], fontStyle: 'bold' },
  });

  savePdf(doc, `compras-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function gerarPdfVendas(data: AppData) {
  const doc = new jsPDF();
  addHeader(doc, 'Relatório de Vendas');

  const rows = data.vendas.map((v) => [
    formatDate(v.data),
    v.cliente,
    v.formaPagamento,
    v.itens.length.toString(),
    formatCurrency(v.total),
  ]);

  const total = sumBy(data.vendas, (v) => v.total);

  autoTable(doc, {
    startY: 52,
    head: [['Data', 'Cliente', 'Pagamento', 'Itens', 'Total']],
    body: rows,
    foot: [['', '', '', 'Total', formatCurrency(total)]],
    theme: 'grid',
    headStyles: { fillColor: [180, 83, 9] },
    footStyles: { fillColor: [254, 243, 199], textColor: [60, 40, 30], fontStyle: 'bold' },
  });

  savePdf(doc, `vendas-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function gerarPdfFinanceiro(data: AppData, tipo: 'caixa' | 'banco') {
  const doc = new jsPDF();
  const movimentos = tipo === 'caixa' ? data.movimentosCaixa : data.movimentosBanco;
  addHeader(doc, tipo === 'caixa' ? 'Relatório de Caixa' : 'Relatório de Banco');

  const entradas = sumBy(movimentos.filter((m) => m.tipo === 'entrada'), (m) => m.valor);
  const saidas = sumBy(movimentos.filter((m) => m.tipo === 'saida'), (m) => m.valor);

  const isBanco = tipo === 'banco';

  const rows = movimentos.map((m) =>
    isBanco
      ? [
          formatDate(m.data),
          m.banco ?? '—',
          m.descricao,
          m.categoria,
          m.tipo === 'entrada' ? 'Entrada' : 'Saída',
          formatCurrency(m.valor),
        ]
      : [
          formatDate(m.data),
          m.descricao,
          m.categoria,
          m.tipo === 'entrada' ? 'Entrada' : 'Saída',
          formatCurrency(m.valor),
        ]
  );

  autoTable(doc, {
    startY: 52,
    head: isBanco
      ? [['Data', 'Banco', 'Descrição', 'Categoria', 'Tipo', 'Valor']]
      : [['Data', 'Descrição', 'Categoria', 'Tipo', 'Valor']],
    body: rows,
    foot: isBanco
      ? [
          ['', '', '', '', 'Entradas', formatCurrency(entradas)],
          ['', '', '', '', 'Saídas', formatCurrency(saidas)],
          ['', '', '', '', 'Saldo', formatCurrency(entradas - saidas)],
        ]
      : [
          ['', '', '', 'Entradas', formatCurrency(entradas)],
          ['', '', '', 'Saídas', formatCurrency(saidas)],
          ['', '', '', 'Saldo', formatCurrency(entradas - saidas)],
        ],
    theme: 'grid',
    headStyles: { fillColor: [180, 83, 9] },
    footStyles: { fillColor: [254, 243, 199], textColor: [60, 40, 30], fontStyle: 'bold' },
  });

  savePdf(doc, `${tipo}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function gerarPdfDashboard(data: AppData) {
  const doc = new jsPDF();
  addHeader(doc, 'Resumo Geral');

  const saldoEstoque = agruparEstoque(data.estoque);
  const valorEstoque = sumBy(saldoEstoque, (i) => i.quantidade * i.valorUnit);
  const totalCompras = sumBy(data.compras, (c) => c.total);
  const totalVendas = sumBy(data.vendas, (v) => v.total);
  const saldoCaixa =
    sumBy(data.movimentosCaixa.filter((m) => m.tipo === 'entrada'), (m) => m.valor) -
    sumBy(data.movimentosCaixa.filter((m) => m.tipo === 'saida'), (m) => m.valor);
  const saldoBanco =
    sumBy(data.movimentosBanco.filter((m) => m.tipo === 'entrada'), (m) => m.valor) -
    sumBy(data.movimentosBanco.filter((m) => m.tipo === 'saida'), (m) => m.valor);
  const valorPatrimonio = sumBy(data.patrimonio, (p) => p.valorAtual);

  autoTable(doc, {
    startY: 52,
    head: [['Indicador', 'Valor']],
    body: [
      ['Itens em estoque', saldoEstoque.length.toString()],
      ['Valor total do estoque', formatCurrency(valorEstoque)],
      ['Total de compras', formatCurrency(totalCompras)],
      ['Total de vendas', formatCurrency(totalVendas)],
      ['Saldo em caixa', formatCurrency(saldoCaixa)],
      ['Saldo em banco', formatCurrency(saldoBanco)],
      ['Patrimônio', formatCurrency(valorPatrimonio)],
      ['Produções registradas', data.producoes.length.toString()],
    ],
    theme: 'grid',
    headStyles: { fillColor: [180, 83, 9] },
  });

  savePdf(doc, `dashboard-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function gerarPdfPatrimonio(data: AppData) {
  const doc = new jsPDF();
  addHeader(doc, 'Relatório de Patrimônio');

  const rows = data.patrimonio.map((p) => [
    p.nome,
    p.categoria,
    formatDate(p.dataAquisicao),
    formatCurrency(p.valorAquisicao),
    formatCurrency(p.valorAtual),
    `${p.depreciacaoAnual}%`,
  ]);

  const total = sumBy(data.patrimonio, (p) => p.valorAtual);

  autoTable(doc, {
    startY: 52,
    head: [['Bem', 'Categoria', 'Aquisição', 'Valor Aquis.', 'Valor Atual', 'Depreciação']],
    body: rows,
    foot: [['', '', '', '', 'Total', formatCurrency(total)]],
    theme: 'grid',
    headStyles: { fillColor: [180, 83, 9] },
    footStyles: { fillColor: [254, 243, 199], textColor: [60, 40, 30], fontStyle: 'bold' },
  });

  savePdf(doc, `patrimonio-${new Date().toISOString().slice(0, 10)}.pdf`);
}