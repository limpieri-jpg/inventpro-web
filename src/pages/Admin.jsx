import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { Topbar, Spinner, Modal, Empty } from '../components/layout'
import { supabase } from '../lib/supabase'
import { Plus, Edit, Shield, ShieldOff, Eye, EyeOff, Key, Activity, Trash2, UserX, Mail, Send, CheckSquare, Square } from 'lucide-react'

function fmtDate(d) { if (!d) return '—'; return new Date(d).toLocaleDateString('it-IT') }

const TRIBUNALI_IT = [
  'Agrigento','Alba','Alessandria','Ancona','Aosta','Arezzo','Ariano Irpino','Ascoli Piceno',
  'Asti','Avellino','Avezzano','Bari','Barletta','Bassano del Grappa','Belluno','Benevento',
  'Bergamo','Biella','Bologna','Bolzano','Brescia','Brindisi','Busto Arsizio','Cagliari',
  'Caltagirone','Caltanissetta','Campobasso','Casale Monferrato','Cassino','Castrovillari',
  'Catania','Catanzaro','Chiavari','Chieti','Civitavecchia','Como','Cosenza','Cremona',
  'Crotone','Cuneo','Enna','Fermo','Ferrara','Firenze','Foggia','Forlì','Frosinone',
  'Genova','Gela','Grosseto','Imperia','Isernia',"L'Aquila",'La Spezia','Lamezia Terme',
  'Lanciano','Larino','Latina','Lecce','Lecco','Livorno','Locri','Lodi','Lucca','Lucera',
  'Macerata','Mantova','Marsala','Massa','Matera','Messina','Milano','Modena','Monza',
  'Napoli','Napoli Nord','Nola','Novara','Nuoro','Oristano','Padova','Palermo','Paola',
  'Parma','Pavia','Perugia','Pesaro','Pescara','Piacenza','Pisa','Pistoia','Pordenone',
  'Potenza','Prato','Ragusa','Ravenna','Reggio Calabria','Reggio Emilia','Rieti','Rimini',
  'Roma','Rossano','Rovereto','Rovigo','Salerno','Sassari','Savona','Sciacca','Siena',
  'Siracusa','Sondrio','Spoleto','Taranto','Tempio Pausania','Teramo','Terni','Torino',
  'Torre Annunziata','Trapani','Trento','Treviso','Trieste','Udine','Urbino','Varese',
  'Venezia','Vercelli','Verona','Vibo Valentia','Vicenza','Viterbo'
]
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
          is_admin: form.is_admin, is_active: form.is_active,
          tribunali: form.tribunali || []
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

        {/* Tribunali abilitati */}
        <div className="form-section" style={{gridColumn:'1/-1'}}>Tribunali abilitati</div>
        <div className="form-col-full">
          <div style={{fontSize:11,color:'var(--text3)',marginBottom:8}}>
            Seleziona i tribunali per cui questo utente è abilitato. Usato per filtrare le comunicazioni.
          </div>
          <div style={{maxHeight:200,overflowY:'auto',border:'1px solid var(--border)',borderRadius:8,padding:8,background:'var(--bg)',display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:4}}>
            {TRIBUNALI_IT.map(t => {
              const sel = (form.tribunali||[]).includes(t)
              return (
                <label key={t} style={{display:'flex',alignItems:'center',gap:6,padding:'4px 6px',borderRadius:6,cursor:'pointer',background:sel?'rgba(59,111,255,0.1)':'transparent',fontSize:12}}>
                  <input type="checkbox" checked={sel}
                    onChange={e => set('tribunali', e.target.checked
                      ? [...(form.tribunali||[]), t]
                      : (form.tribunali||[]).filter(x=>x!==t)
                    )}/>
                  {t}
                </label>
              )
            })}
          </div>
          {(form.tribunali||[]).length > 0 && (
            <div style={{marginTop:6,fontSize:11,color:'var(--accent)'}}>
              {(form.tribunali||[]).length} tribunali selezionati
            </div>
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
  const [resetting, setResetting]   = useState(null)
  const [showProc, setShowProc]     = useState(false)
  const [procUser, setProcUser]     = useState(null)

  useEffect(() => { loadUsers() }, [])

  const loadUsers = async () => {
    setLoading(true)
    // Usa rpc per bypassare RLS e leggere tutti gli utenti (attivi e inattivi)
    const { data, error } = await supabase.rpc('get_all_profiles')
    if (error) {
      // Fallback alla query diretta se la RPC non esiste ancora
      const { data: data2 } = await supabase.from('profiles').select('*').order('cognome')
      setUsers(data2 || [])
    } else {
      setUsers((data || []).sort((a,b) => (a.cognome||'').localeCompare(b.cognome||'')))
    }
    setLoading(false)
  }

  const toggleAdmin = async (user) => {
    const { error } = await supabase.from('profiles').update({ is_admin: !user.is_admin }).eq('id', user.id)
    if (error) { notify('Errore: ' + error.message, 'err'); return }
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_admin: !u.is_admin } : u))
    notify(user.is_admin ? 'Rimosso da admin' : 'Promosso ad admin', 'ok')
  }

  const toggleActive = async (user) => {
    const { error } = await supabase.from('profiles').update({ is_active: !user.is_active }).eq('id', user.id)
    if (error) { notify('Errore: ' + error.message, 'err'); return }
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: !u.is_active } : u))
    notify(user.is_active ? 'Utente disattivato' : 'Utente attivato', 'ok')
  }

  const eliminaUtente = async (user) => {
    if (!confirm(`Eliminare definitivamente ${user.nome} ${user.cognome}?\nL'utente perderà l'accesso e tutti i suoi dati saranno rimossi.`)) return
    try {
      // Elimina profilo (le procedure_utenti vengono eliminate in cascade)
      await supabase.from('profiles').delete().eq('id', user.id)
      // Elimina utente auth tramite Admin API
      const { data: { session } } = await supabase.auth.getSession()
      await fetch(`https://gsmhhmyxpqwmssfdeslf.supabase.co/auth/v1/admin/users/${user.id}`, {
        method: 'DELETE',
        headers: {
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${session?.access_token}`
        }
      })
      setUsers(prev => prev.filter(u => u.id !== user.id))
      notify('Utente eliminato', 'ok')
    } catch(e) { notify('Errore: ' + e.message, 'err') }
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
      {/* Stats — riga compatta */}
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
        {[
          ['Totali', users.length, 'var(--accent-b)'],
          ['Admin', users.filter(u=>u.is_admin).length, 'var(--accent-y)'],
          ['Attivi', users.filter(u=>u.is_active!==false).length, 'var(--accent-g)'],
          ['Inattivi', users.filter(u=>u.is_active===false).length, 'var(--accent-r)'],
        ].map(([label, val, color]) => (
          <div key={label} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 14px',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:8,fontSize:13}}>
            <span style={{fontWeight:700,color,fontSize:16}}>{val}</span>
            <span style={{color:'var(--text3)'}}>{label}</span>
          </div>
        ))}
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
                  <td style={{fontWeight:500,opacity:u.is_active===false?0.5:1}}>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <div style={{width:32,height:32,borderRadius:'50%',
                        background:u.is_active===false?'var(--text3)':'var(--accent)',
                        display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'#fff',flexShrink:0}}>
                        {u.is_active===false ? <UserX size={14}/> : (u.nome?.[0]||'')+(u.cognome?.[0]||'')}
                      </div>
                      <div>
                        <div style={{textDecoration:u.is_active===false?'line-through':'none',color:u.is_active===false?'var(--text3)':'inherit'}}>
                          {u.titolo?u.titolo+' ':''}{u.nome} {u.cognome}
                        </div>
                        {u.is_active===false && <div style={{fontSize:11,color:'var(--accent-r)',fontWeight:600}}>⚠ Utente disattivato</div>}
                        {u.tel&&u.is_active!==false&&<div style={{fontSize:11,color:'var(--text3)'}}>{u.tel}</div>}
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
                      <button className="btn btn-ghost btn-sm" title="Procedure assegnate"
                        style={{color:'var(--accent-b)'}} onClick={()=>{setProcUser(u);setShowProc(true)}}>
                        <Activity size={13}/>
                      </button>
                      <button className="btn btn-ghost btn-sm" title="Reset password"
                        disabled={resetting===u.id} style={{color:'var(--text3)'}}
                        onClick={()=>resetPassword(u)}><Key size={13}/></button>
                      {u.id!==profile.id&&(
                        <>
                          <button className="btn btn-ghost btn-sm"
                            title={u.is_active!==false?'Disattiva':'Attiva'}
                            style={{color:u.is_active!==false?'var(--accent-r)':'var(--accent-g)'}}
                            onClick={()=>toggleActive(u)}>
                            {u.is_active!==false?<EyeOff size={13}/>:<Eye size={13}/>}
                          </button>
                          <button className="btn btn-ghost btn-sm"
                            title="Elimina utente"
                            style={{color:'var(--accent-r)'}}
                            onClick={()=>eliminaUtente(u)}>
                            <Trash2 size={13}/>
                          </button>
                        </>
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

      <Modal open={showProc} onClose={()=>setShowProc(false)}
        title="Procedure assegnate" wide>
        {procUser && <ProcedureUtente user={procUser} onClose={()=>setShowProc(false)}/>}
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


// ─── Modal procedure assegnate ad un utente ───────────────────────────────────
function ProcedureUtente({ user, onClose }) {
  const { notify } = useStore()
  const [tutte, setTutte]           = useState([])
  const [assegnate, setAssegnate]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(null)
  const [search, setSearch]         = useState('')

  useEffect(() => { load() }, [user.id])

  const load = async () => {
    setLoading(true)
    const { data: procs } = await supabase
      .from('procedure').select('id,nome,tipo,num,anno,tribunale,status').order('nome')
    // Usa RPC SECURITY DEFINER per bypassare RLS e leggere assegnazioni di qualsiasi utente
    const { data: ass, error: assErr } = await supabase
      .rpc('get_procedure_utente', { target_user_id: user.id })
    if (assErr) console.error('get_procedure_utente RPC error:', assErr.message)
    setTutte(procs || [])
    setAssegnate((ass || []).map(r => r.proc_id))
    setLoading(false)
  }

  const toggle = async (procId, isAssegnata) => {
    setSaving(procId)
    try {
      if (isAssegnata) {
        const { error } = await supabase.rpc('remove_procedura_utente', {
          target_user_id: user.id, target_proc_id: procId
        })
        if (error) throw error
        setAssegnate(a => a.filter(id => id !== procId))
        notify('Procedura rimossa', 'ok')
      } else {
        const { error } = await supabase.rpc('assign_procedura_utente', {
          target_user_id: user.id, target_proc_id: procId
        })
        if (error) throw error
        setAssegnate(a => [...a, procId])
        notify('Procedura assegnata', 'ok')
      }
    } catch(e) { notify('Errore: ' + e.message, 'err') }
    finally { setSaving(null) }
  }

  const assegnatutte = async () => {
    if (!confirm('Assegnare TUTTE le procedure a questo utente?')) return
    setSaving('all')
    const nuove = tutte.filter(p => !assegnate.includes(p.id))
    for (const p of nuove) {
      await supabase.rpc('assign_procedura_utente', {
        target_user_id: user.id, target_proc_id: p.id
      })
    }
    setAssegnate(tutte.map(p => p.id))
    setSaving(null)
    notify('Tutte le procedure assegnate', 'ok')
  }

  const filtered = tutte.filter(p =>
    !search || `${p.nome} ${p.tribunale||''} ${p.tipo||''}`.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div style={{marginBottom:12,padding:'10px 14px',background:'rgba(59,111,255,0.08)',border:'1px solid rgba(59,111,255,0.2)',borderRadius:8,fontSize:13}}>
        Utente: <strong>{user.titolo ? user.titolo + ' ' : ''}{user.nome} {user.cognome}</strong>
        {' — '}<span style={{color:'var(--text3)'}}>{assegnate.length} procedure assegnate su {tutte.length}</span>
      </div>

      <div style={{display:'flex',gap:10,marginBottom:14,alignItems:'center'}}>
        <input className="form-input" placeholder="Cerca procedura…" style={{maxWidth:280}}
          value={search} onChange={e=>setSearch(e.target.value)}/>
        <button className="btn btn-ghost btn-sm" onClick={assegnatutte} disabled={saving==='all'}>
          ✅ Assegna tutte
        </button>
      </div>

      {loading ? <Spinner/> : (
        <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:400,overflowY:'auto'}}>
          {filtered.map(p => {
            const ass = assegnate.includes(p.id)
            return (
              <div key={p.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',
                background: ass ? 'rgba(0,200,100,0.06)' : 'var(--bg)',
                border: `1px solid ${ass ? 'rgba(0,200,100,0.25)' : 'var(--border)'}`,
                borderRadius:8,cursor:'pointer',transition:'all 0.15s'}}
                onClick={()=>toggle(p.id, ass)}>
                <div style={{width:20,height:20,borderRadius:4,border:`2px solid ${ass?'var(--accent-g)':'var(--border)'}`,
                  background:ass?'var(--accent-g)':'transparent',display:'flex',alignItems:'center',
                  justifyContent:'center',flexShrink:0,fontSize:12,color:'#fff'}}>
                  {ass && '✓'}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:500,fontSize:13}}>{p.nome}</div>
                  <div style={{fontSize:11,color:'var(--text3)'}}>
                    {p.tipo||''}{p.num?' · N.'+p.num+(p.anno?'/'+p.anno:''):''}{p.tribunale?' · '+p.tribunale:''}
                    {p.status&&p.status!=='attiva'&&<span style={{color:'var(--accent-r)',marginLeft:6}}>({p.status})</span>}
                  </div>
                </div>
                {saving===p.id && <div className="spinner" style={{width:14,height:14}}/>}
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div style={{textAlign:'center',padding:24,color:'var(--text3)',fontSize:13}}>Nessuna procedura trovata</div>
          )}
        </div>
      )}
      <div style={{display:'flex',justifyContent:'flex-end',marginTop:16}}>
        <button className="btn btn-primary" onClick={onClose}>Chiudi</button>
      </div>
    </div>
  )
}


// ─── Tab Comunicazioni ────────────────────────────────────────────────────────
function TabComunicazioni() {
  const { notify } = useStore()
  const [users, setUsers]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [selezionati, setSelezionati] = useState([])
  const [filtroTribunale, setFiltroTribunale] = useState('')
  const [search, setSearch]         = useState('')
  const [oggetto, setOggetto]       = useState('')
  const [corpo, setCorpo]           = useState('')
  const [inviando, setInviando]     = useState(false)
  const [risultato, setRisultato]   = useState(null)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.rpc('get_all_profiles')
      setUsers((data||[]).filter(u=>u.email && u.is_active!==false).sort((a,b)=>(a.cognome||'').localeCompare(b.cognome||'')))
      setLoading(false)
    }
    load()
  }, [])

  // Tribunali disponibili — unione di tutti i tribunali degli utenti
  const tribunali = [...new Set(users.flatMap(u => u.tribunali||[]))].sort()

  const filtered = users.filter(u => {
    const txt = `${u.nome} ${u.cognome} ${u.email}`.toLowerCase()
    const matchSearch = !search || txt.includes(search.toLowerCase())
    const matchTrib = !filtroTribunale || (u.tribunali||[]).includes(filtroTribunale)
    return matchSearch && matchTrib
  })

  const toggleUser = (id) => setSelezionati(s => s.includes(id) ? s.filter(x=>x!==id) : [...s, id])
  const selezionaTutti = () => setSelezionati(filtered.map(u=>u.id))
  const deselezionaTutti = () => setSelezionati([])
  const tuttiSelezionati = filtered.length > 0 && filtered.every(u => selezionati.includes(u.id))

  const invia = async () => {
    if (!selezionati.length) { notify('Seleziona almeno un destinatario', 'warn'); return }
    if (!oggetto.trim()) { notify('Inserisci un oggetto', 'warn'); return }
    if (!corpo.trim()) { notify('Inserisci il corpo del messaggio', 'warn'); return }
    setInviando(true)
    setRisultato(null)
    try {
      const destinatari = users.filter(u => selezionati.includes(u.id))
        .map(u => ({ email: u.email, nome: u.nome, cognome: u.cognome, titolo: u.titolo }))
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ destinatari, oggetto, corpo })
        }
      )
      const data = await res.json()
      if (data.ok) {
        setRisultato({ ok: true, inviati: data.inviati, errori: data.errori, errors: data.errors })
        notify(`✅ ${data.inviati} email inviate${data.errori>0?' ('+data.errori+' errori)':''}`, 'ok', 5000)
        if (data.errori === 0) { setOggetto(''); setCorpo(''); setSelezionati([]) }
      } else {
        throw new Error(data.error)
      }
    } catch(e) { notify('Errore: ' + e.message, 'err') }
    finally { setInviando(false) }
  }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div className="card">
        <div className="card-header"><div className="card-title">📧 Nuova comunicazione</div></div>
        <div className="card-body" style={{display:'flex',flexDirection:'column',gap:12}}>
          <div className="form-group">
            <label className="form-label">Oggetto *</label>
            <input className="form-input" value={oggetto} onChange={e=>setOggetto(e.target.value)} placeholder="Es: Aggiornamento procedura — nuovo avviso di vendita"/>
          </div>
          <div className="form-group">
            <label className="form-label">Messaggio *</label>
            <textarea className="form-input" value={corpo} onChange={e=>setCorpo(e.target.value)}
              rows={8} style={{resize:'vertical',fontFamily:'inherit',lineHeight:1.7}}
              placeholder="Testo del messaggio… Puoi usare a capo per separare i paragrafi."/>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">👥 Destinatari</div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <span style={{fontSize:12,color:'var(--text3)'}}>{selezionati.length} selezionati</span>
            <button className="btn btn-ghost btn-sm" onClick={tuttiSelezionati?deselezionaTutti:selezionaTutti}>
              {tuttiSelezionati ? <><CheckSquare size={13}/> Deseleziona tutti</> : <><Square size={13}/> Seleziona tutti</>}
            </button>
          </div>
        </div>
        <div className="card-body">
          {/* Filtri */}
          <div style={{display:'flex',gap:10,marginBottom:12,flexWrap:'wrap'}}>
            <input className="form-input" placeholder="Cerca per nome o email…" style={{maxWidth:250}}
              value={search} onChange={e=>setSearch(e.target.value)}/>
            <select className="form-input" style={{maxWidth:200}} value={filtroTribunale} onChange={e=>setFiltroTribunale(e.target.value)}>
              <option value="">Tutti i tribunali</option>
              {tribunali.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Lista utenti */}
          {loading ? <div style={{textAlign:'center',padding:16,color:'var(--text3)'}}>Caricamento…</div> : (
            <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:350,overflowY:'auto'}}>
              {filtered.map(u => {
                const sel = selezionati.includes(u.id)
                return (
                  <div key={u.id} onClick={()=>toggleUser(u.id)}
                    style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',
                      background:sel?'rgba(59,111,255,0.08)':'var(--bg)',
                      border:`1px solid ${sel?'rgba(59,111,255,0.3)':'var(--border)'}`,
                      borderRadius:8,cursor:'pointer'}}>
                    <div style={{width:18,height:18,borderRadius:4,border:`2px solid ${sel?'var(--accent)':'var(--border)'}`,
                      background:sel?'var(--accent)':'transparent',display:'flex',alignItems:'center',
                      justifyContent:'center',flexShrink:0,color:'#fff',fontSize:12}}>
                      {sel&&'✓'}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:500,fontSize:13}}>{u.titolo?u.titolo+' ':''}{u.nome} {u.cognome}</div>
                      <div style={{fontSize:11,color:'var(--text3)'}}>{u.email}{(u.tribunali||[]).length>0?' · '+(u.tribunali||[]).join(', '):''}</div>
                    </div>
                  </div>
                )
              })}
              {filtered.length===0&&<div style={{textAlign:'center',padding:16,color:'var(--text3)',fontSize:13}}>Nessun utente trovato</div>}
            </div>
          )}
        </div>
      </div>

      {risultato && (
        <div style={{padding:'12px 16px',background:risultato.ok?'rgba(0,200,100,0.08)':'rgba(255,80,80,0.08)',
          border:`1px solid ${risultato.ok?'rgba(0,200,100,0.3)':'rgba(255,80,80,0.3)'}`,borderRadius:8,fontSize:13}}>
          {risultato.ok ? `✅ ${risultato.inviati} email inviate con successo${risultato.errori>0?' — '+risultato.errori+' errori':''}.` : '❌ Errore invio'}
          {risultato.errors?.map((e,i)=><div key={i} style={{fontSize:12,color:'var(--accent-r)',marginTop:4}}>• {e.email}: {e.error}</div>)}
        </div>
      )}

      <div style={{display:'flex',justifyContent:'flex-end'}}>
        <button className="btn btn-primary" onClick={invia} disabled={inviando||!selezionati.length||!oggetto||!corpo}>
          <Send size={14}/> {inviando?'Invio in corso…':`Invia a ${selezionati.length} destinatar${selezionati.length===1?'io':'i'}`}
        </button>
      </div>
    </div>
  )
}

// ─── Pagina Admin principale ──────────────────────────────────────────────────
export default function Admin() {
  const { profile } = useStore()
  const [tab, setTab] = useState('utenti')

  const TABS = [
    { id: 'utenti',        label: 'Gestione utenti',  icon: Shield },
    { id: 'comunicazioni', label: 'Comunicazioni',     icon: Mail },
    { id: 'log',           label: 'Log attività',      icon: Activity },
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

        {tab==='utenti'        && <TabUtenti profile={profile}/>}
        {tab==='comunicazioni' && <TabComunicazioni/>}
        {tab==='log'           && <TabLog/>}
      </div>
    </>
  )
}
