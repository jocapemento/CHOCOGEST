import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outFile = path.join(root, 'ChocoGest-relatorio-completo.pdf');

const MARGIN = 14;
const PAGE_W = 210;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_Y = 287;

/** jsPDF (Helvetica) nao renderiza bem setas e travessao Unicode */
function pdfText(text) {
  return String(text)
    .replace(/\u2192/g, ' -> ')
    .replace(/\u2014/g, ' - ')
    .replace(/\u2022/g, '-');
}

function addHeader(doc, title) {
  doc.setFillColor(120, 53, 15);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text('ChocoGest', MARGIN, 12);
  doc.setFontSize(11);
  doc.text('Fábrica Bean-to-Bar • Bahia', MARGIN, 20);
  doc.setTextColor(60, 40, 30);
  doc.setFontSize(16);
  doc.text(pdfText(title), MARGIN, 40);
  doc.setFontSize(9);
  doc.text(pdfText(`Gerado em ${new Date().toLocaleString('pt-BR')}`), MARGIN, 48);
  return 56;
}

function addFooter(doc, page, total) {
  doc.setFontSize(8);
  doc.setTextColor(120, 100, 80);
  doc.text(pdfText(`ChocoGest - Relatorio completo - Pagina ${page} de ${total}`), MARGIN, FOOTER_Y);
}

function ensureSpace(doc, y, needed = 20) {
  if (y + needed > FOOTER_Y - 8) {
    doc.addPage();
    return 20;
  }
  return y;
}

function sectionTitle(doc, y, text) {
  y = ensureSpace(doc, y, 14);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(120, 53, 15);
  doc.text(pdfText(text), MARGIN, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 40, 30);
  return y + 8;
}

function paragraph(doc, y, text, fontSize = 10) {
  doc.setFontSize(fontSize);
  const lines = doc.splitTextToSize(pdfText(text), CONTENT_W);
  for (const line of lines) {
    y = ensureSpace(doc, y, 6);
    doc.text(line, MARGIN, y);
    y += fontSize * 0.45 + 1.5;
  }
  return y + 2;
}

function bulletList(doc, y, items) {
  doc.setFontSize(10);
  for (const item of items) {
    const lines = doc.splitTextToSize(pdfText(`- ${item}`), CONTENT_W - 4);
    for (let i = 0; i < lines.length; i++) {
      y = ensureSpace(doc, y, 6);
      const line = pdfText(lines[i]);
      doc.text(i === 0 ? line : `  ${line.replace(/^\-\s*/, '')}`, MARGIN + 2, y);
      y += 5.5;
    }
  }
  return y + 2;
}

const commits = [
  ['1aaca64', 'Exibir itens comprados no histórico de Compras'],
  ['bf0807e', 'Separar matéria-prima e produtos gerados no Dashboard e Estoque'],
  ['67a61a5', 'Perda automática na produção e histórico de preços'],
  ['521d037', 'Relatório das atividades de 2 de julho de 2026'],
  ['4dce86b', 'Deploy Pages sem cancelar em voo e com retry'],
  ['3def088', 'Workflow GitHub Pages com Node 22'],
  ['2f6e128', 'Conversão do total parcelado em dólar (Cartões)'],
  ['3aba7bf', 'Validar ingredientes em Produção e datas ISO'],
  ['2dd9ce3', 'Exclusão de produção com vendas relacionadas'],
  ['c046df5', 'Editar e excluir lançamentos em Produção'],
  ['c5b7dc2', 'Vendas lista apenas produtos de Produção'],
  ['e741060', 'Editar e excluir lançamentos em Caixa'],
  ['f77ce6e', 'Cadastro de bancos e edição em Banco'],
  ['b0bd50b', 'Soma de parcelas por cartão e por mês'],
  ['91205f0', 'Editar e excluir lançamentos em Compras'],
  ['2a1c4ee', 'Editar e excluir lançamentos em Vendas'],
  ['57f70bb', 'Estoque com lançamentos e saldo somado'],
];

const doc = new jsPDF();
let y = addHeader(doc, 'Relatório Completo do Projeto');

y = paragraph(
  doc,
  y,
  'Documento consolidado das evoluções do ChocoGest: desenvolvimento do dia 2 de julho de 2026, melhorias realizadas nas sessões seguintes, decisões sobre dados, produção, precificação, distribuição do sistema e publicação online.'
);

