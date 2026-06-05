// ══════════════════════════════════════════════════════════════════
// UTILITÁRIOS DE IMPORTAÇÃO — RentaFlow
// ══════════════════════════════════════════════════════════════════

export const limparTicker = (ticker) => {
  if (!ticker) return ''
  let limpo = String(ticker).replace(/\s+/g, '').replace(/[^A-Z0-9]/gi, '').toUpperCase()
  const match = limpo.match(/^[A-Z0-9]{4,6}/)
  return match ? match[0] : limpo
}

export const identificarTipo = (ticker) => {
  if (ticker && ticker.length >= 5 && ticker.endsWith('11')) return 'FII'
  return 'Acao'
}

// Lista de palavras que indicam "não é da B3" — descartar na importação
const NAO_E_B3 = ['TESOURO', 'CDB', 'LCI', 'LCA', 'LFT', 'LTN', 'NTN', 'POUPANCA', 'POUPANÇA']

export const ehTickerValido = (ticker) => {
  if (!ticker) return false
  const t = String(ticker).toUpperCase().trim()
  // Descarta se for renda fixa/tesouro
  if (D:\Cecília\Documents\Projeto Renta Flow\rentaflow\frontend\src\pages\SmartAporte.jsx
.some(palavra => t.includes(palavra))) return false
  // Aceita 4-6 caracteres alfanuméricos
  return /^[A-Z]{3,6}\d{0,2}F?$/.test(t)
}

export const ehDataValida = (dataIso) => {
  if (!dataIso) return false
  const ano = parseInt(dataIso.split('-')[0], 10)
  // Descarta datas absurdas (antes de 2000 ou no futuro distante)
  return ano >= 2000 && ano <= 2050
}

