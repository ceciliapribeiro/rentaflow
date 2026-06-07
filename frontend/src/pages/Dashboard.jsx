import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  TrendingUp, Wallet, DollarSign, PieChart,
  LogOut, RefreshCw, ArrowUpRight, ArrowDownRight,
  Upload, Zap, Database, Calculator, Building2
} from 'lucide-react'

export default function Dashboard() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [resumo, setResumo] = useState({
    patrimonio: 0, totalAportes: 0, totalDividendos: 0, totalAtivos: 0,
  })
  const [ativos, setAtivos] = useState([])
  const [debugInfo, setDebugInfo] = useState('')
  const [atualizandoCotacoes, setAtualizandoCotacoes] = useState(false)
  const [statusCotacao, setStatusCotacao] = useState(null)

  useEffect(() => { if (user) carregarResumo() }, [user])

  const carregarResumo = async () => {
    setLoading(true)
    let debug = []
    try {
      debug.push(`User ID: ${user?.id || 'NÃO AUTENTICADO'}`)

      const { data: carteira } = await supabase
        .from('carteira').select('*').eq('user_id', user.id)
      debug.push(`Carteira: ${carteira?.length || 0} linhas`)

      let precosAtivos = {}
      if (carteira && carteira.length > 0) {
        const tickers = carteira.map(c => c.ticker)
        const { data: ativosBD } = await supabase
          .from('ativos').select('ticker, preco, tipo, dy, pvp, razao_social')
          .in('ticker', tickers)
        if (ativosBD) {
          ativosBD.forEach(a => {
            precosAtivos[a.ticker] = {
              preco: Number(a.preco) || 0,
              tipo: a.tipo,
              dy: Number(a.dy) || 0,
              pvp: Number(a.pvp) || 0,
              razao_social: a.razao_social,
            }
          })
        }
      }

      const { data: operacoes } = await supabase
        .from('operacoes').select('*').eq('user_id', user.id)
      debug.push(`Operações: ${operacoes?.length || 0} linhas`)

      const custoMedio = {}
      if (operacoes && operacoes.length > 0) {
        for (const op of operacoes) {
          const t = op.ticker
          const q = Number(op.quantidade) || 0
          const p = Number(op.preco_unitario) || 0
          const tipoOp = (op.operacao || '').toUpperCase()
          if (!custoMedio[t]) custoMedio[t] = { qtde: 0, custo: 0 }
          if (tipoOp === 'COMPRA') {
            custoMedio[t].qtde += q
            custoMedio[t].custo += q * p
          } else if (tipoOp === 'VENDA') {
            const pm = custoMedio[t].qtde > 0 ? custoMedio[t].custo / custoMedio[t].qtde : 0
            custoMedio[t].qtde -= q
            custoMedio[t].custo -= q * pm
            if (custoMedio[t].qtde < 0) custoMedio[t].qtde = 0
            if (custoMedio[t].custo < 0) custoMedio[t].custo = 0
          }
        }
      }

      const { data: aportesRows } = await supabase
        .from('aportes').select('valor').eq('user_id', user.id)
      const totalAportado = aportesRows
        ? aportesRows.reduce((s, a) => s + Number(a.valor || 0), 0) : 0
      debug.push(`Aportes: ${aportesRows?.length || 0} linhas`)

      const { data: divsRows } = await supabase
        .from('dividendos').select('valor').eq('user_id', user.id)
      const totalDividendos = divsRows
        ? divsRows.reduce((s, d) => s + Number(d.valor || 0), 0) : 0
      debug.push(`Dividendos: ${divsRows?.length || 0} linhas`)

      const listaAtivos = []
      let patrimonio = 0

      if (carteira && carteira.length > 0) {
        for (const c of carteira) {
          const qtde = Number(c.qtde_ideal) || 0
          if (qtde <= 0) continue
          const info = precosAtivos[c.ticker] || { preco: 0, tipo: null, dy: 0, pvp: 0, razao_social: null }
          const valorAtual = qtde * info.preco
          const cm = custoMedio[c.ticker] || { qtde: 0, custo: 0 }
          const pm = cm.qtde > 0 ? cm.custo / cm.qtde : 0
          const custoInvestido = qtde * pm
          let tipo = info.tipo
          if (!tipo) {
            tipo = c.ticker.endsWith('11') && c.ticker.length >= 5 ? 'FII' : 'Acao'
          }
          listaAtivos.push({
            ticker: c.ticker,
            quantidade: qtde,
            preco_medio: pm,
            preco_atual: info.preco,
            valor_atual: valorAtual,
            valor_investido: custoInvestido,
            tipo,
            dy: info.dy,
            pvp: info.pvp,
            razao_social: info.razao_social,
            tem_preco: info.preco > 0,
          })
          patrimonio += valorAtual > 0 ? valorAtual : custoInvestido
        }
      }

      debug.push(`Ativos ativos: ${listaAtivos.length}`)
      debug.push(`Aportado: R$ ${totalAportado.toFixed(2)}`)
      debug.push(`Patrimônio: R$ ${patrimonio.toFixed(2)}`)
      debug.push(`Sem preço: ${listaAtivos.filter(a => !a.tem_preco).length}`)

      setResumo({
        patrimonio,
        totalAportes: totalAportado,
        totalDividendos,
        totalAtivos: listaAtivos.length,
      })
      setAtivos(listaAtivos)
      setDebugInfo(debug.join(' | '))
    } catch (err) {
      console.error(err)
      setDebugInfo(debug.join(' | ') + ` | ERRO: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const atualizarCotacoes = async () => {
    if (!ativos || ativos.length === 0) {
      alert('Nenhum ativo na carteira para atualizar.')
      return
    }
    setAtualizandoCotacoes(true)
    setStatusCotacao({ etapa: 'iniciando', mensagem: 'Buscando preços...' })

    try {
      const tickers = ativos.map(a => a.ticker)
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
      await carregarResumo()
    } catch (err) {
      console.error('Erro ao atualizar:', err)
      setStatusCotacao({ etapa: 'erro', mensagem: err.message })
    } finally {
      setAtualizandoCotacoes(false)
    }
  }

  const handleLogout = async () => { await signOut(); navigate('/login') }
  const handleImportar = () => navigate('/importar')
  const formatBRL = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
  const rentabilidade = resumo.totalAportes > 0
    ? ((resumo.patrimonio - resumo.totalAportes) / resumo.totalAportes * 100) : 0
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-green-800 text-white">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">RentaFlow</h1>
            <p className="text-green-200 text-sm">Gestão de Dividendos e Renda Passiva</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-green-200 text-sm hidden sm:block">{user?.email}</span>
            <button onClick={carregarResumo} className="p-2 hover:bg-green-700 rounded-lg">
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={handleLogout} className="flex items-center gap-2 bg-green-700 hover:bg-green-600 px-3 py-2 rounded-lg text-sm">
              <LogOut size={16} /> Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {debugInfo && (
          <div className="bg-yellow-50 border-2 border-yellow-400 rounded-xl p-4 mb-6">
            <h3 className="font-bold text-yellow-800 mb-2">Debug:</h3>
            <p className="text-sm text-yellow-900 font-mono break-all">{debugInfo}</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-500 text-sm font-medium">Patrimônio</span>
              <Wallet className="text-green-600" size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-800">{loading ? '...' : formatBRL(resumo.patrimonio)}</p>
            <div className={`flex items-center gap-1 mt-1 text-sm ${rentabilidade >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {rentabilidade >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {rentabilidade.toFixed(2)}% rentabilidade
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-500 text-sm font-medium">Total Aportado</span>
              <TrendingUp className="text-blue-600" size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-800">{loading ? '...' : formatBRL(resumo.totalAportes)}</p>
            <p className="text-gray-400 text-sm mt-1">Capital investido</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-500 text-sm font-medium">Dividendos</span>
              <DollarSign className="text-emerald-600" size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-800">{loading ? '...' : formatBRL(resumo.totalDividendos)}</p>
            <p className="text-gray-400 text-sm mt-1">Total recebido</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-500 text-sm font-medium">Ativos</span>
              <PieChart className="text-purple-600" size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-800">{loading ? '...' : resumo.totalAtivos}</p>
            <p className="text-gray-400 text-sm mt-1">Na carteira</p>
          </div>
        </div>

        {ativos.length > 0 ? (
          <div className="bg-white rounded-xl shadow-sm border p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-700">Minha Carteira</h2>


<div className="flex gap-2 flex-wrap">
  <button onClick={atualizarCotacoes} disabled={atualizandoCotacoes}
    className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50">
    <Zap size={16} className={atualizandoCotacoes ? 'animate-pulse' : ''} />
    {atualizandoCotacoes ? 'Atualizando...' : 'Atualizar Cotações'}
  </button>
  <button onClick={() => navigate('/dividendos')}
    className="flex items-center gap-2 px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-500">
    <DollarSign size={16} /> Dividendos
  </button>
  <button onClick={() => navigate('/smart-aporte')}
    className="flex items-center gap-2 px-4 py-2 text-sm bg-amber-700 text-white rounded-lg hover:bg-amber-600">
    <Calculator size={16} /> Smart Aporte
  </button>
  <button onClick={() => navigate('/corretoras')}
    className="flex items-center gap-2 px-4 py-2 text-sm bg-slate-700 text-white rounded-lg hover:bg-slate-600">
    <Building2 size={16} /> Corretoras
  </button>
  <button onClick={() => navigate('/importar-dados-b3')}
    className="flex items-center gap-2 px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-500">
    <Database size={16} /> Catálogo B3
  </button>
  <button onClick={handleImportar}
    className="flex items-center gap-2 px-4 py-2 text-sm bg-green-700 text-white rounded-lg hover:bg-green-600">
    <Upload size={16} /> Importar
  </button>
</div>


            </div>

            {statusCotacao && (
              <div className={`mb-4 p-3 rounded-lg text-sm ${
                statusCotacao.etapa === 'erro' ? 'bg-red-50 text-red-700 border border-red-200' :
                statusCotacao.etapa === 'sucesso' ? 'bg-green-50 text-green-700 border border-green-200' :
                'bg-blue-50 text-blue-700 border border-blue-200'
              }`}>
                <strong>Cotações:</strong> {statusCotacao.mensagem}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-2 px-3">Ticker</th>
                    <th className="py-2 px-3">Tipo</th>
                    <th className="py-2 px-3 text-right">Qtde</th>
                    <th className="py-2 px-3 text-right">Preço Médio</th>
                    <th className="py-2 px-3 text-right">Preço Atual</th>
                    <th className="py-2 px-3 text-right">Valor Atual</th>
                    <th className="py-2 px-3 text-right">DY</th>
                    <th className="py-2 px-3 text-right">P/VP</th>
                    <th className="py-2 px-3 text-right">Rent.</th>
                  </tr>
                </thead>
                <tbody>
                  {ativos.map((a, i) => {
                    const rent = a.preco_medio > 0 && a.preco_atual > 0
                      ? ((a.preco_atual - a.preco_medio) / a.preco_medio * 100) : 0
                    return (
                      <tr key={i} className="border-b hover:bg-gray-50">
                        <td className="py-2 px-3 font-medium text-gray-800">{a.ticker}</td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            a.tipo === 'FII' ? 'bg-purple-100 text-purple-700' :
                            a.tipo === 'BDR' ? 'bg-orange-100 text-orange-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>{a.tipo}</span>
                        </td>
                        <td className="py-2 px-3 text-right">{a.quantidade}</td>
                        <td className="py-2 px-3 text-right">{formatBRL(a.preco_medio)}</td>
                        <td className="py-2 px-3 text-right">
                          {a.tem_preco ? formatBRL(a.preco_atual) : <span className="text-yellow-600 text-xs">sem preço</span>}
                        </td>
                        <td className="py-2 px-3 text-right font-medium">
                          {a.tem_preco ? formatBRL(a.valor_atual) : formatBRL(a.valor_investido)}
                        </td>
                        <td className="py-2 px-3 text-right text-gray-600">
                          {a.dy > 0 ? `${a.dy.toFixed(2)}%` : '-'}
                        </td>
                        <td className="py-2 px-3 text-right text-gray-600">
                          {a.pvp > 0 ? a.pvp.toFixed(2) : '-'}
                        </td>
                        <td className={`py-2 px-3 text-right ${rent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {a.tem_preco ? `${rent.toFixed(1)}%` : '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
            <Upload className="mx-auto text-green-600 mb-4" size={48} />
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Bem-vindo ao RentaFlow v2.0!</h2>
            <p className="text-gray-500 max-w-lg mx-auto mb-6">Comece importando sua carteira.</p>
            <div className="flex gap-3 justify-center">
			<button
  onClick={() => navigate('/smart-aporte')}
  className="px-4 py-2 bg-amber-700 text-white text-sm rounded-lg hover:bg-amber-600 flex items-center gap-2"
>
  <Calculator size={16} />
  Smart Aporte
</button>

              <button onClick={() => navigate('/importar-dados-b3')}
                className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-500 font-medium">
                <Database size={18} /> Catálogo B3
              </button>
              <button onClick={handleImportar}
                className="inline-flex items-center gap-2 px-6 py-3 bg-green-700 text-white rounded-lg hover:bg-green-600 font-medium">
                <Upload size={18} /> Importar Carteira
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-gray-400 text-xs mt-8">RentaFlow v2.0 - Desenvolvido por Cecília Ribeiro</p>
      </main>
    </div>
  )
}

