import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useCorretora } from '../contexts/CorretoraContext'
import { supabase } from '../lib/supabase'
import Header from '../components/Header'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import {
  PieChart as PieIcon, TrendingUp, Wallet, DollarSign,
  ArrowUpRight, ArrowDownRight, Building2, Layers
} from 'lucide-react'
import { formatBRL } from '../utils/formatters'
import { calcularPosicoes, inferirTipo, tickersAtivos as getTickers } from '../utils/calcularPosicoes'

const CORES_TIPO = {
  FII:   '#7c3aed',
  Acao:  '#2563eb',
  BDR:   '#0891b2',
  ETF:   '#059669',
  Outro: '#6b7280',
}

const CORES_PIZZA = [
  '#7c3aed', '#2563eb', '#0891b2', '#059669', '#d97706',
  '#dc2626', '#db2777', '#65a30d', '#0284c7', '#9333ea',
]

function TooltipPizza({ active, payload }) {
  if (active && payload && payload.length) {
    const item = payload[0]
    return (
      <div className="bg-white border rounded-lg shadow-md px-4 py-3 text-sm">
        <p className="font-semibold text-gray-800 mb-1">{item.name}</p>
        <p className="text-gray-600">{formatBRL(item.value)}</p>
        <p className="text-gray-500">{item.payload.pct?.toFixed(1)}% da carteira</p>
      </div>
    )
  }
  return null
}

function TooltipArea({ active, payload, label }) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border rounded-lg shadow-md px-4 py-3 text-sm">
        <p className="font-semibold text-gray-700 mb-2">{label}</p>
        {payload.map((p) => (
          <p key={p.dataKey} style={{ color: p.color }}>
            {p.name}: {formatBRL(p.value)}
          </p>
        ))}
      </div>
    )
  }
  return null
}

