/** Quebra de Amêndoa Torrada gera Nibs e Casca no mesmo lote. */

const COPRODUTOS_POR_INGREDIENTE = {
  'amêndoa torrada': ['Nibs', 'Casca'],
  'amendoa torrada': ['Nibs', 'Casca'],
};

function coprodutosSugeridosParaIngredientes(nomesIngredientes) {
  const map = new Map();
  for (const nome of nomesIngredientes) {
    const key = nome.trim().toLowerCase();
    const lista = COPRODUTOS_POR_INGREDIENTE[key];
    if (!lista) continue;
    for (const p of lista) map.set(p.toLowerCase(), p);
  }
  return Array.from(map.values());
}

function preencherProdutosComCoprodutos(atuais, nomesIngredientes, unidade) {
  const sugeridos = coprodutosSugeridosParaIngredientes(nomesIngredientes);
  if (sugeridos.length === 0) {
    return atuais.length > 0 ? atuais : [{ nome: '', quantidade: 0, unidade }];
  }
  const comNome = atuais.filter((p) => p.nome.trim());
  const sugeridosKey = new Set(sugeridos.map((n) => n.toLowerCase()));
  const soVazios = comNome.length === 0;
  const soSugeridos = comNome.every((p) => sugeridosKey.has(p.nome.trim().toLowerCase()));
  if (!soVazios && !soSugeridos) return atuais;
  const existentes = new Map(comNome.map((p) => [p.nome.trim().toLowerCase(), p]));
  return sugeridos.map((nome) => {
    const prev = existentes.get(nome.toLowerCase());
    return prev
      ? { ...prev, nome, unidade: prev.unidade || unidade }
      : { nome, quantidade: 0, unidade };
  });
}

function arredondar(valor) {
  return Math.round(valor * 1000) / 1000;
}

function calcularPerda(ingredientes, produtos) {
  const entrada = ingredientes.reduce((a, i) => a + i.quantidade, 0);
  const saida = produtos.reduce((a, p) => a + p.quantidade, 0);
  const perda = arredondar(Math.max(0, entrada - saida));
  return {
    entrada,
    saida: arredondar(saida),
    perda,
    percentual: entrada > 0 ? arredondar((perda / entrada) * 100) : 0,
  };
}

const fails = [];
function assert(cond, msg) {
  if (!cond) fails.push(msg);
}

const sugeridos = coprodutosSugeridosParaIngredientes(['Amêndoa Torrada']);
assert(sugeridos.length === 2, 'Amêndoa Torrada sugere 2 produtos');
assert(sugeridos.includes('Nibs') && sugeridos.includes('Casca'), 'coprodutos são Nibs e Casca');

const preenchido = preencherProdutosComCoprodutos(
  [{ nome: '', quantidade: 0, unidade: 'kg' }],
  ['Amêndoa Torrada'],
  'kg'
);
assert(preenchido.length === 2, 'formulário abre duas linhas');
assert(preenchido[0].nome === 'Nibs' && preenchido[1].nome === 'Casca', 'linhas Nibs e Casca');

const comNibs = preencherProdutosComCoprodutos(
  [{ nome: 'Nibs', quantidade: 10, unidade: 'kg' }],
  ['Amêndoa Torrada'],
  'kg'
);
assert(comNibs.find((p) => p.nome === 'Nibs')?.quantidade === 10, 'mantém quantidade já digitada de Nibs');
assert(comNibs.some((p) => p.nome === 'Casca'), 'completa Casca');

const outro = preencherProdutosComCoprodutos(
  [{ nome: 'Chocolate 100%', quantidade: 2, unidade: 'kg' }],
  ['Amêndoa Torrada'],
  'kg'
);
assert(outro.length === 1 && outro[0].nome === 'Chocolate 100%', 'não sobrescreve produto já escolhido');

const perda = calcularPerda(
  [{ quantidade: 10 }],
  [
    { quantidade: 7.5 },
    { quantidade: 1.8 },
  ]
);
assert(perda.saida === 9.3, 'saída é a soma dos produtos');
assert(perda.perda === 0.7, 'perda = entrada − Nibs − Casca');
assert(perda.percentual === 7, 'percentual de perda');

if (fails.length) {
  console.error('FALHOU:\n' + fails.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}

console.log('✓ Quebra de Amêndoa Torrada gera Nibs + Casca no mesmo lote');
