import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  agruparEstoque,
  filtrarLancamentosMateriaPrima,
  filtrarLancamentosProdutosGerados,
  filtrarSaldoMateriaPrima,
  filtrarSaldoProdutosGerados,
} from './estoque';
import { totalizarProdutosPrecificados } from './precificacao';
import {
  formatarItensVenda,
  isVendaConcluida,
  listarVendasPendentes,
  produtosReservadosPendentes,
  rankingMelhoresClientes,
  resumoVendasPendentes,
  STATUS_VENDA_LABEL,
} from './vendas';
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

function tabelaSaldoPdf(
  doc: jsPDF,
  titulo: string,
  saldo: ReturnType<typeof agruparEstoque>,
  startY: number
) {
  const rows = saldo.map((item) => [
    item.nome,
    `${item.quantidade} ${item.unidade}`,
    formatCurrency(item.valorUnit),
    formatCurrency(item.quantidade * item.valorUnit),
  ]);
  const total = sumBy(saldo, (i) => i.quantidade * i.valorUnit);

  doc.setFontSize(11);
  doc.setTextColor(120, 53, 15);
  doc.text(titulo, 14, startY);

  autoTable(doc, {
    startY: startY + 4,
    head: [['Item', 'Qtd Total', 'Valor Médio', 'Total']],
    body: rows,
    foot: [['', '', 'Total', formatCurrency(total)]],
    theme: 'grid',
    headStyles: { fillColor: [180, 83, 9] },
    footStyles: { fillColor: [254, 243, 199], textColor: [60, 40, 30], fontStyle: 'bold' },
  });

  return (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

function tabelaLancamentosPdf(
  doc: jsPDF,
  titulo: string,
  lancamentos: AppData['estoque'],
  startY: number
) {
  const rows = lancamentos.map((item) => [
    formatDate(item.data ?? ''),
    item.nome,
    `${item.quantidade} ${item.unidade}`,
    formatCurrency(item.valorUnit),
    formatCurrency(item.quantidade * item.valorUnit),
  ]);

  doc.setFontSize(11);
  doc.setTextColor(120, 53, 15);
  doc.text(titulo, 14, startY);

  autoTable(doc, {
    startY: startY + 4,
    head: [['Data', 'Item', 'Quantidade', 'Valor Unit.', 'Total']],
    body: rows,
    theme: 'grid',
    headStyles: { fillColor: [120, 53, 15] },
  });

  return (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

export function gerarPdfEstoque(data: AppData) {
  const doc = new jsPDF();
  addHeader(doc, 'Relatório de Estoque');

  const saldo = agruparEstoque(data.estoque);
  const saldoMateriaPrima = filtrarSaldoMateriaPrima(saldo);
  const saldoProdutosGerados = filtrarSaldoProdutosGerados(saldo, data.producoes);
  const lancamentosMateriaPrima = filtrarLancamentosMateriaPrima(data.estoque);
  const lancamentosProdutosGerados = filtrarLancamentosProdutosGerados(data.estoque, data.producoes);

  let y = tabelaSaldoPdf(doc, 'Matérias-primas', saldoMateriaPrima, 52);
  y = tabelaSaldoPdf(doc, 'Produtos gerados', saldoProdutosGerados, y + 12);
  y = tabelaLancamentosPdf(doc, 'Lançamentos — Matérias-primas', lancamentosMateriaPrima, y + 12);
  tabelaLancamentosPdf(doc, 'Lançamentos — Produtos gerados', lancamentosProdutosGerados, y + 12);

  savePdf(doc, `estoque-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function gerarPdfCompras(data: AppData) {
  const doc = new jsPDF();
  addHeader(doc, 'Relatório de Compras');

  const rows = data.compras.map((c) => [
    formatDate(c.data),
    c.fornecedor,
    c.itens.length > 0
      ? c.itens.map((i) => `${i.nome} (${i.quantidade} ${i.unidade})`).join(', ')
      : '—',
    c.formaPagamento,
    formatCurrency(c.total),
  ]);

  const total = sumBy(data.compras, (c) => c.total);

  autoTable(doc, {
    startY: 52,
    head: [['Data', 'Fornecedor', 'Itens', 'Pagamento', 'Total']],
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

  const pendentes = listarVendasPendentes(data.vendas);
  const resumoPend = resumoVendasPendentes(data.vendas);
  const reservas = produtosReservadosPendentes(data.vendas);
  const concluidas = data.vendas.filter((v) => isVendaConcluida(v));

  let y = 52;

  doc.setFontSize(11);
  doc.setTextColor(120, 53, 15);
  doc.text('Relação de vendas pendentes', 14, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [['Data', 'Cliente', 'Itens reservados', 'Pagamento', 'Total']],
    body:
      pendentes.length > 0
        ? pendentes.map((v) => [
            formatDate(v.data),
            v.cliente,
            formatarItensVenda(v.itens),
            v.formaPagamento,
            formatCurrency(v.total),
          ])
        : [['—', 'Nenhuma venda pendente', '—', '—', '—']],
    foot:
      pendentes.length > 0
        ? [
            [
              '',
              `${resumoPend.quantidade} pedido(s) · ${resumoPend.clientes} cliente(s)`,
              `Qtd reservada: ${resumoPend.itensReservados}`,
              'Total pendente',
              formatCurrency(resumoPend.valorTotal),
            ],
          ]
        : undefined,
    theme: 'grid',
    headStyles: { fillColor: [180, 83, 9] },
    footStyles: { fillColor: [254, 243, 199], textColor: [60, 40, 30], fontStyle: 'bold' },
  });

  if (reservas.length > 0) {
    const lastTable = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable;
    y = (lastTable?.finalY ?? y) + 10;
    doc.setFontSize(11);
    doc.setTextColor(120, 53, 15);
    doc.text('Reservas por produto (vendas pendentes)', 14, y);

    autoTable(doc, {
      startY: y + 4,
      head: [['Produto', 'Reservado', 'Pedidos', 'Valor']],
      body: reservas.map((r) => [
        r.nome,
        `${r.quantidade} ${r.unidade}`,
        String(r.pedidos),
        formatCurrency(r.valorTotal),
      ]),
      theme: 'grid',
      headStyles: { fillColor: [180, 83, 9] },
    });
  }

  {
    const lastTable = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable;
    y = (lastTable?.finalY ?? y) + 10;
    doc.setFontSize(11);
    doc.setTextColor(120, 53, 15);
    doc.text('Vendas concluídas', 14, y);

    const totalConcluidas = sumBy(concluidas, (v) => v.total);
    autoTable(doc, {
      startY: y + 4,
      head: [['Data', 'Cliente', 'Itens (qtd)', 'Status', 'Pagamento', 'Total']],
      body: concluidas.map((v) => [
        formatDate(v.data),
        v.cliente,
        formatarItensVenda(v.itens),
        STATUS_VENDA_LABEL.concluida,
        v.formaPagamento,
        formatCurrency(v.total),
      ]),
      foot: [['', '', '', '', 'Total concluídas', formatCurrency(totalConcluidas)]],
      theme: 'grid',
      headStyles: { fillColor: [180, 83, 9] },
      footStyles: { fillColor: [254, 243, 199], textColor: [60, 40, 30], fontStyle: 'bold' },
    });
  }

  const ranking = rankingMelhoresClientes(data.vendas);
  if (ranking.length > 0) {
    const lastTable = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable;
    const startY = (lastTable?.finalY ?? 52) + 10;

    doc.setFontSize(11);
    doc.setTextColor(120, 53, 15);
    doc.text('Melhores clientes', 14, startY);

    autoTable(doc, {
      startY: startY + 4,
      head: [['#', 'Cliente', 'Vendas', 'Qtd total', 'Produtos', 'Valor total']],
      body: ranking.map((c, idx) => [
        String(idx + 1),
        c.cliente,
        c.vendasEmProcessamento > 0
          ? `${c.vendasConcluidas} (+${c.vendasEmProcessamento} pend.)`
          : String(c.vendasConcluidas),
        String(c.quantidadeTotal),
        c.produtos.map((p) => `${p.nome} ${p.quantidade}${p.unidade}`).join('; '),
        formatCurrency(c.valorTotal),
      ]),
      theme: 'grid',
      headStyles: { fillColor: [180, 83, 9] },
    });
  }

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
  const saldoMateriaPrima = filtrarSaldoMateriaPrima(saldoEstoque);
  const saldoProdutosGerados = filtrarSaldoProdutosGerados(saldoEstoque, data.producoes);
  const valorMateriaPrima = sumBy(saldoMateriaPrima, (i) => i.quantidade * i.valorUnit);
  const valorProdutosGerados = sumBy(saldoProdutosGerados, (i) => i.quantidade * i.valorUnit);
  const valorEstoque = valorMateriaPrima + valorProdutosGerados;
  const totalCompras = sumBy(data.compras, (c) => c.total);
  const totalVendas = sumBy(data.vendas.filter((v) => isVendaConcluida(v)), (v) => v.total);
  const saldoCaixa =
    sumBy(data.movimentosCaixa.filter((m) => m.tipo === 'entrada'), (m) => m.valor) -
    sumBy(data.movimentosCaixa.filter((m) => m.tipo === 'saida'), (m) => m.valor);
  const saldoBanco =
    sumBy(data.movimentosBanco.filter((m) => m.tipo === 'entrada'), (m) => m.valor) -
    sumBy(data.movimentosBanco.filter((m) => m.tipo === 'saida'), (m) => m.valor);
  const valorPatrimonio = sumBy(data.patrimonio, (p) => p.valorAtual);

  const resumoPreco = totalizarProdutosPrecificados(
    data.estoque,
    data.producoes,
    data.precosGerados
  );

  autoTable(doc, {
    startY: 52,
    head: [['Indicador', 'Valor']],
    body: [
      ['Itens matéria-prima', saldoMateriaPrima.length.toString()],
      ['Valor matéria-prima', formatCurrency(valorMateriaPrima)],
      ['Itens produtos gerados', saldoProdutosGerados.length.toString()],
      ['Valor produtos gerados (custo)', formatCurrency(valorProdutosGerados)],
      ['Valor potencial de venda', formatCurrency(resumoPreco.totais.valorVendaTotal)],
      ['Lucro potencial', formatCurrency(resumoPreco.totais.lucroPotencialTotal)],
      ['Valor total operacional', formatCurrency(valorEstoque)],
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

  if (resumoPreco.itens.length > 0) {
    const precificacaoRows = resumoPreco.itens.map((item) => [
      item.produto,
      item.quantidade > 0 ? `${item.quantidade} ${item.unidade}` : '—',
      item.custoUnitario > 0 ? formatCurrency(item.custoUnitario) : '—',
      item.margemLucro !== null ? `${item.margemLucro}%` : '—',
      item.precoSugerido !== null ? formatCurrency(item.precoSugerido) : '—',
      item.valorCustoTotal > 0 ? formatCurrency(item.valorCustoTotal) : '—',
      item.valorVendaTotal !== null ? formatCurrency(item.valorVendaTotal) : '—',
      item.lucroPotencial !== null ? formatCurrency(item.lucroPotencial) : '—',
    ]);

    const lastTable = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable;
    const startY = (lastTable?.finalY ?? 52) + 10;

    doc.setFontSize(11);
    doc.setTextColor(120, 53, 15);
    doc.text('Produtos produzidos — estoque e precificação', 14, startY);

    autoTable(doc, {
      startY: startY + 4,
      head: [
        [
          'Produto',
          'Qtd',
          'Custo un.',
          'Margem',
          'Preço sug.',
          'Total custo',
          'Total venda',
          'Lucro pot.',
        ],
      ],
      body: precificacaoRows,
      foot: [
        [
          'Totalização',
          `${resumoPreco.totais.quantidadeProdutos} prod.`,
          '',
          '',
          '',
          formatCurrency(resumoPreco.totais.valorCustoTotal),
          formatCurrency(resumoPreco.totais.valorVendaTotal),
          formatCurrency(resumoPreco.totais.lucroPotencialTotal),
        ],
      ],
      theme: 'grid',
      headStyles: { fillColor: [180, 83, 9] },
      footStyles: { fillColor: [254, 243, 199], textColor: [60, 40, 30], fontStyle: 'bold' },
    });
  }

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