export default function Patrimonio() {
  const { user } = useAuth()
  const {
    corretoras,
    corretoraSelecionada,
    setCorretoraSelecionada,
    corretoraAtiva,
  } = useCorretora()

  const [loading, setLoading] = useState(true)
  const [operacoes, setOperacoes] = useState([])
  const [ativosBD, setAtivosBD] = useState([])
  const [aportes, setAportes] = useState([])
  const [dividendos, setDividendos] = useState([])

  useEffect(() => {
    if (user) carregarDados()
  }, [user])

  const carregarDados = async () => {
    setLoading(true)
    try {
      const [opRes, atRes, apRes, divRes] = await Promise.all([
        supabase.from('operacoes').select('*').eq('user_id', user.id).order('data', { ascending: true }),
        supabase.from('ativos').select('ticker, preco, tipo, razao_social'),
        supabase.from('aportes').select('data, valor, corretora_id').eq('user_id', user.id).order('data', { ascending: true }),
        supabase.from('dividendos').select('valor, data_pagamento, corretora_id').eq('user_id', user.id),
      ])
      setOperacoes(opRes.data || [])
      setAtivosBD(atRes.data || [])
      setAportes(apRes.data || [])
      setDividendos(divRes.data || [])
    } catch (err) {
      console.error('Erro ao carregar patrimônio:', err)
    } finally {
      setLoading(false)
    }
  }

  const ehConsolidado = corretoraSelecionada === 'todas'

  // Filtra operações conforme corretora selecionada
  const operacoesFiltradas = useMemo(() => {
    if (ehConsolidado) return operacoes
    return operacoes.filter(op => String(op.corretora_id) === String(corretoraSelecionada))
  }, [operacoes, corretoraSelecionada, ehConsolidado])

  // Filtra aportes conforme corretora selecionada
  const aportesFiltrados = useMemo(() => {
    if (ehConsolidado) return aportes
    return aportes.filter(a => String(a.corretora_id) === String(corretoraSelecionada))
  }, [aportes, corretoraSelecionada, ehConsolidado])

  // Filtra dividendos conforme corretora selecionada
  const dividendosFiltrados = useMemo(() => {
    if (ehConsolidado) return dividendos
    return dividendos.filter(d => String(d.corretora_id) === String(corretoraSelecionada))
  }, [dividendos, corretoraSelecionada, ehConsolidado])

  // Posições baseadas nas operações filtradas
  const posicoes = useMemo(() => calcularPosicoes(operacoesFiltradas), [operacoesFiltradas])

  // Mapeamento de distribuição de tickers por corretora (para a visão consolidada)
  const distribPorTicker = useMemo(() => {
    if (!ehConsolidado) return {}
    const mapa = {}
    corretoras.forEach(c => {
      const opsC = operacoes.filter(op => String(op.corretora_id) === String(c.id))
      const posC = calcularPosicoes(opsC)
      Object.keys(posC).forEach(ticker => {
        if (posC[ticker].qtde > 0) {
          if (!mapa[ticker]) mapa[ticker] = []
          mapa[ticker].push({
            id: c.id,
            nome: c.nome,
            cor: c.cor || '#10b981',
            quantidade: posC[ticker].qtde,
          })
        }
      })
    })
    return mapa
  }, [operacoes, corretoras, ehConsolidado])

  const listaAtivos = useMemo(() => {
    const infoMap = {}
    ativosBD.forEach(a => { infoMap[a.ticker] = a })
    const lista = []
    let totalPat = 0

    for (const [ticker, pos] of Object.entries(posicoes)) {
      if (pos.qtde <= 0) continue
      const info = infoMap[ticker] || {}
      const preco = Number(info.preco) || 0
      const pm = pos.qtde > 0 ? pos.custo / pos.qtde : 0
      const valorAtual = pos.qtde * preco
      const valorInvestido = pos.qtde * pm
      const valorEfetivo = valorAtual > 0 ? valorAtual : valorInvestido
      const tipo = inferirTipo(ticker, info.tipo)

      lista.push({
        ticker,
        razao_social: info.razao_social || ticker,
        tipo,
        quantidade: pos.qtde,
        preco_medio: pm,
        preco_atual: preco,
        valor_efetivo: valorEfetivo,
        valor_investido: valorInvestido,
        variacao: valorInvestido > 0 ? ((valorAtual - valorInvestido) / valorInvestido) * 100 : 0,
        tem_preco: preco > 0,
        distribCorretoras: distribPorTicker[ticker] || [],
      })
      totalPat += valorEfetivo
    }

    return lista
      .map(a => ({ ...a, pct: totalPat > 0 ? (a.valor_efetivo / totalPat) * 100 : 0 }))
      .sort((a, b) => b.valor_efetivo - a.valor_efetivo)
  }, [posicoes, ativosBD, distribPorTicker])

  const patrimonio = useMemo(() => listaAtivos.reduce((s, a) => s + a.valor_efetivo, 0), [listaAtivos])
  const totalAportado = useMemo(() => aportesFiltrados.reduce((s, a) => s + Number(a.valor || 0), 0), [aportesFiltrados])
  const totalDividendos = useMemo(() => dividendosFiltrados.reduce((s, d) => s + Number(d.valor || 0), 0), [dividendosFiltrados])
  const rentabilidade = totalAportado > 0 ? ((patrimonio - totalAportado) / totalAportado) * 100 : 0
  const lucroAbsoluto = patrimonio - totalAportado

  // Composição por Tipo
  const composicaoPorTipo = useMemo(() => {
    const mapa = {}
    listaAtivos.forEach(a => { mapa[a.tipo] = (mapa[a.tipo] || 0) + a.valor_efetivo })
    const total = Object.values(mapa).reduce((s, v) => s + v, 0)
    return Object.entries(mapa)
      .map(([tipo, valor]) => ({ name: tipo, value: valor, pct: total > 0 ? (valor / total) * 100 : 0 }))
      .sort((a, b) => b.value - a.value)
  }, [listaAtivos])

  // Composição por Ativo
  const composicaoPorAtivo = useMemo(() => {
    if (listaAtivos.length === 0) return []
    const top = listaAtivos.slice(0, 8)
    const outros = listaAtivos.slice(8)
    const result = top.map(a => ({ name: a.ticker, value: a.valor_efetivo, pct: a.pct }))
    if (outros.length > 0) {
      result.push({
        name: 'Outros',
        value: outros.reduce((s, a) => s + a.valor_efetivo, 0),
        pct: outros.reduce((s, a) => s + a.pct, 0),
      })
    }
    return result
  }, [listaAtivos])

  // Composição por Corretora (relevante na visão consolidada com 2+ corretoras)
  const composicaoPorCorretora = useMemo(() => {
    if (!ehConsolidado || corretoras.length <= 1) return []
    const infoMap = {}
    ativosBD.forEach(a => { infoMap[a.ticker] = a })

    const resultado = []
    let somaTotal = 0

    corretoras.forEach(c => {
      const opsC = operacoes.filter(op => String(op.corretora_id) === String(c.id))
      const posC = calcularPosicoes(opsC)
      let patC = 0

      Object.entries(posC).forEach(([ticker, p]) => {
        if (p.qtde <= 0) return
        const preco = Number(infoMap[ticker]?.preco) || 0
        const pm = p.qtde > 0 ? p.custo / p.qtde : 0
        const valorAtual = p.qtde * preco
        const valorInvestido = p.qtde * pm
        patC += valorAtual > 0 ? valorAtual : valorInvestido
      })

      if (patC > 0) {
        resultado.push({
          id: c.id,
          name: c.nome,
          value: patC,
          cor: c.cor || '#10b981',
        })
        somaTotal += patC
      }
    })

    return resultado
      .map(r => ({ ...r, pct: somaTotal > 0 ? (r.value / somaTotal) * 100 : 0 }))
      .sort((a, b) => b.value - a.value)
  }, [ehConsolidado, corretoras, operacoes, ativosBD])

  // Evolução acumulada dos aportes
  const evolucaoAportes = useMemo(() => {
    if (aportesFiltrados.length === 0) return []
    const porMes = {}
    aportesFiltrados.forEach(a => {
      if (!a.data) return
      const mes = a.data.slice(0, 7)
      porMes[mes] = (porMes[mes] || 0) + Number(a.valor || 0)
    })
    const nomesMeses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
                        'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
    let acumulado = 0
    return Object.keys(porMes).sort().map(mes => {
      acumulado += porMes[mes]
      const [y, m] = mes.split('-')
      return {
        mes: `${nomesMeses[parseInt(m, 10) - 1]}/${y.slice(2)}`,
        aportado: Number(acumulado.toFixed(2)),
      }
    })
  }, [aportesFiltrados])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header titulo="Patrimônio" subtitulo="Evolução e composição" />
        <div className="flex items-center justify-center py-24 text-gray-500">Carregando patrimônio...</div>
      </div>
    )
  }

  const semDados = listaAtivos.length === 0

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        titulo="Patrimônio"
        subtitulo={
          ehConsolidado
            ? 'Evolução e composição consolidada da carteira'
            : `Patrimônio em custódia na corretora ${corretoraAtiva?.nome || ''}`
        }
      />

      <main className="max-w-7xl mx-auto px-4 py-6">

        {/* BARRA DE FILTRO POR CORRETORA */}
        <div className="bg-white border rounded-xl p-3 mb-6 shadow-sm flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-green-700 flex-shrink-0" />
            <span className="text-sm font-semibold text-gray-700">Filtrar por Corretora:</span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap flex-1 justify-start md:justify-end">
            <button
              onClick={() => setCorretoraSelecionada('todas')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                ehConsolidado
                  ? 'bg-green-700 text-white shadow-sm ring-2 ring-green-600/30'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Layers size={13} />
              <span>Todas as Corretoras</span>
            </button>

            {corretoras.map(c => {
              const ativo = String(corretoraSelecionada) === String(c.id)
              return (
                <button
                  key={c.id}
                  onClick={() => setCorretoraSelecionada(String(c.id))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    ativo
                      ? 'bg-gray-900 text-white shadow-sm ring-2 ring-gray-800/30 font-semibold'
                      : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: c.cor || '#10b981' }}
                  />
                  <span>{c.nome}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* AVISO QUANDO UMA CORRETORA ESPECÍFICA ESTÁ SELECIONADA */}
        {!ehConsolidado && (
          <div
            className="mb-6 p-4 rounded-xl border flex items-center justify-between flex-wrap gap-2 shadow-sm"
            style={{
              backgroundColor: `${corretoraAtiva?.cor || '#15803d'}12`,
              borderColor: `${corretoraAtiva?.cor || '#15803d'}40`,
            }}
          >
            <div className="flex items-center gap-3">
              <span
                className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: corretoraAtiva?.cor || '#15803d' }}
              />
              <p className="text-sm font-bold text-gray-800">
                Visualizando métricas patrimoniais de: <span className="underline">{corretoraAtiva?.nome}</span>
              </p>
            </div>
            <button
              onClick={() => setCorretoraSelecionada('todas')}
              className="px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-lg shadow-sm"
            >
              ← Ver Consolidado Geral
            </button>
          </div>
        )}

        {/* Cards de métricas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <CardMetrica
            titulo={ehConsolidado ? 'Patrimônio Atual' : `Patrimônio (${corretoraAtiva?.nome})`}
            valor={formatBRL(patrimonio)}
            icon={PieIcon}
            cor="text-purple-600"
            sub={
              totalAportado > 0 && (
                <span className={`flex items-center gap-1 text-sm ${rentabilidade >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {rentabilidade >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {rentabilidade.toFixed(2)}% vs aportado
                </span>
              )
            }
          />
          <CardMetrica
            titulo={ehConsolidado ? 'Total Aportado' : `Aportado (${corretoraAtiva?.nome})`}
            valor={formatBRL(totalAportado)}
            icon={Wallet}
            cor="text-blue-600"
            sub={<span className="text-sm text-gray-500">{aportesFiltrados.length} aporte(s)</span>}
          />
          <CardMetrica
            titulo="Resultado (R$)"
            valor={formatBRL(lucroAbsoluto)}
            icon={TrendingUp}
            cor={lucroAbsoluto >= 0 ? 'text-green-600' : 'text-red-600'}
            sub={<span className="text-sm text-gray-500">Patrimônio − Aportado</span>}
          />
          <CardMetrica
            titulo={ehConsolidado ? 'Dividendos Totais' : `Dividendos (${corretoraAtiva?.nome})`}
            valor={formatBRL(totalDividendos)}
            icon={DollarSign}
            cor="text-amber-600"
            sub={<span className="text-sm text-gray-500">{dividendosFiltrados.length} provento(s)</span>}
          />
        </div>

        {semDados ? (
          <div className="bg-white rounded-xl shadow-sm border p-16 text-center">
            <PieIcon className="mx-auto text-gray-300 mb-4" size={56} />
            <p className="text-gray-700 font-semibold text-lg mb-2">
              {ehConsolidado ? 'Carteira vazia' : `Nenhum investimento na corretora ${corretoraAtiva?.nome}`}
            </p>
            <p className="text-gray-500 text-sm">
              {ehConsolidado
                ? 'Importe suas operações para visualizar o patrimônio.'
                : 'Selecione outra corretora ou veja o consolidado geral.'}
            </p>
          </div>
        ) : (
          <>
            {/* Gráficos de rosca */}
            <div className={`grid grid-cols-1 ${composicaoPorCorretora.length > 1 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'} gap-4 mb-6`}>
              {/* Rosca: Por Tipo */}
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Composição por Tipo</h3>
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="55%" height={220}>
                    <PieChart>
                      <Pie
                        data={composicaoPorTipo}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={3}
                      >
                        {composicaoPorTipo.map((entry) => (
                          <Cell key={entry.name} fill={CORES_TIPO[entry.name] || '#6b7280'} />
                        ))}
                      </Pie>
                      <Tooltip content={<TooltipPizza />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-col gap-2 flex-1">
                    {composicaoPorTipo.map((entry) => (
                      <div key={entry.name} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: CORES_TIPO[entry.name] || '#6b7280' }} />
                          <span className="font-medium text-gray-700">{entry.name}</span>
                        </div>
                        <span className="text-gray-500">{entry.pct.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Rosca: Por Ativo */}
              <div className="bg-white rounded-xl shadow-sm border p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Composição por Ativo</h3>
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="55%" height={220}>
                    <PieChart>
                      <Pie
                        data={composicaoPorAtivo}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={2}
                      >
                        {composicaoPorAtivo.map((entry, i) => (
                          <Cell key={entry.name} fill={CORES_PIZZA[i % CORES_PIZZA.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<TooltipPizza />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-col gap-1.5 flex-1 overflow-hidden">
                    {composicaoPorAtivo.map((entry, i) => (
                      <div key={entry.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 overflow-hidden">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: CORES_PIZZA[i % CORES_PIZZA.length] }} />
                          <span className="font-medium text-gray-700 truncate">{entry.name}</span>
                        </div>
                        <span className="text-gray-500 flex-shrink-0 ml-1">{entry.pct.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Rosca: Por Corretora (aparece se houver 2+ corretoras na visão consolidada) */}
              {composicaoPorCorretora.length > 1 && (
                <div className="bg-white rounded-xl shadow-sm border p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <Building2 size={18} className="text-green-700" />
                    Divisão por Corretora
                  </h3>
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="55%" height={220}>
                      <PieChart>
                        <Pie
                          data={composicaoPorCorretora}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={90}
                          paddingAngle={3}
                        >
                          {composicaoPorCorretora.map((entry) => (
                            <Cell key={entry.id} fill={entry.cor || '#10b981'} />
                          ))}
                        </Pie>
                        <Tooltip content={<TooltipPizza />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-col gap-2 flex-1">
                      {composicaoPorCorretora.map((entry) => (
                        <div
                          key={entry.id}
                          onClick={() => setCorretoraSelecionada(String(entry.id))}
                          className="flex items-center justify-between text-xs cursor-pointer p-1 rounded hover:bg-gray-50"
                          title="Clique para filtrar"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: entry.cor }}
                            />
                            <span className="font-semibold text-gray-700 truncate max-w-[90px]">{entry.name}</span>
                          </div>
                          <span className="text-gray-500 font-medium">{entry.pct.toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Gráfico de evolução dos aportes */}
            {evolucaoAportes.length > 1 && (
              <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">
                  Evolução acumulada dos aportes
                  {!ehConsolidado && ` — ${corretoraAtiva?.nome}`}
                </h3>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={evolucaoAportes} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradAportado" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#6b7280' }} />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      tickFormatter={(v) => v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`}
                    />
                    <Tooltip content={<TooltipArea />} />
                    <Area
                      type="monotone"
                      dataKey="aportado"
                      name="Total Aportado"
                      stroke="#2563eb"
                      strokeWidth={2}
                      fill="url(#gradAportado)"
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Tabela de composição */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="px-6 py-4 border-b flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">
                    Composição da Carteira
                    {!ehConsolidado && ` — ${corretoraAtiva?.nome}`}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">{listaAtivos.length} ativo(s) em carteira</p>
                </div>

                {!ehConsolidado && (
                  <button
                    onClick={() => setCorretoraSelecionada('todas')}
                    className="text-xs text-green-700 font-semibold hover:underline"
                  >
                    Ver carteira de todas as corretoras
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr className="text-gray-600 text-left">
                      <th className="py-2 px-3">Ticker</th>
                      <th className="py-2 px-3">Tipo</th>
                      {ehConsolidado && <th className="py-2 px-3">Corretora(s)</th>}
                      <th className="py-2 px-3 text-right">Qtde</th>
                      <th className="py-2 px-3 text-right">Preço Médio</th>
                      <th className="py-2 px-3 text-right">Preço Atual</th>
                      <th className="py-2 px-3 text-right">Valor Atual</th>
                      <th className="py-2 px-3 text-right">Variação</th>
                      <th className="py-2 px-3 text-right">Peso</th>
                      <th className="py-2 px-3 min-w-[80px]">Barra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listaAtivos.map(a => (
                      <tr key={a.ticker} className="border-b hover:bg-gray-50">
                        <td className="py-2 px-3">
                          <div className="font-semibold text-blue-700">{a.ticker}</div>
                          {a.razao_social && a.razao_social !== a.ticker && (
                            <div className="text-xs text-gray-400 truncate max-w-[140px]">{a.razao_social}</div>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className="px-2 py-0.5 rounded text-xs font-medium"
                            style={{
                              backgroundColor: `${CORES_TIPO[a.tipo] || '#6b7280'}18`,
                              color: CORES_TIPO[a.tipo] || '#6b7280',
                            }}
                          >
                            {a.tipo}
                          </span>
                        </td>

                        {/* Corretora(s) no modo consolidado */}
                        {ehConsolidado && (
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-1 flex-wrap max-w-[180px]">
                              {a.distribCorretoras && a.distribCorretoras.length > 0 ? (
                                a.distribCorretoras.map(dc => (
                                  <span
                                    key={dc.id}
                                    className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded font-medium"
                                    style={{
                                      backgroundColor: `${dc.cor}20`,
                                      color: dc.cor,
                                    }}
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dc.cor }} />
                                    {dc.nome}: {dc.quantidade}
                                  </span>
                                ))
                              ) : (
                                <span className="text-gray-400 text-xs">—</span>
                              )}
                            </div>
                          </td>
                        )}

                        <td className="py-2 px-3 text-right text-gray-700">{a.quantidade}</td>
                        <td className="py-2 px-3 text-right text-gray-600">{formatBRL(a.preco_medio)}</td>
                        <td className="py-2 px-3 text-right">
                          {a.tem_preco
                            ? formatBRL(a.preco_atual)
                            : <span className="text-gray-400 text-xs">sem preço</span>}
                        </td>
                        <td className="py-2 px-3 text-right font-medium text-gray-800">
                          {formatBRL(a.valor_efetivo)}
                        </td>
                        <td className={`py-2 px-3 text-right font-medium ${a.variacao >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {a.tem_preco
                            ? `${a.variacao >= 0 ? '+' : ''}${a.variacao.toFixed(2)}%`
                            : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="py-2 px-3 text-right font-medium text-gray-700">
                          {a.pct.toFixed(1)}%
                        </td>
                        <td className="py-2 px-3">
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(a.pct, 100)}%`,
                                backgroundColor: CORES_TIPO[a.tipo] || '#6b7280',
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t">
                    <tr>
                      <td colSpan={ehConsolidado ? 6 : 5} className="py-3 px-3 font-semibold text-gray-700 text-right">
                        Total {ehConsolidado ? 'Consolidado' : `em ${corretoraAtiva?.nome}`}:
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-gray-900 text-base">{formatBRL(patrimonio)}</td>
                      <td colSpan="3" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function CardMetrica({ titulo, valor, icon: Icon, cor, sub }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-500 text-sm font-medium">{titulo}</span>
        <Icon className={cor} size={20} />
      </div>
      <p className="text-2xl font-bold text-gray-800">{valor}</p>
      {sub && <div className="mt-1">{sub}</div>}
    </div>
  )
}