y = sectionTitle(doc, y, '1. Visão geral do sistema');
y = bulletList(doc, y, [
  'Sistema de gestão para fábrica de chocolate artesanal (bean-to-bar).',
  'Tecnologia: Next.js (app estático), dados no localStorage do navegador.',
  'Repositório: github.com/jocapemento/CHOCOGEST',
  'Site publicado: jocapemento.github.io/CHOCOGEST/',
  'Backup: Exportar/Importar Backup no cabeçalho do app.',
]);

y = sectionTitle(doc, y, '2. Dia 2 de julho de 2026 (20 commits)');
y = paragraph(doc, y, 'Dia intenso de evolução com CRUD completo nos módulos principais e estabilização do deploy.');

y = sectionTitle(doc, y, '2.1 Compras, Vendas e Estoque');
y = bulletList(doc, y, [
  'Editar e excluir lançamentos em Compras e Vendas.',
  'Estoque com lançamentos individuais e saldo disponível somado.',
  'Lista de itens já lançados no campo Nome em Compras.',
]);

y = sectionTitle(doc, y, '2.2 Produção');
y = bulletList(doc, y, [
  'Labels nos campos de ingredientes.',
  'Editar e excluir lançamentos de produção.',
  'Vendas lista apenas produtos registrados em Produção.',
  'Exclusão de produção com aviso de vendas relacionadas.',
  'Validação de ingredientes e normalização de datas ISO.',
]);

y = sectionTitle(doc, y, '2.3 Financeiro — Caixa, Banco e Cartões');
y = bulletList(doc, y, [
  'Editar e excluir lançamentos em Caixa.',
  'Cadastro de bancos e edição de lançamentos bancários.',
  'Soma de parcelas por cartão e por mês.',
  'Parcelas a partir da data inicial da compra.',
  'Conversão do total parcelado em dólar na aba Cartões.',
]);

y = sectionTitle(doc, y, '2.4 Publicação GitHub Pages');
y = bulletList(doc, y, [
  'Deploy automático via GitHub Actions (workflow deploy-pages.yml).',
  'Node 22 no build, retry sem cancelar deploy em andamento.',
  'Fonte correta: GitHub Actions (não usar branch main como fonte do Pages).',
]);

y = sectionTitle(doc, y, '3. Armazenamento de dados');
y = paragraph(
  doc,
  y,
  'O código fica no Git/GitHub; os dados inseridos (compras, vendas, estoque, etc.) ficam no localStorage de cada navegador/dispositivo. Não há sincronização automática entre aparelhos.'
);
y = bulletList(doc, y, [
  'chocogest_estoque, chocogest_compras, chocogest_vendas, chocogest_producoes',
  'chocogest_cartoes, chocogest_bancos, chocogest_patrimonio',
  'chocogest_caixa, chocogest_banco, chocogest_precos',
  'Para trocar de dispositivo: Exportar Backup → copiar arquivo → Importar Backup.',
]);

y = sectionTitle(doc, y, '4. Produção — controle de perdas (torra e processos)');
y = paragraph(
  doc,
  y,
  'Fluxo adotado: lançar a matéria-prima (entrada), depois o produto gerado (saída). O sistema calcula automaticamente a perda quantitativa e percentual.'
);
y = bulletList(doc, y, [
  'Exemplo: 1 kg amêndoa crua → 0,85 kg torrada = 0,15 kg de perda (15%).',
  'Custo dos ingredientes é rateado sobre a quantidade produzida.',
  'Lista de produtos no formulário (produtos já registrados em produções).',
  'Tabela de totalização de perdas por produto.',
  'Coluna Perda no histórico de produções.',
]);

y = sectionTitle(doc, y, '5. Precificação — histórico de preços');
y = bulletList(doc, y, [
  'Botão Registrar preço salva custo, margem e preço sugerido por produto.',
  'Campo Data do registro.',
  'Histórico filtrado por produto selecionado ou geral.',
  'Dados persistidos em chocogest_precos (localStorage e backup).',
]);

y = sectionTitle(doc, y, '6. Dashboard e Estoque — duas categorias');
y = bulletList(doc, y, [
  'Matéria-prima: itens com tipo MateriaPrima.',
  'Produtos gerados: itens cujo nome foi registrado em Produção.',
  'Dashboard com KPIs e painéis separados para cada categoria.',
  'Estoque com saldo e lançamentos em tabelas distintas.',
  'Equipamentos e outros tipos não aparecem nessas telas (vão ao Patrimônio).',
  'PDFs de Dashboard e Estoque atualizados com a mesma separação.',
]);

