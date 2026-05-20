import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { Topbar, Spinner, Modal, Empty } from '../components/layout'
import { supabase } from '../lib/supabase'
import { Plus, Edit, Shield, ShieldOff, Eye, EyeOff, Key, Activity } from 'lucide-react'

function fmtDate(d) { if (!d) return '—'; return new Date(d).toLocaleDateString('it-IT') }
function fmtDateTime(d) { if (!d) return '—'; return new Date(d).toLocaleString('it-IT') }

// ─── Form nuovo/modifica utente ───────────────────────────────────────────────
function UserForm({ user, onSave, onClose }) {
  const { notify } = useStore()
  const [form, setForm] = useState({
    nome: '', cognome: '', email: '', titolo: '', ruolo: 'Utente',
    cf: '', tel: '', pec: '', is_admin: false, is_active: true,
    ...user
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const inp = (k, type = 'text') => ({ value: form[k] || '', type, onChange: e => set(k, e.target.value), className: 'form-input' })

  const handleSave = async () => {
    if (!form.nome || !form.cognome) { notify('Inserisci nome e cognome', 'warn'); return }
    if (!user && !form.email) { notify('Inserisci email', 'warn'); return }
    setSaving(true)
    try {
      if (user?.id) {
        const { error } = await supabase.from('profiles').update({
          nome: form.nome, cognome: form.cognome, titolo: form.titolo,
          ruolo: form.ruolo, cf: form.cf, tel: form.tel, pec: form.pec,
          is_admin: form.is_admin, is_active: form.is_active
        }).eq('id', user.id)
        if (error) throw error
        notify('Utente aggiornato', 'ok')
      } else {
        // Invito via OTP — crea utente e salva dati pending
        const { error: invErr } = await supabase.auth.signInWithOtp({
          email: form.email,
          options: { shouldCreateUser: true, data: { nome: form.nome, cognome: form.cognome } }
        })
        if (invErr) throw invErr
        // Salva dati profilo in pending_profiles per quando si registra
        await supabase.from('pending_profiles').upsert({
          email: form.email, nome: form.nome, cognome: form.cognome,
          titolo: form.titolo, ruolo: form.ruolo, cf: form.cf,
          tel: form.tel, pec: form.pec, is_admin: form.is_admin
        })
        notify('Invito inviato a ' + form.email, 'ok', 6000)
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
            {['Utente','Curatore fallimentare','Commissario giudiziale','Liquidatore giudiziale','Amministratore'].map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div className="form-group"><label className="form-label">Nome *</label><input {...inp('nome')} /></div>
        <div className="form-group"><label className="form-label">Cognome *</label><input {...inp('cognome')} /></div>
        <div className="form-group"><label className="form-label">Codice Fiscale</label><input {...inp('cf')} /></div>
        <div className="form-group"><label className="form-label">Telefono</label><input {...inp('tel','tel')} /></div>
        <div className="form-group"><label className="form-label">PEC</label><input {...inp('pec','email')} /></div>

        {user ? (
          <div className="form-col-full form-group">
            <label className="form-label">Email (non modificabile)</label>
            <input className="form-input" value={form.email||''} readOnly style={{opacity:0.5,cursor:'not-allowed'}}/>
          </div>
        ) : (
          <>
            <div className="form-section">Credenziali accesso</div>
            <div className="form-col-full">
              <div style={{padding:'10px 14px',background:'rgba(59,111,255,0.08)',border:'1px solid rgba(59,111,255,0.2)',borderRadius:8,fontSize:13,marginBottom:8}}>
                ℹ️ Verrà inviata un'email con il link di accesso. L'utente potrà accedere cliccando il link.
              </div>
            </div>
            <div className="form-col-full form-group">
              <label className="form-label">Email *</label>
              <input className="form-input" type="email" value={form.email||''} onChange={e=>set('email',e.target.value)} placeholder="email@esempio.it"/>
            </div>
          </>
        )}

        <div className="form-section">Permessi</div>
        <div className="form-col-full" style={{display:'flex',flexDirection:'column',gap:12}}>
          <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',fontSize:13}}>
            <input type="checkbox" checked={form.is_admin} onChange={e=>set('is_admin',e.target.checked)}/>
            <span><strong>Amministratore</strong> — accesso completo a tutte le procedure e funzioni</span>
          </label>
          {user && (
            <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',fontSize:13}}>
              <input type="checkbox" checked={form.is_active} onChange={e=>set('is_active',e.target.checked)}/>
              <span><strong>Utente attivo</strong> — può accedere all'applicazione</span>
            </label>
          )}
        </div>
      </div>
      <div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:8}}>
        <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvataggio…' : user ? 'Aggiorna utente' : 'Invia invito'}
        </button>
      </div>
    </>
  )
}

// ─── Tab Utenti ───────────────────────────────────────────────────────────────
function TabUtenti({ profile }) {
  const { notify } = useStore()
  const [users, setUsers]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [search, setSearch]     = useState('')
  const [resetting, setResetting] = useState(null)

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

  const resetPassword = async (user) => {
    if (!user.email) { notify('Email non disponibile', 'warn'); return }
    if (!confirm(`Inviare email di reset password a ${user.email}?`)) return
    setResetting(user.id)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: window.location.origin + '/inventpro-web'
      })
      if (error) throw error
      notify('Email di reset inviata a ' + user.email, 'ok', 5000)
    } catch(e) { notify('Errore: ' + e.message, 'err') }
    finally { setResetting(null) }
  }

  const filtered = users.filter(u =>
    !search || `${u.nome} ${u.cognome} ${u.email}`.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
      {/* Stats */}
      <div className="stats-grid" style={{gridTemplateColumns:'repeat(3,1fr)',marginBottom:20}}>
        <div className="stat-card"><div className="stat-label">Utenti totali</div><div className="stat-value stat-blue">{users.length}</div></div>
        <div className="stat-card"><div className="stat-label">Amministratori</div><div className="stat-value stat-yellow">{users.filter(u=>u.is_admin).length}</div></div>
        <div className="stat-card"><div className="stat-label">Utenti attivi</div><div className="stat-value stat-green">{users.filter(u=>u.is_active!==false).length}</div></div>
      </div>

      {/* Filtro + tasto nuovo */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,gap:12,flexWrap:'wrap'}}>
        <input className="form-input" placeholder="Cerca per nome o email…" style={{maxWidth:300}}
          value={search} onChange={e=>setSearch(e.target.value)}/>
        <button className="btn btn-primary btn-sm" onClick={()=>{setEditUser(null);setShowForm(true)}}>
          <Plus size={14}/> Nuovo utente
        </button>
      </div>

      <div className="table-card">
        {loading ? <Spinner/> : filtered.length===0 ? (
          <Empty icon="👥" title="Nessun utente" sub="Crea il primo utente"/>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Utente</th><th>Email</th><th>Ruolo</th>
                <th>Admin</th><th>Stato</th><th style={{width:140}}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id}>
                  <td style={{fontWeight:500}}>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <div style={{width:32,height:32,borderRadius:'50%',background:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'#fff',flexShrink:0}}>
                        {(u.nome?.[0]||'')+(u.cognome?.[0]||'')}
                      </div>
                      <div>
                        <div>{u.titolo?u.titolo+' ':''}{u.nome} {u.cognome}</div>
                        {u.tel&&<div style={{fontSize:11,color:'var(--text3)'}}>{u.tel}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="muted">{u.email}</td>
                  <td><span className="badge badge-blue">{u.ruolo||'Utente'}</span></td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={()=>toggleAdmin(u)}
                      title={u.is_admin?'Rimuovi admin':'Promuovi admin'}
                      style={{color:u.is_admin?'var(--accent-y)':'var(--text3)'}}>
                      {u.is_admin?<Shield size={15}/>:<ShieldOff size={15}/>}
                    </button>
                  </td>
                  <td>
                    <span className={`badge ${u.is_active!==false?'badge-green':'badge-red'}`}>
                      {u.is_active!==false?'Attivo':'Disattivo'}
                    </span>
                  </td>
                  <td>
                    <div style={{display:'flex',gap:4}}>
                      <button className="btn btn-ghost btn-sm" title="Modifica"
                        onClick={()=>{setEditUser(u);setShowForm(true)}}><Edit size={13}/></button>
                      <button className="btn btn-ghost btn-sm" title="Reset password"
                        disabled={resetting===u.id} style={{color:'var(--accent-b)'}}
                        onClick={()=>resetPassword(u)}><Key size={13}/></button>
                      {u.id!==profile.id&&(
                        <button className="btn btn-ghost btn-sm"
                          title={u.is_active!==false?'Disattiva':'Attiva'}
                          style={{color:u.is_active!==false?'var(--accent-r)':'var(--accent-g)'}}
                          onClick={()=>toggleActive(u)}>
                          {u.is_active!==false?<EyeOff size={13}/>:<Eye size={13}/>}
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

      <Modal open={showForm} onClose={()=>setShowForm(false)}
        title={editUser?'Modifica utente':'Nuovo utente'} wide>
        <UserForm user={editUser} onClose={()=>setShowForm(false)}
          onSave={()=>{setShowForm(false);loadUsers()}}/>
      </Modal>
    </>
  )
}

// ─── Tab Log attività ─────────────────────────────────────────────────────────
function TabLog() {
  const { notify } = useStore()
  const [logs, setLogs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [filterType, setFilter] = useState('')

  useEffect(() => { loadLogs() }, [])

  const loadLogs = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('activity_log')
      .select('*, profiles(nome,cognome,email)')
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) {
      // Tabella non ancora creata
      if (error.code === '42P01') {
        notify('Tabella activity_log non trovata — eseguire la migration SQL', 'warn', 8000)
      } else {
        notify('Errore: ' + error.message, 'err')
      }
    }
    setLogs(data || [])
    setLoading(false)
  }

  const ACTION_ICONS = {
    login: '🔑', logout: '👋', create: '➕', update: '✏️',
    delete: '🗑️', generate: '📄', error: '❌'
  }

  const filtered = logs.filter(l => {
    const txt = `${l.profiles?.nome} ${l.profiles?.cognome} ${l.action} ${l.entity} ${l.details||''}`.toLowerCase()
    return (!search || txt.includes(search.toLowerCase())) &&
           (!filterType || l.action === filterType)
  })

  const actionTypes = [...new Set(logs.map(l=>l.action).filter(Boolean))]

  return (
    <>
      <div style={{display:'flex',gap:12,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
        <input className="form-input" placeholder="Cerca nei log…" style={{maxWidth:300}}
          value={search} onChange={e=>setSearch(e.target.value)}/>
        <select className="form-input" style={{maxWidth:180}} value={filterType} onChange={e=>setFilter(e.target.value)}>
          <option value="">Tutte le azioni</option>
          {actionTypes.map(a=><option key={a} value={a}>{a}</option>)}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={loadLogs}>↻ Aggiorna</button>
        <span style={{fontSize:12,color:'var(--text3)',marginLeft:'auto'}}>Ultimi 200 eventi</span>
      </div>

      <div className="table-card">
        {loading ? <Spinner/> : filtered.length===0 ? (
          <Empty icon="📋" title="Nessun log" sub={logs.length===0?"Nessuna attività registrata":"Nessun risultato per i filtri impostati"}/>
        ) : (
          <table>
            <thead>
              <tr><th>Data/Ora</th><th>Utente</th><th>Azione</th><th>Entità</th><th>Dettagli</th></tr>
            </thead>
            <tbody>
              {filtered.map((l,i) => (
                <tr key={l.id||i}>
                  <td style={{fontSize:12,color:'var(--text3)',whiteSpace:'nowrap'}}>{fmtDateTime(l.created_at)}</td>
                  <td style={{fontSize:13}}>
                    {l.profiles ? `${l.profiles.nome} ${l.profiles.cognome}` : <span style={{color:'var(--text3)'}}>Sistema</span>}
                  </td>
                  <td>
                    <span style={{fontSize:13}}>
                      {ACTION_ICONS[l.action]||'•'} {l.action}
                    </span>
                  </td>
                  <td style={{fontSize:12,color:'var(--text2)'}}>{l.entity||'—'}</td>
                  <td style={{fontSize:12,color:'var(--text3)',maxWidth:300,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}
                    title={l.details||''}>{l.details||'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* SQL per creare la tabella se non esiste */}
      {logs.length===0&&!loading&&(
        <div style={{marginTop:16,padding:'12px 16px',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:8,fontSize:12,color:'var(--text3)'}}>
          <strong>Per attivare il log attività</strong>, esegui in Supabase SQL Editor:
          <pre style={{marginTop:8,fontSize:11,overflowX:'auto',color:'var(--text2)'}}>
{`CREATE TABLE IF NOT EXISTS activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id),
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin only" ON activity_log
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );`}
          </pre>
        </div>
      )}
    </>
  )
}

// ─── Pagina Admin principale ──────────────────────────────────────────────────
export default function Admin() {
  const { profile } = useStore()
  const [tab, setTab] = useState('utenti')

  const TABS = [
    { id: 'utenti',   label: 'Gestione utenti', icon: Shield },
    { id: 'log',      label: 'Log attività',    icon: Activity },
  ]

  if (!profile?.is_admin) return (
    <>
      <Topbar title="Amministrazione"/>
      <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>
        <Empty icon="🔒" title="Accesso negato" sub="Solo gli amministratori possono accedere a questa sezione"/>
      </div>
    </>
  )

  return (
    <>
      <Topbar title="Amministrazione" subtitle="Gestione utenti e sistema"/>
      <div style={{flex:1,overflowY:'auto',padding:24}}>

        <div className="tabs" style={{marginBottom:24}}>
          {TABS.map(t=>(
            <div key={t.id} className={`tab ${tab===t.id?'active':''}`} onClick={()=>setTab(t.id)}>
              <t.icon size={13} style={{marginRight:6,verticalAlign:'middle'}}/>{t.label}
            </div>
          ))}
        </div>

        {tab==='utenti' && <TabUtenti profile={profile}/>}
        {tab==='log'    && <TabLog/>}
      </div>
    </>
  )
}
