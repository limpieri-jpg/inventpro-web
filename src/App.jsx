import { useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { useStore } from './store/useStore'
import { Sidebar, Toast } from './components/layout'

// Pages
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ProcedureList from './pages/ProcedureList'
import ProceduraDetail from './pages/ProceduraDetail'
import Inventario from './pages/Inventario'
import Lotti from './pages/Lotti'
import Aste from './pages/Aste'
import Contratti from './pages/Contratti'
import Impostazioni from './pages/Impostazioni'
import Admin from './pages/Admin'

function AppLayout({ children }) {
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {children}
      </main>
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { user, loading } = useStore()
  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" />
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  return <AppLayout>{children}</AppLayout>
}

export default function App() {
  const { setUser, setProfile, setLoading, fetchProfile } = useStore()
  const navigate = useNavigate()

  useEffect(() => {
    // Controlla sessione iniziale
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        fetchProfile(session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    // Ascolta cambi auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user)
        fetchProfile(session.user.id)
        navigate('/')
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
        setProfile(null)
        navigate('/login')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/procedure" element={<ProtectedRoute><ProcedureList /></ProtectedRoute>} />
        <Route path="/procedure/:id" element={<ProtectedRoute><ProceduraDetail /></ProtectedRoute>} />
        <Route path="/inventario" element={<ProtectedRoute><Inventario /></ProtectedRoute>} />
        <Route path="/lotti" element={<ProtectedRoute><Lotti /></ProtectedRoute>} />
        <Route path="/aste" element={<ProtectedRoute><Aste /></ProtectedRoute>} />
        <Route path="/contratti" element={<ProtectedRoute><Contratti /></ProtectedRoute>} />
        <Route path="/impostazioni" element={<ProtectedRoute><Impostazioni /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toast />
    </>
  )
}
