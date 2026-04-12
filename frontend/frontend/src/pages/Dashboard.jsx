import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  TrendingUp, Wallet, DollarSign, PieChart,
  LogOut, RefreshCw, ArrowUpRight, ArrowDownRight
} from 'lucide-react'

export default function Dashboard() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [resumo, setResumo] = useState({
    patrimonio: 0,
    totalAportes: 0,
    totalDividendos: 0,
    totalAtivos: 0,
  })

  useEffect(() => {
    carregarResumo()
  }, [])

  const carregarResumo = async () => {
    setLoading(true)
    try {
      // Busca aportes
      const { data: aportes } = await supabase
        .from('aportes')
        .select('valor')
      const totalAportes = aportes?.reduce((s, a) => s + Number(a.valor), 0) || 0

      // Busca dividendos
      const { data: dividendos } = await supabase
        .from('dividendos')
        .select('valor')
      const totalDividendos = dividendos?.reduce((s, d) => s + Number(d.valor), 0) || 0

      // Busca carteira
      const { data: carteira } = await supabase
        .from('carteira')
        .select('valor_atual')
      const patrimonio = carteira?.reduce((s, c) => s + Number(c.valor_atual || 0), 0) || 0
      const totalAtivos = carteira?.length || 0

      setResumo({ patrimonio, totalAportes, totalDividendos, totalAtivos })
    } catch (err) {
      console.error('Erro ao carregar resumo:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  const formatBRL = (valor) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)

  const rentabilidade = resumo.totalAportes > 0
    ? ((resumo.patrimonio - resumo.totalAportes) / resumo.totalAportes * 100)
    : 0

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-green-800 text-white">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">RentaFlow</h1>
            <p className="text-green-200 text-sm">Gestão de Dividendos & Renda Passiva</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-green-200 text-sm hidden sm:block">
              {user?.email}
            </span>
            <button
              onClick={carregarResumo}
              className="p-2 hover:bg-green-700 rounded-lg transition"
              title="Atualizar dados"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 bg-green-700 hover:bg-green-600 px-3 py-2 rounded-lg text-sm transition"
            >
              <LogOut size={16} />
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Cards de Resumo */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Patrimônio */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-500 text-sm font-medium">Patrimônio</span>
              <Wallet className="text-green-600" size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-800">
              {loading ? '...' : formatBRL(resumo.patrimonio)}
            </p>
            <div className={`flex items-center gap-1 mt-1 text-sm ${
              rentabilidade >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {rentabilidade >= 0
                ? <ArrowUpRight size={14} />
                : <ArrowDownRight size={14} />
              }
              {rentabilidade.toFixed(2)}% rentabilidade
            </div>
          </div>

          {/* Total Aportes */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-500 text-sm font-medium">Total Aportado</span>
              <TrendingUp className="text-blue-600" size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-800">
              {loading ? '...' : formatBRL(resumo.totalAportes)}
            </p>
            <p className="text-gray-400 text-sm mt-1">Capital investido</p>
          </div>

          {/* Dividendos */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-500 text-sm font-medium">Dividendos</span>
              <DollarSign className="text-emerald-600" size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-800">
              {loading ? '...' : formatBRL(resumo.totalDividendos)}
            </p>
            <p className="text-gray-400 text-sm mt-1">Total recebido</p>
          </div>

          {/* Ativos */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-500 text-sm font-medium">Ativos</span>
              <PieChart className="text-purple-600" size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-800">
              {loading ? '...' : resumo.totalAtivos}
            </p>
            <p className="text-gray-400 text-sm mt-1">Na carteira</p>
          </div>
        </div>

        {/* Área de conteúdo futuro */}
        <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
          <h2 className="text-xl font-semibold text-gray-700 mb-2">
            Bem-vindo ao RentaFlow v2.0!
          </h2>
          <p className="text-gray-500 max-w-lg mx-auto">
            Seu painel de controle está pronto. Em breve teremos gráficos de
            evolução patrimonial, distribuição por setor e histórico de dividendos.
          </p>
        </div>

        {/* Rodapé */}
        <p className="text-center text-gray-400 text-xs mt-8">
          RentaFlow v2.0 — Desenvolvido por Cecília Ribeiro
        </p>
      </main>
    </div>
  )
}
