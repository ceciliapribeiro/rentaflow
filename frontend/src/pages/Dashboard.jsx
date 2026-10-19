import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useCorretora } from '../contexts/CorretoraContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Header from '../components/Header'
import {
  TrendingUp, Wallet, DollarSign, PieChart,
  RefreshCw, ArrowUpRight, ArrowDownRight,
  Upload, Zap, Database, Calculator, ChevronRight,
  ArrowUpDown, ChevronUp, ChevronDown, Building2,
  Layers, Check
} from 'lucide-react'
import { formatBRL } from '../utils/formatters'
import { calcularPosicoes, tickersAtivos as getTickers } from '../utils/calcularPosicoes'
import { useToast } from '../contexts/ToastContext'

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const {
    corretoras,
    corretoraSelecionada,
    setCorretoraSelecionada,
    corretoraAtiva,
  } = useCorretora()

  const [loading, setLoading] = useState(true)
  const [atualizandoCotacoes, setAtualizandoCotacoes] = useState(false)
  const [statusCotacao, setStatusCotacao] = useState(null)

  // Dados brutos do banco
  const [todasOperacoes, setTodasOperacoes] = useState([])
  const [todosAportes, setTodosAportes] = useState([])
  const [todosDividendos, setTodosDividendos] = useState([])
  const [precosAtivos, setPrecosAtivos] = useState({})

  // Modo de exibição da tabela quando "Todas" está selecionado: 'consolidado' | 'separado'
  const [modoTabela, setModoTabela] = useState('consolidado')

  // Estado para controlar a ordenação (padrão: valor_atual do maior para o menor)
  const [sortConfig, setSortConfig] = useState({ key: 'valor_atual', direction: 'desc' })

  useEffect(() => {
    if (user) carregarDados()
  }, [user])

  const carregarDados = async () => {
    setLoading(true)
    try {
      // 1) Carrega TODAS as operações
      const { data: operacoes } = await supabase
        .from('operacoes')
        .select('*')
        .eq('user_id', user.id)
        .order('data', { ascending: true })

      const ops = operacoes || []
      setTodasOperacoes(ops)

      // 2) Calcula posições consolidadas para saber tickers ativos
      const posGerais = calcularPosicoes(ops)
      const tickersGerais = getTickers(posGerais)

      // Também inclui tickers que tenham posição em alguma corretora específica
      const tickersSet = new Set(tickersGerais)
      ops.forEach(op => {
        if (op.ticker) tickersSet.add(op.ticker)
      })
      const todosTickers = Array.from(tickersSet)

      // 3) Busca cotações e dados dos ativos
      const mapaPrecos = {}
      if (todosTickers.length > 0) {
        const { data: ativosBD } = await supabase
          .from('ativos')
          .select('ticker, preco, tipo, dy, pvp, razao_social')
          .in('ticker', todosTickers)
        if (ativosBD) {
          ativosBD.forEach(a => {
            mapaPrecos[a.ticker] = {
              preco: Number(a.preco) || 0,
              tipo: a.tipo,
              dy: Number(a.dy) || 0,
              pvp: Number(a.pvp) || 0,
              razao_social: a.razao_social,
            }
          })
        }
      }
      setPrecosAtivos(mapaPrecos)

      // 4) Aportes
      const { data: aportesRows } = await supabase
        .from('aportes')
        .select('valor, corretora_id')
        .eq('user_id', user.id)
      setTodosAportes(aportesRows || [])

      // 5) Dividendos
      const { data: divsRows } = await supabase
        .from('dividendos')
        .select('valor, corretora_id')
        .eq('user_id', user.id)
      setTodosDividendos(divsRows || [])

    } catch (err) {
      console.error('Erro ao carregar dados do dashboard:', err)
    } finally {
      setLoading(false)
    }
  }

  // --- CÁLCULO SEPARADO POR CORRETORA ---
  // Mapa de corretoraId -> { corretora, patrimonio, totalAportes, totalDividendos, totalAtivos, ativos: [] }
  const dadosPorCorretora = useMemo(() => {
    const mapa = {}

    // Inicializa cada corretora cadastrada
    corretoras.forEach(c => {
      mapa[c.id] = {
        id: c.id,
        nome: c.nome,
        codigo: c.codigo,
        cor: c.cor || '#10b981',
        operacoes: [],
        aportes: 0,
        dividendos: 0,
        patrimonio: 0,
        totalAtivos: 0,
        ativos: [],
      }
    })

    // Adiciona entradas para registros sem corretora vinculada (se houver)
    mapa['sem_corretora'] = {
      id: 'sem_corretora',
      nome: 'Sem Corretora',
      codigo: null,
      cor: '#9ca3af',
      operacoes: [],
      aportes: 0,
      dividendos: 0,
      patrimonio: 0,
      totalAtivos: 0,
      ativos: [],
    }

    // Agrupa operações
    todasOperacoes.forEach(op => {
      const k = op.corretora_id ? op.corretora_id : 'sem_corretora'
      if (!mapa[k]) {
        mapa[k] = {
          id: k,
          nome: `Corretora #${k}`,
          codigo: null,
          cor: '#6b7280',
          operacoes: [],
          aportes: 0,
          dividendos: 0,
          patrimonio: 0,
          totalAtivos: 0,
          ativos: [],
        }
      }
      mapa[k].operacoes.push(op)
    })

    // Agrupa aportes
    todosAportes.forEach(ap => {
      const k = ap.corretora_id ? ap.corretora_id : 'sem_corretora'
      if (mapa[k]) mapa[k].aportes += Number(ap.valor || 0)
    })

    // Agrupa dividendos
    todosDividendos.forEach(d => {
      const k = d.corretora_id ? d.corretora_id : 'sem_corretora'
      if (mapa[k]) mapa[k].dividendos += Number(d.valor || 0)
    })

    // Calcula patrimônio e ativos de cada corretora
    Object.values(mapa).forEach(corr => {
      const pos = calcularPosicoes(corr.operacoes)
      const tickers = getTickers(pos)
      const lista = []
      let pat = 0

      tickers.forEach(ticker => {
        const p = pos[ticker]
        const info = precosAtivos[ticker] || { preco: 0, tipo: null, dy: 0, pvp: 0, razao_social: null }
        const pm = p.qtde > 0 ? p.custo / p.qtde : 0
        const valorAtual = p.qtde * info.preco
        const custoInvestido = p.qtde * pm
        let tipo = info.tipo
        if (!tipo) {
          tipo = ticker.endsWith('11') && ticker.length >= 5 ? 'FII' : 'Acao'
        }
        const variacao = custoInvestido > 0
          ? ((valorAtual - custoInvestido) / custoInvestido) * 100 : 0

        const itemAtivo = {
          ticker,
          corretora_id: corr.id,
          corretora_nome: corr.nome,
          corretora_cor: corr.cor,
          quantidade: p.qtde,
          preco_medio: pm,
          preco_atual: info.preco,
          valor_atual: valorAtual,
          valor_investido: custoInvestido,
          tipo,
          dy: info.dy,
          pvp: info.pvp,
          variacao,
          razao_social: info.razao_social,
          tem_preco: info.preco > 0,
        }
        lista.push(itemAtivo)
        pat += valorAtual > 0 ? valorAtual : custoInvestido
      })

      corr.patrimonio = pat
      corr.totalAtivos = lista.length
      corr.ativos = lista
    })

    // Remove 'sem_corretora' se estiver vazia
    if (
      mapa['sem_corretora'].patrimonio === 0 &&
      mapa['sem_corretora'].aportes === 0 &&
      mapa['sem_corretora'].dividendos === 0 &&
      mapa['sem_corretora'].totalAtivos === 0
    ) {
      delete mapa['sem_corretora']
    }

    return mapa
  }, [corretoras, todasOperacoes, todosAportes, todosDividendos, precosAtivos])

  // --- CÁLCULO DO TOTAL CONSOLIDADO ---
  const consolidado = useMemo(() => {
    const pos = calcularPosicoes(todasOperacoes)
    const tickers = getTickers(pos)
    const lista = []
    let patrimonio = 0

    tickers.forEach(ticker => {
      const p = pos[ticker]
      const info = precosAtivos[ticker] || { preco: 0, tipo: null, dy: 0, pvp: 0, razao_social: null }
      const pm = p.qtde > 0 ? p.custo / p.qtde : 0
      const valorAtual = p.qtde * info.preco
      const custoInvestido = p.qtde * pm
      let tipo = info.tipo
      if (!tipo) {
        tipo = ticker.endsWith('11') && ticker.length >= 5 ? 'FII' : 'Acao'
      }
      const variacao = custoInvestido > 0
        ? ((valorAtual - custoInvestido) / custoInvestido) * 100 : 0

      // Distribuição deste ticker por corretora
      const porCorretora = []
      Object.values(dadosPorCorretora).forEach(corr => {
        const at = corr.ativos.find(a => a.ticker === ticker)
        if (at && at.quantidade > 0) {
          porCorretora.push({
            id: corr.id,
            nome: corr.nome,
            cor: corr.cor,
            quantidade: at.quantidade,
            valor: at.valor_atual,
          })
        }
      })

      lista.push({
        ticker,
        quantidade: p.qtde,
        preco_medio: pm,
        preco_atual: info.preco,
        valor_atual: valorAtual,
        valor_investido: custoInvestido,
        tipo,
        dy: info.dy,
        pvp: info.pvp,
        variacao,
        razao_social: info.razao_social,
        tem_preco: info.preco > 0,
        distribCorretoras: porCorretora,
      })
      patrimonio += valorAtual > 0 ? valorAtual : custoInvestido
    })

    const totalAportes = todosAportes.reduce((s, a) => s + Number(a.valor || 0), 0)
    const totalDividendos = todosDividendos.reduce((s, d) => s + Number(d.valor || 0), 0)

    return {
      patrimonio,
      totalAportes,
      totalDividendos,
      totalAtivos: lista.length,
      ativos: lista,
    }
  }, [todasOperacoes, precosAtivos, todosAportes, todosDividendos, dadosPorCorretora])

  // --- DADOS ATIVOS DEPENDENDO DO FILTRO ---
  const dadosAtivos = useMemo(() => {
    if (corretoraSelecionada === 'todas') {
      return consolidado
    }
    const corr = dadosPorCorretora[corretoraSelecionada]
    if (!corr) {
      return {
        patrimonio: 0,
        totalAportes: 0,
        totalDividendos: 0,
        totalAtivos: 0,
        ativos: [],
      }
    }
    return {
      patrimonio: corr.patrimonio,
      totalAportes: corr.aportes,
      totalDividendos: corr.dividendos,
      totalAtivos: corr.totalAtivos,
      ativos: corr.ativos,
    }
  }, [corretoraSelecionada, consolidado, dadosPorCorretora])

  // Lista de corretoras que possuem atividade (para renderizar os cards comparativos)
  const listaCorretorasAtivas = useMemo(() => {
    return Object.values(dadosPorCorretora).filter(c =>
      c.patrimonio > 0 || c.aportes > 0 || c.dividendos > 0 || c.totalAtivos > 0
    )
  }, [dadosPorCorretora])

  const atualizarCotacoes = async () => {
    if (!consolidado.ativos || consolidado.ativos.length === 0) {
      toast.warning('Nenhum ativo na carteira para atualizar.')
      return
    }
    setAtualizandoCotacoes(true)
    setStatusCotacao({ etapa: 'iniciando', mensagem: 'Buscando preços...' })

    try {
      const tickers = consolidado.ativos.map(a => a.ticker)
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

      const response = await fetch(`${SUPABASE_URL}/functions/v1/atualizar-cotacoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers }),
      })

      const resultado = await response.json()
      if (!response.ok) throw new Error(resultado.erro || 'Erro')

      setStatusCotacao({
        etapa: 'sucesso',
        mensagem: `${resultado.sucesso}/${resultado.total} atualizados | ${resultado.falhas} falhas`,
        detalhes: resultado,
      })
      await carregarDados()
    } catch (err) {
      console.error('Erro ao atualizar:', err)
      setStatusCotacao({ etapa: 'erro', mensagem: err.message })
    } finally {
      setAtualizandoCotacoes(false)
    }
  }

  // --- ORDENAÇÃO ---
  const handleSort = (key) => {
    let direction = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ key, direction })
  }

  const sortedAtivos = useMemo(() => {
    let sortableItems = [...dadosAtivos.ativos]
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        if (typeof a[sortConfig.key] === 'string') {
          return sortConfig.direction === 'asc'
            ? a[sortConfig.key].localeCompare(b[sortConfig.key])
            : b[sortConfig.key].localeCompare(a[sortConfig.key])
        }
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? -1 : 1
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? 1 : -1
        }
        return 0
      })
    }
    return sortableItems
  }, [dadosAtivos.ativos, sortConfig])

  // Componente auxiliar para os cabeçalhos ordenáveis
  const HeaderCell = ({ label, sortKey, align = 'left' }) => {
    const isActive = sortConfig.key === sortKey
    return (
      <th
        className={`py-2 px-3 text-${align} cursor-pointer hover:bg-gray-200 transition-colors select-none group`}
        onClick={() => handleSort(sortKey)}
      >
        <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
          {label}
          {isActive ? (
            sortConfig.direction === 'asc' ? <ChevronUp size={14} className="text-gray-700" /> : <ChevronDown size={14} className="text-gray-700" />
          ) : (
            <ArrowUpDown size={14} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </div>
      </th>
    )
  }

  const rentabilidade = dadosAtivos.totalAportes > 0
    ? ((dadosAtivos.patrimonio - dadosAtivos.totalAportes) / dadosAtivos.totalAportes * 100) : 0

  const CardClicavel = ({ titulo, valor, sub, icon: Icon, cor, destino }) => (
    <button
      onClick={() => navigate(destino)}
      className="bg-white rounded-xl shadow-sm border p-6 text-left hover:border-green-500 hover:shadow-md transition-all group"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-500 text-sm font-medium">{titulo}</span>
        <div className="flex items-center gap-1">
          <Icon className={cor} size={20} />
          <ChevronRight className="text-gray-300 group-hover:text-green-600 transition" size={16} />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-800">{loading ? '...' : valor}</p>
      {sub && <div className="mt-1 text-sm">{sub}</div>}
    </button>
  )

  const ehConsolidado = corretoraSelecionada === 'todas'

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        titulo="Dashboard"
        subtitulo={
          ehConsolidado
            ? 'Visão geral da sua carteira consolidada'
            : `Carteira filtrada: ${corretoraAtiva?.nome || 'Corretora Selecionada'}`
        }
        mostrarImportar={true}
      />

      <main className="max-w-7xl mx-auto px-4 py-6">

        {/* BARRA DE FILTRO DE CORRETORA */}
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
              <span>Todas (Consolidado)</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${ehConsolidado ? 'bg-green-800 text-white' : 'bg-gray-200 text-gray-600'}`}>
                {consolidado.totalAtivos}
              </span>
            </button>

            {corretoras.map(c => {
              const info = dadosPorCorretora[c.id]
              const ativo = String(corretoraSelecionada) === String(c.id)
              const temAtivos = info && info.totalAtivos > 0
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
                  {temAtivos && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${ativo ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'}`}>
                      {info.totalAtivos}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* ALERTA VISUAL QUANDO FILTRADO POR UMA CORRETORA ESPECÍFICA */}
        {!ehConsolidado && (
          <div
            className="mb-6 p-4 rounded-xl border flex items-center justify-between flex-wrap gap-2 shadow-sm transition-all"
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
              <div>
                <p className="text-sm font-bold text-gray-800">
                  Visualizando investimentos da corretora: <span className="underline">{corretoraAtiva?.nome}</span>
                </p>
                <p className="text-xs text-gray-600">
                  {consolidado.patrimonio > 0
                    ? `Representa ${((dadosAtivos.patrimonio / consolidado.patrimonio) * 100).toFixed(1)}% do seu patrimônio total consolidado (${formatBRL(consolidado.patrimonio)}).`
                    : ''}
                </p>
              </div>
            </div>

            <button
              onClick={() => setCorretoraSelecionada('todas')}
              className="px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-lg shadow-sm"
            >
              ← Ver Consolidado Geral (Total)
            </button>
          </div>
        )}

        {/* 4 CARDS PRINCIPAIS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <CardClicavel
            titulo={ehConsolidado ? 'Patrimônio Total' : `Patrimônio (${corretoraAtiva?.nome})`}
            valor={formatBRL(dadosAtivos.patrimonio)}
            sub={
              dadosAtivos.totalAportes > 0 ? (
                <span className={`flex items-center gap-1 ${rentabilidade >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {rentabilidade >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {rentabilidade.toFixed(2)}% vs aportado
                </span>
              ) : (
                ehConsolidado ? null : (
                  <span className="text-gray-500 text-xs">
                    {consolidado.patrimonio > 0 ? `${((dadosAtivos.patrimonio / consolidado.patrimonio) * 100).toFixed(1)}% do total` : ''}
                  </span>
                )
              )
            }
            icon={PieChart}
            cor="text-purple-600"
            destino="/patrimonio"
          />

          <CardClicavel
            titulo={ehConsolidado ? 'Total Aportado' : `Aportes (${corretoraAtiva?.nome})`}
            valor={formatBRL(dadosAtivos.totalAportes)}
            sub={<span className="text-gray-500">Veja todos os aportes</span>}
            icon={Wallet}
            cor="text-blue-600"
            destino="/aportes"
          />

          <CardClicavel
            titulo={ehConsolidado ? 'Dividendos Recebidos' : `Dividendos (${corretoraAtiva?.nome})`}
            valor={formatBRL(dadosAtivos.totalDividendos)}
            sub={<span className="text-gray-500">Histórico completo</span>}
            icon={DollarSign}
            cor="text-green-600"
            destino="/dividendos"
          />

          <CardClicavel
            titulo={ehConsolidado ? 'Ativos em Carteira' : `Ativos (${corretoraAtiva?.nome})`}
            valor={String(dadosAtivos.totalAtivos)}
            sub={<span className="text-gray-500">Ver operações</span>}
            icon={TrendingUp}
            cor="text-amber-600"
            destino="/operacoes"
          />
        </div>

        {/* SEÇÃO: VISÃO SEPARADA POR CORRETORA (OTIMIZAÇÃO DO DASHBOARD) */}
        {listaCorretorasAtivas.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <Building2 size={20} className="text-green-700" />
                  Divisão de Investimentos por Corretora
                </h3>
                <p className="text-xs text-gray-500">
                  Compare o patrimônio e resultados em cada instituição financeira
                </p>
              </div>

              {/* Barra de distribuição percentual */}
              {consolidado.patrimonio > 0 && (
                <span className="text-xs font-semibold text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                  Total Consolidado: {formatBRL(consolidado.patrimonio)}
                </span>
              )}
            </div>

            {/* Barra contínua de proporção */}
            {consolidado.patrimonio > 0 && (
              <div className="mb-5">
                <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden flex shadow-inner">
                  {listaCorretorasAtivas.map(c => {
                    const pct = (c.patrimonio / consolidado.patrimonio) * 100
                    if (pct <= 0) return null
                    return (
                      <div
                        key={c.id}
                        className="h-full transition-all relative group"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: c.cor,
                        }}
                        title={`${c.nome}: ${formatBRL(c.patrimonio)} (${pct.toFixed(1)}%)`}
                      />
                    )
                  })}
                </div>
              </div>
            )}

            {/* Grid de Cards das Corretoras */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {listaCorretorasAtivas.map(c => {
                const pct = consolidado.patrimonio > 0
                  ? (c.patrimonio / consolidado.patrimonio) * 100
                  : 0
                const selecionado = String(corretoraSelecionada) === String(c.id)

                return (
                  <div
                    key={c.id}
                    onClick={() => setCorretoraSelecionada(selecionado ? 'todas' : String(c.id))}
                    className={`rounded-xl border p-4 cursor-pointer transition-all relative overflow-hidden ${
                      selecionado
                        ? 'border-green-600 shadow-md bg-green-50/20 ring-2 ring-green-600/20'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                    }`}
                  >
                    <div
                      className="absolute top-0 left-0 right-0 h-1.5"
                      style={{ backgroundColor: c.cor }}
                    />

                    <div className="flex items-center justify-between mb-3 mt-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: c.cor }}
                        />
                        <h4 className="font-bold text-gray-800 text-base">{c.nome}</h4>
                        {c.codigo && (
                          <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                            {c.codigo}
                          </span>
                        )}
                      </div>

                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                          selecionado
                            ? 'bg-green-700 text-white'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {pct.toFixed(1)}% do total
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                      <div>
                        <p className="text-xs text-gray-500">Patrimônio</p>
                        <p className="font-bold text-gray-900 text-base">{formatBRL(c.patrimonio)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Ativos</p>
                        <p className="font-bold text-gray-800 text-base">{c.totalAtivos} ativos</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Total Aportado</p>
                        <p className="font-semibold text-gray-700">{formatBRL(c.aportes)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Dividendos</p>
                        <p className="font-semibold text-green-700">{formatBRL(c.dividendos)}</p>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs">
                      <span className={selecionado ? 'font-bold text-green-700' : 'text-gray-500'}>
                        {selecionado ? '✓ Filtro ativo no Dashboard' : 'Clique para filtrar esta corretora'}
                      </span>
                      <ChevronRight size={14} className={selecionado ? 'text-green-700' : 'text-gray-400'} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* TABELA: MINHA CARTEIRA */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="px-6 py-4 border-b flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">
                Minha Carteira
                {ehConsolidado ? ' (Consolidada)' : ` — ${corretoraAtiva?.nome}`}
              </h3>
              <p className="text-xs text-gray-500">
                {ehConsolidado
                  ? 'Você pode ver o consolidado geral ou alternar para agrupar por corretora'
                  : `Exibindo apenas os ativos em custódia na ${corretoraAtiva?.nome}`}
              </p>
            </div>

            <div className="flex gap-2 flex-wrap items-center">
              {/* Seletor de Modo Consolidado vs Separado por Corretora (quando em 'todas') */}
              {ehConsolidado && listaCorretorasAtivas.length > 1 && (
                <div className="bg-gray-100 p-0.5 rounded-lg flex items-center mr-2 border border-gray-200">
                  <button
                    onClick={() => setModoTabela('consolidado')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                      modoTabela === 'consolidado'
                        ? 'bg-white text-gray-800 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Visão Consolidada
                  </button>
                  <button
                    onClick={() => setModoTabela('separado')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                      modoTabela === 'separado'
                        ? 'bg-white text-green-800 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Separar por Corretora
                  </button>
                </div>
              )}

              <button
                onClick={atualizarCotacoes}
                disabled={atualizandoCotacoes || consolidado.ativos.length === 0}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm disabled:opacity-50"
              >
                <RefreshCw size={14} className={atualizandoCotacoes ? 'animate-spin' : ''} />
                {atualizandoCotacoes ? 'Atualizando...' : 'Atualizar Cotações'}
              </button>
              <button
                onClick={() => navigate('/smart-aporte')}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm"
              >
                <Zap size={14} /> Smart Aporte
              </button>
              <button
                onClick={() => navigate('/importar-dados-b3')}
                className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-sm"
              >
                <Database size={14} /> Catálogo B3
              </button>
            </div>
          </div>

          {statusCotacao && (
            <div className={`px-6 py-2 text-sm border-b ${
              statusCotacao.etapa === 'erro' ? 'bg-red-50 text-red-700' :
              statusCotacao.etapa === 'sucesso' ? 'bg-green-50 text-green-700' :
              'bg-blue-50 text-blue-700'
            }`}>
              Cotações: {statusCotacao.mensagem}
            </div>
          )}

          {loading ? (
            <div className="p-8 text-center text-gray-500">Carregando carteira...</div>
          ) : dadosAtivos.ativos.length === 0 ? (
            <div className="p-12 text-center">
              <Calculator className="mx-auto text-gray-300 mb-3" size={48} />
              <p className="text-gray-700 font-semibold mb-2">
                {ehConsolidado ? 'Carteira vazia' : `Nenhum ativo encontrado em ${corretoraAtiva?.nome}`}
              </p>
              <p className="text-gray-500 text-sm mb-4">
                {ehConsolidado
                  ? 'Importe suas operações para começar.'
                  : 'Lance ou vincule operações a esta corretora para visualizar sua custódia.'}
              </p>
              {ehConsolidado ? (
                <button
                  onClick={() => navigate('/importar')}
                  className="px-4 py-2 bg-green-700 text-white text-sm rounded-lg hover:bg-green-600 inline-flex items-center gap-2"
                >
                  <Upload size={16} /> Importar dados
                </button>
              ) : (
                <button
                  onClick={() => setCorretoraSelecionada('todas')}
                  className="px-4 py-2 bg-green-700 text-white text-sm rounded-lg hover:bg-green-600 inline-flex items-center gap-2"
                >
                  Ver Carteira Consolidada
                </button>
              )}
            </div>
          ) : (
            <>
              {/* TABELA AGRUPADA POR CORRETORA */}
              {ehConsolidado && modoTabela === 'separado' ? (
                <div className="divide-y divide-gray-200">
                  {listaCorretorasAtivas.map(corr => {
                    if (corr.ativos.length === 0) return null
                    return (
                      <div key={corr.id} className="p-4 bg-gray-50/60">
                        <div className="flex items-center justify-between mb-3 px-2">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-3.5 h-3.5 rounded-full"
                              style={{ backgroundColor: corr.cor }}
                            />
                            <h4 className="font-bold text-gray-900 text-base">{corr.nome}</h4>
                            <span className="text-xs text-gray-500 bg-white border px-2 py-0.5 rounded-full">
                              {corr.ativos.length} ativo(s)
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs text-gray-500 mr-2">Subtotal:</span>
                            <span className="font-bold text-gray-900 text-base">{formatBRL(corr.patrimonio)}</span>
                          </div>
                        </div>

                        <div className="bg-white rounded-lg border overflow-x-auto shadow-sm">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b text-gray-600">
                              <tr>
                                <th className="py-2 px-3 text-left">Ticker</th>
                                <th className="py-2 px-3 text-left">Tipo</th>
                                <th className="py-2 px-3 text-right">Qtde</th>
                                <th className="py-2 px-3 text-right">Preço Médio</th>
                                <th className="py-2 px-3 text-right">Preço Atual</th>
                                <th className="py-2 px-3 text-right">Valor Atual</th>
                                <th className="py-2 px-3 text-right">Variação</th>
                              </tr>
                            </thead>
                            <tbody>
                              {corr.ativos.map(a => (
                                <tr
                                  key={a.ticker}
                                  onClick={() => navigate(`/ativo/${a.ticker}`)}
                                  className="border-b hover:bg-gray-50 cursor-pointer"
                                >
                                  <td className="py-2 px-3 font-semibold text-blue-700">{a.ticker}</td>
                                  <td className="py-2 px-3">
                                    <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700">{a.tipo}</span>
                                  </td>
                                  <td className="py-2 px-3 text-right">{a.quantidade}</td>
                                  <td className="py-2 px-3 text-right">{formatBRL(a.preco_medio)}</td>
                                  <td className="py-2 px-3 text-right">
                                    {a.tem_preco ? formatBRL(a.preco_atual) : <span className="text-gray-400 text-xs">sem preço</span>}
                                  </td>
                                  <td className="py-2 px-3 text-right font-medium">{formatBRL(a.valor_atual)}</td>
                                  <td className={`py-2 px-3 text-right font-medium ${
                                    a.variacao >= 0 ? 'text-green-600' : 'text-red-600'
                                  }`}>
                                    {a.tem_preco ? `${a.variacao >= 0 ? '+' : ''}${a.variacao.toFixed(2)}%` : '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                /* TABELA CONSOLIDADA OU DE UMA CORRETORA ESPECÍFICA */
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr className="text-gray-600">
                        <HeaderCell label="Ticker" sortKey="ticker" />
                        <HeaderCell label="Tipo" sortKey="tipo" />
                        {ehConsolidado && <th className="py-2 px-3 text-left">Corretoras</th>}
                        <HeaderCell label="Qtde" sortKey="quantidade" align="right" />
                        <HeaderCell label="Preço médio" sortKey="preco_medio" align="right" />
                        <HeaderCell label="Preço atual" sortKey="preco_atual" align="right" />
                        <HeaderCell label="Valor atual" sortKey="valor_atual" align="right" />
                        <HeaderCell label="DY" sortKey="dy" align="right" />
                        <HeaderCell label="P/VP" sortKey="pvp" align="right" />
                        <HeaderCell label="Variação" sortKey="variacao" align="right" />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedAtivos.map(a => {
                        return (
                          <tr
                            key={a.ticker}
                            onClick={() => navigate(`/ativo/${a.ticker}`)}
                            className="border-b hover:bg-gray-50 cursor-pointer"
                          >
                            <td className="py-2 px-3">
                              <span className="font-semibold text-blue-700">{a.ticker}</span>
                              {a.razao_social && a.razao_social !== a.ticker && (
                                <p className="text-[11px] text-gray-400 truncate max-w-[140px]">{a.razao_social}</p>
                              )}
                            </td>
                            <td className="py-2 px-3">
                              <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700">{a.tipo}</span>
                            </td>

                            {/* Coluna de corretoras no modo consolidado */}
                            {ehConsolidado && (
                              <td className="py-2 px-3">
                                <div className="flex items-center gap-1 flex-wrap max-w-[200px]">
                                  {a.distribCorretoras && a.distribCorretoras.length > 0 ? (
                                    a.distribCorretoras.map(dc => (
                                      <span
                                        key={dc.id}
                                        className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded font-medium"
                                        style={{
                                          backgroundColor: `${dc.cor}20`,
                                          color: dc.cor,
                                        }}
                                        title={`${dc.nome}: ${dc.quantidade} cotas (${formatBRL(dc.valor)})`}
                                      >
                                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dc.cor }} />
                                        {dc.nome}: {dc.quantidade}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-gray-400 text-xs">-</span>
                                  )}
                                </div>
                              </td>
                            )}

                            <td className="py-2 px-3 text-right">{a.quantidade}</td>
                            <td className="py-2 px-3 text-right">{formatBRL(a.preco_medio)}</td>
                            <td className="py-2 px-3 text-right">
                              {a.tem_preco ? formatBRL(a.preco_atual) : <span className="text-gray-400 text-xs">sem preço</span>}
                            </td>
                            <td className="py-2 px-3 text-right font-medium">{formatBRL(a.valor_atual)}</td>
                            <td className="py-2 px-3 text-right">
                              {a.dy > 0 ? `${a.dy.toFixed(2)}%` : '-'}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {a.pvp > 0 ? a.pvp.toFixed(2) : '-'}
                            </td>
                            <td className={`py-2 px-3 text-right font-medium ${
                              a.variacao >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {a.tem_preco ? `${a.variacao >= 0 ? '+' : ''}${a.variacao.toFixed(2)}%` : '-'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t font-semibold">
                      <tr>
                        <td className="py-3 px-3 text-gray-700" colSpan={ehConsolidado ? 6 : 5}>
                          Total {ehConsolidado ? 'Consolidado' : `em ${corretoraAtiva?.nome}`}:
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-gray-900 text-base">
                          {formatBRL(dadosAtivos.patrimonio)}
                        </td>
                        <td colSpan={3}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}