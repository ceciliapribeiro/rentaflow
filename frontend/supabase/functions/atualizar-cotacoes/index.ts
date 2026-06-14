// Edge Function: atualizar-cotacoes (v6)
// Yahoo Finance (primária) + Status Invest (fallback p/ DY e P/VP)
// Resolve a inconsistência do Yahoo Finance para tickers da B3

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
  fonteDy?: string
  fontePvp?: string
  erro?: string
}

// ───────────────────────────────────────────────────────────
// 1) Yahoo Finance — primária para preço, DY e P/VP
// ───────────────────────────────────────────────────────────
async function buscarYahoo(ticker: string): Promise<AtivoData> {
  const out: AtivoData = { ticker, preco: 0 }
  try {
    const tickerB3 = `${ticker}.SA`

    // Preço
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

    // Fundamentos
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
          out.fonteDy = 'YF'
        }
        if (typeof pvpRaw === 'number' && pvpRaw > 0) {
          out.pvp = pvpRaw
          out.fontePvp = 'YF'
        }
      }
    } catch { /* tenta SI no fallback */ }

    return out
  } catch (e) {
    out.erro = `Yahoo: ${String(e).slice(0, 80)}`
    return out
  }
}

// ───────────────────────────────────────────────────────────
// 2) Status Invest — fallback para DY e P/VP da B3
// ───────────────────────────────────────────────────────────
const FIAGROS = new Set(['AAZQ11', 'VGIA11', 'SNAG11', 'RURA11', 'KNCA11'])

function detectarTipoAtivo(ticker: string): 'fii' | 'acao' | 'bdr' {
  const t = ticker.toUpperCase()
  if (FIAGROS.has(t)) return 'fii'
  // BDRs terminam em 32, 33, 34, 35
  if (/\d{2}$/.test(t) && ['32', '33', '34', '35'].includes(t.slice(-2))) {
    return 'bdr'
  }
  // FIIs e Fiagros terminam em 11
  if (t.endsWith('11') && t.length === 6) return 'fii'
  return 'acao'
}

async function buscarStatusInvest(ticker: string): Promise<{ dy?: number; pvp?: number }> {
  const tipo = detectarTipoAtivo(ticker)
  const path = tipo === 'fii' ? 'fundos-imobiliarios'
             : tipo === 'bdr' ? 'bdrs'
             : 'acoes'
  const url = `https://statusinvest.com.br/${path}/${ticker.toLowerCase()}`

  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
    })
    if (!r.ok) return {}
    const html = await r.text()

    const out: { dy?: number; pvp?: number } = {}

    // DY: vários padrões possíveis no HTML do Status Invest
    const dyPatterns = [
      /["']dividend[\s-]?yield["']?\s*[":>][^<]{0,80}?(\d{1,4}[,\.]\d{1,4})/i,
      /title="Dividend Yield"[^>]*>[\s\S]{0,200}?<strong[^>]*>([\d,\.]+)/i,
      /D\.?Y\.?<\/[^>]+>[\s\S]{0,200}?<strong[^>]*>([\d,\.]+)/i,
    ]
    for (const pat of dyPatterns) {
      const m = html.match(pat)
      if (m) {
        const val = parseFloat(m[1].replace('.', '').replace(',', '.'))
        if (val > 0 && val < 100) {
          out.dy = val
          break
        }
      }
    }

    // P/VP
    const pvpPatterns = [
      /title="P\/VP"[^>]*>[\s\S]{0,200}?<strong[^>]*>([\d,\.]+)/i,
      /title="P\/VPA"[^>]*>[\s\S]{0,200}?<strong[^>]*>([\d,\.]+)/i,
      /["']p\/vpa?["']?\s*[":>][^<]{0,80}?(\d{1,4}[,\.]\d{1,4})/i,
    ]
    for (const pat of pvpPatterns) {
      const m = html.match(pat)
      if (m) {
        const val = parseFloat(m[1].replace('.', '').replace(',', '.'))
        if (val > 0 && val < 100) {
          out.pvp = val
          break
        }
      }
    }

    return out
  } catch {
    return {}
  }
}

// ───────────────────────────────────────────────────────────
// 3) Fluxo combinado: Yahoo + fallback Status Invest
// ───────────────────────────────────────────────────────────
async function buscarTudo(ticker: string): Promise<AtivoData> {
  // Primeiro Yahoo (preço sempre + tenta DY/P/VP)
  const dados = await buscarYahoo(ticker)
  if (!dados.preco) return dados  // sem preço, sem ponto continuar

  // Se DY ou P/VP faltam, tenta Status Invest
  const precisaDy = !dados.dy || dados.dy <= 0
  const precisaPvp = !dados.pvp || dados.pvp <= 0

  if (precisaDy || precisaPvp) {
    const si = await buscarStatusInvest(ticker)
    if (precisaDy && si.dy) {
      dados.dy = si.dy
      dados.fonteDy = 'SI'
    }
    if (precisaPvp && si.pvp) {
      dados.pvp = si.pvp
      dados.fontePvp = 'SI'
    }
  }

  return dados
}

// ───────────────────────────────────────────────────────────
// 4) Handler HTTP
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const resultados: AtivoData[] = []
    // Lote menor que v5 porque agora pode haver scraping (mais lento)
    const LOTE = 5

    for (let i = 0; i < tickers.length; i += LOTE) {
      const lote = tickers.slice(i, i + LOTE)
      const r = await Promise.all(
        lote.map((t) => buscarTudo(String(t).toUpperCase().trim()))
      )
      resultados.push(...r)
      if (i + LOTE < tickers.length) {
        await new Promise((rs) => setTimeout(rs, 600))
      }
    }

    // Grava preço, DY e P/VP
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
      const { error } = await supabase
        .from('ativos')
        .upsert(paraGravar, { onConflict: 'ticker' })
      if (!error) gravados = paraGravar.length
    }

    const sucesso = resultados.filter((r) => r.preco > 0).length
    const comDY = resultados.filter((r) => (r.dy ?? 0) > 0).length
    const comPvp = resultados.filter((r) => (r.pvp ?? 0) > 0).length
    const dyDeYahoo = resultados.filter((r) => r.fonteDy === 'YF').length
    const dyDeStatus = resultados.filter((r) => r.fonteDy === 'SI').length
    const pvpDeYahoo = resultados.filter((r) => r.fontePvp === 'YF').length
    const pvpDeStatus = resultados.filter((r) => r.fontePvp === 'SI').length

    return jsonResponse({
      total: resultados.length,
      sucesso,
      comDY,
      comPvp,
      falhas: resultados.length - sucesso,
      gravados,
      fontes: {
        dy_yahoo: dyDeYahoo,
        dy_statusinvest: dyDeStatus,
        pvp_yahoo: pvpDeYahoo,
        pvp_statusinvest: pvpDeStatus,
      },
      detalhes: resultados,
    })
  } catch (e) {
    return jsonResponse({ erro: String(e) }, 500)
  }
})
