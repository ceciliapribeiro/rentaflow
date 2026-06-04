// ══════════════════════════════════════════════════════════════════
// SMART APORTE — Lógica de cálculo
// Portado de smart_aporte.py (sistema desktop RentaFlow)
// ══════════════════════════════════════════════════════════════════

// Parâmetros (mesmos do smart_aporte.py)
const PARAMS = {
  // Compra
  PISO_PESO_UNIFORME: 0.5,        // peso mínimo = 50% do peso uniforme
  FATOR_PVP_MIN: 0.5,             // fator P/VP nunca < 0.5

  // Venda — sobrealinhamento
  LIMIAR_SOBREALINHAMENTO: 1.30,  // peso > 130% do alvo
  FRACAO_VENDA_MAX: 1 / 3,        // até 1/3 da posição

  // Venda — DY baixo
  DY_BAIXO: 4.0,                  // < 4% considera baixo
  DY_BAIXO_FRACAO: 1 / 3,         // vende até 1/3

  // Venda — P/VP alto (FII)
  PVP_ALTO_FII: 1.20,             // P/VP > 1.20 em FII
  PVP_ALTO_FRACAO: 1 / 4,         // vende até 1/4

  // Venda — Stop loss
  STOP_LOSS_PCT: 0.75,            // preço < 75% do PM
  STOP_LOSS_FRACAO: 1.0,          // vende tudo

  // Venda — Take profit
  TAKE_PROFIT_PCT: 1.40,          // preço > 140% do PM
  TAKE_PROFIT_FRACAO: 1 / 3,      // vende 1/3
}

// ══════════════════════════════════════════════════════════════════
// CÁLCULO DO PREÇO MÉDIO (PM) por ticker — a partir das operações
// ══════════════════════════════════════════════════════════════════

export function calcularPrecoMedio(operacoes) {
  const pm = {} // { ticker: { qtde, custo } }

  for (const op of operacoes) {
    const t = op.ticker
    const q = Number(op.quantidade) || 0
    const p = Number(op.preco_unitario) || 0
    const tipo = String(op.operacao || '').toUpperCase()

    if (!pm[t]) pm[t] = { qtde: 0, custo: 0 }

    if (tipo === 'COMPRA') {
      pm[t].qtde += q
      pm[t].custo += q * p
    } else if (tipo === 'VENDA') {
      const pmAtual = pm[t].qtde > 0 ? pm[t].custo / pm[t].qtde : 0
      pm[t].qtde -= q
      pm[t].custo -= q * pmAtual
      if (pm[t].qtde < 0) pm[t].qtde = 0
      if (pm[t].custo < 0) pm[t].custo = 0
    }
  }

  // Retorna { ticker: pm_unitario }
  const resultado = {}
  for (const [t, data] of Object.entries(pm)) {
    resultado[t] = data.qtde > 0 ? data.custo / data.qtde : 0
  }
  return resultado
}

// ══════════════════════════════════════════════════════════════════
// CÁLCULO DOS PESOS-ALVO (proporcional ao DY com piso uniforme)
// ══════════════════════════════════════════════════════════════════

function calcularPesosAlvo(ativos) {
  const n = ativos.length
  if (n === 0) return {}

  const pesoUniforme = 1 / n
  const pisoPeso = pesoUniforme * PARAMS.PISO_PESO_UNIFORME

  // Soma dos DYs (mínimo 0.01 para evitar zero)
  const somaDy = ativos.reduce((s, a) => s + Math.max(a.dy || 0, 0.01), 0)

  // Peso bruto proporcional ao DY
  const pesos = {}
  for (const a of ativos) {
    const dyEfetivo = Math.max(a.dy || 0, 0.01)
    const pesoBruto = dyEfetivo / somaDy
    // Aplica piso de 50% do peso uniforme
    pesos[a.ticker] = Math.max(pesoBruto, pisoPeso)
  }

  // Normaliza para somar 1.0
  const total = Object.values(pesos).reduce((s, v) => s + v, 0)
  for (const t of Object.keys(pesos)) {
    pesos[t] = pesos[t] / total
  }

  return pesos
}

// ══════════════════════════════════════════════════════════════════
// SCORE DE COMPRA: défice × (1 + DY/100) × fator_pvp
// ══════════════════════════════════════════════════════════════════

