import { Building2, ChevronDown, Check } from 'lucide-react'
import { useCorretora } from '../contexts/CorretoraContext'
import { useState, useRef, useEffect } from 'react'

export default function FiltroCorretora({
  modo = 'select', // 'select' | 'pills' | 'header'
  valor,
  onChange,
  className = '',
  mostrarTotalLabel = 'Todas as corretoras',
  mostrarIcone = true,
  tamanho = 'md', // 'sm' | 'md'
}) {
  const { corretoras, corretoraSelecionada, setCorretoraSelecionada, corretoraAtiva } = useCorretora()
  const [dropdownAberto, setDropdownAberto] = useState(false)
  const dropdownRef = useRef(null)

  const valorAtual = valor !== undefined ? valor : corretoraSelecionada
  const setValor = onChange || setCorretoraSelecionada

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    function handleClickFora(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownAberto(false)
      }
    }
    document.addEventListener('mousedown', handleClickFora)
    return () => document.removeEventListener('mousedown', handleClickFora)
  }, [])

  // MODO HEADER: Botão estilizado para o cabeçalho verde
  if (modo === 'header') {
    return (
      <div className="relative inline-block" ref={dropdownRef}>
        <button
          onClick={() => setDropdownAberto(prev => !prev)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            valorAtual !== 'todas'
              ? 'bg-white text-green-900 shadow-sm font-semibold'
              : 'bg-green-700/80 hover:bg-green-700 text-white'
          }`}
          title="Filtrar por corretora"
        >
          {corretoraAtiva ? (
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: corretoraAtiva.cor || '#10b981' }}
            />
          ) : (
            <Building2 size={13} className="text-green-200" />
          )}
          <span className="truncate max-w-[120px] sm:max-w-[160px]">
            {corretoraAtiva ? corretoraAtiva.nome : 'Todas as Corretoras'}
          </span>
          <ChevronDown size={12} className={`transition-transform ${dropdownAberto ? 'rotate-180' : ''}`} />
        </button>

        {dropdownAberto && (
          <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
            <div className="px-3 py-1.5 border-b border-gray-100">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Filtrar por Corretora
              </p>
            </div>

            <button
              onClick={() => {
                setValor('todas')
                setDropdownAberto(false)
              }}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-gray-50 transition-colors ${
                valorAtual === 'todas' ? 'text-green-700 font-semibold bg-green-50/60' : 'text-gray-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <Building2 size={14} className="text-gray-400" />
                <span>Todas (Consolidado)</span>
              </div>
              {valorAtual === 'todas' && <Check size={14} className="text-green-600" />}
            </button>

            {corretoras.map(c => (
              <button
                key={c.id}
                onClick={() => {
                  setValor(String(c.id))
                  setDropdownAberto(false)
                }}
                className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-gray-50 transition-colors ${
                  String(valorAtual) === String(c.id) ? 'text-green-700 font-semibold bg-green-50/60' : 'text-gray-700'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: c.cor || '#6b7280' }}
                  />
                  <span className="truncate">{c.nome}</span>
                  {c.codigo && <span className="text-[10px] text-gray-400">({c.codigo})</span>}
                </div>
                {String(valorAtual) === String(c.id) && <Check size={14} className="text-green-600 flex-shrink-0" />}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // MODO PILLS: Botões horizontais clicáveis
  if (modo === 'pills') {
    return (
      <div className={`flex items-center gap-1.5 flex-wrap ${className}`}>
        <button
          onClick={() => setValor('todas')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            valorAtual === 'todas'
              ? 'bg-green-700 text-white shadow-sm ring-2 ring-green-700/20'
              : 'bg-white border text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Building2 size={13} />
          <span>Todas (Consolidado)</span>
        </button>

        {corretoras.map(c => {
          const selecionado = String(valorAtual) === String(c.id)
          return (
            <button
              key={c.id}
              onClick={() => setValor(String(c.id))}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                selecionado
                  ? 'bg-gray-900 text-white shadow-sm ring-2 ring-gray-900/20'
                  : 'bg-white border text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: c.cor || '#6b7280' }}
              />
              <span>{c.nome}</span>
            </button>
          )
        })}
      </div>
    )
  }

  // MODO SELECT: Dropdown clássico estilizado
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {mostrarIcone && <Building2 size={16} className="text-gray-400 flex-shrink-0" />}
      <div className="relative inline-block w-full">
        <select
          value={valorAtual}
          onChange={(e) => setValor(e.target.value)}
          className={`w-full px-3 py-1.5 border rounded-lg text-sm bg-white font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors ${
            tamanho === 'sm' ? 'py-1 text-xs' : 'py-1.5 text-sm'
          }`}
        >
          <option value="todas">🏢 {mostrarTotalLabel}</option>
          {corretoras.map(c => (
            <option key={c.id} value={c.id}>
              {c.nome} {c.codigo ? `(${c.codigo})` : ''}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
