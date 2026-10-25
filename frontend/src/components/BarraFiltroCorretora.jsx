import { Building2, Layers } from 'lucide-react'
import { useCorretora } from '../contexts/CorretoraContext'

export default function BarraFiltroCorretora({
  titulo = 'Filtrar por Corretora:',
  labelConsolidado = 'Todas as Corretoras',
  mostrarBanner = true,
  descricaoBanner = 'registros',
  contagens = null, // ex: { '1': 10, '2': 5, todas: 15 }
  children = null,
  extraAcoes = null,
  className = '',
}) {
  const {
    corretoras,
    corretoraSelecionada,
    setCorretoraSelecionada,
    corretoraAtiva,
  } = useCorretora()

  const ehConsolidado = corretoraSelecionada === 'todas'

  return (
    <>
      {/* BARRA PRINCIPAL DE FILTRO */}
      <div className={`bg-white border rounded-xl p-3 mb-6 shadow-sm flex flex-wrap items-center justify-between gap-3 ${className}`}>
        <div className="flex items-center gap-2">
          <Building2 size={18} className="text-green-700 flex-shrink-0" />
          <span className="text-sm font-semibold text-gray-700">{titulo}</span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap flex-1 justify-start md:justify-end">
          {/* Botão Consolidado */}
          <button
            onClick={() => setCorretoraSelecionada('todas')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              ehConsolidado
                ? 'bg-green-700 text-white shadow-sm ring-2 ring-green-600/30'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Layers size={13} />
            <span>{labelConsolidado}</span>
            {contagens?.todas !== undefined && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                ehConsolidado ? 'bg-green-800 text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                {contagens.todas}
              </span>
            )}
          </button>

          {/* Botões individuais de cada corretora */}
          {corretoras.map(c => {
            const ativo = String(corretoraSelecionada) === String(c.id)
            const count = contagens ? contagens[c.id] : undefined
            return (
              <button
                key={c.id}
                onClick={() => setCorretoraSelecionada(String(c.id))}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  ativo
                    ? 'bg-gray-900 text-white shadow-sm ring-2 ring-gray-800/30 font-semibold'
                    : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: c.cor || '#10b981' }}
                />
                <span>{c.nome}</span>
                {count !== undefined && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    ativo ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}

          {extraAcoes}
        </div>

        {/* Filtros adicionais opcionais (ex: busca por ticker, select de ano, etc) */}
        {children && (
          <div className="w-full pt-3 mt-1 border-t border-gray-100 flex flex-wrap items-center gap-3">
            {children}
          </div>
        )}
      </div>

      {/* BANNER VISUAL QUANDO FILTRADO POR CORRETORA ESPECÍFICA */}
      {mostrarBanner && !ehConsolidado && corretoraAtiva && (
        <div
          className="mb-6 p-4 rounded-xl border flex items-center justify-between flex-wrap gap-2 shadow-sm transition-all"
          style={{
            backgroundColor: `${corretoraAtiva?.cor || '#15803d'}12`,
            borderColor: `${corretoraAtiva?.cor || '#15803d'}40`,
          }}
        >
          <div className="flex items-center gap-3">
            <span
              className="w-3.5 h-3.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: corretoraAtiva?.cor || '#15803d' }}
            />
            <p className="text-sm font-bold text-gray-800">
              Visualizando {descricaoBanner} da corretora: <span className="underline">{corretoraAtiva?.nome}</span>
            </p>
          </div>
          <button
            onClick={() => setCorretoraSelecionada('todas')}
            className="px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-lg shadow-sm"
          >
            ← Ver Todas as Corretoras
          </button>
        </div>
      )}
    </>
  )
}