function calcularScoreCompra(ativo, defice) {
  if (defice <= 0) return 0

  const dy = Number(ativo.dy) || 0
  const pvp = Number(ativo.pvp) || 0
  const ehFii = ativo.tipo === 'FII'

  // Fator P/VP: penaliza FIIs com P/VP > 1
  let fatorPvp = 1.0
  if (ehFii && pvp > 1) {
    fatorPvp = Math.max(PARAMS.FATOR_PVP_MIN, 1 / pvp)
  }

  return defice * (1 + dy / 100) * fatorPvp
}

// ══════════════════════════════════════════════════════════════════
// CRITÉRIOS DE VENDA (5 motivos)
// ══════════════════════════════════════════════════════════════════

function avaliarVendas(ativo, pesoReal, pesoAlvo, dyMedioCarteira) {
  const motivos = []
  const dy = Number(ativo.dy) || 0
  const pvp = Number(ativo.pvp) || 0
  const preco = Number(ativo.preco) || 0
  const pm = Number(ativo.preco_medio) || 0
  const qtde = Number(ativo.quantidade) || 0
  const ehFii = ativo.tipo === 'FII'

  // 1. Sobrealinhamento
  if (pesoAlvo > 0 && pesoReal > pesoAlvo * PARAMS.LIMIAR_SOBREALINHAMENTO) {
    const excesso = pesoReal - pesoAlvo
    const fracaoVenda = Math.min(PARAMS.FRACAO_VENDA_MAX, excesso / pesoReal)
    motivos.push({
      tipo: 'SOBREALINHAMENTO',
      descricao: `Peso ${(pesoReal * 100).toFixed(1)}% > alvo ${(pesoAlvo * 100).toFixed(1)}%`,
      fracao: fracaoVenda,
      cotas: Math.max(1, Math.floor(qtde * fracaoVenda)),
    })
  }

  // 2. DY baixo (apenas se média da carteira é maior)
  if (dy > 0 && dy < PARAMS.DY_BAIXO && dyMedioCarteira > PARAMS.DY_BAIXO) {
    motivos.push({
      tipo: 'DY_BAIXO',
      descricao: `DY ${dy.toFixed(2)}% < ${PARAMS.DY_BAIXO}% (média carteira: ${dyMedioCarteira.toFixed(2)}%)`,
      fracao: PARAMS.DY_BAIXO_FRACAO,
      cotas: Math.max(1, Math.floor(qtde * PARAMS.DY_BAIXO_FRACAO)),
    })
  }

  // 3. P/VP alto em FII
  if (ehFii && pvp > PARAMS.PVP_ALTO_FII) {
    motivos.push({
      tipo: 'PVP_ALTO',
      descricao: `FII com P/VP ${pvp.toFixed(2)} > ${PARAMS.PVP_ALTO_FII}`,
      fracao: PARAMS.PVP_ALTO_FRACAO,
      cotas: Math.max(1, Math.floor(qtde * PARAMS.PVP_ALTO_FRACAO)),
    })
  }

  // 4. Stop loss
  if (pm > 0 && preco > 0 && preco < pm * PARAMS.STOP_LOSS_PCT) {
    motivos.push({
      tipo: 'STOP_LOSS',
      descricao: `Preço R$ ${preco.toFixed(2)} < ${(PARAMS.STOP_LOSS_PCT * 100).toFixed(0)}% do PM R$ ${pm.toFixed(2)}`,
      fracao: PARAMS.STOP_LOSS_FRACAO,
      cotas: qtde, // vende tudo
    })
  }

  // 5. Take profit
  if (pm > 0 && preco > 0 && preco > pm * PARAMS.TAKE_PROFIT_PCT) {
    motivos.push({
      tipo: 'TAKE_PROFIT',
      descricao: `Preço R$ ${preco.toFixed(2)} > ${(PARAMS.TAKE_PROFIT_PCT * 100).toFixed(0)}% do PM R$ ${pm.toFixed(2)}`,
      fracao: PARAMS.TAKE_PROFIT_FRACAO,
      cotas: Math.max(1, Math.floor(qtde * PARAMS.TAKE_PROFIT_FRACAO)),
    })
  }

  return motivos
}

