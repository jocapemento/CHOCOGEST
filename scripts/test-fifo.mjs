function compararLancamentosFifo(a, b) {
  const dateCmp = (a.data ?? '').localeCompare(b.data ?? '');
  if (dateCmp !== 0) return dateCmp;
  return a.id - b.id;
}

function baixarEstoqueFifo(estoque, itens) {
  const updated = estoque.map((e) => ({ ...e }));

  for (const item of itens) {
    let restante = item.quantidade;
    const nome = item.nome.toLowerCase();

    const indices = updated
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.nome.toLowerCase() === nome && entry.quantidade > 0)
      .sort((a, b) => compararLancamentosFifo(a.entry, b.entry))
      .map(({ index }) => index);

    for (const index of indices) {
      if (restante <= 0) break;
      const baixa = Math.min(updated[index].quantidade, restante);
      updated[index] = { ...updated[index], quantidade: updated[index].quantidade - baixa };
      restante -= baixa;
    }
  }

  return updated.filter((e) => e.quantidade > 0);
}

const estoque = [
  { id: 2, nome: 'Amêndoa', tipo: 'MateriaPrima', quantidade: 5, unidade: 'kg', valorUnit: 20, data: '2026-03-15' },
  { id: 1, nome: 'Amêndoa', tipo: 'MateriaPrima', quantidade: 10, unidade: 'kg', valorUnit: 15, data: '2026-01-10' },
];

const resultado = baixarEstoqueFifo(estoque, [
  { id: 0, nome: 'Amêndoa', tipo: 'MateriaPrima', quantidade: 3, unidade: 'kg', valorUnit: 0 },
]);

const antigo = resultado.find((e) => e.id === 1);
const recente = resultado.find((e) => e.id === 2);

if (!antigo || antigo.quantidade !== 7) {
  console.error('FIFO falhou: lançamento antigo deveria ter 7 kg, obteve', antigo?.quantidade);
  process.exit(1);
}

if (!recente || recente.quantidade !== 5) {
  console.error('FIFO falhou: lançamento recente deveria permanecer com 5 kg, obteve', recente?.quantidade);
  process.exit(1);
}

console.log('✓ Baixa FIFO: consome primeiro o lançamento mais antigo');