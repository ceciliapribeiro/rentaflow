// Edge Function: buscar-dividendos (v1)
// Porta do caca_dividendos.py:
// - Custódia D+2 úteis a partir de OPERAÇÕES
// - Fundamentus primária + Status Invest fallback
// - Dedup por chave TICKER_DATA_PAGAMENTO_TIPO
// - Janela fixa 365 dias

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const JANELA_DIAS = 365

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ───────────────────────────────────────────────────────────
// TIPOS
// ───────────────────────────────────────────────────────────
interface Provento {
  data_ex: Date
  data_pagamento: Date
  valor_unitario: number
  tipo: 'RENDIMENTO' | 'JUROS'
}

interface Operacao {
  ticker: string
  data: string         // YYYY-MM-DD do pregão
  quantidade: number
  operacao: 'COMPRA' | 'VENDA'
  tipo_ativo?: string
}

interface Snapshot {
  data_liquidacao: Date  // após D+2 úteis
  qtde_acumulada: number
}

interface ResultadoTicker {
  ticker: string
  novos: number
  ignorados_sem_custodia: number
  duplicados: number
  fonte: 'Fundamentus' | 'StatusInvest' | 'nenhuma'
  erro?: string
}

// ───────────────────────────────────────────────────────────
// 1) D+2 dias úteis (idêntico ao desktop _adicionar_dias_uteis)
// ───────────────────────────────────────────────────────────
function adicionarDiasUteis(data: Date, dias: number): Date {
  let atual = new Date(data)
  atual.setHours(0, 0, 0, 0)
  let adicionados = 0
  while (adicionados < dias) {
    atual.setDate(atual.getDate() + 1)
    const dow = atual.getDay()  // 0=dom, 6=sáb
    if (dow !== 0 && dow !== 6) {
      adicionados += 1
    }
  }
  return atual
}

// Constrói snapshots de custódia por ticker usando data de LIQUIDAÇÃO (D+2 úteis)
function construirHistoricoPosicoes(operacoes: Operacao[]): Map<string, Snapshot[]> {
  const opsPorTicker = new Map<string, { data_liq: Date; delta: number }[]>()

  for (const op of operacoes) {
    const ticker = op.ticker.toUpperCase().trim()
    const qtde = Number(op.quantidade) || 0
    const tipo = (op.operacao || '').toUpperCase()
    if (qtde <= 0) continue

    // Parse data YYYY-MM-DD como local
    const [y, m, d] = op.data.split('-').map(Number)
    if (!y || !m || !d) continue
    const dataPregao = new Date(y, m - 1, d)
    const dataLiq = adicionarDiasUteis(dataPregao, 2)

    if (!opsPorTicker.has(ticker)) opsPorTicker.set(ticker, [])
    const lista = opsPorTicker.get(ticker)!

    if (tipo === 'COMPRA') {
      lista.push({ data_liq: dataLiq, delta: +qtde })
    } else if (tipo === 'VENDA') {
      lista.push({ data_liq: dataLiq, delta: -qtde })
    }
  }

  const historico = new Map<string, Snapshot[]>()
  for (const [ticker, ops] of opsPorTicker.entries()) {
    ops.sort((a, b) => a.data_liq.getTime() - b.data_liq.getTime())
    let acumulado = 0
    const snapshots: Snapshot[] = []
    for (const op of ops) {
      acumulado += op.delta
      snapshots.push({
        data_liquidacao: op.data_liq,
        qtde_acumulada: Math.max(acumulado, 0),
      })
    }
    historico.set(ticker, snapshots)
  }

  return historico
}

// Quantas cotas o usuário tinha em custódia em uma data EX específica
function qtdeEmCustodia(snapshots: Snapshot[], dataRef: Date): number {
  let qtde = 0
  const ref = dataRef.getTime()
  for (const snap of snapshots) {
    if (snap.data_liquidacao.getTime() <= ref) {
      qtde = snap.qtde_acumulada
    } else {
      break
    }
  }
  return qtde
}

// Normaliza tipo de provento para RENDIMENTO ou JUROS
function tipoParaDesc(tipoRaw: string): 'RENDIMENTO' | 'JUROS' {
  const t = (tipoRaw || '').toUpperCase()
  if (t.includes('JRS') || t.includes('JUROS') || t.includes('JCP') || t.includes('CAP PROPRIO')) {
    return 'JUROS'
  }
  return 'RENDIMENTO'
}

// Parse data BR DD/MM/YYYY → Date
function parseDataBR(s: string): Date | null {
  if (!s || s === '-') return null
  const parts = s.trim().split('/')
  if (parts.length !== 3) return null
  const [d, m, y] = parts.map(Number)
  if (!d || !m || !y) return null
  return new Date(y, m - 1, d)
}

