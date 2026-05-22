import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { Topbar } from '../components/layout'
import { supabase } from '../lib/supabase'
import { Eye, EyeOff, Save, Key, Building, User, Plus, Trash2 } from 'lucide-react'

export default function Impostazioni() {
  const { profile, notify, fetchProfile } = useStore()
  const [tab, setTab] = useState('profilo')
  const [profilo, setProfilo] = useState({})
  const [saving, setSaving] = useState(false)
  const [studioNome, setStudioNome] = useState(localStorage.getItem('ip_studio_nome') || '')
  const [studioIndirizzo, setStudioIndirizzo] = useState(localStorage.getItem('ip_studio_indirizzo') || '')
  const [logoPreview, setLogoPreview] = useState(localStorage.getItem('ip_logo') || null)

  // Conti commissionario — salvati in localStorage (chiave ip_conti_commissionario)
  // Lettura diretta dal localStorage ogni volta che il tab studio viene montato
  const readConti = () => { try { return JSON.parse(localStorage.getItem('ip_conti_commissionario') || '[]') } catch { return [] } }
  const [contiCommiss, setContiCommiss] = useState(readConti)

  // Ricarica dal localStorage ogni volta che si apre il tab studio
  useEffect(() => {
    if (tab === 'studio') setContiCommiss(readConti())
  }, [tab])

  // Helper: aggiorna stato E salva subito in localStorage (autoSave)
  const setContiAndSave = (nuovi) => {
    setContiCommiss(nuovi)
    try { localStorage.setItem('ip_conti_commissionario', JSON.stringify(nuovi)) } catch {}
  }

  const addConto = () => setContiAndSave([...contiCommiss, { iban: '', banca: '', intestazione: '' }])
  const removeConto = (i) => setContiAndSave(contiCommiss.filter((_, j) => j !== i))
  const updateConto = (i, field, val) => setContiAndSave(contiCommiss.map((c, j) => j === i ? { ...c, [field]: val } : c))

  const salvaConti = () => {
    try {
      localStorage.setItem('ip_conti_commissionario', JSON.stringify(contiCommiss))
      notify('Conti commissionario salvati', 'ok')
    } catch(e) { notify('Errore: ' + e.message, 'err') }
  }


  useEffect(() => {
    if (profile) {
      setProfilo({ ...profile })
    }
  }, [profile])

  const set = (k, v) => setProfilo(p => ({ ...p, [k]: v }))
  const inp = (k, type = 'text') => ({ value: profilo[k] || '', type, onChange: e => set(k, e.target.value), className: 'form-input' })

  const saveProfilo = async () => {
    if (!profile?.id) { notify('Profilo non trovato — ricarica la pagina', 'err'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('profiles').upsert({ ...profilo, id: profile.id }).eq('id', profile.id)
      if (error) throw error
      await fetchProfile(profile.id)
      notify('Profilo aggiornato', 'ok')
    } catch (e) { notify('Errore: ' + e.message, 'err') }
    finally { setSaving(false) }
  }


  const TABS = [
    { id: 'profilo', label: 'Profilo utente', icon: User },
    ...(profile?.is_admin ? [
      { id: 'api',    label: 'Chiave API AI', icon: Key },
      { id: 'studio', label: 'Studio / Logo', icon: Building },
    ] : []),
  ]

  const salvaStudio = () => {
    localStorage.setItem('ip_studio_nome', studioNome.trim())
    localStorage.setItem('ip_studio_indirizzo', studioIndirizzo.trim())
    notify('Dati studio salvati', 'ok')
  }

  const handleLogo = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const b64 = ev.target.result
      localStorage.setItem('ip_logo', b64)
      setLogoPreview(b64)
      notify('Logo salvato', 'ok')
    }
    reader.readAsDataURL(file)
  }

  const rimuoviLogo = () => {
    localStorage.removeItem('ip_logo')
    setLogoPreview(null)
    notify('Logo rimosso', 'ok')
  }

  return (
    <>
      <Topbar title="Impostazioni" subtitle="Configura il tuo profilo e le integrazioni" />
      <div style={{ flex: 1, overflowY: 'auto', padding: 24, maxWidth: 720 }}>

        <div className="tabs" style={{ marginBottom: 24 }}>
          {TABS.map(t => (
            <div key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              <t.icon size={13} style={{ marginRight: 6, verticalAlign: 'middle' }} />{t.label}
            </div>
          ))}
        </div>

        {/* Profilo utente */}
        {tab === 'profilo' && (
          <div className="card">
            <div className="card-header"><div className="card-title">Dati profilo</div></div>
            <div className="card-body">
              <div className="form-grid">
                <div className="form-section">Dati personali</div>
                <div className="form-group"><label className="form-label">Titolo (es. Dott., Avv.)</label><input {...inp('titolo')} placeholder="Dott." /></div>
                <div className="form-group"><label className="form-label">Ruolo</label><input {...inp('ruolo')} placeholder="Curatore fallimentare" /></div>
                <div className="form-group"><label className="form-label">Nome *</label><input {...inp('nome')} /></div>
                <div className="form-group"><label className="form-label">Cognome *</label><input {...inp('cognome')} /></div>
                <div className="form-group"><label className="form-label">Codice Fiscale</label><input {...inp('cf')} placeholder="LLLNNN00A00A000A" style={{ textTransform: 'uppercase' }} /></div>
                <div className="form-group"><label className="form-label">Telefono</label><input {...inp('tel', 'tel')} /></div>
                <div className="form-group"><label className="form-label">Email di studio</label><input type="email" className="form-input" value={profilo.email||''} disabled style={{opacity:0.5}} /></div>
                <div className="form-group"><label className="form-label">PEC</label><input {...inp('pec', 'email')} placeholder="nome@pec.it" /></div>

                {profile?.is_admin && <>
                <div className="form-section">Studio professionale</div>
                <div className="form-group"><label className="form-label">Indirizzo studio</label><input {...inp('stu_indirizzo')} /></div>
                <div className="form-group"><label className="form-label">N. civico</label><input {...inp('stu_civico')} /></div>
                <div className="form-group"><label className="form-label">CAP</label><input {...inp('stu_cap')} /></div>
                <div className="form-group"><label className="form-label">Città</label><input {...inp('stu_citta')} /></div>
                <div className="form-group"><label className="form-label">Provincia</label><input {...inp('stu_provincia')} maxLength={2} /></div>
                </>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <button className="btn btn-primary" onClick={saveProfilo} disabled={saving}>
                  <Save size={13} /> {saving ? 'Salvataggio…' : 'Salva profilo'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Chiave API */}
        {tab === 'api' && (
          <div className="card">
            <div className="card-header"><div className="card-title">Chiave API AI</div></div>
            <div className="card-body">
              <div style={{display:'flex',alignItems:'center',gap:16,padding:'16px 20px',background:'rgba(0,200,150,0.06)',border:'1px solid rgba(0,200,150,0.2)',borderRadius:10,marginBottom:20}}>
                <span style={{fontSize:28}}>✅</span>
                <div>
                  <div style={{fontWeight:600,fontSize:14,color:'var(--accent-g)'}}>AI attiva e configurata</div>
                  <div style={{fontSize:13,color:'var(--text2)',marginTop:2}}>La chiave API Anthropic è configurata in modo sicuro sul server. Non è necessario inserirla manualmente.</div>
                </div>
              </div>
              <div style={{fontSize:13,color:'var(--text3)',lineHeight:1.6}}>
                <p>Le funzionalità AI disponibili nell&apos;applicazione includono:</p>
                <ul style={{paddingLeft:20,marginTop:8}}>
                  <li>Analisi fotografica articoli e attribuzione valore commerciale/giudiziario</li>
                  <li>Generazione descrizione lotti di vendita</li>
                  <li>Redazione sezioni documenti (relazione particolareggiata, programma di liquidazione, rapporti)</li>
                  <li>Generazione testo avvisi di vendita</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {tab === 'studio' && (
          <div className="settings-section">
            <div className="card">
              <div className="card-header"><div className="card-title">🏢 Dati studio professionale</div></div>
              <div className="card-body">
                <div className="form-grid">
                  <div className="form-col-full form-group">
                    <label className="form-label">Nome studio / Ragione sociale</label>
                    <input className="form-input" value={studioNome} onChange={e=>setStudioNome(e.target.value)} placeholder="Es: Procedure Gestite e Servizi S.r.l." />
                  </div>
                  <div className="form-col-full form-group">
                    <label className="form-label">Indirizzo (per footer e carta intestata documenti)</label>
                    <input className="form-input" value={studioIndirizzo} onChange={e=>setStudioIndirizzo(e.target.value)} placeholder="Es: Via Giuseppe Parini, 29 - Lecco (LC) - 23900" />
                  </div>
                </div>
                <div style={{ display:'flex', justifyContent:'flex-end', marginTop:16 }}>
                  <button className="btn btn-primary" onClick={salvaStudio}><Save size={14} /> Salva dati studio</button>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-header"><div className="card-title">🖼 Logo studio (intestazione documenti)</div></div>
              <div className="card-body">
                {logoPreview && (
                  <div style={{ marginBottom:16 }}>
                    <div style={{ fontSize:12, color:'var(--text3)', marginBottom:8 }}>Logo attuale:</div>
                    <img src={logoPreview} alt="Logo" style={{ maxHeight:80, maxWidth:300, border:'1px solid var(--border)', borderRadius:6, padding:8, background:'white' }} />
                  </div>
                )}
                <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
                  <label className="btn btn-ghost" style={{ cursor:'pointer' }}>
                    📁 {logoPreview ? 'Cambia logo' : 'Carica logo'}
                    <input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={handleLogo} style={{ display:'none' }} />
                  </label>
                  {logoPreview && (
                    <button className="btn btn-ghost" onClick={rimuoviLogo} style={{ color:'var(--accent-r)' }}>
                      🗑 Rimuovi logo
                    </button>
                  )}
                </div>
                <div style={{ fontSize:11, color:'var(--text3)', marginTop:8 }}>
                  PNG, JPG o SVG. Il logo apparirà nell'intestazione di tutti i documenti generati.
                </div>
              </div>
            </div>

            {/* Conti commissionario */}
            <div className="card" style={{marginTop:16}}>
              <div className="card-header">
                <div className="card-title">🏦 Conti correnti commissionario</div>
                <button className="btn btn-ghost btn-sm" onClick={addConto}><Plus size={13}/> Aggiungi conto</button>
              </div>
              <div className="card-body">
                {contiCommiss.length === 0 ? (
                  <div style={{fontSize:13,color:'var(--text3)',padding:'8px 0'}}>
                    Nessun conto inserito. Aggiungi i conti IBAN del commissionario da usare negli avvisi di vendita.
                  </div>
                ) : (
                  <div style={{display:'flex',flexDirection:'column',gap:12}}>
                    {contiCommiss.map((cc, i) => (
                      <div key={i} style={{background:'var(--bg)',borderRadius:8,padding:'12px 14px',border:'1px solid var(--border)'}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                          <span style={{fontWeight:600,fontSize:13}}>Conto {i+1}</span>
                          <button className="btn btn-ghost btn-sm" style={{color:'var(--accent-r)'}} onClick={()=>removeConto(i)}>
                            <Trash2 size={13}/>
                          </button>
                        </div>
                        <div className="form-grid">
                          <div className="form-col-full form-group">
                            <label className="form-label">IBAN</label>
                            <input className="form-input" value={cc.iban} onChange={e=>updateConto(i,'iban',e.target.value)}
                              placeholder="IT00 X000 0000 0000 0000 0000 000" style={{fontFamily:'monospace'}}/>
                          </div>
                          <div className="form-group">
                            <label className="form-label">Banca</label>
                            <input className="form-input" value={cc.banca} onChange={e=>updateConto(i,'banca',e.target.value)}
                              placeholder="Es. Deutsche Bank"/>
                          </div>
                          <div className="form-group">
                            <label className="form-label">Intestazione</label>
                            <input className="form-input" value={cc.intestazione} onChange={e=>updateConto(i,'intestazione',e.target.value)}
                              placeholder="Es. Mario Rossi — Liquidazione X"/>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{display:'flex',justifyContent:'flex-end',marginTop:16,gap:10}}>
                  <button className="btn btn-ghost btn-sm" onClick={addConto}><Plus size={13}/> Aggiungi conto</button>
                  <button className="btn btn-primary" onClick={salvaConti}>
                    <Save size={13}/> Salva conti commissionario
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
