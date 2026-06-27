import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Header from '../components/Header'
import {
  TrendingUp, Wallet, DollarSign, PieChart,
  RefreshCw, ArrowUpRight, ArrowDownRight,
  Upload, Zap, Database, Calculator, ChevronRight,
} from 'lucide-react'

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [resumo, setResumo] = useState({
    patrimonio: 0, totalAportes: 0, totalDividendos: 0, totalAtivos: 0,
  })
  const [ativos, setAtivos] = useState([])
  const [atualizandoCotacoes, setAtualizandoCotacoes] = useState(false)
  const [statusCotacao, setStatusCotacao] = useState(null)

  useEffect(() => { if (user) carregarResumo() }, [user])

  const carregarResumo = async () => {
    setLoading(true)
    try {
      // 1) Carrega TODAS as operações (fonte de verdade da carteira real)
      const { data: operacoes } = await supabase
        .from('operacoes').select('*').eq('user_id', user.id)
        .order('data', { ascending: true })

      // 2) Calcula saldo e custo médio por ticker
      const posicoes = {}  // { ticker: { qtde, custo, valorInvestido } }
      if (operacoes && operacoes.length > 0) {
        for (const op of operacoes) {
          const t = op.ticker
          const q = Number(op.quantidade) || 0
          const p = Number(op.preco_unitario) || 0
          const tipoOp = (op.operacao || '').toUpperCase()
          if (!posicoes[t]) posicoes[t] = { qtde: 0, custo: 0 }
          if (tipoOp === 'COMPRA') {
            posicoes[t].qtde += q
            posicoes[t].custo += q * p
          } else if (tipoOp === 'VENDA') {
            const pm = posicoes[t].qtde > 0 ? posicoes[t].custo / posicoes[t].qtde : 0
            posicoes[t].qtde -= q
            posicoes[t].custo -= q * pm
            if (posicoes[t].qtde <= 0.0001) {
              posicoes[t].qtde = 0
              posicoes[t].custo = 0
            }
          }
        }
      }

      // 3) Tickers que ainda têm posição (qtde > 0)
      const tickersAtivos = Object.keys(posicoes).filter(t => posicoes[t].qtde > 0)

      // 4) Busca dados dos ativos (preço, DY, P/VP) apenas para os ativos
      let precosAtivos = {}
      if (tickersAtivos.length > 0) {
        const { data: ativosBD } = await supabase
          .from('ativos').select('ticker, preco, tipo, dy, pvp, razao_social')
          .in('ticker', tickersAtivos)
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

      // 5) Totais de aportes e dividendos
      const { data: aportesRows } = await supabase
        .from('aportes').select('valor').eq('user_id', user.id)
      const totalAportado = aportesRows
        ? aportesRows.reduce((s, a) => s + Number(a.valor || 0), 0) : 0

      const { data: divsRows } = await supabase
        .from('dividendos').select('valor').eq('user_id', user.id)
      const totalDividendos = divsRows
        ? divsRows.reduce((s, d) => s + Number(d.valor || 0), 0) : 0

      // 6) Monta lista de ativos com posição
      const listaAtivos = []
      let patrimonio = 0
      for (const ticker of tickersAtivos) {
        const pos = posicoes[ticker]
        const info = precosAtivos[ticker] || { preco: 0, tipo: null, dy: 0, pvp: 0, razao_social: null }
        const pm = pos.qtde > 0 ? pos.custo / pos.qtde : 0
        const valorAtual = pos.qtde * info.preco
        const custoInvestido = pos.qtde * pm
        let tipo = info.tipo
        if (!tipo) {
          tipo = ticker.endsWith('11') && ticker.length >= 5 ? 'FII' : 'Acao'
        }
        listaAtivos.push({
          ticker,
          quantidade: pos.qtde,
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

      // Ordena por valor atual decrescente
      listaAtivos.sort((a, b) => b.valor_atual - a.valor_atual)

      setResumo({
        patrimonio,
        totalAportes: totalAportado,
        totalDividendos,
        totalAtivos: listaAtivos.length,
      })
      setAtivos(listaAtivos)
    } catch (err) {
      console.error('Erro ao carregar resumo:', err)
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

  const formatBRL = (v) => new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL',
  }).format(v)

  const rentabilidade = resumo.totalAportes > 0
    ? ((resumo.patrimonio - resumo.totalAportes) / resumo.totalAportes * 100) : 0

  // Cards clicáveis — cada um navega para sua página
  const CardClicavel = ({ titulo, valor, sub, icon: Icon, cor, destino, extraClasses = '' }) => (
    <button
      onClick={() => navigate(destino)}
      className={`bg-white rounded-xl shadow-sm border p-6 text-left hover:border-green-500 hover:shadow-md transition-all group ${extraClasses}`}
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

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        titulo="Dashboard"
        subtitulo="Visão geral da sua carteira"
        mostrarImportar={true}
      />

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* 4 cards clicáveis */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <CardClicavel
            titulo="Patrimônio"
            valor={formatBRL(resumo.patrimonio)}
            sub={
              resumo.totalAportes > 0 && (
                <span className={`flex items-center gap-1 ${rentabilidade >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {rentabilidade >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {rentabilidade.toFixed(2)}% vs aportado
                </span>
              )
            }
            icon={PieChart}
            cor="text-purple-600"
            destino="/patrimonio"
          />

          <CardClicavel
            titulo="Total Aportado"
            valor={formatBRL(resumo.totalAportes)}
            sub={<span className="text-gray-500">Veja todos os aportes</span>}
            icon={Wallet}
            cor="text-blue-600"
            destino="/aportes"
          />

          <CardClicavel
            titulo="Dividendos"
            valor={formatBRL(resumo.totalDividendos)}
            sub={<span className="text-gray-500">Histórico completo</span>}
            icon={DollarSign}
            cor="text-green-600"
            destino="/dividendos"
          />

          <CardClicavel
            titulo="Ativos"
            valor={String(resumo.totalAtivos)}
            sub={<span className="text-gray-500">Ver operações</span>}
            icon={TrendingUp}
            cor="text-amber-600"
            destino="/operacoes"
          />
        </div>

        {/* Carteira detalhada */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="px-6 py-4 border-b flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Minha Carteira</h3>
              <p className="text-xs text-gray-500">Clique no ticker para ver detalhes</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={atualizarCotacoes}
                disabled={atualizandoCotacoes || ativos.length === 0}
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

          {/* Status da atualização */}
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
          ) : ativos.length === 0 ? (
            <div className="p-12 text-center">
              <Calculator className="mx-auto text-gray-300 mb-3" size={48} />
              <p className="text-gray-700 font-semibold mb-2">Carteira vazia</p>
              <p className="text-gray-500 text-sm mb-4">Importe suas operações para começar.</p>
              <button
                onClick={() => navigate('/importar')}
                className="px-4 py-2 bg-green-700 text-white text-sm rounded-lg hover:bg-green-600 inline-flex items-center gap-2"
              >
                <Upload size={16} /> Importar dados
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr className="text-left text-gray-600">
                    <th className="py-2 px-3">Ticker</th>
                    <th className="py-2 px-3">Tipo</th>
                    <th className="py-2 px-3 text-right">Qtde</th>
                    <th className="py-2 px-3 text-right">Preço médio</th>
                    <th className="py-2 px-3 text-right">Preço atual</th>
                    <th className="py-2 px-3 text-right">Valor atual</th>
                    <th className="py-2 px-3 text-right">DY</th>
                    <th className="py-2 px-3 text-right">P/VP</th>
                    <th className="py-2 px-3 text-right">Variação</th>
                  </tr>
                </thead>
                <tbody>
                  {ativos.map(a => {
                    const variacao = a.valor_investido > 0
                      ? ((a.valor_atual - a.valor_investido) / a.valor_investido) * 100 : 0
                    return (
                      <tr key={a.ticker}
                        onClick={() => navigate(`/ativo/${a.ticker}`)}
                        className="border-b hover:bg-gray-50 cursor-pointer">
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
                        <td className="py-2 px-3 text-right">
                          {a.dy > 0 ? `${a.dy.toFixed(2)}%` : '-'}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {a.pvp > 0 ? a.pvp.toFixed(2) : '-'}
                        </td>
                        <td className={`py-2 px-3 text-right font-medium ${
                          variacao >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {a.tem_preco ? `${variacao >= 0 ? '+' : ''}${variacao.toFixed(2)}%` : '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
