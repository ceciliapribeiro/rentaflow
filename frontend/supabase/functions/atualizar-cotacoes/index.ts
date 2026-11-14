// Edge Function: atualizar-cotacoes (v12)
// Multi-fonte inteligente:
// - Ações/BDRs e FIIs: Brapi, Status Invest e Fundamentus em paralelo
// - Fallbacks cruzados para DY, P/VP e Preço (Yahoo + Fundsexplorer)

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

// Units de ações negociadas com final 11 que não são FIIs nem Fiagros
const UNITS_ACOES = new Set([
  'TAEE11', 'SAPR11', 'KLBN11', 'ALUP11', 'SANB11', 'TIET11',
  'BPAC11', 'ENGI11', 'CPLE11', 'SULA11', 'BIDI11'
])

// Fiagros conhecidos (no Status Invest ficam em /fiagros/)
const FIAGROS = new Set([
  'SNAG11', 'VGIA11', 'KNCA11', 'RURA11', 'AAZQ11', 'XPCA11',
  'FGAA11', 'EGAF11', 'OIAG11', 'RZAG11', 'CPTR11', 'BTAL11',
  'BBGO11', 'DCRA11', 'GCRA11', 'AGRX11', 'JGPX11', 'PLCA11',
  'SNCI11', 'IAAG11', 'KNPK11', 'BODB11', 'MANA11', 'YUFI11'
])

// Heurística: ticker termina em "11" com 6 chars = FII / Fiagro (exceto units de ações)
function ehFII(ticker: string): boolean {
  const up = ticker.toUpperCase()
  if (UNITS_ACOES.has(up)) return false
  return (up.length === 6 && up.endsWith('11')) || FIAGROS.has(up)
}

function ehFiagro(ticker: string): boolean {
  return FIAGROS.has(ticker.toUpperCase())
}

function ehBDR(ticker: string): boolean {
  const up = ticker.toUpperCase()
  return up.endsWith('34') || up.endsWith('35') || up.endsWith('39')
}

// Converte "1,23" ou "12,34%" → 1.23
function parseNumeroBR(txt: string): number {
  if (!txt) return 0
  const limpo = txt.replace(/[%\s]/g, '').replace(/\./g, '').replace(',', '.')
  const n = parseFloat(limpo)
  return isFinite(n) ? n : 0
}

