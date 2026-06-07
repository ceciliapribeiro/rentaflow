import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import {
  ArrowLeft, DollarSign, Search, AlertTriangle,
  CheckCircle, Calendar, Loader, TrendingUp
} from 'lucide-react'

const formatBRL = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

const formatData = (iso) => {
  if (!iso) return '—'
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

export default function Dividendos() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [buscando, setBuscando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

  // Dados da carteira
  const [tickers, setTickers] = useState([])
  const [operacoes, setOperacoes] = useState([])

  // Parâmetros da busca
  const hoje = new Date().toISOString().split('T')[0]
  const umAnoAtras = (() => {
    const d = new Date()
    d.setDate(d.getDate() - 365)
    return d.toISOString().split('T')[0]
  })()
  const [dataInicio, setDataInicio] = useState(umAnoAtras)
  const [dataFim, setDataFim] = useState(hoje)

  // Resultado da busca
  const [proventos, setProventos] = useState([])
  const [stats, setStats] = useState(null)
  const [proventosNovos, setProventosNovos] = useState([])
  const [proventosExistentes, setProventosExistentes] = useState([])

  useEffect(() => {
    if (user) carregarDados()
  }, [user])

  const carregarDados = async () => {
    setLoading(true)
    try {
      // 1. Pega tickers únicos da carteira
      const { data: carteira, error: errCart } = await supabase
        .from('carteira')
        .select('ticker, qtde_ideal')
        .eq('user_id', user.id)
        .gt('qtde_ideal', 0)

      if (errCart) throw errCart

      // 2. Pega tipos de cada ticker da tabela ativos
      const tickersList = (carteira || []).map(c => c.ticker)
      if (tickersList.length === 0) {
        setTickers([])
        setOperacoes([])
        setLoading(false)
        return
      }

      const { data: ativos, error: errAt } = await supabase
        .from('ativos')
        .select('ticker, tipo')
        .in('ticker', tickersList)

      if (errAt) throw errAt

      const tipoPorTicker = {}
      ;(ativos || []).forEach(a => { tipoPorTicker[a.ticker] = a.tipo })

      const tickersComTipo = tickersList.map(t => ({
        ticker: t,
        tipo: tipoPorTicker[t] || (t.endsWith('11') && t.length >= 5 ? 'FII' : 'Acao'),
      }))

      // 3. Pega operações para reconstruir custódia
      const { data: ops, error: errOps } = await supabase
        .from('operacoes')
        .select('data, ticker, quantidade, operacao')
        .eq('user_id', user.id)
        .order('data', { ascending: true })

      if (errOps) throw errOps

      setTickers(tickersComTipo)
      setOperacoes(ops || [])
    } catch (err) {
      console.error(err)
      setErro('Erro ao carregar dados: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleBuscar = async () => {
    if (tickers.length === 0) {
      setErro('Nenhum ativo na carteira para buscar dividendos.')
      return
    }
    if (operacoes.length === 0) {
      setErro('Nenhuma operação registrada — necessário para calcular custódia.')
      return
    }

    setErro(null)
    setBuscando(true)
    setProventos([])
    setStats(null)
    setProventosNovos([])
    setProventosExistentes([])

    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
      const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

      const response = await fetch(`${SUPABASE_URL}/functions/v1/buscar-dividendos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ANON_KEY}`,
          'apikey': ANON_KEY,
        },
        body: JSON.stringify({
          operacoes,
          tickers_carteira: tickers,
          data_inicio: dataInicio,
          data_fim: dataFim,
        }),
      })

      if (!response.ok) {
        const txt = await response.text()
        throw new Error(`Edge Function ${response.status}: ${txt}`)
      }

      const resultado = await response.json()
      if (resultado.erro) throw new Error(resultado.erro)

      const encontrados = resultado.encontrados || []
      setProventos(encontrados)
      setStats(resultado.stats)

      // 4. Verifica quais já estão no banco (dedup)
      if (encontrados.length > 0) {
        const { data: existentes } = await supabase
          .from('dividendos')
          .select('ticker, data_pagamento, tipo_provento')
          .eq('user_id', user.id)
          .gte('data_pagamento', dataInicio)
          .lte('data_pagamento', dataFim)

        const chavesExistentes = new Set(
          (existentes || []).map(d =>
            `${d.ticker}|${d.data_pagamento}|${d.tipo_provento}`
          )
        )

        const novos = []
        const dups = []
        for (const p of encontrados) {
          const tipoProv = p.tipo === 'JUROS' ? 'JUROS' : 'RENDIMENTO'
          const chave = `${p.ticker}|${p.data_pagamento}|${tipoProv}`
          if (chavesExistentes.has(chave)) {
            dups.push({ ...p, tipo_provento: tipoProv, ja_existe: true })
          } else {
            novos.push({ ...p, tipo_provento: tipoProv, selecionado: true })
          }
        }

        setProventosNovos(novos)
        setProventosExistentes(dups)
      }
    } catch (err) {
      console.error(err)
      setErro('Erro ao buscar: ' + err.message)
    } finally {
      setBuscando(false)
    }
  }

  const toggleSelecao = (idx) => {
    setProventosNovos(prev =>
      prev.map((p, i) => i === idx ? { ...p, selecionado: !p.selecionado } : p)
    )
  }

  const toggleTodos = () => {
    const todosSel = proventosNovos.every(p => p.selecionado)
    setProventosNovos(prev =>
      prev.map(p => ({ ...p, selecionado: !todosSel }))
    )
  }

  const handleSalvar = async () => {
    const aSalvar = proventosNovos.filter(p => p.selecionado)
    if (aSalvar.length === 0) {
      setErro('Selecione ao menos um provento para salvar.')
      return
    }

    setSalvando(true)
    setErro(null)
    try {
      const linhas = aSalvar.map(p => ({
        user_id: user.id,
        ano: parseInt(p.data_pagamento.split('-')[0], 10),
        data_pagamento: p.data_pagamento,
        data_ex: p.data_ex,
        ticker: p.ticker,
        valor: p.valor_total,
        valor_unitario: p.valor_unitario,
        quantidade: p.quantidade,
        tipo_provento: p.tipo_provento,
        fonte: p.fonte,
      }))

      const { error } = await supabase
        .from('dividendos')
        .upsert(linhas, {
          onConflict: 'user_id,ticker,data_pagamento,tipo_provento',
          ignoreDuplicates: false,
        })

      if (error) throw error

      alert(`✅ ${linhas.length} provento(s) salvo(s) com sucesso!`)

      // Atualiza UI: move salvos para "existentes"
      setProventosExistentes(prev => [
        ...prev,
        ...aSalvar.map(p => ({ ...p, ja_existe: true }))
      ])
      setProventosNovos(prev => prev.filter(p => !p.selecionado))
    } catch (err) {
      setErro('Erro ao salvar: ' + err.message)
    } finally {
      setSalvando(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Carregando dados...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-green-800 text-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
          <button onClick={() => navigate('/dashboard')} className="p-2 hover:bg-green-700 rounded-lg">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold">Buscar Dividendos</h1>
            <p className="text-green-200 text-sm">
              Consulta proventos via Fundamentus (B3) com cálculo de custódia D+2
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Painel de busca */}
        <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
          <h2 className="font-semibold text-gray-700 mb-4">Parâmetros da busca</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data inicial
              </label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data final
              </label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleBuscar}
                disabled={buscando || tickers.length === 0}
                className="w-full px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {buscando ? <Loader className="animate-spin" size={18} /> : <Search size={18} />}
                {buscando ? 'Buscando...' : 'Buscar dividendos'}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-500">
            <span><strong>{tickers.length}</strong> tickers na carteira</span>
            <span>•</span>
            <span><strong>{operacoes.length}</strong> operações registradas</span>
            <span>•</span>
            <span>Janela: <strong>{Math.round((new Date(dataFim) - new Date(dataInicio)) / 86400000)}</strong> dias</span>
          </div>
        </div>

        {erro && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-start gap-3">
            <AlertTriangle className="text-red-500 flex-shrink-0" size={20} />
            <div className="text-red-700 text-sm">{erro}</div>
          </div>
        )}

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <CardStats label="Tickers consultados" valor={stats.tickers_consultados} cor="text-gray-800" />
            <CardStats label="Proventos brutos" valor={stats.total_proventos_brutos} cor="text-blue-700" />
            <CardStats label="Encontrados" valor={stats.encontrados} cor="text-green-700" />
            <CardStats label="Sem custódia" valor={stats.ignorados_sem_custodia} cor="text-yellow-700" />
          </div>
        )}

        {/* Proventos novos (selecionáveis) */}
        {proventosNovos.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border mb-6">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="font-semibold text-gray-700">
                Proventos novos ({proventosNovos.length})
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={toggleTodos}
                  className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
                >
                  {proventosNovos.every(p => p.selecionado) ? 'Desmarcar todos' : 'Marcar todos'}
                </button>
                <button
                  onClick={handleSalvar}
                  disabled={salvando}
                  className="px-4 py-1.5 text-sm bg-green-700 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 flex items-center gap-2"
                >
                  {salvando ? <Loader className="animate-spin" size={14} /> : <CheckCircle size={14} />}
                  Salvar selecionados ({proventosNovos.filter(p => p.selecionado).length})
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr className="border-b text-gray-500 text-left">
                    <th className="py-2 px-3 w-8"></th>
                    <th className="py-2 px-3">Ticker</th>
                    <th className="py-2 px-3">Tipo</th>
                    <th className="py-2 px-3">Data EX</th>
                    <th className="py-2 px-3">Pagamento</th>
                    <th className="py-2 px-3 text-right">Qtde</th>
                    <th className="py-2 px-3 text-right">Valor unit.</th>
                    <th className="py-2 px-3 text-right">Total</th>
                    <th className="py-2 px-3">Fonte</th>
                  </tr>
                </thead>
                <tbody>
                  {proventosNovos.map((p, i) => (
                    <tr key={i} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-3">
                        <input
                          type="checkbox"
                          checked={p.selecionado}
                          onChange={() => toggleSelecao(i)}
                          className="w-4 h-4"
                        />
                      </td>
                      <td className="py-2 px-3 font-medium">{p.ticker}</td>
                      <td className="py-2 px-3">
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          p.tipo_provento === 'JUROS' ? 'bg-orange-100 text-orange-700' :
                          'bg-emerald-100 text-emerald-700'
                        }`}>{p.tipo_provento}</span>
                      </td>
                      <td className="py-2 px-3 text-gray-600">{formatData(p.data_ex)}</td>
                      <td className="py-2 px-3 text-gray-600">{formatData(p.data_pagamento)}</td>
                      <td className="py-2 px-3 text-right">{p.quantidade}</td>
                      <td className="py-2 px-3 text-right">{formatBRL(p.valor_unitario)}</td>
                      <td className="py-2 px-3 text-right font-bold text-green-700">{formatBRL(p.valor_total)}</td>
                      <td className="py-2 px-3 text-xs text-gray-500">{p.fonte}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-bold">
                    <td colSpan="7" className="py-2 px-3 text-right">Total selecionado:</td>
                    <td className="py-2 px-3 text-right text-green-700">
                      {formatBRL(proventosNovos.filter(p => p.selecionado).reduce((s, p) => s + p.valor_total, 0))}
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Proventos já existentes */}
        {proventosExistentes.length > 0 && (
          <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-4 mb-6">
            <h3 className="font-semibold text-yellow-800 mb-2 text-sm">
              {proventosExistentes.length} provento(s) já registrado(s) no banco — ignorados
            </h3>
            <div className="text-xs text-yellow-700">
              {proventosExistentes.slice(0, 5).map((p, i) => (
                <div key={i}>
                  • {p.ticker} • {formatData(p.data_pagamento)} • {p.tipo_provento} • {formatBRL(p.valor_total)}
                </div>
              ))}
              {proventosExistentes.length > 5 && (
                <div className="mt-1">... e mais {proventosExistentes.length - 5}</div>
              )}
            </div>
          </div>
        )}

        {/* Mensagem se busca foi feita mas sem resultados */}
        {stats && proventosNovos.length === 0 && proventosExistentes.length === 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-blue-700 text-sm">
              Nenhum provento encontrado na janela. Verifique se você tinha cotas dos ativos antes da data EX.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}

function CardStats({ label, valor, cor }) {
  return (
    <div className="bg-white border rounded-lg p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${cor}`}>{valor}</p>
    </div>
  )
}
