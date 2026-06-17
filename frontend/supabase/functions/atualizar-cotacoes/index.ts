// Edge Function: atualizar-cotacoes (v10)
// Brapi (primária) + Yahoo Finance (fallback)
// Brapi: preço + DY + P/VP via modules=defaultKeyStatistics,financialData
// Yahoo: usado apenas se Brapi falhar (sem token, ticker desconhecido, rate limit)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface AtivoData {
  ticker: string
  preco: number
  dy?: number
  pvp?: number
  razao_social?: string
  fontePreco?: string
  fonteDy?: string
  fontePvp?: string
  erro?: string
}

// ───────────────────────────────────────────────────────────
// 1) BRAPI — preço + DY + P/VP (primária)
// ───────────────────────────────────────────────────────────
async function buscarBrapi(ticker: string, token: string): Promise<AtivoData> {
  const out: AtivoData = { ticker, preco: 0 }
  try {
    const url = `https://brapi.dev/api/quote/${ticker}?token=${token}&modules=defaultKeyStatistics,financialData`
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } })

    if (!r.ok) {
      out.erro = `Brapi HTTP ${r.status}`
      return out
    }

    const j = await r.json()
    const result = j?.results?.[0]
    if (!result) {
      out.erro = 'Brapi sem dados'
      return out
    }

    out.preco = Number(result.regularMarketPrice) || 0
    if (out.preco > 0) out.fontePreco = 'Brapi'

    out.razao_social = result.longName || result.shortName || undefined

    const dks = result.defaultKeyStatistics
    if (dks) {
      const dyRaw = Number(dks.dividendYield)
      if (dyRaw > 0) {
        out.dy = dyRaw < 1 ? dyRaw * 100 : dyRaw
        out.fonteDy = 'Brapi'
      }
      const pvpRaw = Number(dks.priceToBook)
      if (pvpRaw > 0 && pvpRaw < 100) {
        out.pvp = pvpRaw
        out.fontePvp = 'Brapi'
      }
    }

    return out
  } catch (e) {
    out.erro = `Brapi: ${String(e).slice(0, 80)}`
    return out
  }
}

