// supabase/functions/buscar-dividendos/index.ts
// Edge Function: busca proventos no Fundamentus (B3) e Status Invest fallback
// Portado de caca_dividendos.py do sistema desktop RentaFlow

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  'Referer': 'https://www.fundamentus.com.br/',
}

// ══════════════════════════════════════════════════════════════════
// FUNÇÕES DE DATA
// ══════════════════════════════════════════════════════════════════

function parseDataBR(s: string): Date | null {
  // "10/02/2026" → Date
  const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!m) return null
  const d = parseInt(m[1], 10)
  const mes = parseInt(m[2], 10)
  const a = parseInt(m[3], 10)
  if (a < 2000 || a > 2050) return null
  return new Date(Date.UTC(a, mes - 1, d))
}

function adicionarDiasUteis(data: Date, dias: number): Date {
  // Avança N dias úteis (pula sáb/dom)
  const d = new Date(data.getTime())
  let restantes = dias
  while (restantes > 0) {
    d.setUTCDate(d.getUTCDate() + 1)
    const dow = d.getUTCDay()
    if (dow !== 0 && dow !== 6) restantes--
  }
  return d
}

function dataParaIso(d: Date): string {
  return d.toISOString().split('T')[0]
}

// ══════════════════════════════════════════════════════════════════
// PARSER DE NÚMEROS BRASILEIROS
// ══════════════════════════════════════════════════════════════════

function parseValorBR(s: string): number {
  // "0,123" ou "1.234,56" → 0.123 / 1234.56
  const limpo = String(s)
    .replace(/[^\d,.\-]/g, '')
    .trim()
  if (!limpo) return 0
  const temPonto = limpo.includes('.')
  const temVirgula = limpo.includes(',')
  let normalizado = limpo
  if (temPonto && temVirgula) {
    normalizado = limpo.replace(/\./g, '').replace(',', '.')
  } else if (temVirgula) {
    normalizado = limpo.replace(',', '.')
  }
  const v = parseFloat(normalizado)
  return isNaN(v) ? 0 : v
}

// ══════════════════════════════════════════════════════════════════
// NORMALIZAÇÃO DE TIPO DE PROVENTO
// ══════════════════════════════════════════════════════════════════

function normalizarTipoProvento(raw: string): 'JUROS' | 'RENDIMENTO' {
  const t = String(raw || '').toUpperCase()
  if (t.includes('JCP') || t.includes('JUROS') || t.includes('JRS') || t.includes('CAP PROPRIO')) {
    return 'JUROS'
  }
  return 'RENDIMENTO'
}

// ══════════════════════════════════════════════════════════════════
// FUNDAMENTUS — Fonte primária
// ══════════════════════════════════════════════════════════════════

async function buscarFundamentus(ticker: string, ehFii: boolean): Promise<any[]> {
  const tickerUp = ticker.toUpperCase()
  const url = ehFii
    ? `https://www.fundamentus.com.br/fii_proventos.php?papel=${tickerUp}`
    : `https://www.fundamentus.com.br/proventos.php?papel=${tickerUp}&tipo=2`

  let html = ''
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      const res = await fetch(url, { headers: HEADERS })
      if (res.status === 200) {
        html = await res.text()
        break
      }
      if (res.status === 429 || res.status === 503) {
        const espera = 15000 * (tentativa + 1)
        console.log(`[FUND] ${ticker} rate limit (${res.status}) - aguardando ${espera}ms`)
        await new Promise(r => setTimeout(r, espera))
      }
    } catch (e) {
      if (tentativa < 2) await new Promise(r => setTimeout(r, 3000 * (tentativa + 1)))
    }
  }

  if (!html) return []

  // Extrai conteúdo das células <td>
  const re = /<td[^>]*>([^<]+)<\/td>/g
  const campos: string[] = []
  let m
  while ((m = re.exec(html)) !== null) {
    campos.push(m[1].trim())
  }

  if (campos.length === 0) return []

  const proventos = []
  const passo = ehFii ? 4 : 5  // FII: 4 colunas | Ação: 5 colunas

  for (let i = 0; i + (passo - 1) < campos.length; i += passo) {
    try {
      let dataExStr, tipoRaw, dataPagStr, valorStr

      if (ehFii) {
        // FII: data_ex | tipo | data_pagamento | valor
        dataExStr = campos[i]
        tipoRaw = campos[i + 1]
        dataPagStr = campos[i + 2].split(/\s+/)[0]
        valorStr = campos[i + 3]
      } else {
        // Ação: data_ex | valor | tipo | data_pagamento | _
        dataExStr = campos[i]
        valorStr = campos[i + 1]
        tipoRaw = campos[i + 2]
        dataPagStr = campos[i + 3].split(/\s+/)[0]
      }

      // Ignora linhas sem data de pagamento
      if (!dataPagStr || dataPagStr === '-') continue

      const dataEx = parseDataBR(dataExStr)
      const dataPag = parseDataBR(dataPagStr)
      if (!dataEx || !dataPag) continue

      const valor = parseValorBR(valorStr)
      if (valor <= 0) continue

      proventos.push({
        data_ex: dataParaIso(dataEx),
        data_pagamento: dataParaIso(dataPag),
        valor,
        tipo: normalizarTipoProvento(tipoRaw),
      })
    } catch (e) {
      continue
    }
  }

  return proventos
}

