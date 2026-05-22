import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { useStore } from './store/useStore'
import { Sidebar, Toast } from './components/layout'

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
import Backup from './pages/Backup'
import Documenti from './pages/Documenti'

// ── Modal cambio password primo accesso ───────────────────────────────────────
function PasswordChangeBanner() {
  const { profile, notify, fetchProfile } = useStore()
  const [show, setShow]     = useState(false)
  const [pwd, setPwd]       = useState('')
  const [pwd2, setPwd2]     = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (profile && profile.is_admin === false && !profile.password_changed) {
      setShow(true)
    } else if (profile) {
      setShow(false)
    }
  }, [profile])

  if (!profile || !show) return null

  const handleChange = async () => {
    if (!pwd || pwd.length < 6) { notify('Password minimo 6 caratteri', 'warn'); return }
    if (pwd !== pwd2) { notify('Le password non coincidono', 'warn'); return }
    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd })
      if (error) throw error
      await supabase.from('profiles').update({ password_changed: true }).eq('id', profile.id)
      await fetchProfile(profile.id)
      notify('Password aggiornata con successo!', 'ok', 5000)
      setShow(false)
    } catch(e) { notify('Errore: ' + e.message, 'err') }
    finally { setSaving(false) }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 20, width: '100%', maxWidth: 400,
        padding: 32, boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        {/* Icona e titolo */}
        <div style={{textAlign:'center'}}>
          <div style={{fontSize:48,marginBottom:12}}>🔐</div>
          <div style={{fontSize:18,fontWeight:700,marginBottom:6}}>Imposta la tua password</div>
          <div style={{fontSize:13,color:'var(--text2)',lineHeight:1.6}}>
            Stai usando la password temporanea.<br/>
            Per la sicurezza del tuo account, scegli una password personale.
          </div>
        </div>

        {/* Form */}
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div>
            <label className="form-label">Nuova password</label>
            <input className="form-input" type="password" value={pwd}
              onChange={e=>setPwd(e.target.value)} placeholder="Minimo 6 caratteri"
              autoFocus/>
          </div>
          <div>
            <label className="form-label">Conferma password</label>
            <input className="form-input" type="password" value={pwd2}
              onChange={e=>setPwd2(e.target.value)} placeholder="Ripeti la password"
              onKeyDown={e=>e.key==='Enter'&&handleChange()}/>
          </div>
        </div>

        {/* Bottoni */}
        <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:4}}>
          <button className="btn btn-primary" onClick={handleChange} disabled={saving}
            style={{width:'100%',padding:'12px',fontSize:14}}>
            {saving ? 'Salvataggio…' : '✓ Salva nuova password'}
          </button>
          <button className="btn btn-ghost" onClick={() => setShow(false)}
            style={{width:'100%',fontSize:12,color:'var(--text3)'}}>
            Ricordamelo al prossimo accesso
          </button>
        </div>

        <div style={{fontSize:11,color:'var(--text3)',textAlign:'center'}}>
          Questo avviso apparirà ad ogni accesso finché non cambi la password.
        </div>
      </div>
    </div>
  )
}

function AppLayout({ children }) {
  return (
    <>
      <PasswordChangeBanner />
      <div className="app-layout" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
        <Sidebar />
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          {children}
        </main>
      </div>
    </>
  )
}

function ProtectedRoute({ children }) {
  const { user, loading } = useStore()
  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
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
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        fetchProfile(session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

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
        <Route path="/documenti" element={<ProtectedRoute><Documenti /></ProtectedRoute>} />
        <Route path="/impostazioni" element={<ProtectedRoute><Impostazioni /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
        <Route path="/backup" element={<ProtectedRoute><Backup /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toast />
    </>
  )
}
