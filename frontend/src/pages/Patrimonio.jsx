import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import Header from '../components/Header'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import {
  PieChart as PieIcon, TrendingUp, Wallet, DollarSign,
  ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import { formatBRL } from '../utils/formatters'
import { calcularPosicoes, inferirTipo } from '../utils/calcularPosicoes'

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
        supabase.from('aportes').select('data, valor').eq('user_id', user.id).order('data', { ascending: true }),
        supabase.from('dividendos').select('valor, data_pagamento').eq('user_id', user.id),
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

  const posicoes = useMemo(() => calcularPosicoes(operacoes), [operacoes])

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
      })
      totalPat += valorEfetivo
    }
    return lista
      .map(a => ({ ...a, pct: totalPat > 0 ? (a.valor_efetivo / totalPat) * 100 : 0 }))
      .sort((a, b) => b.valor_efetivo - a.valor_efetivo)
  }, [posicoes, ativosBD])

  const patrimonio = useMemo(() => listaAtivos.reduce((s, a) => s + a.valor_efetivo, 0), [listaAtivos])
  const totalAportado = useMemo(() => aportes.reduce((s, a) => s + Number(a.valor || 0), 0), [aportes])
  const totalDividendos = useMemo(() => dividendos.reduce((s, d) => s + Number(d.valor || 0), 0), [dividendos])
  const rentabilidade = totalAportado > 0 ? ((patrimonio - totalAportado) / totalAportado) * 100 : 0
  const lucroAbsoluto = patrimonio - totalAportado

  const composicaoPorTipo = useMemo(() => {
    const mapa = {}
    listaAtivos.forEach(a => { mapa[a.tipo] = (mapa[a.tipo] || 0) + a.valor_efetivo })
    const total = Object.values(mapa).reduce((s, v) => s + v, 0)
    return Object.entries(mapa)
      .map(([tipo, valor]) => ({ name: tipo, value: valor, pct: total > 0 ? (valor / total) * 100 : 0 }))
      .sort((a, b) => b.value - a.value)
  }, [listaAtivos])

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

  const evolucaoAportes = useMemo(() => {
    if (aportes.length === 0) return []
    const porMes = {}
    aportes.forEach(a => {
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
  }, [aportes])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header titulo="Patrimônio" subtitulo="Evolução e composição" />
        <div className="flex items-center justify-center py-24 text-gray-500">Carregando...</div>
      </div>
    )
  }

  const semDados = listaAtivos.length === 0

  return (
    <div className="min-h-screen bg-gray-50">
      <Header titulo="Patrimônio" subtitulo="Evolução e composição da carteira" />

      <main className="max-w-7xl mx-auto px-4 py-6">

        {/* Cards de métricas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <CardMetrica
            titulo="Patrimônio Atual"
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
            titulo="Total Aportado"
            valor={formatBRL(totalAportado)}
            icon={Wallet}
            cor="text-blue-600"
            sub={<span className="text-sm text-gray-500">{aportes.length} aporte(s) registrado(s)</span>}
          />
          <CardMetrica
            titulo="Resultado (R$)"
            valor={formatBRL(lucroAbsoluto)}
            icon={TrendingUp}
            cor={lucroAbsoluto >= 0 ? 'text-green-600' : 'text-red-600'}
            sub={<span className="text-sm text-gray-500">Patrimônio − Aportado</span>}
          />
          <CardMetrica
            titulo="Dividendos Totais"
            valor={formatBRL(totalDividendos)}
            icon={DollarSign}
            cor="text-amber-600"
            sub={<span className="text-sm text-gray-500">{dividendos.length} provento(s) recebido(s)</span>}
          />
        </div>

        {semDados ? (
          <div className="bg-white rounded-xl shadow-sm border p-16 text-center">
            <PieIcon className="mx-auto text-gray-300 mb-4" size={56} />
            <p className="text-gray-700 font-semibold text-lg mb-2">Carteira vazia</p>
            <p className="text-gray-500 text-sm">Importe suas operações para visualizar o patrimônio.</p>
          </div>
        ) : (
          <>
            {/* Gráficos de rosca */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
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
            </div>

            {/* Gráfico de evolução dos aportes */}
            {evolucaoAportes.length > 1 && (
              <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Evolução acumulada dos aportes</h3>
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
              <div className="px-6 py-4 border-b">
                <h3 className="text-lg font-semibold text-gray-800">Composição da Carteira</h3>
                <p className="text-xs text-gray-500 mt-0.5">{listaAtivos.length} ativo(s) em carteira</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr className="text-gray-600 text-left">
                      <th className="py-2 px-3">Ticker</th>
                      <th className="py-2 px-3">Tipo</th>
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
                      <td colSpan="5" className="py-3 px-3 font-semibold text-gray-700 text-right">Total:</td>
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