// Parse valor BR "12,34" → 12.34
function parseValorBR(s: string): number {
  if (!s) return 0
  const limpo = s.trim().replace(/\./g, '').replace(',', '.')
  const n = parseFloat(limpo)
  return isFinite(n) ? n : 0
}

// ───────────────────────────────────────────────────────────
// 4) FUNDAMENTUS — fonte primária (mesma lógica do desktop)
// ───────────────────────────────────────────────────────────
async function buscarFundamentus(
  ticker: string,
  ehFII: boolean,
): Promise<Provento[]> {
  const headers = {
    'User-Agent': UA,
    'Referer': 'https://www.fundamentus.com.br/',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'pt-BR,pt;q=0.9',
  }

  const url = ehFII
    ? `https://www.fundamentus.com.br/fii_proventos.php?papel=${ticker.toUpperCase()}`
    : `https://www.fundamentus.com.br/proventos.php?papel=${ticker.toUpperCase()}&tipo=2`

  let html = ''
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      const r = await fetch(url, { headers })
      if (r.ok) {
        html = await r.text()
        break
      }
      if (tentativa < 2) {
        await new Promise(rs => setTimeout(rs, 3000 * (tentativa + 1)))
      }
    } catch {
      if (tentativa < 2) {
        await new Promise(rs => setTimeout(rs, 3000 * (tentativa + 1)))
      }
    }
  }

  if (!html) return []

  // Extrai todos os <td>...</td>
  const tdMatches = html.matchAll(/<td[^>]*>([^<]+)<\/td>/g)
  const campos: string[] = []
  for (const m of tdMatches) {
    campos.push(m[1].trim())
  }

  if (campos.length === 0) return []

  const proventos: Provento[] = []
  const passo = ehFII ? 4 : 5

  for (let i = 0; i <= campos.length - passo; i += passo) {
    try {
      let dataExStr: string
      let dataPagStr: string
      let valorStr: string
      let tipoRaw: string

      if (ehFII) {
        // FII: data_ex | tipo | data_pagamento | valor
        dataExStr  = campos[i].trim()
        tipoRaw    = campos[i + 1].trim()
        dataPagStr = campos[i + 2].trim().split(/\s+/)[0]
        valorStr   = campos[i + 3].trim()
      } else {
        // Ação: data_ex | valor | tipo | data_pagamento | _
        dataExStr  = campos[i].trim()
        valorStr   = campos[i + 1].trim()
        tipoRaw    = campos[i + 2].trim()
        dataPagStr = campos[i + 3].trim().split(/\s+/)[0]
      }

      if (!dataPagStr || dataPagStr === '-') continue

      const dataEx = parseDataBR(dataExStr)
      const dataPag = parseDataBR(dataPagStr)
      const valor = parseValorBR(valorStr)

      if (!dataEx || !dataPag || valor <= 0) continue

      proventos.push({
        data_ex: dataEx,
        data_pagamento: dataPag,
        valor_unitario: valor,
        tipo: tipoParaDesc(tipoRaw),
      })
    } catch {
      continue
    }
  }

  return proventos
}

// ───────────────────────────────────────────────────────────
// 5) STATUS INVEST — fallback (JSON API)
// ───────────────────────────────────────────────────────────
async function buscarStatusInvestProventos(
  ticker: string,
  ehFII: boolean,
): Promise<Provento[]> {
  const headers = { 'User-Agent': UA }

  const buscarUrl = async (url: string): Promise<any[]> => {
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      try {
        const r = await fetch(url, { headers })
        if (r.status === 429 || r.status === 503) {
          await new Promise(rs => setTimeout(rs, 15000 * (tentativa + 1)))
          continue
        }
        if (r.ok) {
          const j = await r.json().catch(() => ({}))
          return j?.assetEarningsModels || []
        }
      } catch {
        if (tentativa < 2) {
          await new Promise(rs => setTimeout(rs, 3000 * (tentativa + 1)))
        }
      }
    }
    return []
  }

  const url = ehFII
    ? `https://statusinvest.com.br/fii/companytickerprovents?ticker=${ticker.toLowerCase()}&chartProventsType=2`
    : `https://statusinvest.com.br/acao/companytickerprovents?ticker=${ticker.toLowerCase()}&chartProventsType=1`

  let modelos = await buscarUrl(url)

  // Para ações, tenta também chartProventsType=2 se vier vazio
  if (modelos.length === 0 && !ehFII) {
    modelos = await buscarUrl(url.replace('chartProventsType=1', 'chartProventsType=2'))
  }

  const proventos: Provento[] = []
  for (const item of modelos) {
    if (!item?.pd || item.pd === '-') continue
    if (!item?.ed || item.ed === '-') continue
    try {
      const dataEx = parseDataBR(item.ed)
      const dataPag = parseDataBR(item.pd)
      const valor = Number(item.v) || 0
      if (!dataEx || !dataPag || valor <= 0) continue
      proventos.push({
        data_ex: dataEx,
        data_pagamento: dataPag,
        valor_unitario: valor,
        tipo: tipoParaDesc(item.et || 'Rendimento'),
      })
    } catch {
      continue
    }
  }

  return proventos
}

