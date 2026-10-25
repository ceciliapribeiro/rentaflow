import { supabase } from '../lib/supabase.js'

/**
 * Adiciona dias úteis (D+2) para considerar liquidação B3
 */
function adicionarDiasUteis(dataStr, dias = 2) {
  if (!dataStr) return null
  const [y, m, d] = dataStr.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  let dt = new Date(Date.UTC(y, m - 1, d))
  let adicionados = 0
  while (adicionados < dias) {
    dt.setUTCDate(dt.getUTCDate() + 1)
    const dow = dt.getUTCDay() // 0=dom, 6=sáb
    if (dow !== 0 && dow !== 6) {
      adicionados++
    }
  }
  return dt.toISOString().slice(0, 10)
}

/**
 * Avalia e atribui a corretora correta para cada dividendo com base:
 * 1. Nas datas e quantidades das operações de compra e venda de cada ticker por corretora.
 * 2. Na custódia real que o investidor mantinha em cada corretora na data do provento (data_ex ou data_pagamento).
 * 3. No intervalo de atuação de cada corretora (evita proventos antigos na Inter antes de sua primeira operação,
 *    e evita proventos recentes na Rico quando a custódia já estava na Inter).
 *
 * @param {Array} dividendos - Lista bruta de dividendos
 * @param {Array} operacoes - Lista de operações cadastradas
 * @param {Array} corretoras - Lista de corretoras cadastradas
 * @returns {{
 *   dividendosNormalizados: Array,
 *   divergencias: Array,
 *   estatisticas: Object,
 *   salvarNoBanco: Function
 * }}
 */
