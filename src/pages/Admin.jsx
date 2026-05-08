import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { Topbar, Spinner, Modal, Empty } from '../components/layout'
import { supabase } from '../lib/supabase'
import { Plus, Edit, Trash2, Shield, ShieldOff, Eye, EyeOff } from 'lucide-react'

function fmtDate(d) { if (!d) return '—'; return new Date(d).toLocaleDateString('it-IT') }

function UserForm({ user, onSave, onClose }) {
  const { notify } = useStore()
  const [form, setForm] = useState({
    nome: '', cognome: '', email: '', titolo: '', ruolo: 'Utente',
    cf: '', tel: '', pec: '', is_admin: false, is_active: true,
    ...user
  })
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [showPwd, setShowPwd] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const inp = (k, type = 'text') => ({ value: form[k] || '', type, onChange: e => set(k, e.target.value), className: 'form-input' })

  const handleSave = async () => {
    if (!form.nome || !form.cognome) { notify('Inserisci nome e cognome', 'warn'); return }
    if (!user && !form.email) { notify('Inserisci email', 'warn'); return }
    // password non richiesta — si usa magic link
    setSaving(true)
    try {
      if (user?.id) {
        // Aggiorna profilo esistente
        const { error } = await supabase.from('profiles').update({
          nome: form.nome, cognome: form.cognome, titolo: form.titolo,
          ruolo: form.ruolo, cf: form.cf, tel: form.tel, pec: form.pec,
          is_admin: form.is_admin, is_active: form.is_active
        }).eq('id', user.id)
        if (error) throw error
        notify('Utente aggiornato', 'ok')
      } else {
        // Invita utente via Supabase (invia email con link di accesso)
        const { error: invErr } = await supabase.auth.signInWithOtp({
          email: form.email,
          options: { shouldCreateUser: true }
        })
        if (invErr) throw invErr
        // Salva dati profilo extra in attesa che l'utente si registri
        // Usiamo una tabella temporanea o salviamo direttamente
        notify('Invito inviato a ' + form.email + ' — cliccare il link ricevuto per accedere', 'ok', 6000)
      }
      onSave()
    } catch (e) { notify('Errore: ' + e.message, 'err') }
    finally { setSaving(false) }
  }

  return (
    <>
      <div className="form-grid">
        <div className="form-section">Dati personali</div>
        <div className="form-group"><label className="form-label">Titolo</label><input {...inp('titolo')} placeholder="Dott., Avv." /></div>
        <div className="form-group"><label className="form-label">Ruolo</label>
          <select className="form-input" value={form.ruolo} onChange={e => set('ruolo', e.target.value)}>
            {['Utente', 'Curatore fallimentare', 'Commissario giudiziale', 'Liquidatore giudiziale', 'Amministratore'].map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div className="form-group"><label className="form-label">Nome *</label><input {...inp('nome')} /></div>
        <div className="form-group"><label className="form-label">Cognome *</label><input {...inp('cognome')} /></div>
        <div className="form-group"><label className="form-label">Codice Fiscale</label><input {...inp('cf')} /></div>
        <div className="form-group"><label className="form-label">Telefono</label><input {...inp('tel', 'tel')} /></div>

        {user ? (
          // Modifica utente esistente — mostra email in sola lettura
          <div className="form-col-full form-group">
            <label className="form-label">Email (non modificabile)</label>
            <input className="form-input" value={form.email || ''} readOnly style={{ opacity: 0.5, cursor: 'not-allowed' }} />
          </div>
        ) : (
          <>
            <div className="form-section">Credenziali accesso</div>
            <div className="form-col-full">
              <div style={{ padding: '10px 14px', background: 'rgba(59,111,255,0.08)', border: '1px solid rgba(59,111,255,0.2)', borderRadius: 8, fontSize: 13, marginBottom: 8 }}>
                ℹ️ Verrà inviata un'email con il link di accesso. L'utente potrà impostare la propria password al primo accesso.
              </div>
            </div>
            <div className="form-col-full form-group">
              <label className="form-label">Email *</label>
              <input
                className="form-input"
                type="text"
                autoComplete="off"
                value={form.email || ''}
                onChange={e => set('email', e.target.value)}
                placeholder="email@esempio.it"
              />
            </div>
          </>
        )}

        <div className="form-section">Permessi</div>
        <div className="form-col-full" style={{ display: 'flex', gap: 24 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={form.is_admin} onChange={e => set('is_admin', e.target.checked)} />
            <span><strong>Amministratore</strong> — accesso completo a tutte le procedure e funzioni</span>
          </label>
        </div>
        {user && (
          <div className="form-col-full" style={{ display: 'flex', gap: 24 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} />
              <span><strong>Utente attivo</strong> — può accedere all'applicazione</span>
            </label>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
        <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Invio…' : user ? 'Aggiorna utente' : 'Invia invito'}
        </button>
      </div>
    </>
  )
}

export default function Admin() {
  const { profile, notify } = useStore()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => { loadUsers() }, [])

  const loadUsers = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('profiles').select('*').order('cognome')
    if (error) notify('Errore: ' + error.message, 'err')
    setUsers(data || [])
    setLoading(false)
  }

  const toggleAdmin = async (user) => {
    await supabase.from('profiles').update({ is_admin: !user.is_admin }).eq('id', user.id)
    notify(user.is_admin ? 'Rimosso da admin' : 'Promosso ad admin', 'ok')
    loadUsers()
  }

  const toggleActive = async (user) => {
    await supabase.from('profiles').update({ is_active: !user.is_active }).eq('id', user.id)
    notify(user.is_active ? 'Utente disattivato' : 'Utente attivato', 'ok')
    loadUsers()
  }

  const filtered = users.filter(u =>
    !search || `${u.nome} ${u.cognome} ${u.email}`.toLowerCase().includes(search.toLowerCase())
  )

  if (!profile?.is_admin) return (
    <>
      <Topbar title="Amministrazione" />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Empty icon="🔒" title="Accesso negato" sub="Solo gli amministratori possono accedere a questa sezione" />
      </div>
    </>
  )

  return (
    <>
      <Topbar
        title="Gestione utenti"
        subtitle={`${users.length} utenti registrati`}
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => { setEditUser(null); setShowForm(true) }}>
            <Plus size={14} /> Nuovo utente
          </button>
        }
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 20 }}>
          <div className="stat-card">
            <div className="stat-label">Utenti totali</div>
            <div className="stat-value stat-blue">{users.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Amministratori</div>
            <div className="stat-value stat-yellow">{users.filter(u => u.is_admin).length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Utenti attivi</div>
            <div className="stat-value stat-green">{users.filter(u => u.is_active !== false).length}</div>
          </div>
        </div>

        <div className="filter-bar" style={{ marginBottom: 16 }}>
          <input className="form-input" placeholder="Cerca utente…" style={{ maxWidth: 300 }}
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="table-card">
          {loading ? <Spinner /> : filtered.length === 0 ? (
            <Empty icon="👥" title="Nessun utente" sub="Crea il primo utente" />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Utente</th>
                  <th>Email</th>
                  <th>Ruolo</th>
                  <th>Admin</th>
                  <th>Stato</th>
                  <th style={{ width: 100 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 500 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0
                        }}>
                          {(u.nome?.[0] || '') + (u.cognome?.[0] || '')}
                        </div>
                        <div>
                          <div>{u.titolo ? u.titolo + ' ' : ''}{u.nome} {u.cognome}</div>
                          {u.tel && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{u.tel}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="muted">{u.email}</td>
                    <td><span className="badge badge-blue">{u.ruolo || 'Utente'}</span></td>
                    <td>
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleAdmin(u)}
                        title={u.is_admin ? 'Rimuovi admin' : 'Promuovi admin'}
                        style={{ color: u.is_admin ? 'var(--accent-y)' : 'var(--text3)' }}>
                        {u.is_admin ? <Shield size={15} /> : <ShieldOff size={15} />}
                      </button>
                    </td>
                    <td>
                      <span className={`badge ${u.is_active !== false ? 'badge-green' : 'badge-red'}`}>
                        {u.is_active !== false ? 'Attivo' : 'Disattivo'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setEditUser(u); setShowForm(true) }}>
                          <Edit size={13} />
                        </button>
                        {u.id !== profile.id && (
                          <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(u)}
                            style={{ color: u.is_active !== false ? 'var(--accent-r)' : 'var(--accent-g)' }}>
                            {u.is_active !== false ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editUser ? 'Modifica utente' : 'Nuovo utente'} wide>
        <UserForm
          user={editUser}
          onClose={() => setShowForm(false)}
          onSave={() => { setShowForm(false); loadUsers() }}
        />
      </Modal>
    </>
  )
}
