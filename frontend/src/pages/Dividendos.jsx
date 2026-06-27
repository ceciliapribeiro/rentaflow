import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import Header from '../components/Header'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  DollarSign, Calendar, TrendingUp, RefreshCw, Search,
} from 'lucide-react'

export default function Dividendos() {
  const { user } = useAuth()
  const [dividendos, setDividendos] = useState([])
  const [loading, setLoading] = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [statusAtualizacao, setStatusAtualizacao] = useState(null)

  // Paginação
  const [paginaAtual, setPaginaAtual] = useState(1)
  const POR_PAGINA = 30

  // Filtros
  const [filtroAno, setFiltroAno] = useState('todos')
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [filtroTicker, setFiltroTicker] = useState('')

  useEffect(() => {
    if (user) carregarDividendos()
  }, [user])

  const carregarDividendos = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('dividendos')
      .select('*')
      .eq('user_id', user.id)
      .order('data_pagamento', { ascending: false })

    if (error) {
      console.error('Erro ao carregar dividendos:', error)
      setDividendos([])
    } else {
      setDividendos(data || [])
    }
    setLoading(false)
  }

  const atualizarDividendos = async () => {
    if (!confirm('Buscar novos proventos dos últimos 365 dias? Isso pode levar 2-5 minutos.')) {
      return
    }

    setAtualizando(true)
    setStatusAtualizacao({ etapa: 'iniciando', mensagem: 'Conectando à fonte de dados...' })

    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
      const response = await fetch(`${SUPABASE_URL}/functions/v1/buscar-dividendos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      })

      const resultado = await response.json()
      if (!response.ok) throw new Error(resultado.erro || 'Erro desconhecido')

      setStatusAtualizacao({
        etapa: 'sucesso',
        mensagem: `${resultado.novos_dividendos} novo(s) | ${resultado.duplicados} já existentes | ${resultado.tickers_processados} ativos consultados`,
        detalhes: resultado,
      })
      await carregarDividendos()
    } catch (err) {
      console.error('Erro:', err)
      setStatusAtualizacao({ etapa: 'erro', mensagem: err.message })
    } finally {
      setAtualizando(false)
    }
  }

  const formatBRL = (v) => new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL',
  }).format(v)

  const formatData = (d) => {
    if (!d) return ''
    const data = String(d).slice(0, 10)
    const [y, m, day] = data.split('-')
    return `${day}/${m}/${y}`
  }

  // Anos disponíveis para filtro
  const anosDisponiveis = useMemo(() => {
    const anos = new Set()
    dividendos.forEach(d => {
      if (d.ano) anos.add(String(d.ano))
      else if (d.data_pagamento) anos.add(d.data_pagamento.slice(0, 4))
    })
    return Array.from(anos).sort().reverse()
  }, [dividendos])

  // Dividendos filtrados
  const dividendosFiltrados = useMemo(() => {
    return dividendos.filter(d => {
      const anoD = d.ano ? String(d.ano) : (d.data_pagamento?.slice(0, 4) || '')
      if (filtroAno !== 'todos' && anoD !== filtroAno) return false

      const tipoD = String(d.tipo_provento || '').toUpperCase()
      if (filtroTipo === 'RENDIMENTO' && !tipoD.includes('REND')) return false
      if (filtroTipo === 'JUROS' && !tipoD.includes('JURO') && !tipoD.includes('JCP')) return false

      if (filtroTicker && !String(d.ticker).toLowerCase().includes(filtroTicker.toLowerCase())) {
        return false
      }
      return true
    })
  }, [dividendos, filtroAno, filtroTipo, filtroTicker])

  // Totais
  const totalGeral = useMemo(
    () => dividendos.reduce((s, d) => s + Number(d.valor || 0), 0),
    [dividendos]
  )
  const totalAnoVigente = useMemo(() => {
    const anoAtual = new Date().getFullYear().toString()
    return dividendos
      .filter(d => {
        const anoD = d.ano ? String(d.ano) : (d.data_pagamento?.slice(0, 4) || '')
        return anoD === anoAtual
      })
      .reduce((s, d) => s + Number(d.valor || 0), 0)
  }, [dividendos])
  const totalFiltrado = useMemo(
    () => dividendosFiltrados.reduce((s, d) => s + Number(d.valor || 0), 0),
    [dividendosFiltrados]
  )

  // Média mensal do ano vigente (só meses com pelo menos 1 dividendo)
  const mediaMensalAno = useMemo(() => {
    const anoAtual = new Date().getFullYear().toString()
    const meses = new Set()
    let soma = 0
    dividendos.forEach(d => {
      const anoD = d.ano ? String(d.ano) : (d.data_pagamento?.slice(0, 4) || '')
      if (anoD === anoAtual && d.data_pagamento) {
        meses.add(d.data_pagamento.slice(0, 7))
        soma += Number(d.valor || 0)
      }
    })
    return meses.size > 0 ? soma / meses.size : 0
  }, [dividendos])

  // Agregação mensal para o gráfico (respeitando filtros)
  const dadosGrafico = useMemo(() => {
    const porMes = {}
    dividendosFiltrados.forEach(d => {
      if (!d.data_pagamento) return
      const mes = d.data_pagamento.slice(0, 7) // YYYY-MM
      porMes[mes] = (porMes[mes] || 0) + Number(d.valor || 0)
    })
    return Object.entries(porMes)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mes, valor]) => {
        const [y, m] = mes.split('-')
        const nomesMeses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
                            'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
        return {
          mes: `${nomesMeses[parseInt(m, 10) - 1]}/${y.slice(2)}`,
          valor: Number(valor.toFixed(2)),
        }
      })
  }, [dividendosFiltrados])

  // Paginação
  const totalPaginas = Math.ceil(dividendosFiltrados.length / POR_PAGINA)
  const dividendosPagina = useMemo(() => {
    const inicio = (paginaAtual - 1) * POR_PAGINA
    return dividendosFiltrados.slice(inicio, inicio + POR_PAGINA)
  }, [dividendosFiltrados, paginaAtual])

  // Reset paginação ao mudar filtros
  useEffect(() => {
    setPaginaAtual(1)
  }, [filtroAno, filtroTipo, filtroTicker])

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        titulo="Dividendos"
        subtitulo="Proventos recebidos com base na sua custódia"
      />

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* 3 cards de resumo */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-500 text-sm font-medium">Total Recebido</span>
              <DollarSign className="text-green-600" size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-800">{formatBRL(totalGeral)}</p>
            <p className="text-xs text-gray-500 mt-1">{dividendos.length} provento(s) no total</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-500 text-sm font-medium">Ano Vigente</span>
              <Calendar className="text-blue-600" size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-800">{formatBRL(totalAnoVigente)}</p>
            <p className="text-xs text-gray-500 mt-1">{new Date().getFullYear()}</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-500 text-sm font-medium">Média Mensal (ano)</span>
              <TrendingUp className="text-purple-600" size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-800">{formatBRL(mediaMensalAno)}</p>
            <p className="text-xs text-gray-500 mt-1">
              Considerando meses com recebimento
            </p>
          </div>
        </div>

        {/* Filtros + botão Atualizar */}
        <div className="bg-white rounded-xl shadow-sm border p-4 mb-6 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-3 items-center flex-1">
            <select
              value={filtroAno}
              onChange={(e) => setFiltroAno(e.target.value)}
              className="px-3 py-1.5 border rounded-lg text-sm bg-white"
            >
              <option value="todos">Todos os anos</option>
              {anosDisponiveis.map(ano => (
                <option key={ano} value={ano}>{ano}</option>
              ))}
            </select>

            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="px-3 py-1.5 border rounded-lg text-sm bg-white"
            >
              <option value="todos">Todos os tipos</option>
              <option value="RENDIMENTO">Rendimento</option>
              <option value="JUROS">Juros / JCP</option>
            </select>

            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar ticker..."
                value={filtroTicker}
                onChange={(e) => setFiltroTicker(e.target.value.toUpperCase())}
                className="pl-9 pr-3 py-1.5 border rounded-lg text-sm bg-white"
              />
            </div>

            <span className="text-sm text-gray-500">
              Total filtrado: <strong className="text-gray-800">{formatBRL(totalFiltrado)}</strong>
              <span className="text-gray-400 ml-2">({dividendosFiltrados.length} registros)</span>
            </span>
          </div>

          <button
            onClick={atualizarDividendos}
            disabled={atualizando}
            className="flex items-center gap-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <RefreshCw size={14} className={atualizando ? 'animate-spin' : ''} />
            {atualizando ? 'Buscando...' : 'Atualizar dividendos'}
          </button>
        </div>

        {/* Status da atualização */}
        {statusAtualizacao && (
          <div className={`px-4 py-3 mb-6 rounded-lg text-sm border ${
            statusAtualizacao.etapa === 'erro' ? 'bg-red-50 text-red-700 border-red-200' :
            statusAtualizacao.etapa === 'sucesso' ? 'bg-green-50 text-green-700 border-green-200' :
            'bg-blue-50 text-blue-700 border-blue-200'
          }`}>
            {statusAtualizacao.mensagem}
          </div>
        )}

        {/* Gráfico de barras Recharts */}
        {dadosGrafico.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Dividendos por mês</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dadosGrafico} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#6b7280' }} />
                <YAxis
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                  tickFormatter={(v) => v >= 1000 ? `R$ ${(v / 1000).toFixed(1)}k` : `R$ ${v.toFixed(0)}`}
                />
                <Tooltip
                  formatter={(v) => formatBRL(v)}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    fontSize: '13px',
                  }}
                  labelStyle={{ color: '#374151', fontWeight: 600 }}
                />
                <Bar dataKey="valor" fill="#15803d" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Tabela de dividendos com paginação */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Carregando...</div>
          ) : dividendosFiltrados.length === 0 ? (
            <div className="p-12 text-center">
              <DollarSign className="mx-auto text-gray-300 mb-3" size={48} />
              <p className="text-gray-700 font-semibold mb-2">Nenhum dividendo encontrado</p>
              <p className="text-gray-500 text-sm mb-4">
                {dividendos.length === 0
                  ? 'Clique em "Atualizar dividendos" para buscar proventos.'
                  : 'Tente alterar os filtros acima.'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr className="text-left text-gray-600">
                      <th className="py-2 px-3">Data Pagamento</th>
                      <th className="py-2 px-3">Data EX</th>
                      <th className="py-2 px-3">Ticker</th>
                      <th className="py-2 px-3">Tipo</th>
                      <th className="py-2 px-3 text-right">Qtde</th>
                      <th className="py-2 px-3 text-right">Valor Unit.</th>
                      <th className="py-2 px-3 text-right">Valor Total</th>
                      <th className="py-2 px-3">Fonte</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dividendosPagina.map(d => {
                      const tipo = String(d.tipo_provento || '').toUpperCase()
                      const ehJuros = tipo.includes('JURO') || tipo.includes('JCP')
                      return (
                        <tr key={d.id} className="border-b hover:bg-gray-50">
                          <td className="py-2 px-3">{formatData(d.data_pagamento)}</td>
                          <td className="py-2 px-3 text-gray-500">{formatData(d.data_ex)}</td>
                          <td className="py-2 px-3 font-medium text-gray-800">{d.ticker}</td>
                          <td className="py-2 px-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              ehJuros
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-green-100 text-green-700'
                            }`}>
                              {ehJuros ? 'JUROS' : 'RENDIMENTO'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right">
                            {d.quantidade ? Number(d.quantidade).toFixed(0) : '-'}
                          </td>
                          <td className="py-2 px-3 text-right text-gray-600">
                            {d.valor_unitario ? `R$ ${Number(d.valor_unitario).toFixed(4)}` : '-'}
                          </td>
                          <td className="py-2 px-3 text-right font-medium text-green-700">
                            {formatBRL(d.valor)}
                          </td>
                          <td className="py-2 px-3 text-xs text-gray-500">
                            {d.fonte || '-'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t">
                    <tr>
                      <td colSpan="6" className="py-3 px-3 font-semibold text-gray-700 text-right">
                        Total (página atual):
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-green-700 text-base">
                        {formatBRL(dividendosPagina.reduce((s, d) => s + Number(d.valor || 0), 0))}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Paginação */}
              {totalPaginas > 1 && (
                <div className="border-t px-4 py-3 flex items-center justify-between text-sm">
                  <span className="text-gray-500">
                    Página {paginaAtual} de {totalPaginas} ({dividendosFiltrados.length} registros)
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPaginaAtual(p => Math.max(1, p - 1))}
                      disabled={paginaAtual === 1}
                      className="px-3 py-1 border rounded-lg disabled:opacity-50 hover:bg-gray-50"
                    >
                      Anterior
                    </button>
                    <button
                      onClick={() => setPaginaAtual(p => Math.min(totalPaginas, p + 1))}
                      disabled={paginaAtual === totalPaginas}
                      className="px-3 py-1 border rounded-lg disabled:opacity-50 hover:bg-gray-50"
                    >
                      Próxima
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