y = sectionTitle(doc, y, '7. Compras — histórico com itens');
y = paragraph(
  doc,
  y,
  'Adicionada coluna Itens no Histórico de Compras, listando nome, quantidade e unidade de cada item comprado. PDF de compras também atualizado.'
);

y = sectionTitle(doc, y, '8. Distribuir para outros fabricantes (sem acesso ao Git)');
y = bulletList(doc, y, [
  'Tornar o repositório privado no GitHub (Settings → Danger Zone).',
  'Manter GitHub Pages ativo com Source = GitHub Actions.',
  'Compartilhar apenas o link do app, nunca o repositório ou ZIP do código.',
  'Não adicionar fabricantes como colaboradores do GitHub.',
  'Orientar sobre Exportar/Importar Backup para preservar dados.',
  'Site público na internet; código-fonte privado no repositório.',
]);

y = sectionTitle(doc, y, '9. Principais commits (resumo)');
y = ensureSpace(doc, y, 20);
autoTable(doc, {
  startY: y,
  head: [['Commit', 'Descrição']],
  body: commits.map(([c, d]) => [c, pdfText(d)]),
  theme: 'grid',
  styles: { fontSize: 8, cellPadding: 2 },
  headStyles: { fillColor: [180, 83, 9] },
  margin: { left: MARGIN, right: MARGIN },
});
y = (doc.lastAutoTable?.finalY ?? y) + 12;

doc.addPage();
y = 20;
y = sectionTitle(doc, y, '10. GitHub Pages — configuração recomendada');
y = paragraph(
  doc,
  y,
  'Passo a passo para publicar o app com repositório privado. O código fica privado; o site fica público no link abaixo.'
);

y = sectionTitle(doc, y, '10.1 Configuração padrão (quando o menu aparece)');
y = bulletList(doc, y, [
  'Abrir: github.com/jocapemento/CHOCOGEST/settings/pages',
  'Em Build and deployment → Source (Origem), escolher: GitHub Actions.',
  'NÃO usar Deploy from a branch com branch main (publica o README, não o app).',
  'Abrir: github.com/jocapemento/CHOCOGEST/settings/actions',
  'Em Workflow permissions, marcar: Read and write permissions → Salvar.',
  'URL do app: https://jocapemento.github.io/CHOCOGEST/',
  'Validar localmente antes do push: npm run check',
]);

y = sectionTitle(doc, y, '10.2 Caminho alternativo (se GitHub Actions não aparecer)');
y = bulletList(doc, y, [
  'Abrir: github.com/jocapemento/CHOCOGEST/actions/workflows/deploy-pages.yml',
  'Clicar em Run workflow → branch main → Run workflow.',
  'Aguardar o workflow ficar verde (3 a 5 minutos).',
  'Voltar em Settings → Pages e conferir a mensagem: Your site is live at...',
  'Se falhar: conferir permissões em Settings → Actions → General.',
  'Em Actions permissions: Allow all actions and reusable workflows.',
]);

y = sectionTitle(doc, y, '10.3 O que compartilhar com outros fabricantes');
y = bulletList(doc, y, [
  'Compartilhar SOMENTE o link: https://jocapemento.github.io/CHOCOGEST/',
  'Ensinar Exportar Backup / Importar Backup no cabeçalho do app.',
  'Não enviar link do GitHub, ZIP do projeto ou convite de colaborador.',
]);

y = sectionTitle(doc, y, '10.4 O que não fazer');
y = bulletList(doc, y, [
  'Não usar branch main como fonte do Pages.',
  'Não depender só da branch gh-pages sem o workflow Actions.',
  'Não adicionar fabricantes como colaboradores do repositório.',
]);

y = sectionTitle(doc, y, '11. Situação atual');
y = bulletList(doc, y, [
  'Módulos operacionais com criar, editar e excluir.',
  'Produção integrada a Vendas e Estoque com controle de perdas.',
  'Precificação com histórico por produto.',
  'Dashboard e Estoque focados em matéria-prima e produtos gerados.',
  'Repositório configurável como privado para distribuição segura do app.',
]);

const totalPages = doc.getNumberOfPages();
for (let p = 1; p <= totalPages; p++) {
  doc.setPage(p);
  addFooter(doc, p, totalPages);
}

const buffer = Buffer.from(doc.output('arraybuffer'));
fs.writeFileSync(outFile, buffer);
console.log(`PDF gerado: ${outFile}`);