// Edge Function: atualizar-cotacoes (v5 — simplificada)
// Atualiza APENAS preço, DY e P/VP via Yahoo Finance
// Dados estáticos (razão_social, CNPJ, segmento, short_name) vêm da planilha "Dados B3"

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
  erro?: string
}

// Yahoo Finance: preço + DY + P/VP via quoteSummary
async function buscarYahoo(ticker: string): Promise<AtivoData> {
  const out: AtivoData = { ticker, preco: 0 }
  try {
    const tickerB3 = `${ticker}.SA`

    // a) Preço (rota chart — mais leve)
    const urlChart = `https://query1.finance.yahoo.com/v8/finance/chart/${tickerB3}?interval=1d&range=5d`
    const r = await fetch(urlChart, { headers: { 'User-Agent': UA } })
    if (!r.ok) {
      out.erro = `Yahoo HTTP ${r.status}`
      return out
    }
    const j = await r.json()
    const meta = j?.chart?.result?.[0]?.meta
    out.preco = meta?.regularMarketPrice || meta?.chartPreviousClose || 0

    if (!out.preco) {
      const closes = j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close
      if (Array.isArray(closes)) {
        for (let i = closes.length - 1; i >= 0; i--) {
          if (closes[i] != null) { out.preco = Number(closes[i]); break }
        }
      }
    }

    if (!out.preco) {
      out.erro = 'sem preço'
      return out
    }

    // b) Fundamentos (DY + P/VP) via quoteSummary
    try {
      const urlSum = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${tickerB3}?modules=summaryDetail,defaultKeyStatistics`
      const rs = await fetch(urlSum, { headers: { 'User-Agent': UA } })
      if (rs.ok) {
        const js = await rs.json()
        const q = js?.quoteSummary?.result?.[0]
        const dyRaw = q?.summaryDetail?.dividendYield?.raw
                   ?? q?.summaryDetail?.trailingAnnualDividendYield?.raw
        const pvpRaw = q?.defaultKeyStatistics?.priceToBook?.raw
        if (typeof dyRaw === 'number' && dyRaw > 0) out.dy = dyRaw * 100
        if (typeof pvpRaw === 'number' && pvpRaw > 0) out.pvp = pvpRaw
      }
    } catch {/* segue sem DY/P/VP */}

    return out
  } catch (e) {
    out.erro = `Yahoo: ${String(e).slice(0, 80)}`
    return out
  }
}

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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const resultados: AtivoData[] = []
    const LOTE = 10  // mais rápido que antes (sem scraping pesado)

    for (let i = 0; i < tickers.length; i += LOTE) {
      const lote = tickers.slice(i, i + LOTE)
      const r = await Promise.all(
        lote.map((t) => buscarYahoo(String(t).toUpperCase().trim()))
      )
      resultados.push(...r)
      if (i + LOTE < tickers.length) {
        await new Promise((rs) => setTimeout(rs, 400))
      }
    }

    // Grava APENAS os campos dinâmicos (preço, DY, P/VP, updated_at)
    // Os campos estáticos (razão_social, CNPJ, segmento, short_name, tipo)
    // são preservados — vêm da planilha "Dados B3"
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
        return obj
      })

    let gravados = 0
    if (paraGravar.length > 0) {
      // upsert por ticker — atualiza só os campos enviados, preserva os demais
      const { error } = await supabase
        .from('ativos')
        .upsert(paraGravar, { onConflict: 'ticker' })
      if (!error) gravados = paraGravar.length
    }

    const sucesso = resultados.filter((r) => r.preco > 0).length
    const comDY = resultados.filter((r) => (r.dy ?? 0) > 0).length
    const comPvp = resultados.filter((r) => (r.pvp ?? 0) > 0).length

    return jsonResponse({
      total: resultados.length,
      sucesso,
      comDY,
      comPvp,
      falhas: resultados.length - sucesso,
      gravados,
      detalhes: resultados,
    })
  } catch (e) {
    return jsonResponse({ erro: String(e) }, 500)
  }
})