// ───────────────────────────────────────────────────────────
// 2) YAHOO FINANCE — fallback para preço (e tenta DY/PVP)
// ───────────────────────────────────────────────────────────
async function buscarYahoo(ticker: string): Promise<Partial<AtivoData>> {
  const out: Partial<AtivoData> = {}
  try {
    const tickerB3 = `${ticker}.SA`

    // Preço via /chart
    const urlChart = `https://query1.finance.yahoo.com/v8/finance/chart/${tickerB3}?interval=1d&range=5d`
    const r = await fetch(urlChart, { headers: { 'User-Agent': UA } })
    if (r.ok) {
      const j = await r.json()
      const meta = j?.chart?.result?.[0]?.meta
      let preco = meta?.regularMarketPrice || meta?.chartPreviousClose || 0

      if (!preco) {
        const closes = j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close
        if (Array.isArray(closes)) {
          for (let i = closes.length - 1; i >= 0; i--) {
            if (closes[i] != null) { preco = Number(closes[i]); break }
          }
        }
      }
      if (preco > 0) {
        out.preco = Number(preco)
        out.fontePreco = 'Yahoo'
      }
    }

    // Tenta DY/PVP via quoteSummary (geralmente vazio para B3, mas custa pouco)
    try {
      const urlSum = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${tickerB3}?modules=summaryDetail,defaultKeyStatistics`
      const rs = await fetch(urlSum, { headers: { 'User-Agent': UA } })
      if (rs.ok) {
        const js = await rs.json()
        const q = js?.quoteSummary?.result?.[0]
        const dyRaw = q?.summaryDetail?.dividendYield?.raw
                   ?? q?.summaryDetail?.trailingAnnualDividendYield?.raw
        const pvpRaw = q?.defaultKeyStatistics?.priceToBook?.raw
        if (typeof dyRaw === 'number' && dyRaw > 0) {
          out.dy = dyRaw * 100
          out.fonteDy = 'Yahoo'
        }
        if (typeof pvpRaw === 'number' && pvpRaw > 0) {
          out.pvp = pvpRaw
          out.fontePvp = 'Yahoo'
        }
      }
    } catch { /* segue */ }

    return out
  } catch {
    return out
  }
}

// ───────────────────────────────────────────────────────────
// 3) Combina: Brapi primária + Yahoo fallback
// ───────────────────────────────────────────────────────────
async function buscarTudo(ticker: string, brapiToken: string): Promise<AtivoData> {
  // Tenta Brapi primeiro
  const brapi = await buscarBrapi(ticker, brapiToken)

  // Se Brapi falhou completamente (sem preço), tenta Yahoo
  if (!brapi.preco || brapi.preco <= 0) {
    const yahoo = await buscarYahoo(ticker)
    if (yahoo.preco && yahoo.preco > 0) {
      return {
        ticker,
        preco: yahoo.preco,
        dy: yahoo.dy,
        pvp: yahoo.pvp,
        fontePreco: yahoo.fontePreco,
        fonteDy: yahoo.fonteDy,
        fontePvp: yahoo.fontePvp,
        razao_social: brapi.razao_social,
      }
    }
    // Ambas falharam
    return brapi
  }

  // Brapi tem preço; complementa com Yahoo se DY ou PVP estiverem faltando
  const precisaDy = !brapi.dy || brapi.dy <= 0
  const precisaPvp = !brapi.pvp || brapi.pvp <= 0

  if (precisaDy || precisaPvp) {
    const yahoo = await buscarYahoo(ticker)
    if (precisaDy && yahoo.dy && yahoo.dy > 0) {
      brapi.dy = yahoo.dy
      brapi.fonteDy = 'Yahoo'
    }
    if (precisaPvp && yahoo.pvp && yahoo.pvp > 0) {
      brapi.pvp = yahoo.pvp
      brapi.fontePvp = 'Yahoo'
    }
  }

  return brapi
}

// ───────────────────────────────────────────────────────────
// 4) Handler HTTP — processa em paralelo controlado
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
    const tickers: string[] = body?.tickers || []

    if (!Array.isArray(tickers) || tickers.length === 0) {
      return jsonResponse({ erro: 'Envie array "tickers"' }, 400)
    }

    const brapiToken = Deno.env.get('BRAPI_TOKEN') ?? ''
    if (!brapiToken) {
      return jsonResponse({
        erro: 'BRAPI_TOKEN não configurado nos secrets do Supabase.',
      }, 500)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const tickersUp = tickers.map((t) => String(t).toUpperCase().trim())
    const resultados: AtivoData[] = []

    // 5 chamadas em paralelo, com sleep entre lotes
    const PARALELO = 5
    for (let i = 0; i < tickersUp.length; i += PARALELO) {
      const lote = tickersUp.slice(i, i + PARALELO)
      const r = await Promise.all(
        lote.map((t) => buscarTudo(t, brapiToken))
      )
      resultados.push(...r)

      if (i + PARALELO < tickersUp.length) {
        await new Promise((rs) => setTimeout(rs, 250))
      }
    }

    // Grava no Supabase
    const paraGravar = resultados
      .filter((r) => r.preco > 0)
      .map((r) => {
        const obj: Record<string, any> = {
          ticker: r.ticker,
          preco: r.preco,
          updated_at: new Date().toISOString(),
        }
        if (typeof r.dy === 'number' && r.dy > 0) obj.dy = r.dy
        if (typeof r.pvp === 'number' && r.pvp > 0) obj.pvp = r.pvp
        if (r.razao_social) obj.razao_social = r.razao_social
        return obj
      })

    let gravados = 0
    if (paraGravar.length > 0) {
      const { error } = await supabase
        .from('ativos')
        .upsert(paraGravar, { onConflict: 'ticker' })
      if (!error) gravados = paraGravar.length
    }

    const sucesso = resultados.filter((r) => r.preco > 0).length
    const comDY = resultados.filter((r) => (r.dy ?? 0) > 0).length
    const comPvp = resultados.filter((r) => (r.pvp ?? 0) > 0).length

    // Estatísticas de fontes (útil para debug)
    const precoBrapi = resultados.filter((r) => r.fontePreco === 'Brapi').length
    const precoYahoo = resultados.filter((r) => r.fontePreco === 'Yahoo').length
    const dyBrapi = resultados.filter((r) => r.fonteDy === 'Brapi').length
    const dyYahoo = resultados.filter((r) => r.fonteDy === 'Yahoo').length
    const pvpBrapi = resultados.filter((r) => r.fontePvp === 'Brapi').length
    const pvpYahoo = resultados.filter((r) => r.fontePvp === 'Yahoo').length

    return jsonResponse({
      total: resultados.length,
      sucesso,
      comDY,
      comPvp,
      falhas: resultados.length - sucesso,
      gravados,
      fontes: {
        preco: { brapi: precoBrapi, yahoo: precoYahoo },
        dy: { brapi: dyBrapi, yahoo: dyYahoo },
        pvp: { brapi: pvpBrapi, yahoo: pvpYahoo },
      },
      detalhes: resultados,
    })
  } catch (e) {
    return jsonResponse({ erro: String(e) }, 500)
  }
})
