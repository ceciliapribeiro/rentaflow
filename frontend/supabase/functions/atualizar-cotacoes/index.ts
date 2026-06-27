// Edge Function: atualizar-cotacoes (v11)
// Multi-fonte inteligente:
// - Ações/BDRs: Brapi (preço+DY+PVP) → Yahoo fallback
// - FIIs: Status Invest (DY+PVP) → Fundsexplorer fallback; preço sempre via Brapi/Yahoo

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
  tipo?: string
  fontePreco?: string
  fonteDy?: string
  fontePvp?: string
  erro?: string
}

// Heurística: ticker termina em "11" com 6 chars = FII (provavelmente)
function ehFII(ticker: string): boolean {
  return ticker.length === 6 && ticker.endsWith('11')
}

// Converte "1,23" ou "12,34%" → 1.23
function parseNumeroBR(txt: string): number {
  if (!txt) return 0
  const limpo = txt.replace(/[%\s]/g, '').replace(/\./g, '').replace(',', '.')
  const n = parseFloat(limpo)
  return isFinite(n) ? n : 0
}

// ───────────────────────────────────────────────────────────
// 1) STATUS INVEST — DY e P/VP para FIIs (scraping HTML)
// ───────────────────────────────────────────────────────────
async function buscarStatusInvest(ticker: string): Promise<Partial<AtivoData>> {
  const out: Partial<AtivoData> = {}
  try {
    const url = `https://statusinvest.com.br/fundos-imobiliarios/${ticker.toLowerCase()}`
    const r = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
    })
    if (!r.ok) return out

    const html = await r.text()

    // DY — busca por padrões "Dividend Yield" seguidos de valor
    const dyMatches = [
      /title="Dividend Yield[^"]*"[\s\S]*?<strong[^>]*class="[^"]*value[^"]*"[^>]*>([\d,\.]+)/i,
      /["']?Dividend Yield["']?[^<]{0,80}?(\d{1,3}[,\.]\d{1,4})/i,
      /["']?DY["']?\s*[":>][^<]{0,40}?(\d{1,3}[,\.]\d{1,4})/i,
    ]
    for (const re of dyMatches) {
      const m = html.match(re)
      if (m && m[1]) {
        const dy = parseNumeroBR(m[1])
        if (dy > 0 && dy < 100) {
          out.dy = dy
          out.fonteDy = 'StatusInvest'
          break
        }
      }
    }

    // P/VP — busca por padrões similares
    const pvpMatches = [
      /title="P\/VP[^"]*"[\s\S]*?<strong[^>]*class="[^"]*value[^"]*"[^>]*>([\d,\.]+)/i,
      /["']?P\/VP["']?[^<]{0,80}?(\d{1,3}[,\.]\d{1,4})/i,
      /["']?P\/VPA["']?[^<]{0,80}?(\d{1,3}[,\.]\d{1,4})/i,
    ]
    for (const re of pvpMatches) {
      const m = html.match(re)
      if (m && m[1]) {
        const pvp = parseNumeroBR(m[1])
        if (pvp > 0 && pvp < 50) {
          out.pvp = pvp
          out.fontePvp = 'StatusInvest'
          break
        }
      }
    }

    return out
  } catch {
    return out
  }
}

// ───────────────────────────────────────────────────────────
// 2) FUNDSEXPLORER — fallback para FIIs (scraping HTML)
// ───────────────────────────────────────────────────────────
async function buscarFundsexplorer(ticker: string): Promise<Partial<AtivoData>> {
  const out: Partial<AtivoData> = {}
  try {
    const url = `https://www.fundsexplorer.com.br/funds/${ticker.toLowerCase()}`
    const r = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
    })
    if (!r.ok) return out

    const html = await r.text()

    // DY anual no Fundsexplorer (procura "Dividend Yield" e variações)
    const dyMatches = [
      /Dividend Yield[\s\S]{0,200}?(\d{1,3}[,\.]\d{1,4})\s*%/i,
      /"dividendYield"[^:]*:\s*"?(\d{1,3}[,\.]\d{1,4})/i,
      /DY[^<]{0,100}?(\d{1,3}[,\.]\d{1,4})\s*%/i,
    ]
    for (const re of dyMatches) {
      const m = html.match(re)
      if (m && m[1]) {
        const dy = parseNumeroBR(m[1])
        if (dy > 0 && dy < 100) {
          out.dy = dy
          out.fonteDy = 'Fundsexplorer'
          break
        }
      }
    }

    // P/VP no Fundsexplorer
    const pvpMatches = [
      /P\/VP[\s\S]{0,200}?(\d{1,3}[,\.]\d{1,4})/i,
      /"pvp"[^:]*:\s*"?(\d{1,3}[,\.]\d{1,4})/i,
    ]
    for (const re of pvpMatches) {
      const m = html.match(re)
      if (m && m[1]) {
        const pvp = parseNumeroBR(m[1])
        if (pvp > 0 && pvp < 50) {
          out.pvp = pvp
          out.fontePvp = 'Fundsexplorer'
          break
        }
      }
    }

    return out
  } catch {
    return out
  }
}