// ══════════════════════════════════════════════════════════════════
// STATUS INVEST — Fallback
// ══════════════════════════════════════════════════════════════════

async function buscarStatusInvest(ticker: string, ehFii: boolean): Promise<any[]> {
  const t = ticker.toLowerCase()
  const url = ehFii
    ? `https://statusinvest.com.br/fii/companytickerprovents?ticker=${t}&chartProventsType=2`
    : `https://statusinvest.com.br/acao/companytickerprovents?ticker=${t}&chartProventsType=1`

  let json: any = null
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': HEADERS['User-Agent'] } })
      if (res.status === 200) {
        json = await res.json()
        break
      }
      if (res.status === 429 || res.status === 503) {
        await new Promise(r => setTimeout(r, 15000 * (tentativa + 1)))
      }
    } catch (e) {
      if (tentativa < 2) await new Promise(r => setTimeout(r, 3000 * (tentativa + 1)))
    }
  }

  if (!json) return []

  const modelos = json.assetEarningsModels || []
  const proventos = []

  for (const item of modelos) {
    if (!item.pd || item.pd === '-') continue
    if (!item.ed || item.ed === '-') continue

    try {
      const dataEx = parseDataBR(item.ed)
      const dataPag = parseDataBR(item.pd)
      if (!dataEx || !dataPag) continue

      const valor = parseFloat(item.v)
      if (isNaN(valor) || valor <= 0) continue

      proventos.push({
        data_ex: dataParaIso(dataEx),
        data_pagamento: dataParaIso(dataPag),
        valor,
        tipo: normalizarTipoProvento(item.et || 'Rendimento'),
      })
    } catch (e) {
      continue
    }
  }

  return proventos
}

// ══════════════════════════════════════════════════════════════════
// BUSCA COMBINADA (Fundamentus → Status Invest fallback)
// ══════════════════════════════════════════════════════════════════

async function buscarProventos(ticker: string, ehFii: boolean): Promise<any[]> {
  // 1. Tenta Fundamentus
  let proventos = await buscarFundamentus(ticker, ehFii)
  let fonte = 'fundamentus'

  // 2. Fallback: Status Invest
  if (proventos.length === 0) {
    console.log(`[${ticker}] Fundamentus sem dados, tentando Status Invest...`)
    proventos = await buscarStatusInvest(ticker, ehFii)
    fonte = 'status_invest'
  }

  return proventos.map(p => ({ ...p, fonte }))
}

// ══════════════════════════════════════════════════════════════════
// CUSTÓDIA D+2 — Reconstrói posições por ticker
// ══════════════════════════════════════════════════════════════════

interface Operacao {
  data: string         // ISO yyyy-mm-dd (data do pregão)
  ticker: string
  quantidade: number
  operacao: string     // COMPRA ou VENDA
}

interface Snapshot {
  data_liquidacao: string  // ISO
  qtde_acumulada: number
}