export const parseData = (valor) => {
  if (!valor) return null

  if (typeof valor === 'number') {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30))
    const data = new Date(excelEpoch.getTime() + valor * 86400000)
    return data.toISOString().split('T')[0]
  }

  if (valor instanceof Date) return valor.toISOString().split('T')[0]

  const str = String(valor).trim()

  const matchIso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (matchIso) {
    const a = matchIso[1]
    const m = matchIso[2].padStart(2, '0')
    const d = matchIso[3].padStart(2, '0')
    return `${a}-${m}-${d}`
  }

  const matchBr4 = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (matchBr4) {
    const d = matchBr4[1].padStart(2, '0')
    const m = matchBr4[2].padStart(2, '0')
    const a = matchBr4[3]
    return `${a}-${m}-${d}`
  }

  const matchAbrev = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})(?:\s|$)/)
  if (matchAbrev) {
    const n1 = parseInt(matchAbrev[1], 10)
    const n2 = parseInt(matchAbrev[2], 10)
    const ano = matchAbrev[3]
    const anoCompleto = parseInt(ano, 10) < 70 ? `20${ano}` : `19${ano}`

    let dia, mes
    if (n1 > 12 && n2 <= 12) { dia = n1; mes = n2 }
    else if (n2 > 12 && n1 <= 12) { mes = n1; dia = n2 }
    else { mes = n1; dia = n2 }

    return `${anoCompleto}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
  }

  return null
}

export const parseNumero = (valor) => {
  if (valor === null || valor === undefined || valor === '') return 0
  if (typeof valor === 'number') return valor

  let str = String(valor).replace(/R\$\s*/gi, '').replace(/\s+/g, '').trim()
  if (!str) return 0

  const temVirgula = str.includes(',')
  const temPonto = str.includes('.')

  if (temVirgula && temPonto) {
    const posVirgula = str.lastIndexOf(',')
    const posPonto = str.lastIndexOf('.')
    if (posVirgula > posPonto) {
      str = str.replace(/\./g, '').replace(',', '.')
    } else {
      str = str.replace(/,/g, '')
    }
  } else if (temVirgula) {
    str = str.replace(',', '.')
  }

  const num = parseFloat(str)
  return isNaN(num) ? 0 : num
}

export const encontrarCampo = (row, nomesPossiveis) => {
  for (const nome of nomesPossiveis) {
    for (const key of Object.keys(row)) {
      const keyNorm = key
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().trim().replace(/\s+/g, ' ')
      const nomeNorm = nome
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().trim().replace(/\s+/g, ' ')
      if (keyNorm === nomeNorm || keyNorm.includes(nomeNorm) || nomeNorm.includes(keyNorm)) {
        if (row[key] !== '' && row[key] !== null && row[key] !== undefined) {
          return row[key]
        }
      }
    }
  }
  return null
}

export const formatBRL = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

export const formatData = (iso) => {
  if (!iso) return ''
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

// ══════════════════════════════════════════════════════════════════
// PROCESSAMENTO POR ABA — COM FILTROS DE VALIDAÇÃO
// ══════════════════════════════════════════════════════════════════

export const processarOperacoes = (jsonData) => {
  const resultado = []
  const stats = {
    total: jsonData.length,
    aceitas: 0,
    sem_ticker_e_data: 0,
    nao_e_b3: 0,
    sem_valor: 0,
    sem_qtde: 0,
    data_invalida: 0,
  }

  console.log('[OPERAÇÕES] Linhas recebidas:', jsonData.length)
  if (jsonData.length > 0) console.log('[OPERAÇÕES] Colunas:', Object.keys(jsonData[0]))

  for (const row of jsonData) {
    const data = encontrarCampo(row, ['Data'])
    const ticker = encontrarCampo(row, ['Ticker', 'Ticket', 'Codigo', 'Ativo'])
    const qtde = encontrarCampo(row, ['Quantidade', 'Qtde'])
    const valor = encontrarCampo(row, ['Valor', 'Preco', 'Preço'])
    const operacao = encontrarCampo(row, ['Operacao', 'Operação', 'Tipo'])

    // Filtro 1: descarta linhas sem ticker E sem data (linhas vazias da planilha)
    if (!ticker && !data) {
      stats.sem_ticker_e_data++
      continue
    }

    // Filtro 2: descarta se faltar ticker ou data
    if (!ticker || !data) {
      stats.sem_ticker_e_data++
      continue
    }

    // Filtro 3: descarta Tesouro/CDB/LCI/LCA (não é da B3)
    if (!ehTickerValido(ticker)) {
      stats.nao_e_b3++
      continue
    }

    const tickerLimpo = limparTicker(ticker)
    const dataLimpa = parseData(data)
    const qtdeNum = parseNumero(qtde)
    const valorNum = parseNumero(valor)
    const opStr = String(operacao || '').toUpperCase().trim()

    // Filtro 4: ticker, data ou qtde inválidos
    if (!tickerLimpo) {
      stats.nao_e_b3++
      continue
    }
    if (!dataLimpa || !ehDataValida(dataLimpa)) {
      stats.data_invalida++
      continue
    }
    if (qtdeNum === 0) {
      stats.sem_qtde++
      continue
    }

    // Filtro 5: descarta operações sem valor (preço unitário)
    if (valorNum === 0) {
      stats.sem_valor++
      continue
    }

    let tipoOp = 'COMPRA'
    if (opStr.includes('VENDA') || opStr === 'V' || qtdeNum < 0) tipoOp = 'VENDA'
    else if (opStr.includes('COMPRA') || opStr === 'C') tipoOp = 'COMPRA'

    resultado.push({
      data: dataLimpa,
      ticker: tickerLimpo,
      quantidade: Math.abs(qtdeNum),
      preco_unitario: valorNum,
      operacao: tipoOp,
      tipo_ativo: identificarTipo(tickerLimpo),
      selecionado: true,
    })
    stats.aceitas++
  }

  console.log('[OPERAÇÕES] Estatísticas:', stats)
  return resultado
}

export const processarAportes = (jsonData) => {
  const resultado = []
  const stats = {
    total: jsonData.length,
    aceitos: 0,
    sem_data: 0,
    sem_valor: 0,
    data_invalida: 0,
  }

  console.log('[APORTES] jsonData recebido:', jsonData.length, 'linhas')
  if (jsonData.length > 0) console.log('[APORTES] Colunas:', Object.keys(jsonData[0]))

  for (const row of jsonData) {
    const data = encontrarCampo(row, ['Data'])
    const valor = encontrarCampo(row, ['Valor'])
    const descricao = encontrarCampo(row, ['Descricao', 'Descrição', 'Obs'])

    if (!data) {
      stats.sem_data++
      continue
    }
    if (valor === null || valor === undefined || valor === '') {
      stats.sem_valor++
      continue
    }

    const dataLimpa = parseData(data)
    const valorNum = parseNumero(valor)

    if (!dataLimpa || !ehDataValida(dataLimpa)) {
      stats.data_invalida++
      continue
    }
    if (valorNum === 0) {
      stats.sem_valor++
      continue
    }

    resultado.push({
      data: dataLimpa,
      valor: valorNum,
      descricao: descricao ? String(descricao) : null,
      selecionado: true,
    })
    stats.aceitos++
  }

  console.log('[APORTES] Estatísticas:', stats)
  return resultado
}

export const processarDividendos = (jsonData) => {
  const resultado = []
  const stats = {
    total: jsonData.length,
    aceitos: 0,
    sem_ticker: 0,
    sem_data: 0,
    sem_valor: 0,
    nao_e_b3: 0,
    data_invalida: 0,
  }

  console.log('[DIVIDENDOS] jsonData recebido:', jsonData.length, 'linhas')
  if (jsonData.length > 0) console.log('[DIVIDENDOS] Colunas:', Object.keys(jsonData[0]))

  for (const row of jsonData) {
    const data = encontrarCampo(row, ['Data Pagamento', 'Pagamento', 'Data'])
    const valor = encontrarCampo(row, ['Valor'])
    const tipo = encontrarCampo(row, ['PROVENTOS', 'Proventos', 'Tipo Provento', 'Tipo'])
    const ticker = encontrarCampo(row, ['ATIVO', 'Ativo', 'TICKET', 'Ticker', 'Codigo'])

    if (!ticker) {
      stats.sem_ticker++
      continue
    }
    if (!data) {
      stats.sem_data++
      continue
    }

    if (!ehTickerValido(ticker)) {
      stats.nao_e_b3++
      continue
    }

    const tickerLimpo = limparTicker(ticker)
    const dataLimpa = parseData(data)
    const valorNum = parseNumero(valor)

    if (!tickerLimpo) {
      stats.nao_e_b3++
      continue
    }
    if (!dataLimpa || !ehDataValida(dataLimpa)) {
      stats.data_invalida++
      continue
    }
    if (valorNum === 0) {
      stats.sem_valor++
      continue
    }

    let tipoNorm = 'RENDIMENTO'
    const tipoStr = String(tipo || '').toUpperCase()
    if (tipoStr.includes('JUROS') || tipoStr.includes('JCP')) {
      tipoNorm = 'JUROS'
    } else if (tipoStr.includes('DIVIDENDO')) {
      tipoNorm = 'DIVIDENDO'
    }

    resultado.push({
      ticker: tickerLimpo,
      data_pagamento: dataLimpa,
      valor: valorNum,
      tipo: tipoNorm,
      selecionado: true,
    })
    stats.aceitos++
  }

  console.log('[DIVIDENDOS] Estatísticas:', stats)
  return resultado
}
