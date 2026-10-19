import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useCorretora } from '../contexts/CorretoraContext'
import { supabase } from '../lib/supabase'
import {
  ArrowLeft, TrendingUp, TrendingDown, DollarSign,
  Wallet, Activity, Building2, AlertTriangle, Calendar,
  ArrowUpRight, ArrowDownRight, BarChart3, Layers,
} from 'lucide-react'
import { formatBRL, formatData } from '../utils/formatters'

export default function AtivoDetalhe() {
  const { user } = useAuth()
  const { ticker } = useParams()
  const navigate = useNavigate()
  const {
    corretoras,
    corretoraSelecionada,
    setCorretoraSelecionada,
    corretoraAtiva,
  } = useCorretora()

  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [aba, setAba] = useState('operacoes')

  const [ativoInfo, setAtivoInfo] = useState(null)
  const [todasOperacoes, setTodasOperacoes] = useState([])
  const [todosDividendos, setTodosDividendos] = useState([])
  const [resumoConsolidado, setResumoConsolidado] = useState({
    qtde: 0,
    custoTotal: 0,
    precoMedio: 0,
    valorMercado: 0,
    rentabilidade: 0,
    rentabilidadeReais: 0,
    totalDividendos: 0,
    yieldOnCost: 0,
  })
  const [porCorretora, setPorCorretora] = useState([])

  useEffect(() => {
    if (user && ticker) carregar()
  }, [user, ticker])

  const carregar = async () => {
    setLoading(true)
    setErro(null)
    try {
      const tickerUp = ticker.toUpperCase()

      // 1. Info do ativo
      const { data: ativo } = await supabase
        .from('ativos')
        .select('*')
        .eq('ticker', tickerUp)
        .maybeSingle()
      setAtivoInfo(ativo)

      // 2. Operações
      const { data: ops, error: errOps } = await supabase
        .from('operacoes')
        .select('*, corretoras(id, nome, cor)')
        .eq('user_id', user.id)
        .eq('ticker', tickerUp)
        .order('data', { ascending: true })

      if (errOps) throw errOps
      setTodasOperacoes(ops || [])

      // 3. Dividendos
      const { data: divs } = await supabase
        .from('dividendos')
        .select('*, corretoras(id, nome, cor)')
        .eq('user_id', user.id)
        .eq('ticker', tickerUp)
        .order('data_pagamento', { ascending: false })

      setTodosDividendos(divs || [])

      // 4. Calcula resumo consolidado e distribuição por corretora
      let qtde = 0
      let custoTotal = 0
      const corretorasMap = new Map()

      for (const op of (ops || [])) {
        const q = Number(op.quantidade) || 0
        const p = Number(op.preco_unitario) || 0
        const tipoOp = (op.operacao || '').toUpperCase()
        const corrId = op.corretora_id ? String(op.corretora_id) : 'sem_corretora'

        if (!corretorasMap.has(corrId)) {
          corretorasMap.set(corrId, {
            corretora: op.corretoras || (op.corretora_id ? { id: op.corretora_id, nome: `Corretora #${op.corretora_id}` } : { id: 'sem_corretora', nome: 'Sem corretora' }),
            qtde: 0,
            custo: 0,
          })
        }
        const cm = corretorasMap.get(corrId)

        if (tipoOp === 'COMPRA') {
          qtde += q
          custoTotal += q * p
          cm.qtde += q
          cm.custo += q * p
        } else if (tipoOp === 'VENDA') {
          const pmGlobal = qtde > 0 ? custoTotal / qtde : 0
          qtde -= q
          custoTotal -= q * pmGlobal
          if (qtde < 0) qtde = 0
          if (custoTotal < 0) custoTotal = 0

          const pmCorr = cm.qtde > 0 ? cm.custo / cm.qtde : 0
          cm.qtde -= q
          cm.custo -= q * pmCorr
          if (cm.qtde < 0) cm.qtde = 0
          if (cm.custo < 0) cm.custo = 0
        }
      }

      const precoMedio = qtde > 0 ? custoTotal / qtde : 0
      const precoAtual = Number(ativo?.preco) || 0
      const valorMercado = qtde * precoAtual
      const rentabilidadeReais = valorMercado - custoTotal
      const rentabilidade = custoTotal > 0
        ? (rentabilidadeReais / custoTotal) * 100
        : 0

      const totalDividendos = (divs || []).reduce(
        (s, d) => s + Number(d.valor || 0), 0
      )
      const yieldOnCost = custoTotal > 0
        ? (totalDividendos / custoTotal) * 100
        : 0

      setResumoConsolidado({
        qtde,
        custoTotal,
        precoMedio,
        valorMercado,
        rentabilidade,
        rentabilidadeReais,
        totalDividendos,
        yieldOnCost,
      })

      // 5. Distribuição por corretora
      const distrib = []
      for (const [id, dados] of corretorasMap.entries()) {
        if (dados.qtde > 0.001) {
          const pm = dados.qtde > 0 ? dados.custo / dados.qtde : 0
          const divsCorr = (divs || [])
            .filter(d => (id === 'sem_corretora' ? !d.corretora_id : String(d.corretora_id) === id))
            .reduce((s, d) => s + Number(d.valor || 0), 0)

          const vm = dados.qtde * precoAtual
          const rentR = vm - dados.custo

          distrib.push({
            id,
            corretora: dados.corretora,
            qtde: dados.qtde,
            custo: dados.custo,
            preco_medio: pm,
            valor_mercado: vm,
            rentabilidade: dados.custo > 0 ? (rentR / dados.custo) * 100 : 0,
            rentabilidadeReais: rentR,
            totalDividendos: divsCorr,
            yieldOnCost: dados.custo > 0 ? (divsCorr / dados.custo) * 100 : 0,
          })
        }
      }
      distrib.sort((a, b) => b.valor_mercado - a.valor_mercado)
      setPorCorretora(distrib)
    } catch (err) {
      setErro('Erro ao carregar: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const ehConsolidado = corretoraSelecionada === 'todas'

  // Dados calculados para a corretora selecionada (ou consolidados)
  const resumoAtivo = useMemo(() => {
    if (ehConsolidado) return resumoConsolidado
    const item = porCorretora.find(p => String(p.id) === String(corretoraSelecionada))
    if (!item) {
      return {
        qtde: 0,
        custoTotal: 0,
        precoMedio: 0,
        valorMercado: 0,
        rentabilidade: 0,
        rentabilidadeReais: 0,
        totalDividendos: 0,
        yieldOnCost: 0,
      }
    }
    return {
      qtde: item.qtde,
      custoTotal: item.custo,
      precoMedio: item.preco_medio,
      valorMercado: item.valor_mercado,
      rentabilidade: item.rentabilidade,
      rentabilidadeReais: item.rentabilidadeReais,
      totalDividendos: item.totalDividendos,
      yieldOnCost: item.yieldOnCost,
    }
  }, [ehConsolidado, corretoraSelecionada, resumoConsolidado, porCorretora])

  // Operações filtradas
  const operacoesFiltradas = useMemo(() => {
    if (ehConsolidado) return todasOperacoes
    return todasOperacoes.filter(op => String(op.corretora_id) === String(corretoraSelecionada))
  }, [ehConsolidado, corretoraSelecionada, todasOperacoes])

  // Dividendos filtrados
  const dividendosFiltrados = useMemo(() => {
    if (ehConsolidado) return todosDividendos
    return todosDividendos.filter(d => String(d.corretora_id) === String(corretoraSelecionada))
  }, [ehConsolidado, corretoraSelecionada, todosDividendos])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Carregando dados de {ticker}...
      </div>
    )
  }

  const precoAtual = Number(ativoInfo?.preco) || 0
  const tipo = ativoInfo?.tipo ||
    (ticker.endsWith('11') && ticker.length >= 5 ? 'FII' : 'Acao')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-green-800 text-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4 flex-wrap">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-green-700 rounded-lg"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{ticker.toUpperCase()}</h1>
              <span className={`text-xs px-2 py-0.5 rounded ${
                tipo === 'FII' ? 'bg-purple-200 text-purple-800' :
                tipo === 'BDR' ? 'bg-orange-200 text-orange-800' :
                'bg-blue-200 text-blue-800'
              }`}>{tipo}</span>
            </div>
            {ativoInfo?.razao_social && (
              <p className="text-green-200 text-sm">{ativoInfo.razao_social}</p>
            )}
          </div>
          {precoAtual > 0 && (
            <div className="text-right">
              <p className="text-xs text-green-200">Preço atual</p>
              <p className="text-2xl font-bold">{formatBRL(precoAtual)}</p>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">

        {/* BARRA DE FILTRO POR CORRETORA */}
        <div className="bg-white border rounded-xl p-3 mb-6 shadow-sm flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-green-700 flex-shrink-0" />
            <span className="text-sm font-semibold text-gray-700">Ver custódia por Corretora:</span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setCorretoraSelecionada('todas')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                ehConsolidado
                  ? 'bg-green-700 text-white shadow-sm ring-2 ring-green-600/30'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Layers size={13} />
              <span>Consolidado (Todas)</span>
            </button>

            {porCorretora.map(p => {
              const ativo = String(corretoraSelecionada) === String(p.id)
              return (
                <button
                  key={p.id}
                  onClick={() => setCorretoraSelecionada(String(p.id))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    ativo
                      ? 'bg-gray-900 text-white shadow-sm ring-2 ring-gray-800/30 font-semibold'
                      : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: p.corretora?.cor || '#10b981' }}
                  />
                  <span>{p.corretora?.nome}</span>
                  <span className={`text-[10px] px-1 rounded ${ativo ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    {p.qtde} cotas
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* BANNER SE FILTRADO */}
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
                Visualizando posição e operações de {ticker} na corretora: <span className="underline">{corretoraAtiva?.nome}</span>
              </p>
            </div>
            <button
              onClick={() => setCorretoraSelecionada('todas')}
              className="px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-lg shadow-sm"
            >
              ← Ver Consolidado de Todas as Corretoras
            </button>
          </div>
        )}

        {erro && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-start gap-3">
            <AlertTriangle className="text-red-500 flex-shrink-0" size={20} />
            <div className="text-red-700 text-sm">{erro}</div>
          </div>
        )}

        {resumoAtivo.qtde === 0 ? (
          <div className="bg-white border rounded-xl p-12 text-center">
            <BarChart3 size={48} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-700 font-semibold mb-2">
              {ehConsolidado
                ? `Sem posição em ${ticker}`
                : `Sem posição em ${ticker} na corretora ${corretoraAtiva?.nome}`}
            </p>
            <p className="text-gray-500 text-sm mb-4">
              {ehConsolidado
                ? 'Você não possui cotas deste ativo em carteira.'
                : 'Você não possui cotas deste ativo nesta corretora.'}
            </p>
            {!ehConsolidado ? (
              <button
                onClick={() => setCorretoraSelecionada('todas')}
                className="px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-600 text-sm font-medium"
              >
                Ver Posição Consolidada
              </button>
            ) : (
              <button
                onClick={() => navigate('/operacoes')}
                className="px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-600 text-sm font-medium"
              >
                Lançar operação
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Cards principais */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white border rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">
                    {ehConsolidado ? 'Quantidade Total' : `Qtde (${corretoraAtiva?.nome})`}
                  </span>
                  <Wallet size={16} className="text-green-600" />
                </div>
                <p className="text-2xl font-bold">{resumoAtivo.qtde}</p>
                <p className="text-xs text-gray-400 mt-1">cotas/ações</p>
              </div>

              <div className="bg-white border rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">Preço médio</span>
                  <Activity size={16} className="text-blue-600" />
                </div>
                <p className="text-2xl font-bold">{formatBRL(resumoAtivo.precoMedio)}</p>
                <p className="text-xs text-gray-400 mt-1">
                  Custo total: {formatBRL(resumoAtivo.custoTotal)}
                </p>
              </div>

              <div className="bg-white border rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">Valor de mercado</span>
                  <TrendingUp size={16} className="text-purple-600" />
                </div>
                <p className="text-2xl font-bold">{formatBRL(resumoAtivo.valorMercado)}</p>
                <div className={`flex items-center gap-1 text-xs mt-1 ${
                  resumoAtivo.rentabilidade >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {resumoAtivo.rentabilidade >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {resumoAtivo.rentabilidade.toFixed(2)}%
                </div>
              </div>

              <div className="bg-white border rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">Dividendos recebidos</span>
                  <DollarSign size={16} className="text-emerald-600" />
                </div>
                <p className="text-2xl font-bold">{formatBRL(resumoAtivo.totalDividendos)}</p>
                <p className="text-xs text-gray-400 mt-1">
                  YoC: {resumoAtivo.yieldOnCost.toFixed(2)}%
                </p>
              </div>
            </div>

            {/* Indicadores do mercado */}
            {(ativoInfo?.dy > 0 || ativoInfo?.pvp > 0) && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-center">
                  {ativoInfo?.dy > 0 && (
                    <div>
                      <p className="text-xs text-blue-700 mb-1">DY (mercado)</p>
                      <p className="text-xl font-bold text-blue-900">{Number(ativoInfo.dy).toFixed(2)}%</p>
                    </div>
                  )}
                  {ativoInfo?.pvp > 0 && (
                    <div>
                      <p className="text-xs text-blue-700 mb-1">P/VP</p>
                      <p className="text-xl font-bold text-blue-900">{Number(ativoInfo.pvp).toFixed(2)}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-blue-700 mb-1">Rentabilidade (R$)</p>
                    <p className={`text-xl font-bold ${
                      resumoAtivo.rentabilidadeReais >= 0 ? 'text-green-700' : 'text-red-700'
                    }`}>
                      {formatBRL(resumoAtivo.rentabilidadeReais)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Distribuição por corretora */}
            {ehConsolidado && porCorretora.length > 1 && (
              <div className="bg-white border rounded-xl p-4 mb-6 shadow-sm">
                <h3 className="font-semibold text-gray-700 mb-3 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Building2 size={18} className="text-green-700" />
                    Distribuição deste ativo por corretora
                  </span>
                  <span className="text-xs text-gray-400">Clique na corretora para filtrar</span>
                </h3>
                <div className="space-y-2.5">
                  {porCorretora.map((p, i) => {
                    const pct = resumoConsolidado.qtde > 0 ? (p.qtde / resumoConsolidado.qtde) * 100 : 0
                    return (
                      <div
                        key={i}
                        onClick={() => setCorretoraSelecionada(String(p.id))}
                        className="flex items-center gap-3 p-1.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                        title={`Filtrar ${ticker} na ${p.corretora?.nome}`}
                      >
                        <div className="w-28 flex items-center gap-2 text-sm">
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: p.corretora?.cor || '#6b7280' }}
                          />
                          <span className="font-medium text-gray-800 truncate">{p.corretora?.nome || '—'}</span>
                        </div>
                        <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: p.corretora?.cor || '#6b7280',
                            }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold">
                            {pct.toFixed(1)}% ({p.qtde} cotas)
                          </div>
                        </div>
                        <div className="text-right text-sm w-32">
                          <p className="font-bold text-gray-800">{formatBRL(p.valor_mercado)}</p>
                          <p className="text-xs text-gray-500">PM: {formatBRL(p.preco_medio)}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
              <div className="border-b flex">
                <button
                  onClick={() => setAba('operacoes')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 ${
                    aba === 'operacoes'
                      ? 'border-green-600 text-green-700 font-bold'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Operações ({operacoesFiltradas.length})
                </button>
                <button
                  onClick={() => setAba('dividendos')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 ${
                    aba === 'dividendos'
                      ? 'border-green-600 text-green-700 font-bold'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Dividendos ({dividendosFiltrados.length})
                </button>
              </div>

              <div className="overflow-x-auto">
                {aba === 'operacoes' ? (
                  operacoesFiltradas.length > 0 ? (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr className="border-b text-gray-500 text-left">
                          <th className="py-2 px-3">Data</th>
                          <th className="py-2 px-3">Op</th>
                          <th className="py-2 px-3 text-right">Qtde</th>
                          <th className="py-2 px-3 text-right">Preço</th>
                          <th className="py-2 px-3 text-right">Total</th>
                          <th className="py-2 px-3">Corretora</th>
                        </tr>
                      </thead>
                      <tbody>
                        {operacoesFiltradas.map(op => (
                          <tr key={op.id} className="border-b hover:bg-gray-50">
                            <td className="py-2 px-3">{formatData(op.data)}</td>
                            <td className="py-2 px-3">
                              <span className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 w-fit ${
                                op.operacao === 'COMPRA' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                              }`}>
                                {op.operacao === 'COMPRA' ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                {op.operacao}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right">{op.quantidade}</td>
                            <td className="py-2 px-3 text-right">{formatBRL(op.preco_unitario)}</td>
                            <td className="py-2 px-3 text-right font-medium">
                              {formatBRL(op.quantidade * op.preco_unitario)}
                            </td>
                            <td className="py-2 px-3">
                              {op.corretoras ? (
                                <span className="inline-flex items-center gap-1 text-xs">
                                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: op.corretoras.cor }} />
                                  {op.corretoras.nome}
                                </span>
                              ) : <span className="text-gray-400 text-xs">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-8 text-center text-gray-500 text-sm">
                      Nenhuma operação registrada nesta corretora.
                    </div>
                  )
                ) : dividendosFiltrados.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr className="border-b text-gray-500 text-left">
                        <th className="py-2 px-3">Pagamento</th>
                        <th className="py-2 px-3">Data EX</th>
                        <th className="py-2 px-3">Tipo</th>
                        <th className="py-2 px-3 text-right">Qtde</th>
                        <th className="py-2 px-3 text-right">Valor unit.</th>
                        <th className="py-2 px-3 text-right">Total</th>
                        <th className="py-2 px-3">Corretora</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dividendosFiltrados.map(d => (
                        <tr key={d.id} className="border-b hover:bg-gray-50">
                          <td className="py-2 px-3">{formatData(d.data_pagamento)}</td>
                          <td className="py-2 px-3 text-gray-600">{formatData(d.data_ex)}</td>
                          <td className="py-2 px-3">
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              d.tipo_provento === 'JUROS' ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'
                            }`}>{d.tipo_provento}</span>
                          </td>
                          <td className="py-2 px-3 text-right">{d.quantidade || '—'}</td>
                          <td className="py-2 px-3 text-right">{d.valor_unitario ? formatBRL(d.valor_unitario) : '—'}</td>
                          <td className="py-2 px-3 text-right font-bold text-green-700">
                            {formatBRL(d.valor)}
                          </td>
                          <td className="py-2 px-3">
                            {d.corretoras ? (
                              <span className="inline-flex items-center gap-1 text-xs">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.corretoras.cor }} />
                                {d.corretoras.nome}
                              </span>
                            ) : <span className="text-gray-400 text-xs">—</span>}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50 font-bold">
                        <td colSpan="5" className="py-2 px-3 text-right">Total recebido:</td>
                        <td className="py-2 px-3 text-right text-green-700">
                          {formatBRL(resumoAtivo.totalDividendos)}
                        </td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  <div className="p-12 text-center text-gray-500">
                    <Calendar size={32} className="mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">Nenhum dividendo registrado para {ticker}.</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