// ───────────────────────────────────────────────────────────
// 1) STATUS INVEST — DY, P/VP e Preço (Ações, BDRs, FIIs e Fiagros)
// ───────────────────────────────────────────────────────────
async function extrairStatusInvestUrl(url: string): Promise<Partial<AtivoData>> {
  const out: Partial<AtivoData> = {}
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
    })
    if (!r.ok) return out

    const html = await r.text()

    // Preço
    const precoMatches = [
      /title="Valor atual do ativo"[\s\S]*?<strong[^>]*class="[^"]*value[^"]*"[^>]*>([\d,\.]+)/i,
      /class="[^"]*value[^"]*"[^>]*title="Valor atual[^"]*"[^>]*>([\d,\.]+)/i,
    ]
    for (const re of precoMatches) {
      const m = html.match(re)
      if (m && m[1]) {
        const p = parseNumeroBR(m[1])
        if (p > 0) {
          out.preco = p
          out.fontePreco = 'StatusInvest'
          break
        }
      }
    }

    // DY — busca por padrões "Dividend Yield" seguidos de valor anual
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
      /title="Preço sobre o Valor Patrimonial[^"]*"[\s\S]*?<strong[^>]*class="[^"]*value[^"]*"[^>]*>([\d,\.]+)/i,
      /["']?P\/VP["']?[^<]{0,80}?(\d{1,3}[,\.]\d{1,4})/i,
      /["']?P\/VPA["']?[^<]{0,80}?(\d{1,3}[,\.]\d{1,4})/i,
    ]
    for (const re of pvpMatches) {
      const m = html.match(re)
      if (m && m[1]) {
        const pvp = parseNumeroBR(m[1])
        if (pvp > 0 && pvp < 100) {
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

async function buscarStatusInvest(ticker: string): Promise<Partial<AtivoData>> {
  try {
    const t = ticker.toLowerCase()
    let endpoints: string[] = ['acoes']
    if (ehFiagro(ticker)) {
      // Fiagros no Status Invest ficam sob /fiagros/
      endpoints = ['fiagros', 'fundos-imobiliarios', 'acoes']
    } else if (ehFII(ticker)) {
      // FIIs tradicionais sob /fundos-imobiliarios/
      endpoints = ['fundos-imobiliarios', 'fiagros', 'acoes']
    } else if (ehBDR(ticker)) {
      endpoints = ['bdrs', 'acoes']
    }

    for (const ep of endpoints) {
      const url = `https://statusinvest.com.br/${ep}/${t}`
      const dados = await extrairStatusInvestUrl(url)
      if (dados.dy || dados.pvp || dados.preco) {
        return dados
      }
    }
    return {}
  } catch {
    return {}
  }
}

// ───────────────────────────────────────────────────────────
// 2) FUNDAMENTUS — Cotação, DY, P/VP e Razão Social (Ações e FIIs)
// ───────────────────────────────────────────────────────────
async function buscarFundamentus(ticker: string): Promise<Partial<AtivoData>> {
  const out: Partial<AtivoData> = {}
  try {
    const url = `https://www.fundamentus.com.br/detalhes.php?papel=${ticker.toUpperCase()}`
    const r = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
    })
    if (!r.ok) return out

    const html = await r.text()

    // Cotação / Preço
    const mPreco = html.match(/<span[^>]*class="txt"[^>]*>Cota[^<]*<\/span><\/td>\s*<td[^>]*class="data[^"]*"[^>]*><span[^>]*class="txt"[^>]*>([^<]+)<\/span><\/td>/i)
    if (mPreco && mPreco[1]) {
      const preco = parseNumeroBR(mPreco[1])
      if (preco > 0) {
        out.preco = preco
        out.fontePreco = 'Fundamentus'
      }
    }

    // P/VP
    const mPvp = html.match(/<span[^>]*class="txt"[^>]*>P\/VP<\/span><\/td>\s*<td[^>]*class="data[^"]*"[^>]*><span[^>]*class="txt"[^>]*>([^<]+)<\/span><\/td>/i)
    if (mPvp && mPvp[1]) {
      const pvp = parseNumeroBR(mPvp[1])
      if (pvp > 0 && pvp < 100) {
        out.pvp = pvp
        out.fontePvp = 'Fundamentus'
      }
    }

    // Div. Yield
    const mDy = html.match(/<span[^>]*class="txt"[^>]*>Div\.\s*Yield<\/span><\/td>\s*<td[^>]*class="data[^"]*"[^>]*><span[^>]*class="txt"[^>]*>([^<]+)<\/span><\/td>/i)
    if (mDy && mDy[1]) {
      const dy = parseNumeroBR(mDy[1])
      if (dy > 0 && dy < 100) {
        out.dy = dy
        out.fonteDy = 'Fundamentus'
      }
    }

    // Razão Social / Empresa
    const mNome = html.match(/<span[^>]*class="txt"[^>]*>(?:Empresa|Fundo)<\/span><\/td>\s*<td[^>]*class="data[^"]*"[^>]*><span[^>]*class="txt"[^>]*>([^<]+)<\/span><\/td>/i)
    if (mNome && mNome[1]) {
      out.razao_social = mNome[1].trim()
    }

    return out
  } catch {
    return out
  }
}

// ───────────────────────────────────────────────────────────
// 3) FUNDSEXPLORER — fallback para FIIs e Fiagros (scraping HTML e JSON)
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

    // 1) JSON "dy" anual (evita capturar o rendimento mensal de 1,2% como se fosse anual)
    const mJsonDy = html.match(/"dy"\s*:\s*(\d+(?:\.\d+)?)/i)
    if (mJsonDy && mJsonDy[1]) {
      const v = parseFloat(mJsonDy[1])
      if (v > 0 && v < 100) {
        out.dy = Number(v.toFixed(2))
        out.fonteDy = 'Fundsexplorer'
      }
    }

    // 2) HTML regex para DY anual dos últimos 12 meses caso não esteja no JSON
    if (!out.dy) {
      const dyMatches = [
        /Dividend Yield[\s\S]{0,200}?(\d{1,3}[,\.]\d{1,4})(?:<[^>]+>|\s)*%(?:[\s\S]{0,100}?(?:12\s*meses|ano))?/i,
        /DY[\s\S]{0,100}?(\d{1,3}[,\.]\d{1,4})(?:<[^>]+>|\s)*%/i,
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
    }

    // P/VP no Fundsexplorer: primeiro do JSON, depois HTML
    const mJsonPvp = html.match(/"pvp"\s*:\s*(\d+(?:\.\d+)?)/i)
    if (mJsonPvp && mJsonPvp[1]) {
      const v = parseFloat(mJsonPvp[1])
      if (v > 0 && v < 50) {
        out.pvp = Number(v.toFixed(2))
        out.fontePvp = 'Fundsexplorer'
      }
    }

    if (!out.pvp) {
      const pvpMatches = [
        /P\/VP[\s\S]{0,200}?(\d{1,3}[,\.]\d{1,4})/i,
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
    }

    return out
  } catch {
    return out
  }
}

// ───────────────────────────────────────────────────────────
// 4) BRAPI — preço + DY + P/VP
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
// 5) YAHOO FINANCE — fallback para preço
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
// 6) COMBINADOR INTELIGENTE — FIIs, Fiagros e Ações com suporte a DY e P/VP
// ───────────────────────────────────────────────────────────
async function buscarTudo(ticker: string, brapiToken: string): Promise<AtivoData> {
  const fii = ehFII(ticker)
  const tipo = fii ? 'FII' : 'Acao'

  // Consulta em paralelo: Brapi, Status Invest e Fundamentus
  const [brapi, statusInvest, fundamentus] = await Promise.all([
    buscarBrapi(ticker, brapiToken),
    buscarStatusInvest(ticker),
    buscarFundamentus(ticker),
  ])

  // Preço: Brapi -> Fundamentus -> StatusInvest -> Yahoo
  let preco = brapi.preco || 0
  let fontePreco = brapi.fontePreco

  if (!preco || preco <= 0) {
    if (fundamentus.preco && fundamentus.preco > 0) {
      preco = fundamentus.preco
      fontePreco = 'Fundamentus'
    } else if (statusInvest.preco && statusInvest.preco > 0) {
      preco = statusInvest.preco
      fontePreco = 'StatusInvest'
    } else {
      const yahoo = await buscarYahoo(ticker)
      if (yahoo.preco && yahoo.preco > 0) {
        preco = yahoo.preco
        fontePreco = 'Yahoo'
      }
    }

    // Fallback especial para RAIZ55: se provedor ainda usa o antigo RAIZ4
    if (ticker === 'RAIZ55' && (!preco || preco <= 0)) {
      const fbRaiz = await buscarFundamentus('RAIZ4')
      if (fbRaiz.preco && fbRaiz.preco > 0) {
        preco = fbRaiz.preco
        fontePreco = 'Fundamentus (RAIZ4)'
      }
    }
  }

  // Fator de cotação da B3: RAIZ55 é cotado em lote de 100 ações na B3/Yahoo
  // Se o preço retornado for do lote (ex: >= 3.00), converte para o preço unitário por ação
  if (ticker === 'RAIZ55' && preco >= 3) {
    preco = Number((preco / 100).toFixed(4))
  }

  // Se for FII/Fiagro e faltar DY ou PVP em StatusInvest, consulta Fundsexplorer
  let feData: Partial<AtivoData> = {}
  if (fii && ((!statusInvest.dy || statusInvest.dy <= 0) || (!statusInvest.pvp || statusInvest.pvp <= 0))) {
    feData = await buscarFundsexplorer(ticker)
  }

  // DY: StatusInvest -> (se FII/Fiagro: Fundsexplorer) -> Fundamentus -> Brapi
  let dy = statusInvest.dy || (fii ? feData.dy : undefined) || fundamentus.dy || brapi.dy || feData.dy
  let fonteDy = statusInvest.dy
    ? statusInvest.fonteDy
    : (fii && feData.dy ? feData.fonteDy : (fundamentus.dy ? fundamentus.fonteDy : (brapi.dy ? brapi.fonteDy : feData.fonteDy)))

  // P/VP: StatusInvest -> (se FII/Fiagro: Fundsexplorer) -> Fundamentus -> Brapi
  let pvp = statusInvest.pvp || (fii ? feData.pvp : undefined) || fundamentus.pvp || brapi.pvp || feData.pvp
  let fontePvp = statusInvest.pvp
    ? statusInvest.fontePvp
    : (fii && feData.pvp ? feData.fontePvp : (fundamentus.pvp ? fundamentus.fontePvp : (brapi.pvp ? brapi.fontePvp : feData.fontePvp)))

  const razao_social = brapi.razao_social || fundamentus.razao_social || undefined

  const out: AtivoData = {
    ticker,
    preco,
    dy,
    pvp,
    tipo,
    razao_social,
    fontePreco,
    fonteDy,
    fontePvp,
  }

  if (!preco || preco <= 0) {
    out.erro = brapi.erro || 'Sem preço'
  }

  return out
}

// ───────────────────────────────────────────────────────────
// 7) Handler HTTP — processa em paralelo controlado
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

    // Paralelismo controlado para scraping
    const PARALELO = 3
    for (let i = 0; i < tickersUp.length; i += PARALELO) {
      const lote = tickersUp.slice(i, i + PARALELO)
      const r = await Promise.all(
        lote.map((t) => buscarTudo(t, brapiToken))
      )
      resultados.push(...r)

      if (i + PARALELO < tickersUp.length) {
        await new Promise((rs) => setTimeout(rs, 350))
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
        if (r.tipo) obj.tipo = r.tipo
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
        fundamentus: resultados.filter((r) => r.fontePreco === 'Fundamentus').length,
        statusinvest: resultados.filter((r) => r.fontePreco === 'StatusInvest').length,
        yahoo: resultados.filter((r) => r.fontePreco === 'Yahoo').length,
      },
      dy: {
        brapi: resultados.filter((r) => r.fonteDy === 'Brapi').length,
        statusinvest: resultados.filter((r) => r.fonteDy === 'StatusInvest').length,
        fundamentus: resultados.filter((r) => r.fonteDy === 'Fundamentus').length,
        fundsexplorer: resultados.filter((r) => r.fonteDy === 'Fundsexplorer').length,
      },
      pvp: {
        brapi: resultados.filter((r) => r.fontePvp === 'Brapi').length,
        statusinvest: resultados.filter((r) => r.fontePvp === 'StatusInvest').length,
        fundamentus: resultados.filter((r) => r.fontePvp === 'Fundamentus').length,
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