// ══════════════════════════════════════════════════════════════════
// FUNÇÃO PRINCIPAL — calcula a boleta completa
// ══════════════════════════════════════════════════════════════════

export function calcularSmartAporte({ carteira, ativosBase, operacoes, valorAporte }) {
  // 1. Calcula PM por ticker
  const pmPorTicker = calcularPrecoMedio(operacoes)

  // 2. Monta lista enriquecida
  const ativos = []
  for (const c of carteira) {
    const qtde = Number(c.qtde_ideal) || 0
    if (qtde <= 0) continue

    const base = ativosBase.find(a => a.ticker === c.ticker) || {}
    const preco = Number(base.preco) || 0

    // Só considera ativos com preço para a alocação
    if (preco <= 0) continue

    ativos.push({
      ticker: c.ticker,
      tipo: base.tipo || (c.ticker.endsWith('11') ? 'FII' : 'Acao'),
      razao_social: base.razao_social || null,
      quantidade: qtde,
      preco,
      preco_medio: pmPorTicker[c.ticker] || 0,
      valor_atual: qtde * preco,
      dy: Number(base.dy) || 0,
      pvp: Number(base.pvp) || 0,
    })
  }

  if (ativos.length === 0) {
    return {
      erro: 'Nenhum ativo com cotação válida na carteira.',
      compras: [],
      vendas: [],
      stats: null,
    }
  }

  // 3. Patrimônio
  const patrimonioAtual = ativos.reduce((s, a) => s + a.valor_atual, 0)
  const patrimonioProjetado = patrimonioAtual + valorAporte

  // 4. Pesos alvo
  const pesosAlvo = calcularPesosAlvo(ativos)

  // 5. DY médio ponderado da carteira
  const dyMedio = ativos.reduce((s, a) => s + a.dy * (a.valor_atual / patrimonioAtual), 0)

  // 6. Calcula défice e score de compra para cada ativo
  for (const a of ativos) {
    a.peso_real = a.valor_atual / patrimonioAtual
    a.peso_alvo = pesosAlvo[a.ticker] || 0
    a.alvo_valor = patrimonioProjetado * a.peso_alvo
    a.defice = a.alvo_valor - a.valor_atual
    a.score_compra = calcularScoreCompra(a, a.defice)
  }

  // 7. Distribui o aporte (greedy por score)
  const compras = []
  let restante = valorAporte
  const candidatos = ativos
    .filter(a => a.score_compra > 0)
    .sort((x, y) => y.score_compra - x.score_compra)

  for (const a of candidatos) {
    if (restante < a.preco) continue
    // Quantas cotas posso comprar do défice?
    const cotasIdeais = Math.floor(a.defice / a.preco)
    const cotasMaxRestante = Math.floor(restante / a.preco)
    const cotas = Math.min(cotasIdeais, cotasMaxRestante)

    if (cotas <= 0) continue

    const valorCompra = cotas * a.preco
    compras.push({
      ticker: a.ticker,
      tipo: a.tipo,
      cotas,
      preco: a.preco,
      valor: valorCompra,
      dy: a.dy,
      pvp: a.pvp,
      defice_antes: a.defice,
      score: a.score_compra,
    })
    restante -= valorCompra
  }

  // 8. Avalia critérios de venda
  const vendas = []
  for (const a of ativos) {
    const motivos = avaliarVendas(a, a.peso_real, a.peso_alvo, dyMedio)
    if (motivos.length > 0) {
      vendas.push({
        ticker: a.ticker,
        tipo: a.tipo,
        quantidade: a.quantidade,
        preco: a.preco,
        preco_medio: a.preco_medio,
        dy: a.dy,
        pvp: a.pvp,
        valor_atual: a.valor_atual,
        peso_real: a.peso_real,
        peso_alvo: a.peso_alvo,
        motivos,
      })
    }
  }

  return {
    erro: null,
    compras,
    vendas,
    stats: {
      patrimonio_atual: patrimonioAtual,
      patrimonio_projetado: patrimonioProjetado,
      valor_aporte: valorAporte,
      valor_alocado: valorAporte - restante,
      valor_restante: restante,
      total_ativos: ativos.length,
      dy_medio: dyMedio,
    },
    ativos: ativos.sort((x, y) => y.score_compra - x.score_compra),
  }
}
