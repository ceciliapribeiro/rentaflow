import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'

/* ──────────────────────────────────────────────────────────────────
   TOAST CONTEXT
   Uso:
     const { toast } = useToast()
     toast.success('Salvo!')
     toast.error('Algo deu errado.')
     toast.warning('Atenção!')
     toast.info('Buscando dados...')
   ────────────────────────────────────────────────────────────────── */

const ToastContext = createContext(null)

const ICONS = {
  success: CheckCircle,
  error:   XCircle,
  warning: AlertTriangle,
  info:    Info,
}

const STYLES = {
  success: 'bg-green-50  border-green-400  text-green-800',
  error:   'bg-red-50    border-red-400    text-red-800',
  warning: 'bg-yellow-50 border-yellow-400 text-yellow-800',
  info:    'bg-blue-50   border-blue-400   text-blue-800',
}

const ICON_COLORS = {
  success: 'text-green-500',
  error:   'text-red-500',
  warning: 'text-yellow-500',
  info:    'text-blue-500',
}

let _id = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const remove = useCallback((id) =>
    setToasts(prev => prev.filter(t => t.id !== id)), [])

  const add = useCallback((type, message, duration = 4000) => {
    const id = ++_id
    setToasts(prev => [...prev, { id, type, message }])
    if (duration > 0) setTimeout(() => remove(id), duration)
    return id
  }, [remove])

  const toast = {
    success: (msg, d) => add('success', msg, d),
    error:   (msg, d) => add('error',   msg, d),
    warning: (msg, d) => add('warning', msg, d),
    info:    (msg, d) => add('info',    msg, d),
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Portal de toasts — canto superior direito */}
      <div
        aria-live="polite"
        className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)] pointer-events-none"
      >
        {toasts.map(t => {
          const Icon = ICONS[t.type]
          return (
            <div
              key={t.id}
              className={`
                flex items-start gap-3 border rounded-xl px-4 py-3 shadow-lg
                pointer-events-auto animate-slide-in
                ${STYLES[t.type]}
              `}
              role="alert"
            >
              <Icon size={18} className={`mt-0.5 shrink-0 ${ICON_COLORS[t.type]}`} />
              <span className="text-sm font-medium flex-1 leading-snug">{t.message}</span>
              <button
                onClick={() => remove(t.id)}
                className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                aria-label="Fechar"
              >
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast deve ser usado dentro de <ToastProvider>')
  return ctx
}

/* ──────────────────────────────────────────────────────────────────
   CONFIRM MODAL CONTEXT
   Uso:
     const { confirm } = useConfirm()
     const ok = await confirm({ title: 'Excluir?', message: 'Esta ação não pode ser desfeita.' })
     if (!ok) return
   ────────────────────────────────────────────────────────────────── */

const ConfirmContext = createContext(null)

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null)
  const resolveRef = useRef(null)

  const confirm = useCallback(({ title, message, confirmLabel = 'Confirmar', danger = false }) =>
    new Promise(resolve => {
      setDialog({ title, message, confirmLabel, danger })
      resolveRef.current = resolve
    }), [])

  const respond = (answer) => {
    setDialog(null)
    resolveRef.current?.(answer)
    resolveRef.current = null
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}

      {dialog && (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => respond(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <AlertTriangle
                size={22}
                className={dialog.danger ? 'text-red-500 mt-0.5 shrink-0' : 'text-yellow-500 mt-0.5 shrink-0'}
              />
              <div>
                <p className="font-semibold text-gray-900 text-base">{dialog.title}</p>
                {dialog.message && (
                  <p className="text-gray-500 text-sm mt-1 leading-relaxed whitespace-pre-line">
                    {dialog.message}
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-1">
              <button
                onClick={() => respond(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => respond(true)}
                className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors ${
                  dialog.danger
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {dialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm deve ser usado dentro de <ConfirmProvider>')
  return ctx
}