// ───────────────────────────────────────────────────────────
// 6) COMBINADOR — Fundamentus → Status Invest fallback
// ───────────────────────────────────────────────────────────
async function buscarProventos(
  ticker: string,
  ehFII: boolean,
): Promise<{ proventos: Provento[]; fonte: 'Fundamentus' | 'StatusInvest' | 'nenhuma' }> {
  // Tenta Fundamentus primeiro
  const fundamentus = await buscarFundamentus(ticker, ehFII)
  if (fundamentus.length > 0) {
    return { proventos: fundamentus, fonte: 'Fundamentus' }
  }

  // Fallback para Status Invest
  const statusInvest = await buscarStatusInvestProventos(ticker, ehFII)
  if (statusInvest.length > 0) {
    return { proventos: statusInvest, fonte: 'StatusInvest' }
  }

  return { proventos: [], fonte: 'nenhuma' }
}

// ───────────────────────────────────────────────────────────
// 7) Detecta se é FII (consulta tabela ativos primeiro, fallback heurístico)
// ───────────────────────────────────────────────────────────
async function detectarFII(
  supabase: any,
  ticker: string,
): Promise<boolean> {
  // Heurística rápida primeiro
  const heuristica = ticker.length === 6 && ticker.endsWith('11')

  try {
    const { data } = await supabase
      .from('ativos').select('tipo')
      .eq('ticker', ticker).maybeSingle()
    if (data?.tipo) {
      const t = String(data.tipo).toUpperCase()
      return t === 'FII' || t === 'FIAGRO'
    }
  } catch {
    /* segue com heurística */
  }
  return heuristica
}

// ───────────────────────────────────────────────────────────
// 8) Processa um ticker: busca + filtra por custódia + dedup
// ───────────────────────────────────────────────────────────
interface RegistroExistente {
  data_pagamento: string  // YYYY-MM-DD
  tipo_provento: string   // RENDIMENTO ou JUROS
}

async function processarTicker(
  supabase: any,
  userId: string,
  ticker: string,
  snapshots: Snapshot[],
  existentesPorTicker: Map<string, Set<string>>,
  inicioBusca: Date,
  hojeLimite: Date,
): Promise<ResultadoTicker> {
  const resultado: ResultadoTicker = {
    ticker,
    novos: 0,
    ignorados_sem_custodia: 0,
    duplicados: 0,
    fonte: 'nenhuma',
  }

  const ehFii = await detectarFII(supabase, ticker)

  try {
    const { proventos, fonte } = await buscarProventos(ticker, ehFii)
    resultado.fonte = fonte

    if (proventos.length === 0) {
      resultado.erro = 'Sem proventos retornados pelas fontes'
      return resultado
    }

    const chavesExistentes = existentesPorTicker.get(ticker) || new Set<string>()
    const novosRegistros: any[] = []

    for (const prov of proventos) {
      // Filtra pela janela (365 dias)
      if (prov.data_pagamento < inicioBusca || prov.data_pagamento > hojeLimite) {
        continue
      }

      // Calcula qtde em custódia na data EX (D+2 já aplicado nos snapshots)
      const qtde = qtdeEmCustodia(snapshots, prov.data_ex)
      if (qtde <= 0) {
        resultado.ignorados_sem_custodia += 1
        continue
      }

      // Formata data como YYYY-MM-DD
      const yyyy = prov.data_pagamento.getFullYear()
      const mm = String(prov.data_pagamento.getMonth() + 1).padStart(2, '0')
      const dd = String(prov.data_pagamento.getDate()).padStart(2, '0')
      const dataPagISO = `${yyyy}-${mm}-${dd}`

      // Dedup por chave TICKER_DATA_TIPO
      const chave = `${dataPagISO}_${prov.tipo}`
      if (chavesExistentes.has(chave)) {
        resultado.duplicados += 1
        continue
      }

      const valorTotal = Math.round(qtde * prov.valor_unitario * 100) / 100

      novosRegistros.push({
        user_id: userId,
        ticker,
        ano: yyyy,
        data_pagamento: dataPagISO,
        data_ex: `${prov.data_ex.getFullYear()}-${String(prov.data_ex.getMonth() + 1).padStart(2, '0')}-${String(prov.data_ex.getDate()).padStart(2, '0')}`,
        valor: valorTotal,
        valor_unitario: prov.valor_unitario,
        quantidade: qtde,
        tipo_provento: prov.tipo,
        fonte,
      })

      chavesExistentes.add(chave)
    }

    if (novosRegistros.length > 0) {
      const { error } = await supabase.from('dividendos').insert(novosRegistros)
      if (error) {
        resultado.erro = `Erro ao gravar: ${error.message}`
      } else {
        resultado.novos = novosRegistros.length
      }
    }

    return resultado
  } catch (e) {
    resultado.erro = String(e).slice(0, 150)
    return resultado
  }
}

