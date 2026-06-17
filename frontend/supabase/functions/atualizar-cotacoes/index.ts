// Edge Function: atualizar-cotacoes (v9)
// Brapi.dev com modules=defaultKeyStatistics,financialData
// Lê dividendYield e priceToBook dos caminhos aninhados corretos

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

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
  erro?: string
}

// ───────────────────────────────────────────────────────────
// Brapi com modules — busca UM ticker por chamada
// (descobrimos que múltiplos com vírgula dá HTTP 400 no plano grátis)
// ───────────────────────────────────────────────────────────
async function buscarBrapiUm(ticker: string, token: string): Promise<AtivoData> {
  const out: AtivoData = { ticker, preco: 0 }
  try {
    const url = `https://brapi.dev/api/quote/${ticker}?token=${token}&modules=defaultKeyStatistics,financialData`
    const r = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    })

    if (!r.ok) {
      out.erro = `Brapi HTTP ${r.status}`
      return out
    }

    const j = await r.json()
    const result = j?.results?.[0]
    if (!result) {
      out.erro = 'sem dados'
      return out
    }

    // Preço — campo direto
    out.preco = Number(result.regularMarketPrice) || 0

    // Razão social
    out.razao_social = result.longName || result.shortName || undefined

    // DY — vem no módulo defaultKeyStatistics em formato decimal (0.06 = 6%)
    const dks = result.defaultKeyStatistics
    if (dks) {
      const dyRaw = Number(dks.dividendYield)
      if (dyRaw > 0) {
        // Se < 1, é decimal; se >= 1, já é percentual
        out.dy = dyRaw < 1 ? dyRaw * 100 : dyRaw
      }

      // P/VP — priceToBook
      const pvpRaw = Number(dks.priceToBook)
      if (pvpRaw > 0 && pvpRaw < 100) {
        out.pvp = pvpRaw
      }
    }

    return out
  } catch (e) {
    out.erro = `Brapi: ${String(e).slice(0, 100)}`
    return out
  }
}

// ───────────────────────────────────────────────────────────
// 2) Handler HTTP — processa em paralelo controlado
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
        erro: 'BRAPI_TOKEN não configurado. Adicione em Edge Functions → Secrets.',
      }, 500)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const tickersUp = tickers.map((t) => String(t).toUpperCase().trim())
    const resultados: AtivoData[] = []

    // 5 chamadas em paralelo, com pequeno sleep entre lotes
    const PARALELO = 5
    for (let i = 0; i < tickersUp.length; i += PARALELO) {
      const lote = tickersUp.slice(i, i + PARALELO)
      const r = await Promise.all(
        lote.map((t) => buscarBrapiUm(t, brapiToken))
      )
      resultados.push(...r)

      if (i + PARALELO < tickersUp.length) {
        await new Promise((rs) => setTimeout(rs, 250))
      }
    }

    // Grava no Supabase: preço, DY, P/VP, razão social, updated_at
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
    const naoEncontrados = resultados.filter((r) => r.erro).map((r) => r.ticker)

    return jsonResponse({
      total: resultados.length,
      sucesso,
      comDY,
      comPvp,
      falhas: resultados.length - sucesso,
      gravados,
      naoEncontrados,
      detalhes: resultados,
    })
  } catch (e) {
    return jsonResponse({ erro: String(e) }, 500)
  }
})
