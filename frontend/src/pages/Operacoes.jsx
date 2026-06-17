import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  ArrowLeft, Plus, Edit2, Trash2, Save, X, TrendingUp, Building2,
} from 'lucide-react'

export default function Operacoes() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [operacoes, setOperacoes] = useState([])
  const [corretoras, setCorretoras] = useState([])
  const [loading, setLoading] = useState(true)
  const [criandoNova, setCriandoNova] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [filtroCorretora, setFiltroCorretora] = useState('todas')
  const [filtroTipo, setFiltroTipo] = useState('todas')
  const [filtroTicker, setFiltroTicker] = useState('')

  const [form, setForm] = useState({
    data: new Date().toISOString().split('T')[0],
    ticker: '',
    quantidade: '',
    preco_unitario: '',
    operacao: 'COMPRA',
    corretora_id: '',
  })

  useEffect(() => {
    if (user) {
      carregarCorretoras()
      carregarOperacoes()
    }
  }, [user])

  const carregarCorretoras = async () => {
    const { data } = await supabase
      .from('corretoras').select('id, nome, cor')
      .eq('user_id', user.id).order('nome')
    setCorretoras(data || [])
  }

  const carregarOperacoes = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('operacoes')
      .select('*, corretoras(nome, cor)')
      .eq('user_id', user.id)
      .order('data', { ascending: false })
    setOperacoes(data || [])
    setLoading(false)
  }

  const limparForm = () => {
    setForm({
      data: new Date().toISOString().split('T')[0],
      ticker: '',
      quantidade: '',
      preco_unitario: '',
      operacao: 'COMPRA',
      corretora_id: corretoras.length > 0
        ? String(corretoras.find(c => c.nome === 'Inter')?.id || corretoras[0].id)
        : '',
    })
    setEditandoId(null)
    setCriandoNova(false)
  }

  const iniciarNova = () => {
    setCriandoNova(true)
    setEditandoId(null)
    setForm({
      data: new Date().toISOString().split('T')[0],
      ticker: '',
      quantidade: '',
      preco_unitario: '',
      operacao: 'COMPRA',
      corretora_id: corretoras.length > 0
        ? String(corretoras.find(c => c.nome === 'Inter')?.id || corretoras[0].id)
        : '',
    })
  }

  const iniciarEdicao = (op) => {
    setEditandoId(op.id)
    setCriandoNova(false)
    setForm({
      data: op.data,
      ticker: op.ticker,
      quantidade: String(op.quantidade),
      preco_unitario: String(op.preco_unitario),
      operacao: op.operacao,
      corretora_id: String(op.corretora_id || ''),
    })
  }

  const salvar = async () => {
    if (!form.ticker || !form.quantidade || !form.preco_unitario || !form.corretora_id) {
      alert('Preencha todos os campos obrigatórios.')
      return
    }
    const ticker = form.ticker.toUpperCase().trim()

    // Busca tipo automaticamente da tabela ativos
    let tipoAtivo = 'Acao'
    try {
      const { data: ativoBD } = await supabase
        .from('ativos').select('tipo')
        .eq('ticker', ticker).maybeSingle()
      if (ativoBD?.tipo) {
        tipoAtivo = ativoBD.tipo
      } else {
        tipoAtivo = ticker.endsWith('11') && ticker.length === 6 ? 'FII' : 'Acao'
      }
    } catch {
      tipoAtivo = ticker.endsWith('11') && ticker.length === 6 ? 'FII' : 'Acao'
    }

    const dados = {
      user_id: user.id,
      data: form.data,
      ticker,
      quantidade: parseFloat(form.quantidade),
      preco_unitario: parseFloat(form.preco_unitario),
      operacao: form.operacao,
      tipo_ativo: tipoAtivo,
      corretora_id: parseInt(form.corretora_id, 10),
      origem: editandoId ? 'manual_edit' : 'manual',
    }

    try {
      if (editandoId) {
        const { error } = await supabase
          .from('operacoes').update(dados).eq('id', editandoId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('operacoes').insert(dados)
        if (error) throw error
      }
      limparForm()
      await carregarOperacoes()
    } catch (err) {
      alert(`Erro ao salvar: ${err.message}`)
    }
  }

  const excluir = async (id) => {
    if (!confirm('Tem certeza que deseja excluir esta operação?')) return
    const { error } = await supabase.from('operacoes').delete().eq('id', id)
    if (error) {
      alert(`Erro ao excluir: ${error.message}`)
      return
    }
    await carregarOperacoes()
  }

  const formatBRL = (v) => new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL',
  }).format(v)

  const formatData = (d) => {
    if (!d) return ''
    const [y, m, day] = d.split('-')
    return `${day}/${m}/${y}`
  }

  // Filtros
  const opsFiltradas = operacoes.filter(op => {
    if (filtroCorretora !== 'todas' && String(op.corretora_id) !== String(filtroCorretora)) return false
    if (filtroTipo !== 'todas' && op.operacao !== filtroTipo) return false
    if (filtroTicker && !op.ticker.toLowerCase().includes(filtroTicker.toLowerCase())) return false
    return true
  })

  // Totais
  const totalCompras = opsFiltradas.filter(o => o.operacao === 'COMPRA')
    .reduce((s, o) => s + (Number(o.quantidade) * Number(o.preco_unitario)), 0)
  const totalVendas = opsFiltradas.filter(o => o.operacao === 'VENDA')
    .reduce((s, o) => s + (Number(o.quantidade) * Number(o.preco_unitario)), 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-green-800 text-white">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-4">
          <button onClick={() => navigate('/dashboard')} className="p-2 hover:bg-green-700 rounded-lg">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Operações</h1>
            <p className="text-green-200 text-sm">Compras e vendas registradas</p>
          </div>
          <button
            onClick={iniciarNova}
            className="flex items-center gap-2 bg-white text-green-800 px-4 py-2 rounded-lg hover:bg-green-50 font-medium text-sm"
          >
            <Plus size={16} /> Adicionar operação
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Cards de resumo */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <p className="text-xs text-gray-500">Total de operações</p>
            <p className="text-2xl font-bold text-gray-800">{opsFiltradas.length}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <p className="text-xs text-gray-500">Total comprado</p>
            <p className="text-2xl font-bold text-green-700">{formatBRL(totalCompras)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <p className="text-xs text-gray-500">Total vendido</p>
            <p className="text-2xl font-bold text-red-600">{formatBRL(totalVendas)}</p>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-xl shadow-sm border p-4 mb-6 flex flex-wrap gap-3 items-center">
          <Building2 size={18} className="text-gray-500" />
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

          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            className="px-3 py-1.5 border rounded-lg text-sm bg-white"
          >
            <option value="todas">Compras e vendas</option>
            <option value="COMPRA">Apenas compras</option>
            <option value="VENDA">Apenas vendas</option>
          </select>

          <input
            type="text"
            placeholder="Buscar ticker..."
            value={filtroTicker}
            onChange={(e) => setFiltroTicker(e.target.value)}
            className="px-3 py-1.5 border rounded-lg text-sm bg-white flex-1 min-w-[160px]"
          />
        </div>

        {/* Formulário de criar/editar */}
        {(criandoNova || editandoId) && (
          <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-800">
              {editandoId ? 'Editar operação' : 'Nova operação'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Ticker *</label>
                <input
                  type="text"
                  value={form.ticker}
                  onChange={(e) => setForm({ ...form, ticker: e.target.value.toUpperCase() })}
                  placeholder="Ex: PETR4"
                  className="w-full px-3 py-2 border rounded-lg uppercase"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Operação *</label>
                <select
                  value={form.operacao}
                  onChange={(e) => setForm({ ...form, operacao: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg bg-white"
                >
                  <option value="COMPRA">COMPRA</option>
                  <option value="VENDA">VENDA</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade *</label>
                <input
                  type="number"
                  step="any"
                  value={form.quantidade}
                  onChange={(e) => setForm({ ...form, quantidade: e.target.value })}
                  placeholder="Ex: 100"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Preço unitário (R$) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.preco_unitario}
                  onChange={(e) => setForm({ ...form, preco_unitario: e.target.value })}
                  placeholder="Ex: 32.50"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Corretora *</label>
                <select
                  value={form.corretora_id}
                  onChange={(e) => setForm({ ...form, corretora_id: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg bg-white"
                >
                  <option value="">Selecione...</option>
                  {corretoras.map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <div className="text-sm text-gray-500">
                  <p>Total da operação:</p>
                  <p className="font-bold text-gray-800 text-base">
                    {formatBRL((parseFloat(form.quantidade) || 0) * (parseFloat(form.preco_unitario) || 0))}
                  </p>
                </div>
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

        {/* Tabela de operações */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Carregando...</div>
          ) : opsFiltradas.length === 0 ? (
            <div className="p-12 text-center">
              <TrendingUp className="mx-auto text-gray-300 mb-3" size={48} />
              <p className="text-gray-700 font-semibold mb-2">Nenhuma operação encontrada</p>
              <p className="text-gray-500 text-sm mb-4">Adicione sua primeira operação para começar.</p>
              <button
                onClick={iniciarNova}
                className="px-4 py-2 bg-green-700 text-white text-sm rounded-lg hover:bg-green-600 inline-flex items-center gap-2"
              >
                <Plus size={16} /> Adicionar operação
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr className="text-left text-gray-600">
                    <th className="py-2 px-3">Data</th>
                    <th className="py-2 px-3">Ticker</th>
                    <th className="py-2 px-3">Operação</th>
                    <th className="py-2 px-3 text-right">Qtde</th>
                    <th className="py-2 px-3 text-right">Preço</th>
                    <th className="py-2 px-3 text-right">Total</th>
                    <th className="py-2 px-3">Corretora</th>
                    <th className="py-2 px-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {opsFiltradas.map(op => {
                    const total = Number(op.quantidade) * Number(op.preco_unitario)
                    return (
                      <tr key={op.id} className="border-b hover:bg-gray-50">
                        <td className="py-2 px-3">{formatData(op.data)}</td>
                        <td className="py-2 px-3 font-medium">{op.ticker}</td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            op.operacao === 'COMPRA'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {op.operacao}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right">{op.quantidade}</td>
                        <td className="py-2 px-3 text-right">{formatBRL(op.preco_unitario)}</td>
                        <td className="py-2 px-3 text-right font-medium">{formatBRL(total)}</td>
                        <td className="py-2 px-3">
                          {op.corretoras ? (
                            <span
                              className="px-2 py-0.5 rounded text-xs"
                              style={{
                                backgroundColor: `${op.corretoras.cor || '#6b7280'}20`,
                                color: op.corretoras.cor || '#6b7280',
                              }}
                            >
                              {op.corretoras.nome}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <div className="flex justify-center gap-1">
                            <button
                              onClick={() => iniciarEdicao(op)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                              title="Editar"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => excluir(op.id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                              title="Excluir"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
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
