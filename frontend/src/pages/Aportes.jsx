import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import Header from '../components/Header'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  Plus, Edit2, Trash2, Save, X, Wallet, Calendar, TrendingUp,
} from 'lucide-react'

export default function Aportes() {
  const { user } = useAuth()
  const [aportes, setAportes] = useState([])
  const [corretoras, setCorretoras] = useState([])
  const [loading, setLoading] = useState(true)
  const [criandoNovo, setCriandoNovo] = useState(false)
  const [editandoId, setEditandoId] = useState(null)

  // Filtros
  const [filtroAno, setFiltroAno] = useState('todos')
  const [filtroCorretora, setFiltroCorretora] = useState('todas')

  // Formulário
  const [form, setForm] = useState({
    data: new Date().toISOString().split('T')[0],
    valor: '',
    descricao: '',
    corretora_id: '',
  })

  useEffect(() => {
    if (user) {
      carregarCorretoras()
      carregarAportes()
    }
  }, [user])

  const carregarCorretoras = async () => {
    const { data } = await supabase
      .from('corretoras').select('id, nome, cor')
      .eq('user_id', user.id).order('nome')
    setCorretoras(data || [])
  }

  const carregarAportes = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('aportes')
      .select('*, corretoras(nome, cor)')
      .eq('user_id', user.id)
      .order('data', { ascending: false })
    setAportes(data || [])
    setLoading(false)
  }

  const limparForm = () => {
    setForm({
      data: new Date().toISOString().split('T')[0],
      valor: '',
      descricao: '',
      corretora_id: corretoras.length > 0
        ? String(corretoras.find(c => c.nome === 'Inter')?.id || corretoras[0].id)
        : '',
    })
    setEditandoId(null)
    setCriandoNovo(false)
  }

  const iniciarNovo = () => {
    setCriandoNovo(true)
    setEditandoId(null)
    setForm({
      data: new Date().toISOString().split('T')[0],
      valor: '',
      descricao: '',
      corretora_id: corretoras.length > 0
        ? String(corretoras.find(c => c.nome === 'Inter')?.id || corretoras[0].id)
        : '',
    })
  }

  const iniciarEdicao = (ap) => {
    setEditandoId(ap.id)
    setCriandoNovo(false)
    setForm({
      data: ap.data,
      valor: String(ap.valor),
      descricao: ap.descricao || '',
      corretora_id: ap.corretora_id ? String(ap.corretora_id) : '',
    })
  }

  const salvar = async () => {
    if (!form.data || !form.valor) {
      alert('Preencha pelo menos data e valor.')
      return
    }

    const dados = {
      user_id: user.id,
      data: form.data,
      valor: parseFloat(form.valor),
      descricao: form.descricao || null,
      corretora_id: form.corretora_id ? parseInt(form.corretora_id, 10) : null,
    }

    try {
      if (editandoId) {
        const { error } = await supabase
          .from('aportes').update(dados).eq('id', editandoId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('aportes').insert(dados)
        if (error) throw error
      }
      limparForm()
      await carregarAportes()
    } catch (err) {
      alert(`Erro ao salvar: ${err.message}`)
    }
  }

  const excluir = async (id) => {
    if (!confirm('Tem certeza que deseja excluir este aporte?')) return
    const { error } = await supabase.from('aportes').delete().eq('id', id)
    if (error) {
      alert(`Erro ao excluir: ${error.message}`)
      return
    }
    await carregarAportes()
  }

  const formatBRL = (v) => new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL',
  }).format(v)

  const formatData = (d) => {
    if (!d) return ''
    const [y, m, day] = d.split('-')
    return `${day}/${m}/${y}`
  }

  // Anos disponíveis (para o filtro)
  const anosDisponiveis = useMemo(() => {
    const anos = new Set()
    aportes.forEach(a => {
      if (a.data) anos.add(a.data.split('-')[0])
    })
    return Array.from(anos).sort().reverse()
  }, [aportes])

  // Aportes filtrados
  const aportesFiltrados = useMemo(() => {
    return aportes.filter(a => {
      if (filtroAno !== 'todos' && a.data?.split('-')[0] !== filtroAno) return false
      if (filtroCorretora !== 'todas' && String(a.corretora_id) !== String(filtroCorretora)) return false
      return true
    })
  }, [aportes, filtroAno, filtroCorretora])

  // Totais
  const totalGeral = useMemo(
    () => aportes.reduce((s, a) => s + Number(a.valor || 0), 0),
    [aportes]
  )
  const totalAnoVigente = useMemo(() => {
    const anoAtual = new Date().getFullYear().toString()
    return aportes
      .filter(a => a.data?.startsWith(anoAtual))
      .reduce((s, a) => s + Number(a.valor || 0), 0)
  }, [aportes])
  const totalMesVigente = useMemo(() => {
    const mesAtual = new Date().toISOString().slice(0, 7) // YYYY-MM
    return aportes
      .filter(a => a.data?.startsWith(mesAtual))
      .reduce((s, a) => s + Number(a.valor || 0), 0)
  }, [aportes])
  const totalFiltrado = useMemo(
    () => aportesFiltrados.reduce((s, a) => s + Number(a.valor || 0), 0),
    [aportesFiltrados]
  )

  // Agregação mensal para o gráfico de barras
  const dadosGrafico = useMemo(() => {
    const porMes = {}
    aportesFiltrados.forEach(a => {
      if (!a.data) return
      const mes = a.data.slice(0, 7) // YYYY-MM
      porMes[mes] = (porMes[mes] || 0) + Number(a.valor || 0)
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
  }, [aportesFiltrados])

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        titulo="Aportes"
        subtitulo="Histórico e adição de aportes"
      />

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* 3 cards de resumo */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-500 text-sm font-medium">Total Aportado</span>
              <Wallet className="text-blue-600" size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-800">{formatBRL(totalGeral)}</p>
            <p className="text-xs text-gray-500 mt-1">{aportes.length} aporte(s) no total</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-500 text-sm font-medium">Ano Vigente</span>
              <Calendar className="text-green-600" size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-800">{formatBRL(totalAnoVigente)}</p>
            <p className="text-xs text-gray-500 mt-1">{new Date().getFullYear()}</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-500 text-sm font-medium">Mês Vigente</span>
              <TrendingUp className="text-purple-600" size={20} />
            </div>
            <p className="text-2xl font-bold text-gray-800">{formatBRL(totalMesVigente)}</p>
            <p className="text-xs text-gray-500 mt-1">
              {new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Filtros + botão Novo aporte */}
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
              value={filtroCorretora}
              onChange={(e) => setFiltroCorretora(e.target.value)}
              className="px-3 py-1.5 border rounded-lg text-sm bg-white"
            >
              <option value="todas">Todas as corretoras</option>
              {corretoras.map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>

            <span className="text-sm text-gray-500">
              Total filtrado: <strong className="text-gray-800">{formatBRL(totalFiltrado)}</strong>
            </span>
          </div>

          <button
            onClick={iniciarNovo}
            className="flex items-center gap-2 bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Plus size={16} /> Novo aporte
          </button>
        </div>

        {/* Gráfico de barras Recharts */}
        {dadosGrafico.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Aportes por mês</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dadosGrafico} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="mes" tick={{ fontSize: 12, fill: '#6b7280' }} />
                <YAxis
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                  tickFormatter={(v) => `R$ ${(v / 1000).toFixed(1)}k`}
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

        {/* Formulário de criar/editar */}
        {(criandoNovo || editandoId) && (
          <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-800">
              {editandoId ? 'Editar aporte' : 'Novo aporte'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data *</label>
                <input
                  type="date"
                  value={form.data}
                  onChange={(e) => setForm({ ...form, data: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.valor}
                  onChange={(e) => setForm({ ...form, valor: e.target.value })}
                  placeholder="Ex: 1500.00"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Corretora</label>
                <select
                  value={form.corretora_id}
                  onChange={(e) => setForm({ ...form, corretora_id: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg bg-white"
                >
                  <option value="">Sem corretora</option>
                  {corretoras.map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <input
                  type="text"
                  value={form.descricao}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  placeholder="Ex: Aporte mensal"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={salvar}
                className="flex items-center gap-2 px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-600"
              >
                <Save size={16} /> Salvar
              </button>
              <button
                onClick={limparForm}
                className="flex items-center gap-2 px-4 py-2 border text-gray-600 rounded-lg hover:bg-gray-50"
              >
                <X size={16} /> Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Tabela de aportes */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Carregando...</div>
          ) : aportesFiltrados.length === 0 ? (
            <div className="p-12 text-center">
              <Wallet className="mx-auto text-gray-300 mb-3" size={48} />
              <p className="text-gray-700 font-semibold mb-2">Nenhum aporte encontrado</p>
              <p className="text-gray-500 text-sm mb-4">
                {aportes.length === 0
                  ? 'Adicione seu primeiro aporte para começar.'
                  : 'Tente alterar os filtros acima.'}
              </p>
              {aportes.length === 0 && (
                <button
                  onClick={iniciarNovo}
                  className="px-4 py-2 bg-green-700 text-white text-sm rounded-lg hover:bg-green-600 inline-flex items-center gap-2"
                >
                  <Plus size={16} /> Adicionar aporte
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr className="text-left text-gray-600">
                    <th className="py-2 px-3">Data</th>
                    <th className="py-2 px-3 text-right">Valor</th>
                    <th className="py-2 px-3">Corretora</th>
                    <th className="py-2 px-3">Descrição</th>
                    <th className="py-2 px-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {aportesFiltrados.map(ap => (
                    <tr key={ap.id} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-3">{formatData(ap.data)}</td>
                      <td className="py-2 px-3 text-right font-medium text-green-700">
                        {formatBRL(ap.valor)}
                      </td>
                      <td className="py-2 px-3">
                        {ap.corretoras ? (
                          <span
                            className="px-2 py-0.5 rounded text-xs"
                            style={{
                              backgroundColor: `${ap.corretoras.cor || '#6b7280'}20`,
                              color: ap.corretoras.cor || '#6b7280',
                            }}
                          >
                            {ap.corretoras.nome}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">-</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-gray-600">
                        {ap.descricao || <span className="text-gray-400">-</span>}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <div className="flex justify-center gap-1">
                          <button
                            onClick={() => iniciarEdicao(ap)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                            title="Editar"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => excluir(ap.id)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                            title="Excluir"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t">
                  <tr>
                    <td className="py-3 px-3 font-semibold text-gray-700">Total</td>
                    <td className="py-3 px-3 text-right font-bold text-green-700 text-base">
                      {formatBRL(totalFiltrado)}
                    </td>
                    <td colSpan="3"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
