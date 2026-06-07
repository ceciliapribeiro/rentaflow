import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import {
  ArrowLeft, Plus, Edit2, Trash2, Save, X,
  AlertTriangle, Building2, ArrowRightLeft, Eye, EyeOff,
} from 'lucide-react'

const CORES_PADRAO = [
  '#FF7A00', '#EC0000', '#01D29C', '#FFD400', '#820AD1',
  '#1a6b45', '#1e40af', '#7c3d0e', '#374151', '#5b21b6',
]

const formatBRL = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const formatData = (iso) => {
  if (!iso) return '—'
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

export default function Corretoras() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [corretoras, setCorretoras] = useState([])
  const [resumoPorCorretora, setResumoPorCorretora] = useState({})
  const [erro, setErro] = useState(null)

  const [editandoId, setEditandoId] = useState(null)
  const [novoNome, setNovoNome] = useState('')
  const [novoCodigo, setNovoCodigo] = useState('')
  const [novaCor, setNovaCor] = useState(CORES_PADRAO[0])
  const [criandoNova, setCriandoNova] = useState(false)

  // Reatribuição em massa
  const [corretoraExpandida, setCorretoraExpandida] = useState(null)
  const [operacoesCorr, setOperacoesCorr] = useState([])
  const [opsSelecionadas, setOpsSelecionadas] = useState(new Set())
  const [destinoReatribuir, setDestinoReatribuir] = useState('')
  const [reatribuindo, setReatribuindo] = useState(false)

  useEffect(() => {
    if (user) carregar()
  }, [user])

  const carregar = async () => {
    setLoading(true)
    setErro(null)
    try {
      const { data: corrs, error } = await supabase
        .from('corretoras').select('*')
        .eq('user_id', user.id).order('nome')
      if (error) throw error
      setCorretoras(corrs || [])

      const resumo = {}
      for (const c of (corrs || [])) {
        const [opsRes, divsRes, aptRes] = await Promise.all([
          supabase.from('operacoes').select('*', { count: 'exact', head: true })
            .eq('user_id', user.id).eq('corretora_id', c.id),
          supabase.from('dividendos').select('*', { count: 'exact', head: true })
            .eq('user_id', user.id).eq('corretora_id', c.id),
          supabase.from('aportes').select('*', { count: 'exact', head: true })
            .eq('user_id', user.id).eq('corretora_id', c.id),
        ])
        resumo[c.id] = {
          operacoes: opsRes.count || 0,
          dividendos: divsRes.count || 0,
          aportes: aptRes.count || 0,
        }
      }
      setResumoPorCorretora(resumo)
    } catch (err) {
      setErro('Erro ao carregar: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const carregarOperacoes = async (corretoraId) => {
    setOperacoesCorr([])
    setOpsSelecionadas(new Set())
    const { data, error } = await supabase
      .from('operacoes')
      .select('id, data, ticker, quantidade, preco_unitario, operacao')
      .eq('user_id', user.id)
      .eq('corretora_id', corretoraId)
      .order('data', { ascending: false })
      .limit(500)
    if (!error) setOperacoesCorr(data || [])
  }

  const toggleExpandir = async (corretora) => {
    if (corretoraExpandida === corretora.id) {
      setCorretoraExpandida(null)
      setOperacoesCorr([])
    } else {
      setCorretoraExpandida(corretora.id)
      await carregarOperacoes(corretora.id)
    }
  }

  const toggleOp = (opId) => {
    setOpsSelecionadas(prev => {
      const novo = new Set(prev)
      if (novo.has(opId)) novo.delete(opId)
      else novo.add(opId)
      return novo
    })
  }

  const toggleTodasOps = () => {
    if (opsSelecionadas.size === operacoesCorr.length) {
      setOpsSelecionadas(new Set())
    } else {
      setOpsSelecionadas(new Set(operacoesCorr.map(o => o.id)))
    }
  }

  const reatribuir = async () => {
    if (opsSelecionadas.size === 0) {
      setErro('Selecione ao menos uma operação para reatribuir.')
      return
    }
    if (!destinoReatribuir) {
      setErro('Escolha a corretora de destino.')
      return
    }
    const destino = corretoras.find(c => String(c.id) === String(destinoReatribuir))
    if (!destino) return

    const ok = confirm(
      `Mover ${opsSelecionadas.size} operação(ões) para "${destino.nome}"?\n\nEsta ação altera o vínculo de corretora dessas operações.`
    )
    if (!ok) return

    setReatribuindo(true)
    setErro(null)
    try {
      const idsArray = Array.from(opsSelecionadas)
      const { error } = await supabase
        .from('operacoes')
        .update({ corretora_id: parseInt(destinoReatribuir, 10) })
        .in('id', idsArray)
      if (error) throw error

      alert(`✅ ${idsArray.length} operação(ões) movida(s) para ${destino.nome}!`)
      await carregar()
      if (corretoraExpandida) {
        await carregarOperacoes(corretoraExpandida)
      }
      setOpsSelecionadas(new Set())
      setDestinoReatribuir('')
    } catch (err) {
      setErro('Erro ao reatribuir: ' + err.message)
    } finally {
      setReatribuindo(false)
    }
  }

  const limparForm = () => {
    setNovoNome('')
    setNovoCodigo('')
    setNovaCor(CORES_PADRAO[0])
    setEditandoId(null)
    setCriandoNova(false)
  }

  const salvarNova = async () => {
    if (!novoNome.trim()) { setErro('Nome é obrigatório'); return }
    setErro(null)
    try {
      const { error } = await supabase.from('corretoras').insert({
        user_id: user.id,
        nome: novoNome.trim(),
        codigo: novoCodigo.trim() || null,
        cor: novaCor,
      })
      if (error) throw error
      await carregar()
      limparForm()
    } catch (err) {
      setErro('Erro ao salvar: ' + err.message)
    }
  }

  const iniciarEdicao = (c) => {
    setEditandoId(c.id)
    setNovoNome(c.nome)
    setNovoCodigo(c.codigo || '')
    setNovaCor(c.cor || CORES_PADRAO[0])
    setCriandoNova(false)
  }

  const salvarEdicao = async () => {
    if (!novoNome.trim()) { setErro('Nome é obrigatório'); return }
    setErro(null)
    try {
      const { error } = await supabase.from('corretoras').update({
        nome: novoNome.trim(),
        codigo: novoCodigo.trim() || null,
        cor: novaCor,
      }).eq('id', editandoId)
      if (error) throw error
      await carregar()
      limparForm()
    } catch (err) {
      setErro('Erro ao atualizar: ' + err.message)
    }
  }

  const deletarCorretora = async (c) => {
    const r = resumoPorCorretora[c.id] || { operacoes: 0, dividendos: 0, aportes: 0 }
    const total = r.operacoes + r.dividendos + r.aportes
    if (total > 0) {
      const ok = confirm(
        `${c.nome} tem ${r.operacoes} operações, ${r.dividendos} dividendos e ${r.aportes} aportes vinculados.\n\nAo deletar, os registros ficarão SEM corretora. Você poderá reatribuí-los depois.\n\nConfirmar?`
      )
      if (!ok) return
    } else {
      const ok = confirm(`Deletar a corretora "${c.nome}"?`)
      if (!ok) return
    }
    try {
      const { error } = await supabase.from('corretoras').delete().eq('id', c.id)
      if (error) throw error
      await carregar()
    } catch (err) {
      setErro('Erro ao deletar: ' + err.message)
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando corretoras...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-green-800 text-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
          <button onClick={() => navigate('/dashboard')} className="p-2 hover:bg-green-700 rounded-lg">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold">Corretoras</h1>
            <p className="text-green-200 text-sm">
              Gerencie as corretoras e reatribua operações
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
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
            <Plus size={18} /> Adicionar corretora
          </button>
        )}

        {(criandoNova || editandoId) && (
          <div className="bg-white border rounded-xl p-6 mb-6">
            <h2 className="font-semibold text-gray-700 mb-4">
              {editandoId ? 'Editar corretora' : 'Nova corretora'}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input
                  type="text" value={novoNome}
                  onChange={(e) => setNovoNome(e.target.value)}
                  placeholder="Ex: Inter, XP..."
                  className="w-full px-3 py-2 border rounded-lg" autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
                <input
                  type="text" value={novoCodigo}
                  onChange={(e) => setNovoCodigo(e.target.value.toUpperCase())}
                  placeholder="INTER" maxLength={10}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cor</label>
                <div className="flex gap-2 flex-wrap">
                  {CORES_PADRAO.map(cor => (
                    <button key={cor} onClick={() => setNovaCor(cor)}
                      className={`w-8 h-8 rounded-full border-2 ${novaCor === cor ? 'border-gray-800' : 'border-transparent'}`}
                      style={{ backgroundColor: cor }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={editandoId ? salvarEdicao : salvarNova}
                className="px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-600 flex items-center gap-2">
                <Save size={16} /> Salvar
              </button>
              <button onClick={limparForm}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-2">
                <X size={16} /> Cancelar
              </button>
            </div>
          </div>
        )}

        {corretoras.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Building2 size={48} className="mx-auto mb-2 text-gray-300" />
            <p>Nenhuma corretora cadastrada ainda.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {corretoras.map(c => {
              const r = resumoPorCorretora[c.id] || { operacoes: 0, dividendos: 0, aportes: 0 }
              const expandida = corretoraExpandida === c.id
              return (
                <div key={c.id} className="bg-white border rounded-xl overflow-hidden">
                  <div className="h-2" style={{ backgroundColor: c.cor || '#6b7280' }} />
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
                      <div>
                        <h3 className="font-bold text-lg">{c.nome}</h3>
                        {c.codigo && <p className="text-xs text-gray-500">{c.codigo}</p>}
                      </div>
                      <div className="flex gap-1">
                        {r.operacoes > 0 && (
                          <button onClick={() => toggleExpandir(c)}
                            className="p-2 hover:bg-blue-50 rounded-lg text-blue-600 flex items-center gap-1 text-xs">
                            {expandida ? <EyeOff size={14} /> : <Eye size={14} />}
                            {expandida ? 'Ocultar ops' : 'Ver ops'}
                          </button>
                        )}
                        <button onClick={() => iniciarEdicao(c)}
                          className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => deletarCorretora(c)}
                          className="p-2 hover:bg-red-50 rounded-lg text-red-500">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-sm">
                      <div className="bg-gray-50 rounded p-2">
                        <p className="text-xs text-gray-500">Operações</p>
                        <p className="font-bold">{r.operacoes}</p>
                      </div>
                      <div className="bg-gray-50 rounded p-2">
                        <p className="text-xs text-gray-500">Dividendos</p>
                        <p className="font-bold">{r.dividendos}</p>
                      </div>
                      <div className="bg-gray-50 rounded p-2">
                        <p className="text-xs text-gray-500">Aportes</p>
                        <p className="font-bold">{r.aportes}</p>
                      </div>
                    </div>

                    {expandida && (
                      <div className="mt-4 border-t pt-4">
                        {operacoesCorr.length > 0 ? (
                          <>
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3 flex flex-wrap items-center gap-2">
                              <ArrowRightLeft size={16} className="text-blue-600" />
                              <span className="text-sm text-blue-800 font-medium">
                                Reatribuir {opsSelecionadas.size} operação(ões) para:
                              </span>
                              <select
                                value={destinoReatribuir}
                                onChange={(e) => setDestinoReatribuir(e.target.value)}
                                className="px-2 py-1 border rounded text-sm"
                              >
                                <option value="">Selecione...</option>
                                {corretoras.filter(co => co.id !== c.id).map(co => (
                                  <option key={co.id} value={co.id}>{co.nome}</option>
                                ))}
                              </select>
                              <button
                                onClick={reatribuir}
                                disabled={reatribuindo || opsSelecionadas.size === 0 || !destinoReatribuir}
                                className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-500 disabled:opacity-50"
                              >
                                {reatribuindo ? 'Movendo...' : 'Mover'}
                              </button>
                            </div>

                            <div className="overflow-x-auto max-h-96 overflow-y-auto">
                              <table className="w-full text-xs">
                                <thead className="bg-gray-50 sticky top-0">
                                  <tr className="border-b text-gray-500">
                                    <th className="py-1.5 px-2 text-left">
                                      <input
                                        type="checkbox"
                                        checked={opsSelecionadas.size === operacoesCorr.length && operacoesCorr.length > 0}
                                        onChange={toggleTodasOps}
                                      />
                                    </th>
                                    <th className="py-1.5 px-2 text-left">Data</th>
                                    <th className="py-1.5 px-2 text-left">Ticker</th>
                                    <th className="py-1.5 px-2 text-left">Op</th>
                                    <th className="py-1.5 px-2 text-right">Qtde</th>
                                    <th className="py-1.5 px-2 text-right">Preço</th>
                                    <th className="py-1.5 px-2 text-right">Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {operacoesCorr.map(op => (
                                    <tr key={op.id} className={`border-b hover:bg-gray-50 ${opsSelecionadas.has(op.id) ? 'bg-blue-50' : ''}`}>
                                      <td className="py-1 px-2">
                                        <input
                                          type="checkbox"
                                          checked={opsSelecionadas.has(op.id)}
                                          onChange={() => toggleOp(op.id)}
                                        />
                                      </td>
                                      <td className="py-1 px-2">{formatData(op.data)}</td>
                                      <td className="py-1 px-2 font-medium">{op.ticker}</td>
                                      <td className="py-1 px-2">
                                        <span className={`px-1.5 py-0.5 rounded text-xs ${
                                          op.operacao === 'COMPRA' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                        }`}>{op.operacao}</span>
                                      </td>
                                      <td className="py-1 px-2 text-right">{op.quantidade}</td>
                                      <td className="py-1 px-2 text-right">{formatBRL(op.preco_unitario)}</td>
                                      <td className="py-1 px-2 text-right font-medium">
                                        {formatBRL(op.quantidade * op.preco_unitario)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </>
                        ) : (
                          <p className="text-center text-sm text-gray-500 py-4">
                            Carregando operações...
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
