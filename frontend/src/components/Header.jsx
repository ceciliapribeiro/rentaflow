import { useAuth } from '../contexts/AuthContext'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Home, TrendingUp, Wallet, DollarSign, BarChart3, Building2,
  LogOut, Upload,
} from 'lucide-react'

const NAV_ITEMS = [
  { path: '/dashboard',  label: 'Dashboard',  icon: Home },
  { path: '/operacoes',  label: 'Operações',  icon: TrendingUp },
  { path: '/aportes',    label: 'Aportes',    icon: Wallet },
  { path: '/dividendos', label: 'Dividendos', icon: DollarSign },
  { path: '/patrimonio', label: 'Patrimônio', icon: BarChart3 },
  { path: '/corretoras', label: 'Corretoras', icon: Building2 },
]

export default function Header({ titulo, subtitulo, mostrarImportar = false }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  const isAtivo = (path) => location.pathname === path

  return (
    <header className="bg-green-800 text-white shadow-lg">
      {/* Linha superior: logo + email + logout */}
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between border-b border-green-700">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-left hover:opacity-90"
          >
            <h1 className="text-xl font-bold">RentaFlow</h1>
            <p className="text-green-200 text-xs">Gestão de Dividendos</p>
          </button>
        </div>

        <div className="flex items-center gap-3">
          {mostrarImportar && (
            <button
              onClick={() => navigate('/importar')}
              className="hidden sm:flex items-center gap-2 bg-green-700 hover:bg-green-600 px-3 py-1.5 rounded-lg text-sm"
            >
              <Upload size={14} /> Importar
            </button>
          )}
          <span className="text-green-200 text-xs hidden md:block">{user?.email}</span>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 bg-green-700 hover:bg-green-600 px-3 py-1.5 rounded-lg text-xs"
          >
            <LogOut size={14} /> Sair
          </button>
        </div>
      </div>

      {/* Linha de navegação */}
      <nav className="max-w-7xl mx-auto px-4 overflow-x-auto">
        <div className="flex gap-1">
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`flex items-center gap-2 px-4 py-3 text-sm whitespace-nowrap border-b-2 transition-colors ${
                isAtivo(path)
                  ? 'border-white text-white font-semibold'
                  : 'border-transparent text-green-200 hover:text-white hover:border-green-400'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </nav>

      {/* Título e subtítulo da página atual */}
      {(titulo || subtitulo) && (
        <div className="max-w-7xl mx-auto px-4 py-4">
          {titulo && <h2 className="text-2xl font-bold">{titulo}</h2>}
          {subtitulo && <p className="text-green-200 text-sm mt-1">{subtitulo}</p>}
        </div>
      )}
    </header>
  )
}