function reconstruirCustodia(operacoes: Operacao[]): Map<string, Snapshot[]> {
  // Agrupa por ticker e calcula snapshots cumulativos com D+2
  const porTicker: Map<string, { data: Date, delta: number }[]> = new Map()

  for (const op of operacoes) {
    const dataPregao = new Date(op.data + 'T00:00:00Z')
    if (isNaN(dataPregao.getTime())) continue

    const dataLiquidacao = adicionarDiasUteis(dataPregao, 2)
    const qtde = Math.abs(op.quantidade)
    if (qtde <= 0) continue

    const tipo = String(op.operacao || '').toUpperCase()
    let delta = 0
    if (tipo.includes('COMPRA')) delta = +qtde
    else if (tipo.includes('VENDA')) delta = -qtde
    else continue

    if (!porTicker.has(op.ticker)) porTicker.set(op.ticker, [])
    porTicker.get(op.ticker)!.push({ data: dataLiquidacao, delta })
  }

  // Constrói snapshots ordenados
  const resultado: Map<string, Snapshot[]> = new Map()
  for (const [ticker, eventos] of porTicker.entries()) {
    eventos.sort((a, b) => a.data.getTime() - b.data.getTime())
    let acumulado = 0
    const snaps: Snapshot[] = []
    for (const e of eventos) {
      acumulado += e.delta
      snaps.push({
        data_liquidacao: dataParaIso(e.data),
        qtde_acumulada: Math.max(acumulado, 0),
      })
    }
    resultado.set(ticker, snaps)
  }

  return resultado
}

function qtdeNaData(snapshots: Snapshot[], dataIso: string): number {
  // Última snapshot com data <= dataIso
  let qtde = 0
  for (const s of snapshots) {
    if (s.data_liquidacao <= dataIso) {
      qtde = s.qtde_acumulada
    } else {
      break
    }
  }
  return qtde
}

// ══════════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const body = await req.json()
    const operacoes: Operacao[] = body.operacoes || []
    const tickers: { ticker: string, tipo: string }[] = body.tickers_carteira || []
    const dataInicio = body.data_inicio || '2024-01-01'
    const dataFim = body.data_fim || dataParaIso(new Date())

    if (operacoes.length === 0 || tickers.length === 0) {
      return new Response(
        JSON.stringify({ erro: 'operacoes e tickers_carteira são obrigatórios' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[INIT] Operações: ${operacoes.length} | Tickers: ${tickers.length}`)

    // 1. Reconstrói custódia D+2
    const snapshotsPorTicker = reconstruirCustodia(operacoes)
    console.log(`[CUSTODIA] ${snapshotsPorTicker.size} tickers com histórico`)

    // 2. Para cada ticker da carteira, busca proventos
    const encontrados = []
    let ignoradosSemCustodia = 0
    let totalProventosBrutos = 0

    for (const t of tickers) {
      const ticker = t.ticker.toUpperCase()
      const ehFii = String(t.tipo || '').toUpperCase().includes('FII')

      const snapshots = snapshotsPorTicker.get(ticker) || []
      if (snapshots.length === 0) {
        console.log(`[SKIP] ${ticker}: sem histórico de operações`)
        continue
      }

      try {
        const proventos = await buscarProventos(ticker, ehFii)
        totalProventosBrutos += proventos.length
        console.log(`[${ticker}] ${proventos.length} proventos brutos`)

        for (const p of proventos) {
          // Filtra por janela de busca
          if (p.data_pagamento < dataInicio || p.data_pagamento > dataFim) continue

          // Verifica custódia na data EX
          const qtde = qtdeNaData(snapshots, p.data_ex)
          if (qtde <= 0) {
            ignoradosSemCustodia++
            continue
          }

          // Calcula valor total recebido
          const valorTotal = Math.round(qtde * p.valor * 100) / 100

          encontrados.push({
            ticker,
            data_pagamento: p.data_pagamento,
            data_ex: p.data_ex,
            valor_unitario: p.valor,
            quantidade: qtde,
            valor_total: valorTotal,
            tipo: p.tipo,
            fonte: p.fonte,
          })
        }

        // Pequeno delay entre tickers para não saturar
        await new Promise(r => setTimeout(r, 500))

      } catch (e) {
        console.error(`[ERRO] ${ticker}:`, e)
      }
    }

    console.log(`[FIM] Encontrados: ${encontrados.length} | Sem custódia: ${ignoradosSemCustodia}`)

    return new Response(
      JSON.stringify({
        encontrados,
        stats: {
          tickers_consultados: tickers.length,
          total_proventos_brutos: totalProventosBrutos,
          encontrados: encontrados.length,
          ignorados_sem_custodia: ignoradosSemCustodia,
        }
      }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

  } catch (e) {
    console.error('[FATAL]', e)
    return new Response(
      JSON.stringify({ erro: e.message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