export function avaliarDividendosCorretora(dividendos, operacoes, corretoras) {
  if (!dividendos || dividendos.length === 0) {
    return {
      dividendosNormalizados: [],
      divergencias: [],
      estatisticas: { total: 0, corrigidos: 0, mantidos: 0 },
      salvarNoBanco: async () => ({ atualizados: 0 }),
    }
  }

  const mapaCorretoras = new Map()
  ;(corretoras || []).forEach(c => {
    mapaCorretoras.set(String(c.id), c)
  })

  // 1. Mapeia datas globais de atuação de cada corretora
  const dataMinPorCorretora = new Map()
  const dataMaxPorCorretora = new Map()
  ;(operacoes || []).forEach(op => {
    if (!op.corretora_id || !op.data) return
    const cId = String(op.corretora_id)
    const d = op.data.slice(0, 10)
    if (!dataMinPorCorretora.has(cId) || d < dataMinPorCorretora.get(cId)) {
      dataMinPorCorretora.set(cId, d)
    }
    if (!dataMaxPorCorretora.has(cId) || d > dataMaxPorCorretora.get(cId)) {
      dataMaxPorCorretora.set(cId, d)
    }
  })

  // 2. Agrupa operações por ticker e por corretora, calculando histórico de custódia
  // ticker -> { corretorasIds: Set, timelinePorCorretora: Map(cId -> [{ dataLiq, delta, qtdeAcumulada }]) }
  const historicoPorTicker = new Map()

  ;(operacoes || []).forEach(op => {
    const ticker = String(op.ticker || '').toUpperCase().trim()
    if (!ticker || !op.data || !op.corretora_id) return
    const cId = String(op.corretora_id)
    const q = Number(op.quantidade) || 0
    const tipo = String(op.operacao || 'COMPRA').toUpperCase().trim()
    const delta = tipo === 'VENDA' ? -q : q
    const dataLiq = adicionarDiasUteis(op.data, 2) || op.data.slice(0, 10)

    if (!historicoPorTicker.has(ticker)) {
      historicoPorTicker.set(ticker, {
        corretorasIds: new Set(),
        operacoes: [],
      })
    }
    const infoTicker = historicoPorTicker.get(ticker)
    infoTicker.corretorasIds.add(cId)
    infoTicker.operacoes.push({
      corretora_id: cId,
      data: op.data.slice(0, 10),
      dataLiq,
      delta,
      quantidade: q,
      operacao: tipo,
    })
  })

  // Constrói snapshots ordenados por corretora
  const timelines = new Map() // ticker -> Map(cId -> snapshots)
  for (const [ticker, info] of historicoPorTicker.entries()) {
    const mapaCorr = new Map()
    for (const cId of info.corretorasIds) {
      const opsCorr = info.operacoes
        .filter(o => o.corretora_id === cId)
        .sort((a, b) => a.dataLiq.localeCompare(b.dataLiq))

      let acumulado = 0
      const snapshots = []
      for (const op of opsCorr) {
        acumulado += op.delta
        snapshots.push({
          dataLiq: op.dataLiq,
          dataPregao: op.data,
          qtdeAcumulada: Math.max(0, acumulado),
        })
      }
      mapaCorr.set(cId, snapshots)
    }
    timelines.set(ticker, mapaCorr)
  }

  // Função auxiliar para consultar custódia em uma data de referência
  const obterCustodia = (ticker, cId, dataRef) => {
    const mapaCorr = timelines.get(ticker)
    if (!mapaCorr || !mapaCorr.has(cId)) return 0
    const snaps = mapaCorr.get(cId)
    let qtde = 0
    for (const s of snaps) {
      if (s.dataLiq <= dataRef || s.dataPregao <= dataRef) {
        qtde = s.qtdeAcumulada
      } else {
        break
      }
    }
    return qtde
  }

  // Identifica corretoras padrão (Inter, Rico) se existirem
  const rico = (corretoras || []).find(c => c.nome?.trim().toLowerCase() === 'rico')
  const inter = (corretoras || []).find(c => c.nome?.trim().toLowerCase() === 'inter')
  const ricoId = rico ? String(rico.id) : null
  const interId = inter ? String(inter.id) : null

  const divergencias = []
  const dividendosNormalizados = []

  for (const d of dividendos) {
    const ticker = String(d.ticker || '').toUpperCase().trim()
    const dataRef = String(d.data_ex || d.data_pagamento || '').slice(0, 10)
    const corrIdAtual = d.corretora_id ? String(d.corretora_id) : null

    let corretoraAtribuida = null
    let motivo = ''

    const infoTicker = historicoPorTicker.get(ticker)

    if (!infoTicker || infoTicker.corretorasIds.size === 0) {
      // Sem operações desse ticker: se a data for anterior ao início da Inter e houver Rico, é Rico
      if (interId && dataMinPorCorretora.has(interId) && dataRef < dataMinPorCorretora.get(interId)) {
        corretoraAtribuida = ricoId || corrIdAtual
        motivo = 'Data anterior à primeira operação na Inter'
      } else {
        corretoraAtribuida = corrIdAtual || interId || ricoId
        motivo = 'Sem operações cadastradas para este ticker'
      }
    } else if (infoTicker.corretorasIds.size === 1) {
      // 1. Ticker operado exclusivamente em uma única corretora
      corretoraAtribuida = Array.from(infoTicker.corretorasIds)[0]
      motivo = `Ticker ${ticker} operado exclusivamente nesta corretora`
    } else {
      // 2. Ticker operado em múltiplas corretoras (ex: Rico e Inter)
      // Avalia a custódia em cada corretora na data do dividendo
      const custodias = []
      for (const cId of infoTicker.corretorasIds) {
        const qtde = obterCustodia(ticker, cId, dataRef)
        custodias.push({ cId, qtde })
      }

      const comCustodia = custodias.filter(c => c.qtde > 0.0001)

      if (comCustodia.length === 1) {
        // Exatamente uma corretora tinha custódia na data
        corretoraAtribuida = comCustodia[0].cId
        motivo = `Custódia positiva (${comCustodia[0].qtde}) apenas nesta corretora na data ${dataRef}`
      } else if (comCustodia.length > 1) {
        // Mais de uma corretora com custódia: tenta conferir se d.quantidade bate com alguma das corretoras
        const qtdeDiv = Number(d.quantidade) || 0
        const matchQtde = comCustodia.find(c => Math.abs(c.qtde - qtdeDiv) < 0.001)
        if (matchQtde) {
          corretoraAtribuida = matchQtde.cId
          motivo = `Quantidade de provento (${qtdeDiv}) bate com a custódia da corretora`
        } else {
          // Se o tipo_provento trouxer indicação explícita (ex: 'RENDIMENTO (Rico)')
          const tipoStr = String(d.tipo_provento || '').toLowerCase()
          const corrPorNome = comCustodia.find(c => {
            const nomeCorr = mapaCorretoras.get(String(c.cId))?.nome?.toLowerCase() || ''
            return nomeCorr && tipoStr.includes(nomeCorr)
          })
          if (corrPorNome) {
            corretoraAtribuida = corrPorNome.cId
            motivo = `Tipo do provento indica a corretora ${mapaCorretoras.get(String(corrPorNome.cId))?.nome}`
          } else if (corrIdAtual && comCustodia.some(c => String(c.cId) === String(corrIdAtual))) {
            // Se já está atribuído a uma das corretoras com custódia positiva, preserva
            corretoraAtribuida = corrIdAtual
            motivo = `Mantido na corretora atual com custódia válida na data`
          } else {
            // Atribui à corretora com maior custódia
            comCustodia.sort((a, b) => b.qtde - a.qtde)
            corretoraAtribuida = comCustodia[0].cId
            motivo = `Maior custódia na data (${comCustodia[0].qtde})`
          }
        }
      } else {
        // Nenhuma corretora com custódia calculada na data exata:
        // Verifica qual corretora estava ativa nessa época
        if (interId && dataMinPorCorretora.has(interId) && dataRef < dataMinPorCorretora.get(interId)) {
          corretoraAtribuida = ricoId || Array.from(infoTicker.corretorasIds)[0]
          motivo = 'Data do provento anterior ao início das operações na Inter'
        } else {
          // Busca a operação mais próxima anterior
          const opsAnteriores = infoTicker.operacoes
            .filter(o => o.data <= dataRef)
            .sort((a, b) => b.data.localeCompare(a.data))

          if (opsAnteriores.length > 0) {
            corretoraAtribuida = opsAnteriores[0].corretora_id
            motivo = `Última operação anterior (${opsAnteriores[0].data}) realizada nesta corretora`
          } else {
            // Se o provento foi antes de qualquer compra, pega a primeira operação registrada
            const primeiraOp = [...infoTicker.operacoes].sort((a, b) => a.data.localeCompare(b.data))[0]
            corretoraAtribuida = primeiraOp.corretora_id
            motivo = `Primeira operação do ticker (${primeiraOp.data}) nesta corretora`
          }
        }
      }
    }

    // Validação final de consistência de datas entre corretoras:
    // Se foi atribuído à Inter, mas a data é anterior à primeira operação na Inter,
    // e o usuário possui Rico, realoca para Rico
    if (
      interId &&
      corretoraAtribuida === interId &&
      dataMinPorCorretora.has(interId) &&
      dataRef < dataMinPorCorretora.get(interId) &&
      ricoId
    ) {
      corretoraAtribuida = ricoId
      motivo = `Reatribuído à Rico: data (${dataRef}) anterior à primeira operação na Inter (${dataMinPorCorretora.get(interId)})`
    }

    // Se mudou de corretora ou estava sem corretora:
    const idNum = corretoraAtribuida ? parseInt(corretoraAtribuida, 10) : null
    const objCorretora = corretoraAtribuida ? mapaCorretoras.get(String(corretoraAtribuida)) : null

    if (String(corrIdAtual) !== String(corretoraAtribuida)) {
      divergencias.push({
        id: d.id,
        ticker,
        data_pagamento: d.data_pagamento,
        valor: d.valor,
        corretora_anterior: corrIdAtual ? mapaCorretoras.get(String(corrIdAtual))?.nome || corrIdAtual : 'Sem Corretora',
        corretora_correta: objCorretora?.nome || corretoraAtribuida,
        corretora_id_novo: idNum,
        motivo,
      })
    }

    dividendosNormalizados.push({
      ...d,
      corretora_id: idNum,
      corretoras: objCorretora ? { id: objCorretora.id, nome: objCorretora.nome, cor: objCorretora.cor } : d.corretoras,
    })
  }

  // Função para persistir as correções no Supabase
  const salvarNoBanco = async () => {
    if (divergencias.length === 0) return { atualizados: 0 }

    let atualizados = 0
    let erros = 0

    // Atualiza em lotes por corretora de destino
    const porDestino = new Map()
    for (const div of divergencias) {
      if (!div.id) continue
      const cId = div.corretora_id_novo
      if (!porDestino.has(cId)) porDestino.set(cId, [])
      porDestino.get(cId).push(div.id)
    }

    for (const [cId, ids] of porDestino.entries()) {
      try {
        const { error } = await supabase
          .from('dividendos')
          .update({ corretora_id: cId })
          .in('id', ids)

        if (error) {
          console.error(`Erro ao atualizar lote para corretora ${cId}:`, error)
          erros += ids.length
        } else {
          atualizados += ids.length
        }
      } catch (err) {
        console.error('Falha ao persistir reatribuição de dividendos:', err)
        erros += ids.length
      }
    }

    console.log(`[RentaFlow] ✅ Reatribuição de dividendos concluída: ${atualizados} atualizados, ${erros} erros.`)
    return { atualizados, erros }
  }

  return {
    dividendosNormalizados,
    divergencias,
    estatisticas: {
      total: dividendos.length,
      corrigidos: divergencias.length,
      mantidos: dividendos.length - divergencias.length,
    },
    salvarNoBanco,
  }
}
