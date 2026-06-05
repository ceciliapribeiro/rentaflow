import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  ArrowLeft, TrendingUp, AlertTriangle, ShoppingCart,
  TrendingDown, Calculator, BarChart3
} from 'lucide-react'
import { calcularSmartAporte } from '../utils/smartAporte'

const formatBRL = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)

const formatPct = (v, casas = 2) =>
  v != null ? `${(v * 100).toFixed(casas)}%` : '—'

export default function SmartAporte() {
  const navigate = useNavigate()
  const [valorAporte, setValorAporte] = useState('1000')
  const [loading, setLoading] = useState(true)
  const [calculando, setCalculando] = useState(false)
  const [carteira, setCarteira] = useState([])
  const [ativosBase, setAtivosBase] = useState([])
  const [operacoes, setOperacoes] = useState([])
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState(null)
  const [tab, setTab] = useState('compras')

  useEffect(() => {
    carregarDados()
  }, [])

  const carregarDados = async () => {
    setLoading(true)
    setErro(null)
    try {
      const [carteiraRes, ativosRes, operacoesRes] = await Promise.all([
        supabase.from('carteira').select('ticker, qtde_ideal'),
        supabase.from('ativos').select('ticker, tipo, razao_social, preco, dy, pvp'),
        supabase.from('operacoes').select('ticker, quantidade, preco_unitario, operacao'),
      ])

      if (carteiraRes.error) throw carteiraRes.error
      if (ativosRes.error) throw ativosRes.error
      if (operacoesRes.error) throw operacoesRes.error

      setCarteira(carteiraRes.data || [])
      setAtivosBase(ativosRes.data || [])
      setOperacoes(operacoesRes.data || [])
    } catch (err) {
      setErro('Erro ao carregar dados: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCalcular = () => {
    const valor = parseFloat(String(valorAporte).replace(',', '.'))
    if (!valor || valor <= 0) {
      setErro('Informe um valor de aporte válido.')
      return
    }
    setErro(null)
    setCalculando(true)

    setTimeout(() => {
      const r = calcularSmartAporte({
        carteira,
        ativosBase,
        operacoes,
        valorAporte: valor,
      })
      setResultado(r)
      setCalculando(false)
      if (r.erro) setErro(r.erro)
    }, 100)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Carregando dados da carteira...
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
            <h1 className="text-xl font-bold">Smart Aporte</h1>
            <p className="text-green-200 text-sm">
              Boleta de compra inteligente baseada em DY, P/VP e rebalanceamento
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
          <div className="flex items-end gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Valor do aporte (R$)
              </label>
              <input
                type="text"
                value={valorAporte}
                onChange={(e) => setValorAporte(e.target.value)}
                placeholder="1000.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>
            <button
              onClick={handleCalcular}
              disabled={calculando || ativosBase.length === 0}
              className="px-6 py-2 bg-green-700 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 flex items-center gap-2"
            >
              <Calculator size={18} />
              {calculando ? 'Calculando...' : 'Calcular boleta'}
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-500">
            <span><strong>{carteira.length}</strong> ativos na carteira</span>
            <span>•</span>
            <span><strong>{ativosBase.filter(a => a.preco > 0).length}</strong> com cotação</span>
            <span>•</span>
            <span><strong>{operacoes.length}</strong> operações no histórico</span>
          </div>
        </div>

        {erro && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-start gap-3">
            <AlertTriangle className="text-red-500 flex-shrink-0" size={20} />
            <div className="text-red-700 text-sm">{erro}</div>
          </div>
        )}

        {resultado && resultado.stats && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <CardStats
                label="Patrimônio atual"
                valor={formatBRL(resultado.stats.patrimonio_atual)}
                cor="text-gray-800"
              />
              <CardStats
                label="Aporte"
                valor={formatBRL(resultado.stats.valor_aporte)}
                cor="text-blue-700"
              />
              <CardStats
                label="Alocado"
                valor={formatBRL(resultado.stats.valor_alocado)}
                cor="text-green-700"
              />
              <CardStats
                label="Sobra"
                valor={formatBRL(resultado.stats.valor_restante)}
                cor="text-yellow-700"
              />
            </div>

            <div className="bg-white rounded-xl shadow-sm border mb-6">
              <div className="border-b flex">
                <button
                  onClick={() => setTab('compras')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 ${
                    tab === 'compras'
                      ? 'text-green-700 border-green-600'
                      : 'text-gray-500 border-transparent hover:text-gray-700'
                  }`}
                >
                  <ShoppingCart size={16} className="inline mr-2" />
                  Compras sugeridas ({resultado.compras.length})
                </button>
                <button
                  onClick={() => setTab('vendas')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 ${
                    tab === 'vendas'
                      ? 'text-red-700 border-red-600'
                      : 'text-gray-500 border-transparent hover:text-gray-700'
                  }`}
                >
                  <TrendingDown size={16} className="inline mr-2" />
                  Vendas a considerar ({resultado.vendas.length})
                </button>
                <button
                  onClick={() => setTab('analise')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 ${
                    tab === 'analise'
                      ? 'text-blue-700 border-blue-600'
                      : 'text-gray-500 border-transparent hover:text-gray-700'
                  }`}
                >
                  <BarChart3 size={16} className="inline mr-2" />
                  Análise da carteira
                </button>
              </div>

              {tab === 'compras' && (
                <div className="p-6">
                  {resultado.compras.length === 0 ? (
                    <p className="text-gray-500 text-sm">
                      Nenhuma compra sugerida com este valor. Tente um aporte maior.
                    </p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-gray-500">
                          <th className="py-2 text-left">Ticker</th>
                          <th className="py-2 text-center">Tipo</th>
                          <th className="py-2 text-right">Cotas</th>
                          <th className="py-2 text-right">Preço</th>
                          <th className="py-2 text-right">Total</th>
                          <th className="py-2 text-right">DY</th>
                          <th className="py-2 text-right">P/VP</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resultado.compras.map((c, i) => (
                          <tr key={i} className="border-b hover:bg-gray-50">
                            <td className="py-2 font-medium">{c.ticker}</td>
                            <td className="py-2 text-center">
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                c.tipo === 'FII' ? 'bg-purple-100 text-purple-700' :
                                'bg-blue-100 text-blue-700'
                              }`}>{c.tipo}</span>
                            </td>
                            <td className="py-2 text-right font-medium">{c.cotas}</td>
                            <td className="py-2 text-right">{formatBRL(c.preco)}</td>
                            <td className="py-2 text-right font-bold text-green-700">
                              {formatBRL(c.valor)}
                            </td>
                            <td className="py-2 text-right">
                              {c.dy ? `${c.dy.toFixed(2)}%` : '—'}
                            </td>
                            <td className="py-2 text-right">
                              {c.pvp ? c.pvp.toFixed(2) : '—'}
                            </td>
                          </tr>
                        ))}
                        <tr className="border-t-2 font-bold">
                          <td colSpan="4" className="py-3 text-right">Total alocado:</td>
                          <td className="py-3 text-right text-green-700">
                            {formatBRL(resultado.compras.reduce((s, c) => s + c.valor, 0))}
                          </td>
                          <td colSpan="2"></td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {tab === 'vendas' && (
                <div className="p-6">
                  {resultado.vendas.length === 0 ? (
                    <p className="text-gray-500 text-sm">
                      Nenhum critério de venda detectado. Carteira saudável!
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {resultado.vendas.map((v, i) => (
                        <div key={i} className="border rounded-lg p-4 bg-red-50">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <span className="font-bold text-lg">{v.ticker}</span>
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                v.tipo === 'FII' ? 'bg-purple-100 text-purple-700' :
                                'bg-blue-100 text-blue-700'
                              }`}>{v.tipo}</span>
                            </div>
                            <div className="text-right text-sm">
                              <div>{v.quantidade} cotas × {formatBRL(v.preco)}</div>
                              <div className="text-gray-500">PM: {formatBRL(v.preco_medio)}</div>
                            </div>
                          </div>
                          <div className="space-y-1">
                            {v.motivos.map((m, j) => (
                              <div key={j} className="text-sm bg-white rounded p-2 flex justify-between">
                                <span>
                                  <strong className="text-red-700">{m.tipo.replace('_', ' ')}:</strong>{' '}
                                  {m.descricao}
                                </span>
                                <span className="text-red-600 font-medium">
                                  Vender até {m.cotas} cotas
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tab === 'analise' && resultado.ativos && (
                <div className="p-6 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-gray-500">
                        <th className="py-2 text-left">Ticker</th>
                        <th className="py-2 text-center">Tipo</th>
                        <th className="py-2 text-right">Qtde</th>
                        <th className="py-2 text-right">Valor atual</th>
                        <th className="py-2 text-right">Peso real</th>
                        <th className="py-2 text-right">Peso alvo</th>
                        <th className="py-2 text-right">Défice</th>
                        <th className="py-2 text-right">DY</th>
                        <th className="py-2 text-right">P/VP</th>
                        <th className="py-2 text-right">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultado.ativos.map((a, i) => (
                        <tr key={i} className="border-b hover:bg-gray-50">
                          <td className="py-2 font-medium">{a.ticker}</td>
                          <td className="py-2 text-center">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                              a.tipo === 'FII' ? 'bg-purple-100 text-purple-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>{a.tipo}</span>
                          </td>
                          <td className="py-2 text-right">{a.quantidade}</td>
                          <td className="py-2 text-right">{formatBRL(a.valor_atual)}</td>
                          <td className="py-2 text-right">{formatPct(a.peso_real)}</td>
                          <td className="py-2 text-right">{formatPct(a.peso_alvo)}</td>
                          <td className={`py-2 text-right ${a.defice > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                            {formatBRL(a.defice)}
                          </td>
                          <td className="py-2 text-right">{a.dy ? `${a.dy.toFixed(2)}%` : '—'}</td>
                          <td className="py-2 text-right">{a.pvp ? a.pvp.toFixed(2) : '—'}</td>
                          <td className="py-2 text-right font-medium">
                            {a.score_compra > 0 ? a.score_compra.toFixed(0) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800 mb-6">
              <p className="font-semibold mb-1">💡 Como funciona o score de compra</p>
              <p>
                Score = <code>défice × (1 + DY/100) × fator_pvp</code>.
                Ativos com maior défice (mais distantes do alvo) e maior DY recebem prioridade.
                Para FIIs com P/VP &gt; 1, aplicamos um fator de penalidade.
              </p>
            </div>
          </>
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
