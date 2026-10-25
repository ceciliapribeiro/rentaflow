import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { sincronizarDividendosRico } from '../utils/sincronizarDividendosRico'

const CorretoraContext = createContext({})

export function CorretoraProvider({ children }) {
  const { user } = useAuth()
  const [corretoras, setCorretoras] = useState([])
  const [loadingCorretoras, setLoadingCorretoras] = useState(true)
  
  // 'todas', 'sem_corretora', or specific corretora ID as string
  const [corretoraSelecionada, setCorretoraSelecionadaState] = useState(() => {
    try {
      return localStorage.getItem('rentaflow_corretora_filtro') || 'todas'
    } catch {
      return 'todas'
    }
  })

  const setCorretoraSelecionada = useCallback((id) => {
    const val = String(id)
    setCorretoraSelecionadaState(val)
    try {
      localStorage.setItem('rentaflow_corretora_filtro', val)
    } catch {
      // ignore
    }
  }, [])

  const carregarCorretoras = useCallback(async () => {
    if (!user) {
      setCorretoras([])
      setLoadingCorretoras(false)
      return
    }
    setLoadingCorretoras(true)
    try {
      const { data, error } = await supabase
        .from('corretoras')
        .select('*')
        .eq('user_id', user.id)
        .order('nome')
      if (error) throw error
      const lista = data || []
      setCorretoras(lista)

      // Garante que dividendos órfãos (sem corretora) sejam vinculados à Rico no Supabase
      sincronizarDividendosRico(user.id, lista).catch(err => {
        console.warn('Erro ao auto-vincular dividendos à Rico:', err)
      })
    } catch (err) {
      console.error('Erro ao carregar corretoras no contexto:', err)
      setCorretoras([])
    } finally {
      setLoadingCorretoras(false)
    }
  }, [user])

  useEffect(() => {
    carregarCorretoras()
  }, [carregarCorretoras])

  // Objeto da corretora selecionada (ou null se 'todas')
  const corretoraAtiva = corretoras.find(c => String(c.id) === String(corretoraSelecionada)) || null

  return (
    <CorretoraContext.Provider
      value={{
        corretoras,
        loadingCorretoras,
        corretoraSelecionada,
        setCorretoraSelecionada,
        corretoraAtiva,
        recarregarCorretoras: carregarCorretoras,
      }}
    >
      {children}
    </CorretoraContext.Provider>
  )
}

export function useCorretora() {
  const ctx = useContext(CorretoraContext)
  if (!ctx) {
    throw new Error('useCorretora deve ser usado dentro de um CorretoraProvider')
  }
  return ctx
}
