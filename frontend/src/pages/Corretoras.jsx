import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import {
  ArrowLeft, Plus, Edit2, Trash2, Save, X,
  AlertTriangle, Building2,
} from 'lucide-react'

const CORES_PADRAO = [
  '#FF7A00', '#EC0000', '#01D29C', '#FFD400', '#820AD1',
  '#1a6b45', '#1e40af', '#7c3d0e', '#374151', '#5b21b6',
]

export default function Corretoras() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [corretoras, setCorretoras] = useState([])
  const [resumoPorCorretora, setResumoPorCorretora] = useState({})
  const [erro, setErro] = useState(null)

  // Form state
  const [editandoId, setEditandoId] = useState(null)
  const [novoNome, setNovoNome] = useState('')
  const [novoCodigo, setNovoCodigo] = useState('')
  const [novaCor, setNovaCor] = useState(CORES_PADRAO[0])
  const [criandoNova, setCriandoNova] = useState(false)

  useEffect(() => {
    if (user) carregar()
  }, [user])

  const carregar = async () => {
    setLoading(true)
    try {
      const { data: corrs, error } = await supabase
        .from('corretoras')
        .select('*')
        .eq('user_id', user.id)
        .order('nome')

      if (error) throw error
      setCorretoras(corrs || [])

      // Conta operações por corretora
      const { data: contagens } = await supabase.rpc('exec_sql', {
        query: ''
      }).single().catch(() => ({ data: null }))

      // Fallback: conta manualmente
      const resumo = {}
      for (const c of (corrs || [])) {
        const [{ count: nOps }, { count: nDivs }, { count: nApt }] = await Promise.all([
          supabase.from('operacoes').select('*', { count: 'exact', head: true })
            .eq('user_id', user.id).eq('corretora_id', c.id),
          supabase.from('dividendos').select('*', { count: 'exact', head: true })
            .eq('user_id', user.id).eq('corretora_id', c.id),
          supabase.from('aportes').select('*', { count: 'exact', head: true })
            .eq('user_id', user.id).eq('corretora_id', c.id),
        ])
        resumo[c.id] = { operacoes: nOps || 0, dividendos: nDivs || 0, aportes: nApt || 0 }
      }
      setResumoPorCorretora(resumo)
    } catch (err) {
      setErro('Erro ao carregar: ' + err.message)
    } finally {
      setLoading(false)
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
    if (!novoNome.trim()) {
      setErro('Nome é obrigatório')
      return
    }
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
    if (!novoNome.trim()) {
      setErro('Nome é obrigatório')
      return
    }
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
        `${c.nome} tem ${r.operacoes} operações, ${r.dividendos} dividendos e ${r.aportes} aportes vinculados.\n\nAo deletar, os registros ficarão SEM corretora (corretora_id = NULL). Você poderá reatribuí-los depois.\n\nConfirmar?`
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
    return (
      <div className="min-h-screen flex items-center justify-center">
        Carregando corretoras...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-green-800 text-white">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
          <button onClick={() => navigate('/dashboard')} className="p-2 hover:bg-green-700 rounded-lg">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold">Corretoras</h1>
            <p className="text-green-200 text-sm">
              Gerencie as corretoras onde você opera (Inter, XP, Rico, etc.)
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
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
                  type="text"
                  value={novoNome}
                  onChange={(e) => setNovoNome(e.target.value)}
                  placeholder="Ex: Inter, XP, BTG..."
                  className="w-full px-3 py-2 border rounded-lg"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
                <input
                  type="text"
                  value={novoCodigo}
                  onChange={(e) => setNovoCodigo(e.target.value.toUpperCase())}
                  placeholder="INTER"
                  maxLength={10}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cor</label>
                <div className="flex gap-2 flex-wrap">
                  {CORES_PADRAO.map(cor => (
                    <button
                      key={cor}
                      onClick={() => setNovaCor(cor)}
                      className={`w-8 h-8 rounded-full border-2 ${novaCor === cor ? 'border-gray-800' : 'border-transparent'}`}
                      style={{ backgroundColor: cor }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={editandoId ? salvarEdicao : salvarNova}
                className="px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-600 flex items-center gap-2"
              >
                <Save size={16} /> Salvar
              </button>
              <button
                onClick={limparForm}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-2"
              >
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {corretoras.map(c => {
              const r = resumoPorCorretora[c.id] || { operacoes: 0, dividendos: 0, aportes: 0 }
              return (
                <div key={c.id} className="bg-white border rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                  <div className="h-2" style={{ backgroundColor: c.cor || '#6b7280' }} />
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-bold text-lg">{c.nome}</h3>
                        {c.codigo && <p className="text-xs text-gray-500">{c.codigo}</p>}
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => iniciarEdicao(c)}
                          className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => deletarCorretora(c)}
                          className="p-2 hover:bg-red-50 rounded-lg text-red-500"
                        >
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
