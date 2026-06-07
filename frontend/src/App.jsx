import AtivoDetalhe from './pages/AtivoDetalhe'
import Operacoes from './pages/Operacoes'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Importar from './pages/Importar'
import ImportarDadosB3 from './pages/ImportarDadosB3'
import SmartAporte from './pages/SmartAporte'
import Dividendos from './pages/Dividendos'
import Corretoras from './pages/Corretoras'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center">Carregando...</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center">Carregando...</div>
  if (user) return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
		<Route path="/ativo/:ticker" element={<ProtectedRoute><AtivoDetalhe /></ProtectedRoute>} />
		<Route path="/operacoes" element={<ProtectedRoute><Operacoes /></ProtectedRoute>} />
		<Route path="/corretoras" element={<ProtectedRoute><Corretoras /></ProtectedRoute>} />		
		<Route path="/dividendos" element={<ProtectedRoute><Dividendos /></ProtectedRoute>} />
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/importar" element={<ProtectedRoute><Importar /></ProtectedRoute>} />
        <Route path="/importar-dados-b3" element={<ProtectedRoute><ImportarDadosB3 /></ProtectedRoute>} />
        <Route path="/smart-aporte" element={<ProtectedRoute><SmartAporte /></ProtectedRoute>} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
