import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import {
  ArrowLeft, Plus, Edit2, Trash2, Save, X,
  AlertTriangle, TrendingUp, TrendingDown, Search,
} from 'lucide-react'

const formatBRL = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const formatData = (iso) => {
  if (!iso) return '—'
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

export default function Operacoes() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState(null)

  const [operacoes, setOperacoes] = useState([])
  const [corretoras, setCorretoras] = useState([])
  const [busca, setBusca] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('todas')
  const [filtroCorretora, setFiltroCorretora] = useState('todas')

  // Form state
  const [editandoId, setEditandoId] = useState(null)
  const [criandoNova, setCriandoNova] = useState(false)
	const [form, setForm] = useState({
		data: new Date().toISOString().split('T')[0],
		ticker: '',
		quantidade: '',
		preco_unitario: '',
		operacao: 'COMPRA',
		corretora_id: '',
})

  useEffect(() => {
    if (user) carregar()
  }, [user])

  const carregar = async () => {
    setLoading(true)
    try {
      const [opsRes, corrRes] = await Promise.all([
        supabase.from('operacoes')
          .select('*, corretoras(nome, cor)')
          .eq('user_id', user.id)
          .order('data', { ascending: false }),
        supabase.from('corretoras')
          .select('id, nome, cor')
          .eq('user_id', user.id)
          .order('nome'),
      ])
      if (opsRes.error) throw opsRes.error
      if (corrRes.error) throw corrRes.error
      setOperacoes(opsRes.data || [])
      setCorretoras(corrRes.data || [])

      // Default corretora no form
      if (corrRes.data && corrRes.data.length > 0) {
        const inter = corrRes.data.find(c => c.nome === 'Inter')
        setForm(f => ({ ...f, corretora_id: String(inter?.id || corrRes.data[0].id) }))
      }
    } catch (err) {
      setErro('Erro ao carregar: ' + err.message)
    } finally {
      setLoading(false)
    }
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


  const validarForm = () => {
    if (!form.data) return 'Data é obrigatória'
    if (!form.ticker.trim()) return 'Ticker é obrigatório'
    const qtde = parseFloat(form.quantidade)
    if (isNaN(qtde) || qtde <= 0) return 'Quantidade deve ser maior que 0'
    const preco = parseFloat(form.preco_unitario)
    if (isNaN(preco) || preco <= 0) return 'Preço deve ser maior que 0'
    if (!form.corretora_id) return 'Selecione uma corretora'
    return null
  }

  const salvar = async () => {
    const erroValidacao = validarForm()
    if (erroValidacao) {
      setErro(erroValidacao)
      return
    }
    setErro(null)
    setSalvando(true)

    try {
      const ticker = form.ticker.trim().toUpperCase()
// Busca o tipo do ativo no catálogo Dados B3 (tabela ativos)
let tipoAtivo = 'Acao' // fallback
try {
  const { data: ativoBD } = await supabase
    .from('ativos').select('tipo')
    .eq('ticker', ticker).maybeSingle()
  if (ativoBD?.tipo) {
    tipoAtivo = ativoBD.tipo
  } else {
    // Inferência: FII se termina em 11 com 6 chars, senão Ação
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


      if (editandoId) {
        const { error } = await supabase
          .from('operacoes')
          .update(dados)
          .eq('id', editandoId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('operacoes').insert(dados)
        if (error) throw error

        // Atualiza carteira (qtde_ideal)
        const { data: cart } = await supabase.from('carteira')
          .select('qtde_ideal')
          .eq('user_id', user.id).eq('ticker', ticker)
          .maybeSingle()
        const qtdeAtual = cart ? Number(cart.qtde_ideal) : 0
        const novaQtde = form.operacao === 'COMPRA'
          ? qtdeAtual + parseFloat(form.quantidade)
          : qtdeAtual - parseFloat(form.quantidade)

        await supabase.from('carteira').upsert({
          user_id: user.id, ticker,
          qtde_ideal: Math.max(0, novaQtde), peso_ideal: 0,
        }, { onConflict: 'user_id,ticker' })
      }

      await carregar()
      limparForm()
    } catch (err) {
      setErro('Erro ao salvar: ' + err.message)
    } finally {
      setSalvando(false)
    }
  }

  const deletar = async (op) => {
    const ok = confirm(
      `Deletar a operação?\n\n${op.operacao} ${op.quantidade} ${op.ticker} a ${formatBRL(op.preco_unitario)}\nem ${formatData(op.data)}`
    )
    if (!ok) return
    try {
      const { error } = await supabase.from('operacoes').delete().eq('id', op.id)
      if (error) throw error
      await carregar()
    } catch (err) {
      setErro('Erro ao deletar: ' + err.message)
    }
  }

  // Filtros
  const operacoesFiltradas = operacoes.filter(op => {
    if (busca && !op.ticker.toLowerCase().includes(busca.toLowerCase())) return false
    if (filtroTipo !== 'todas' && op.operacao !== filtroTipo) return false
    if (filtroCorretora !== 'todas' && String(op.corretora_id) !== String(filtroCorretora)) return false
    return true
  })

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando operações...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-green-800 text-white">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-4">
          <button onClick={() => navigate('/dashboard')} className="p-2 hover:bg-green-700 rounded-lg">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold">Operações</h1>
            <p className="text-green-200 text-sm">Lançamento manual e edição de compras/vendas</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {erro && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-start gap-3">
            <AlertTriangle className="text-red-500 flex-shrink-0" size={20} />
            <div className="text-red-700 text-sm">{erro}</div>
          </div>
        )}

        {!criandoNova && !editandoId && (
          <button
            onClick={() => setCriandoNova(true)}
            className="mb-6 px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-600 flex items-center gap-2"
          >
            <Plus size={18} /> Adicionar operação
          </button>
        )}

        {(criandoNova || editandoId) && (
          <div className="bg-white border rounded-xl p-6 mb-6">
            <h2 className="font-semibold text-gray-700 mb-4">
              {editandoId ? `Editar operação` : 'Nova operação'}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data *</label>
                <input
                  type="date" value={form.data}
                  onChange={(e) => setForm({ ...form, data: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ticker *</label>
                <input
                  type="text" value={form.ticker}
                  onChange={(e) => setForm({ ...form, ticker: e.target.value.toUpperCase() })}
                  placeholder="MXRF11"
                  maxLength={10}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade *</label>
                <input
                  type="number" value={form.quantidade}
                  onChange={(e) => setForm({ ...form, quantidade: e.target.value })}
                  min="0" step="1"
                  placeholder="100"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Preço unitário *</label>
                <input
                  type="number" value={form.preco_unitario}
                  onChange={(e) => setForm({ ...form, preco_unitario: e.target.value })}
                  min="0" step="0.01"
                  placeholder="10.50"
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
              <button onClick={salvar} disabled={salvando}
                className="px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 flex items-center gap-2">
                <Save size={16} /> {salvando ? 'Salvando...' : 'Salvar'}
              </button>
              <button onClick={limparForm}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-2">
                <X size={16} /> Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Filtros */}
        <div className="bg-white border rounded-xl p-4 mb-6 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por ticker..."
              className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm bg-white"
          >
            <option value="todas">Todas operações</option>
            <option value="COMPRA">Apenas compras</option>
            <option value="VENDA">Apenas vendas</option>
          </select>
          <select
            value={filtroCorretora}
            onChange={(e) => setFiltroCorretora(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm bg-white"
          >
            <option value="todas">Todas corretoras</option>
            {corretoras.map(c => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
          <span className="text-sm text-gray-500">
            <strong>{operacoesFiltradas.length}</strong> de {operacoes.length}
          </span>
        </div>

        {operacoesFiltradas.length === 0 ? (
          <div className="bg-white border rounded-xl p-12 text-center text-gray-500">
            Nenhuma operação encontrada com esses filtros.
          </div>
        ) : (
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr className="border-b text-gray-500 text-left">
                    <th className="py-2 px-3">Data</th>
                    <th className="py-2 px-3">Ticker</th>
                    <th className="py-2 px-3">Op</th>
                    <th className="py-2 px-3">Tipo</th>
                    <th className="py-2 px-3 text-right">Qtde</th>
                    <th className="py-2 px-3 text-right">Preço</th>
                    <th className="py-2 px-3 text-right">Total</th>
                    <th className="py-2 px-3">Corretora</th>
                    <th className="py-2 px-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {operacoesFiltradas.map(op => (
                    <tr key={op.id} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-3">{formatData(op.data)}</td>
                      <td className="py-2 px-3 font-medium">
                        <button
                          onClick={() => navigate(`/ativo/${op.ticker}`)}
                          className="hover:text-blue-600 hover:underline"
                        >
                          {op.ticker}
                        </button>
                      </td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded text-xs flex items-center gap-1 w-fit ${
                          op.operacao === 'COMPRA' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {op.operacao === 'COMPRA' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                          {op.operacao}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-gray-600 text-xs">{op.tipo_ativo || '-'}</td>
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
                      <td className="py-2 px-3">
                        <div className="flex gap-1 justify-center">
                          <button onClick={() => iniciarEdicao(op)}
                            className="p-1.5 hover:bg-gray-100 rounded text-gray-500">
                            <Edit2 size={12} />
                          </button>
                          <button onClick={() => deletar(op)}
                            className="p-1.5 hover:bg-red-50 rounded text-red-500">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