// ───────────────────────────────────────────────────────────
// 9) HANDLER HTTP
// ───────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ erro: 'Use POST' }, 405)
  }

  try {
    const body = await req.json().catch(() => ({}))
    const userId: string = body?.user_id

    if (!userId) {
      return jsonResponse({ erro: 'Envie user_id' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1) Carrega operações do usuário
    const { data: opsRaw, error: errOps } = await supabase
      .from('operacoes')
      .select('ticker, data, quantidade, operacao')
      .eq('user_id', userId)
      .order('data', { ascending: true })

    if (errOps) {
      return jsonResponse({ erro: `Erro ao ler operações: ${errOps.message}` }, 500)
    }

    const operacoes: Operacao[] = (opsRaw || [])
      .filter((o: any) => o.ticker && o.data && o.quantidade && o.operacao)
      .map((o: any) => ({
        ticker: o.ticker,
        data: o.data,
        quantidade: Number(o.quantidade),
        operacao: o.operacao,
      }))

    if (operacoes.length === 0) {
      return jsonResponse({
        erro: 'Nenhuma operação cadastrada. Importe operações primeiro.',
      }, 400)
    }

    // 2) Constrói histórico de custódia (D+2 úteis)
    const historico = construirHistoricoPosicoes(operacoes)
    const tickers = Array.from(historico.keys()).sort()

    // 3) Carrega dividendos já registrados (dedup)
    const { data: divsRaw } = await supabase
      .from('dividendos')
      .select('ticker, data_pagamento, tipo_provento')
      .eq('user_id', userId)

    const existentesPorTicker = new Map<string, Set<string>>()
    if (divsRaw) {
      for (const d of divsRaw) {
        const tk = String(d.ticker).toUpperCase()
        if (!existentesPorTicker.has(tk)) existentesPorTicker.set(tk, new Set())
        const dataISO = String(d.data_pagamento).slice(0, 10)
        const tipo = String(d.tipo_provento || 'RENDIMENTO').toUpperCase()
        const chave = `${dataISO}_${tipo}`
        existentesPorTicker.get(tk)!.add(chave)
      }
    }

    // 4) Janela de busca: últimos 365 dias
    const hojeLimite = new Date()
    hojeLimite.setHours(23, 59, 59, 999)
    const inicioBusca = new Date(hojeLimite)
    inicioBusca.setDate(inicioBusca.getDate() - JANELA_DIAS)

    // 5) Processa tickers em paralelo (3 de cada vez)
    const resultados: ResultadoTicker[] = []
    const PARALELO = 3

    for (let i = 0; i < tickers.length; i += PARALELO) {
      const lote = tickers.slice(i, i + PARALELO)
      const r = await Promise.all(
        lote.map((t) =>
          processarTicker(
            supabase, userId, t,
            historico.get(t)!,
            existentesPorTicker,
            inicioBusca, hojeLimite,
          )
        )
      )
      resultados.push(...r)

      // Sleep entre lotes para respeitar rate limits
      if (i + PARALELO < tickers.length) {
        await new Promise((rs) => setTimeout(rs, 500))
      }
    }

    // 6) Estatísticas finais
    const totalNovos = resultados.reduce((s, r) => s + r.novos, 0)
    const totalIgnorados = resultados.reduce((s, r) => s + r.ignorados_sem_custodia, 0)
    const totalDuplicados = resultados.reduce((s, r) => s + r.duplicados, 0)
    const tickersComErro = resultados.filter((r) => r.erro).length

    const fontes = {
      fundamentus: resultados.filter((r) => r.fonte === 'Fundamentus').length,
      statusinvest: resultados.filter((r) => r.fonte === 'StatusInvest').length,
      nenhuma: resultados.filter((r) => r.fonte === 'nenhuma').length,
    }

    return jsonResponse({
      tickers_processados: resultados.length,
      novos_dividendos: totalNovos,
      ignorados_sem_custodia: totalIgnorados,
      duplicados: totalDuplicados,
      erros: tickersComErro,
      janela_dias: JANELA_DIAS,
      data_inicio: inicioBusca.toISOString().slice(0, 10),
      data_fim: hojeLimite.toISOString().slice(0, 10),
      fontes,
      detalhes: resultados,
    })
  } catch (e) {
    return jsonResponse({ erro: String(e) }, 500)
  }
})
