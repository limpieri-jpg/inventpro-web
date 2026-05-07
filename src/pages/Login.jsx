import { useState } from 'react'
import { useStore } from '../store/useStore'

export default function Login() {
  const { signIn } = useStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(err.message || 'Credenziali non valide')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at 30% 20%, #1a2550 0%, var(--bg) 60%)'
    }}>
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: '48px 40px', width: 380,
        boxShadow: 'var(--shadow)'
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 36 }}>
          <div style={{
            width: 40, height: 40, background: 'var(--accent)', borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 700, color: '#fff'
          }}>IP</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>InventPro</div>
            <div style={{ fontSize: 11, color: 'var(--text2)' }}>Progess Italia</div>
          </div>
        </div>

        <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 6 }}>Accedi</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 28 }}>
          Inserisci le tue credenziali per continuare
        </div>

        {error && (
          <div style={{
            background: 'rgba(255,77,106,0.1)', border: '1px solid rgba(255,77,106,0.3)',
            color: 'var(--accent-r)', borderRadius: 'var(--radius)',
            padding: '10px 14px', fontSize: 13, marginBottom: 16
          }}>{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email" className="form-input"
              placeholder="nome@studio.it"
              value={email} onChange={e => setEmail(e.target.value)}
              required autoFocus
            />
          </div>
          <div className="form-group" style={{ marginBottom: 24 }}>
            <label className="form-label">Password</label>
            <input
              type="password" className="form-input"
              placeholder="••••••••"
              value={password} onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? 'Accesso in corso…' : 'Accedi'}
          </button>
        </form>

        <div style={{ marginTop: 24, textAlign: 'center', fontSize: 12, color: 'var(--text3)' }}>
          InventPro — Inventari Concorsuali · Progess Italia
        </div>
      </div>
    </div>
  )
}
