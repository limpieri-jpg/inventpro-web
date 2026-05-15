import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { Topbar } from '../components/layout'
import { supabase } from '../lib/supabase'
import { Eye, EyeOff, Save, Key, Building, User } from 'lucide-react'

export default function Impostazioni() {
  const { profile, notify, fetchProfile } = useStore()
  const [tab, setTab] = useState('profilo')
  const [profilo, setProfilo] = useState({})
  const [saving, setSaving] = useState(false)
  const [studioNome, setStudioNome] = useState(localStorage.getItem('ip_studio_nome') || '')
  const [studioIndirizzo, setStudioIndirizzo] = useState(localStorage.getItem('ip_studio_indirizzo') || '')
  const [logoPreview, setLogoPreview] = useState(localStorage.getItem('ip_logo') || null)


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
    { id: 'api',     label: 'Chiave API AI',  icon: Key },
    { id: 'studio',  label: 'Studio / Logo',  icon: Building },
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

                <div className="form-section">Studio professionale</div>
                <div className="form-group"><label className="form-label">Indirizzo studio</label><input {...inp('stu_indirizzo')} /></div>
                <div className="form-group"><label className="form-label">N. civico</label><input {...inp('stu_civico')} /></div>
                <div className="form-group"><label className="form-label">CAP</label><input {...inp('stu_cap')} /></div>
                <div className="form-group"><label className="form-label">Città</label><input {...inp('stu_citta')} /></div>
                <div className="form-group"><label className="form-label">Provincia</label><input {...inp('stu_provincia')} maxLength={2} /></div>
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
          </div>
        )}
      </div>
    </>
  )
}
