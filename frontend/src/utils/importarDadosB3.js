import { encontrarCampo, parseNumero } from './importarUtils'

function limparTexto(txt) {
  if (txt === null || txt === undefined) return null
  const s = String(txt).trim()
  if (!s || s === '-' || s === '#N/A' || s === '#NULO!') return null
  return s
}

function normalizarTipo(tipo, ticker) {
  if (!tipo) {
    if (ticker && ticker.length >= 5 && ticker.endsWith('11')) return 'FII'
    return 'Acao'
  }
  const t = String(tipo).trim().toLowerCase()
  if (t.includes('fii') || t.includes('fundo')) return 'FII'
  if (t.includes('fiagro')) return 'FII'
  if (t.includes('bdr')) return 'BDR'
  if (t.includes('a') && (t.includes('ç') || t.includes('c'))) return 'Acao'
  return 'Acao'
}

function limparTicker(t) {
  if (!t) return null
  const limpo = String(t).trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  return limpo.length >= 4 && limpo.length <= 6 ? limpo : null
}

function decodeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

export const processarDadosB3 = (jsonData) => {
  const resultado = []
  const tickersVistos = new Set()
  const stats = {
    total: jsonData.length,
    aceitos: 0,
    duplicados: 0,
    sem_ticker: 0,
    descartados: 0,
  }

  console.log('[DADOS B3] Linhas recebidas:', jsonData.length)
  if (jsonData.length > 0) {
    console.log('[DADOS B3] Colunas da 1ª linha:', Object.keys(jsonData[0]))
  }

  for (const row of jsonData) {
    const tickerRaw = encontrarCampo(row, [
      'Código Negociável', 'Codigo Negociavel', 'Código', 'Codigo', 'Ticker', 'Ativo',
    ])
    const ticker = limparTicker(tickerRaw)
    if (!ticker) {
      stats.sem_ticker++
      continue
    }

    if (tickersVistos.has(ticker)) {
      stats.duplicados++
      continue
    }
    tickersVistos.add(ticker)

    const tipoRaw = encontrarCampo(row, ['Tipo'])
    const tipo = normalizarTipo(tipoRaw, ticker)

    const razaoSocial = limparTexto(decodeHtml(
      encontrarCampo(row, ['Razão Social', 'Razao Social', 'RS', 'Nome']) || ''
    ))

    const preco = parseNumero(encontrarCampo(row, [
      'Valor atual', 'Valor', 'Preço', 'Preco', 'Cotação', 'Cotacao',
    ]))

    const cnpj = limparTexto(encontrarCampo(row, ['CNPJ']))

    const segmento = limparTexto(decodeHtml(
      encontrarCampo(row, ['Segmento', 'Setor', 'Subsetor']) || ''
    ))

    const dy = parseNumero(encontrarCampo(row, ['DY', 'D.Y.', 'Dividend Yield']))
    const pvp = parseNumero(encontrarCampo(row, ['P/VP', 'P_VP', 'PVP', 'P/VPA']))

    const shortName = limparTexto(
      encontrarCampo(row, ['Short Name', 'ShortName', 'Nome Pregão', 'Nome Pregao'])
    )

    resultado.push({
      ticker,
      tipo,
      razao_social: razaoSocial,
      preco: preco > 0 ? preco : null,
      cnpj,
      segmento,
      dy: dy > 0 ? dy : null,
      pvp: pvp > 0 ? pvp : null,
      short_name: shortName,
    })
    stats.aceitos++
  }

  console.log('[DADOS B3] Estatísticas:', stats)
  return { dados: resultado, stats }
}
