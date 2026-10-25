import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useCorretora } from '../contexts/CorretoraContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Header from '../components/Header'
import {
  TrendingUp, Wallet, DollarSign, PieChart as PieIcon,
  RefreshCw, ArrowUpRight, ArrowDownRight,
  Upload, Zap, Database, Calculator, ChevronRight,
  ArrowUpDown, ChevronUp, ChevronDown, Building2,
  Layers, Check, Filter
} from 'lucide-react'
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  ResponsiveContainer
} from 'recharts'
import { formatBRL } from '../utils/formatters'
import { calcularPosicoes, tickersAtivos as getTickers } from '../utils/calcularPosicoes'
import { useToast } from '../contexts/ToastContext'
import { avaliarDividendosCorretora } from '../utils/avaliarDividendosCorretora'

function TooltipPieTipo({ active, payload }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    return (
      <div className="bg-white border border-gray-100 rounded-xl shadow-xl p-3 text-xs z-50">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: data.cor }} />
          <p className="font-bold text-gray-800 text-sm">{data.nome}</p>
        </div>
        <p className="text-gray-900 font-extrabold text-base mb-1">{formatBRL(data.valor)}</p>
        <div className="flex items-center justify-between gap-4 text-gray-500 pt-1 border-t border-gray-100">
          <span>{data.pct.toFixed(1)}% da carteira</span>
          <span className="font-medium text-gray-700">{data.quantidadeAtivos} ativos</span>
        </div>
      </div>
    )
  }
  return null
}

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

  // Filtro por tipo de ativo: 'todos' | 'Acao' | 'FII' | 'BDR'
  const [tipoFiltro, setTipoFiltro] = useState('todos')

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
        .select('id, valor, corretora_id, ticker, data_pagamento, data_ex, quantidade')
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

    // Avalia dividendos com base nas datas e custódia real das operações
    const { dividendosNormalizados, divergencias, salvarNoBanco } = avaliarDividendosCorretora(
      todosDividendos,
      todasOperacoes,
      corretoras
    )

    if (divergencias.length > 0) {
      salvarNoBanco().catch(console.warn)
    }

    dividendosNormalizados.forEach(d => {
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

      // Atribui porcentagem de cada ativo no patrimônio desta corretora
      lista.forEach(item => {
        const v = item.valor_atual > 0 ? item.valor_atual : item.valor_investido
        item.porcentagem = pat > 0 ? (v / pat) * 100 : 0
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

    // Atribui porcentagem de cada ativo no patrimônio consolidado
    lista.forEach(item => {
      const v = item.valor_atual > 0 ? item.valor_atual : item.valor_investido
      item.porcentagem = patrimonio > 0 ? (v / patrimonio) * 100 : 0
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
        mensagem: `${resultado.sucesso}/${resultado.total} atualizados (${resultado.comDY ?? 0} com DY, ${resultado.comPvp ?? 0} com P/VP) | ${resultado.falhas} falhas`,
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

  // Normalizador de tipos (FII, Acao, BDR, etc.)
  const normalizarTipo = (tipo, ticker) => {
    if (!tipo) {
      if (ticker && ticker.endsWith('11') && ticker.length >= 5) return 'FII'
      return 'Acao'
    }
    const t = String(tipo).trim().toLowerCase()
    if (t === 'fii' || t.includes('imobili') || t.includes('fundo')) return 'FII'
    if (t === 'acao' || t === 'ação' || t.includes('acoe') || t.includes('açõe') || t.includes('stock')) return 'Acao'
    if (t === 'bdr' || t.includes('bdr')) return 'BDR'
    return tipo
  }

  // --- CONTADORES POR TIPO DE ATIVO ---
  const contadoresTipo = useMemo(() => {
    let todos = 0
    let acoes = 0
    let fiis = 0
    let bdrs = 0
    let outros = 0

    ;(dadosAtivos.ativos || []).forEach(a => {
      todos++
      const t = normalizarTipo(a.tipo, a.ticker)
      if (t === 'Acao') acoes++
      else if (t === 'FII') fiis++
      else if (t === 'BDR') bdrs++
      else outros++
    })

    return { todos, acoes, fiis, bdrs, outros }
  }, [dadosAtivos.ativos])

  // --- COMPOSIÇÃO POR TIPO (PARA O GRÁFICO DE PIZZA) ---
  const composicaoPorTipo = useMemo(() => {
    const mapa = {
      FII: {
        tipo: 'FII',
        nome: 'Fundos Imobiliários',
        sigla: 'FIIs',
        valor: 0,
        quantidadeAtivos: 0,
        cor: '#7c3aed',
      },
      Acao: {
        tipo: 'Acao',
        nome: 'Ações',
        sigla: 'Ações',
        valor: 0,
        quantidadeAtivos: 0,
        cor: '#2563eb',
      },
    }
    let totalGeral = 0

    ;(dadosAtivos.ativos || []).forEach(ativo => {
      let t = normalizarTipo(ativo.tipo, ativo.ticker)
      if (t !== 'FII' && t !== 'Acao' && t !== 'BDR') {
        t = 'Outros'
      }
      if (t === 'BDR') {
        if (!mapa['BDR']) {
          mapa['BDR'] = {
            tipo: 'BDR',
            nome: 'BDRs',
            sigla: 'BDRs',
            valor: 0,
            quantidadeAtivos: 0,
            cor: '#0891b2',
          }
        }
      } else if (t === 'Outros') {
        if (!mapa['Outros']) {
          mapa['Outros'] = {
            tipo: 'Outros',
            nome: 'Outros',
            sigla: 'Outros',
            valor: 0,
            quantidadeAtivos: 0,
            cor: '#6b7280',
          }
        }
      }

      const val = ativo.valor_atual > 0 ? ativo.valor_atual : (ativo.valor_investido || 0)
      if (mapa[t]) {
        mapa[t].valor += val
        mapa[t].quantidadeAtivos += 1
        totalGeral += val
      }
    })

    return Object.values(mapa)
      .filter(item => item.valor > 0 || item.quantidadeAtivos > 0)
      .map(item => ({
        ...item,
        pct: totalGeral > 0 ? (item.valor / totalGeral) * 100 : 0,
      }))
      .sort((a, b) => b.valor - a.valor)
  }, [dadosAtivos.ativos])

  // --- FILTRO POR TIPO ---
  const ativosFiltrados = useMemo(() => {
    let items = dadosAtivos.ativos || []
    if (tipoFiltro !== 'todos') {
      items = items.filter(a => {
        const t = normalizarTipo(a.tipo, a.ticker)
        return t === tipoFiltro
      })
    }
    return items
  }, [dadosAtivos.ativos, tipoFiltro])

  const sortedAtivos = useMemo(() => {
    let sortableItems = [...ativosFiltrados]
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        if (sortConfig.key === 'ticker' || sortConfig.key === 'tipo' || sortConfig.key === 'razao_social') {
          return sortConfig.direction === 'asc'
            ? String(a[sortConfig.key] || '').localeCompare(String(b[sortConfig.key] || ''))
            : String(b[sortConfig.key] || '').localeCompare(String(a[sortConfig.key] || ''))
        }
        const valA = Number(a[sortConfig.key]) || 0
        const valB = Number(b[sortConfig.key]) || 0
        return sortConfig.direction === 'asc' ? valA - valB : valB - valA
      })
    }
    return sortableItems
  }, [ativosFiltrados, sortConfig])

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
            icon={PieIcon}
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

        {/* SEÇÃO GRÁFICA: COMPOSIÇÃO POR TIPO (PIE CHART) & DIVISÃO POR CORRETORA */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
          {/* GRÁFICO DE PIZZA / ROSCA: COMPOSIÇÃO DE AÇÕES VS FIIS */}
          <div className={`${listaCorretorasAtivas.length > 0 ? 'lg:col-span-5' : 'lg:col-span-12'} bg-white rounded-xl shadow-sm border p-6 flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div>
                  <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <PieIcon size={20} className="text-purple-600" />
                    Composição por Tipo de Ativo
                  </h3>
                  <p className="text-xs text-gray-500">
                    Proporção entre Fundos Imobiliários e Ações {ehConsolidado ? 'na carteira consolidada' : `na ${corretoraAtiva?.nome}`}
                  </p>
                </div>

                {composicaoPorTipo.length > 0 && (
                  <span className="text-xs font-semibold text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                    {dadosAtivos.totalAtivos} ativos
                  </span>
                )}
              </div>

              {composicaoPorTipo.length === 0 ? (
                <div className="h-56 flex items-center justify-center text-gray-400 text-sm">
                  Sem dados de composição
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  {/* Gráfico Recharts */}
                  <div className="w-full sm:w-1/2 h-56 relative flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <Pie
                          data={composicaoPorTipo}
                          dataKey="valor"
                          nameKey="nome"
                          cx="50%"
                          cy="50%"
                          innerRadius={52}
                          outerRadius={82}
                          paddingAngle={3}
                        >
                          {composicaoPorTipo.map((entry) => (
                            <Cell key={entry.tipo} fill={entry.cor} />
                          ))}
                        </Pie>
                        <RechartsTooltip content={<TooltipPieTipo />} />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                    {/* Centro do Donut */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Patrimônio</span>
                      <span className="text-xs font-bold text-gray-800 text-center px-2">
                        {formatBRL(dadosAtivos.patrimonio)}
                      </span>
                    </div>
                  </div>

                  {/* Cards da Legenda e Métricas por Tipo */}
                  <div className="w-full sm:w-1/2 flex flex-col gap-2.5">
                    {composicaoPorTipo.map(item => {
                      const isAtivo = tipoFiltro === item.tipo
                      return (
                        <div
                          key={item.tipo}
                          onClick={() => setTipoFiltro(tipoFiltro === item.tipo ? 'todos' : item.tipo)}
                          className={`p-3 rounded-lg border transition-all cursor-pointer flex items-center justify-between ${
                            isAtivo
                              ? 'ring-2 ring-purple-600/30 bg-purple-50/50 border-purple-400'
                              : 'bg-gray-50/60 hover:bg-gray-100/80 border-gray-200'
                          }`}
                          title={`Clique para filtrar ${item.nome} na tabela abaixo`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: item.cor }}
                            />
                            <div>
                              <div className="flex items-center gap-1.5">
                                <h5 className="font-bold text-gray-900 text-xs sm:text-sm">{item.nome}</h5>
                              </div>
                              <p className="text-xs font-semibold text-gray-700 mt-0.5">
                                {formatBRL(item.valor)}
                              </p>
                            </div>
                          </div>

                          <div className="text-right flex flex-col items-end">
                            <span
                              className="text-xs px-2 py-0.5 rounded-full font-bold shadow-xs inline-block"
                              style={{
                                backgroundColor: `${item.cor}18`,
                                color: item.cor,
                                border: `1px solid ${item.cor}30`,
                              }}
                            >
                              {item.pct.toFixed(1)}%
                            </span>
                            <span className="text-[10px] text-gray-500 mt-0.5">
                              {item.quantidadeAtivos} ativos
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {composicaoPorTipo.length > 0 && (
              <p className="text-[11px] text-gray-400 mt-4 text-center border-t border-gray-100 pt-2">
                💡 Clique em uma categoria para filtrar a tabela da carteira.
              </p>
            )}
          </div>

          {/* DIVISÃO DE INVESTIMENTOS POR CORRETORA */}
          {listaCorretorasAtivas.length > 0 && (
            <div className="lg:col-span-7 bg-white rounded-xl shadow-sm border p-6 flex flex-col justify-between">
              <div>
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

                  {consolidado.patrimonio > 0 && (
                    <span className="text-xs font-semibold text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
                      Total: {formatBRL(consolidado.patrimonio)}
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
              </div>

              {/* Grid de Cards das Corretoras */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {listaCorretorasAtivas.map(c => {
                  const pct = consolidado.patrimonio > 0
                    ? (c.patrimonio / consolidado.patrimonio) * 100
                    : 0
                  const selecionado = String(corretoraSelecionada) === String(c.id)

                  return (
                    <div
                      key={c.id}
                      onClick={() => setCorretoraSelecionada(selecionado ? 'todas' : String(c.id))}
                      className={`rounded-xl border p-3 cursor-pointer transition-all relative overflow-hidden ${
                        selecionado
                          ? 'border-green-600 shadow-md bg-green-50/20 ring-2 ring-green-600/20'
                          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                      }`}
                    >
                      <div
                        className="absolute top-0 left-0 right-0 h-1.5"
                        style={{ backgroundColor: c.cor }}
                      />

                      <div className="flex items-center justify-between mb-2 mt-0.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: c.cor }}
                          />
                          <h4 className="font-bold text-gray-800 text-sm truncate max-w-[90px]">{c.nome}</h4>
                        </div>

                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                            selecionado
                              ? 'bg-green-700 text-white'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {pct.toFixed(1)}%
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                        <div>
                          <p className="text-[10px] text-gray-500">Patrimônio</p>
                          <p className="font-bold text-gray-900 text-xs">{formatBRL(c.patrimonio)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-500">Ativos</p>
                          <p className="font-bold text-gray-800 text-xs">{c.totalAtivos} ativos</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-500">Aportes</p>
                          <p className="font-semibold text-gray-700 text-xs">{formatBRL(c.aportes)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-500">Dividendos</p>
                          <p className="font-semibold text-green-700 text-xs">{formatBRL(c.dividendos)}</p>
                        </div>
                      </div>

                      <div className="pt-1.5 border-t border-gray-100 flex items-center justify-between text-[11px]">
                        <span className={selecionado ? 'font-bold text-green-700' : 'text-gray-400'}>
                          {selecionado ? '✓ Filtrado' : 'Filtrar'}
                        </span>
                        <ChevronRight size={12} className={selecionado ? 'text-green-700' : 'text-gray-400'} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

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

          {/* BARRA DE FILTROS POR TIPO DE ATIVO */}
          <div className="px-6 py-3 bg-gray-50/70 border-b flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1 mr-1">
                <Filter size={13} className="text-gray-400" />
                Filtrar:
              </span>

              <button
                type="button"
                onClick={() => setTipoFiltro('todos')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  tipoFiltro === 'todos'
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                <span>Todos</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  tipoFiltro === 'todos' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                }`}>
                  {contadoresTipo.todos}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setTipoFiltro('Acao')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  tipoFiltro === 'Acao'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white text-blue-700 hover:bg-blue-50 border border-blue-200'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                <span>Ações</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  tipoFiltro === 'Acao' ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-700'
                }`}>
                  {contadoresTipo.acoes}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setTipoFiltro('FII')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  tipoFiltro === 'FII'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-white text-purple-700 hover:bg-purple-50 border border-purple-200'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
                <span>Fundos Imobiliários (FIIs)</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  tipoFiltro === 'FII' ? 'bg-white/20 text-white' : 'bg-purple-50 text-purple-700'
                }`}>
                  {contadoresTipo.fiis}
                </span>
              </button>

              {contadoresTipo.bdrs > 0 && (
                <button
                  type="button"
                  onClick={() => setTipoFiltro('BDR')}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    tipoFiltro === 'BDR'
                      ? 'bg-cyan-600 text-white shadow-sm'
                      : 'bg-white text-cyan-700 hover:bg-cyan-50 border border-cyan-200'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-cyan-500 inline-block" />
                  <span>BDRs</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    tipoFiltro === 'BDR' ? 'bg-white/20 text-white' : 'bg-cyan-50 text-cyan-700'
                  }`}>
                    {contadoresTipo.bdrs}
                  </span>
                </button>
              )}

              {contadoresTipo.outros > 0 && (
                <button
                  type="button"
                  onClick={() => setTipoFiltro('Outros')}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    tipoFiltro === 'Outros'
                      ? 'bg-gray-600 text-white shadow-sm'
                      : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  <span>Outros</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    tipoFiltro === 'Outros' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {contadoresTipo.outros}
                  </span>
                </button>
              )}
            </div>

            {tipoFiltro !== 'todos' && (
              <button
                type="button"
                onClick={() => setTipoFiltro('todos')}
                className="text-xs text-gray-500 hover:text-gray-800 underline underline-offset-2 flex items-center gap-1"
              >
                Limpar filtro ({tipoFiltro === 'Acao' ? 'Ações' : tipoFiltro === 'FII' ? 'FIIs' : tipoFiltro})
              </button>
            )}
          </div>

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
                    const ativosFiltradosCorr = (corr.ativos || []).filter(a => {
                      if (tipoFiltro === 'todos') return true
                      return normalizarTipo(a.tipo, a.ticker) === tipoFiltro
                    })
                    if (ativosFiltradosCorr.length === 0) return null
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
                              {ativosFiltradosCorr.length} de {corr.ativos.length} ativo(s)
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
                                <th className="py-2 px-3 text-right">% Subtotal</th>
                                <th className="py-2 px-3 text-right">DY</th>
                                <th className="py-2 px-3 text-right">P/VP</th>
                                <th className="py-2 px-3 text-right">Variação</th>
                              </tr>
                            </thead>
                            <tbody>
                              {ativosFiltradosCorr.map(a => (
                                <tr
                                  key={a.ticker}
                                  onClick={() => navigate(`/ativo/${a.ticker}`)}
                                  className="border-b hover:bg-gray-50 cursor-pointer"
                                >
                                  <td className="py-2 px-3 font-semibold text-blue-700">{a.ticker}</td>
                                  <td className="py-2 px-3">
                                    <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700">
                                      {normalizarTipo(a.tipo, a.ticker) === 'FII' ? 'FII' : normalizarTipo(a.tipo, a.ticker) === 'Acao' ? 'Ação' : a.tipo}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 text-right">{a.quantidade}</td>
                                  <td className="py-2 px-3 text-right">{formatBRL(a.preco_medio)}</td>
                                  <td className="py-2 px-3 text-right">
                                    {a.tem_preco ? formatBRL(a.preco_atual) : <span className="text-gray-400 text-xs">sem preço</span>}
                                  </td>
                                  <td className="py-2 px-3 text-right font-medium">{formatBRL(a.valor_atual)}</td>
                                  <td className="py-2 px-3 text-right">
                                    <div className="inline-flex items-center gap-1.5 justify-end">
                                      <div className="w-10 bg-gray-100 rounded-full h-1.5 overflow-hidden hidden sm:block">
                                        <div
                                          className="bg-emerald-500 h-full rounded-full"
                                          style={{ width: `${Math.min(100, Math.max(0, a.porcentagem || 0))}%` }}
                                        />
                                      </div>
                                      <span className="font-semibold text-gray-800 text-xs">
                                        {(a.porcentagem || 0).toFixed(1)}%
                                      </span>
                                    </div>
                                  </td>
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
                        <HeaderCell label="% Carteira" sortKey="porcentagem" align="right" />
                        <HeaderCell label="DY" sortKey="dy" align="right" />
                        <HeaderCell label="P/VP" sortKey="pvp" align="right" />
                        <HeaderCell label="Variação" sortKey="variacao" align="right" />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedAtivos.length === 0 ? (
                        <tr>
                          <td colSpan={ehConsolidado ? 11 : 10} className="py-8 text-center text-gray-500">
                            Nenhum ativo encontrado para o filtro selecionado ({tipoFiltro === 'Acao' ? 'Ações' : tipoFiltro === 'FII' ? 'Fundos Imobiliários' : tipoFiltro}).
                            <button
                              type="button"
                              onClick={() => setTipoFiltro('todos')}
                              className="ml-2 text-green-700 underline font-semibold text-xs"
                            >
                              Mostrar todos
                            </button>
                          </td>
                        </tr>
                      ) : (
                        sortedAtivos.map(a => {
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
                                <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700">
                                  {normalizarTipo(a.tipo, a.ticker) === 'FII' ? 'FII' : normalizarTipo(a.tipo, a.ticker) === 'Acao' ? 'Ação' : a.tipo}
                                </span>
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
                                <div className="inline-flex items-center gap-1.5 justify-end">
                                  <div className="w-12 bg-gray-100 rounded-full h-1.5 overflow-hidden hidden sm:block">
                                    <div
                                      className="bg-emerald-500 h-full rounded-full"
                                      style={{ width: `${Math.min(100, Math.max(0, a.porcentagem || 0))}%` }}
                                    />
                                  </div>
                                  <span className="font-semibold text-gray-800 text-xs">
                                    {(a.porcentagem || 0).toFixed(1)}%
                                  </span>
                                </div>
                              </td>
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
                        })
                      )}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t font-semibold">
                      <tr>
                        <td className="py-3 px-3 text-gray-700" colSpan={ehConsolidado ? 6 : 5}>
                          Total {ehConsolidado ? 'Consolidado' : `em ${corretoraAtiva?.nome}`}:
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-gray-900 text-base">
                          {formatBRL(dadosAtivos.patrimonio)}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-gray-900 text-xs">
                          {tipoFiltro === 'todos' ? '100.0%' : '-'}
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