// ───────────────────────────────────────────────────────────
// 3) BRAPI — preço + DY + P/VP (para ações/BDRs)
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
// 4) YAHOO FINANCE — fallback para preço
// ───────────────────────────────────────────────────────────
async function buscarYahoo(ticker: string): Promise<Partial<AtivoData>> {
  const out: Partial<AtivoData> = {}
  try {
    const tickerB3 = `${ticker}.SA`
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
    return out
  } catch {
    return out
  }
}

// ───────────────────────────────────────────────────────────
// 5) COMBINADOR INTELIGENTE — escolhe fontes por tipo
// ───────────────────────────────────────────────────────────
async function buscarTudo(ticker: string, brapiToken: string): Promise<AtivoData> {
  const fii = ehFII(ticker)

  if (fii) {
    // FIIs: Brapi (preço) + Status Invest (DY/PVP) + Fundsexplorer (fallback DY/PVP)
    const [brapi, statusInvest] = await Promise.all([
      buscarBrapi(ticker, brapiToken),
      buscarStatusInvest(ticker),
    ])

    const out: AtivoData = {
      ticker,
      preco: brapi.preco,
      razao_social: brapi.razao_social,
      tipo: 'FII',
      fontePreco: brapi.fontePreco,
      dy: statusInvest.dy ?? brapi.dy,
      pvp: statusInvest.pvp ?? brapi.pvp,
      fonteDy: statusInvest.fonteDy ?? brapi.fonteDy,
      fontePvp: statusInvest.fontePvp ?? brapi.fontePvp,
    }

    // Se preço falhou no Brapi, tenta Yahoo
    if (!out.preco || out.preco <= 0) {
      const yahoo = await buscarYahoo(ticker)
      if (yahoo.preco && yahoo.preco > 0) {
        out.preco = yahoo.preco
        out.fontePreco = 'Yahoo'
      }
    }

    // Se DY ou PVP ainda faltam, tenta Fundsexplorer como fallback
    const precisaDy = !out.dy || out.dy <= 0
    const precisaPvp = !out.pvp || out.pvp <= 0
    if (precisaDy || precisaPvp) {
      const fe = await buscarFundsexplorer(ticker)
      if (precisaDy && fe.dy && fe.dy > 0) {
        out.dy = fe.dy
        out.fonteDy = 'Fundsexplorer'
      }
      if (precisaPvp && fe.pvp && fe.pvp > 0) {
        out.pvp = fe.pvp
        out.fontePvp = 'Fundsexplorer'
      }
    }

    if (!out.preco || out.preco <= 0) out.erro = 'Sem preço'
    return out
  }

  // Ações/BDRs: Brapi primária + Yahoo fallback (só preço)
  const brapi = await buscarBrapi(ticker, brapiToken)
  brapi.tipo = brapi.tipo || 'Acao'

  if (!brapi.preco || brapi.preco <= 0) {
    const yahoo = await buscarYahoo(ticker)
    if (yahoo.preco && yahoo.preco > 0) {
      brapi.preco = yahoo.preco
      brapi.fontePreco = 'Yahoo'
    }
  }

  if (!brapi.preco || brapi.preco <= 0) brapi.erro = brapi.erro || 'Sem preço'
  return brapi
}

// ───────────────────────────────────────────────────────────
// 6) Handler HTTP — processa em paralelo controlado
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

    // Paralelismo reduzido para 3 (Status Invest/Fundsexplorer fazem scraping)
    const PARALELO = 3
    for (let i = 0; i < tickersUp.length; i += PARALELO) {
      const lote = tickersUp.slice(i, i + PARALELO)
      const r = await Promise.all(
        lote.map((t) => buscarTudo(t, brapiToken))
      )
      resultados.push(...r)

      // Sleep maior entre lotes para respeitar rate limits dos scrapers
      if (i + PARALELO < tickersUp.length) {
        await new Promise((rs) => setTimeout(rs, 400))
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

    // Estatísticas finais
    const sucesso = resultados.filter((r) => r.preco > 0).length
    const comDY = resultados.filter((r) => (r.dy ?? 0) > 0).length
    const comPvp = resultados.filter((r) => (r.pvp ?? 0) > 0).length
    const fiis = resultados.filter((r) => ehFII(r.ticker)).length
    const acoes = resultados.length - fiis

    // Estatísticas por fonte
    const fontes = {
      preco: {
        brapi: resultados.filter((r) => r.fontePreco === 'Brapi').length,
        yahoo: resultados.filter((r) => r.fontePreco === 'Yahoo').length,
      },
      dy: {
        brapi:        resultados.filter((r) => r.fonteDy === 'Brapi').length,
        statusinvest: resultados.filter((r) => r.fonteDy === 'StatusInvest').length,
        fundsexplorer: resultados.filter((r) => r.fonteDy === 'Fundsexplorer').length,
      },
      pvp: {
        brapi:        resultados.filter((r) => r.fontePvp === 'Brapi').length,
        statusinvest: resultados.filter((r) => r.fontePvp === 'StatusInvest').length,
        fundsexplorer: resultados.filter((r) => r.fontePvp === 'Fundsexplorer').length,
      },
    }

    return jsonResponse({
      total: resultados.length,
      sucesso,
      comDY,
      comPvp,
      falhas: resultados.length - sucesso,
      gravados,
      fiis,
      acoes,
      fontes,
      detalhes: resultados,
    })
  } catch (e) {
    return jsonResponse({ erro: String(e) }, 500)
  }
})
