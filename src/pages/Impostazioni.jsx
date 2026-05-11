import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { Topbar } from '../components/layout'
import { supabase } from '../lib/supabase'
import { Eye, EyeOff, Save, Key, Building, User, Image } from 'lucide-react'

export default function Impostazioni() {
  const { profile, notify, fetchProfile } = useStore()
  const [tab, setTab] = useState('profilo')
  const [profilo, setProfilo] = useState({})
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testingKey, setTestingKey] = useState(false)

  const [studioLogo, setStudioLogo] = useState(localStorage.getItem('ip_logo') || '')
  const [studioNome, setStudioNome] = useState(localStorage.getItem('ip_studio_nome') || '')

  useEffect(() => {
    if (profile) {
      setProfilo({ ...profile })
      setApiKey(localStorage.getItem('ip_apikey') || '')
    }
  }, [profile])

  const handleLogoUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const b64 = ev.target.result
      setStudioLogo(b64)
      localStorage.setItem('ip_logo', b64)
      notify('Logo salvato', 'ok')
    }
    reader.readAsDataURL(file)
  }

  const saveStudio = () => {
    localStorage.setItem('ip_studio_nome', studioNome)
    notify('Dati studio salvati', 'ok')
  }

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

  const saveApiKey = () => {
    if (!apiKey.trim()) { notify('Inserisci la chiave API', 'warn'); return }
    localStorage.setItem('ip_apikey', apiKey.trim())
    notify('Chiave API salvata', 'ok')
  }

  const testApiKey = async () => {
    if (!apiKey.trim()) { notify('Inserisci prima la chiave', 'warn'); return }
    setTestingKey(true)
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey.trim(),
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({ model: 'claude-sonnet-4-5-20250929', max_tokens: 10, messages: [{ role: 'user', content: 'test' }] })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error.message)
      notify('✅ Chiave API valida e funzionante!', 'ok', 4000)
    } catch (e) { notify('❌ Chiave non valida: ' + e.message, 'err', 5000) }
    finally { setTestingKey(false) }
  }

  const TABS = [
    { id: 'profilo', label: 'Profilo utente', icon: User },
    { id: 'studio',  label: 'Studio / Logo',  icon: Building },
    { id: 'api',     label: 'Chiave API AI',  icon: Key },
  ]

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

        {/* Studio */}
        {tab === 'studio' && (
          <div className="card">
            <div className="card-header"><div className="card-title">Studio / Logo</div></div>
            <div className="card-body">
              <div className="form-grid">
                <div className="form-section">Intestazione documenti</div>
                <div className="form-col-full form-group">
                  <label className="form-label">Nome studio / ragione sociale</label>
                  <input className="form-input" value={studioNome} onChange={e => setStudioNome(e.target.value)} placeholder="Es. Pro.Ges.S. Srl" />
                </div>
                <div className="form-col-full form-group">
                  <label className="form-label">Logo studio</label>
                  {studioLogo && (
                    <div style={{ marginBottom: 12 }}>
                      <img src={studioLogo} alt="Logo" style={{ maxHeight: 80, maxWidth: 220, objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 6, padding: 6 }} />
                    </div>
                  )}
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}>
                    <Image size={14} /> {studioLogo ? 'Cambia logo' : 'Carica logo'}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
                  </label>
                  {studioLogo && (
                    <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8, color: 'var(--accent-r)' }} onClick={() => { setStudioLogo(''); localStorage.removeItem('ip_logo') }}>Rimuovi</button>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>Il logo viene salvato localmente e usato nei report PDF e nei documenti generati.</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <button className="btn btn-primary" onClick={saveStudio}><Save size={13} /> Salva dati studio</button>
              </div>
            </div>
          </div>
        )}

        {/* Chiave API */}
        {tab === 'api' && (
          <div className="card">
            <div className="card-header"><div className="card-title">Chiave API Anthropic</div></div>
            <div className="card-body">
              <div className="alert alert-info" style={{ marginBottom: 20 }}>
                <div>
                  <strong>Come ottenere la chiave API:</strong><br />
                  1. Vai su <strong>console.anthropic.com</strong><br />
                  2. Accedi con il tuo account<br />
                  3. Vai su <strong>API Keys</strong> → <strong>Create Key</strong><br />
                  4. Copia la chiave e incollala qui sotto<br />
                  <span style={{ fontSize: 12, marginTop: 6, display: 'block', opacity: 0.8 }}>La chiave viene salvata localmente nel browser e non viene inviata ai nostri server.</span>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">API Key Anthropic</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showKey ? 'text' : 'password'}
                    className="form-input"
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder="sk-ant-api03-..."
                    style={{ paddingRight: 40, fontFamily: 'DM Mono, monospace', fontSize: 13 }}
                  />
                  <button onClick={() => setShowKey(s => !s)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}>
                    {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button className="btn btn-ghost" onClick={testApiKey} disabled={testingKey}>
                  {testingKey ? 'Test in corso…' : '🔍 Testa chiave'}
                </button>
                <button className="btn btn-primary" onClick={saveApiKey}>
                  <Save size={13} /> Salva chiave
                </button>
              </div>

              {apiKey && (
                <div style={{ marginTop: 20, padding: '10px 14px', background: 'rgba(0,200,150,0.06)', border: '1px solid rgba(0,200,150,0.15)', borderRadius: 8, fontSize: 12, color: 'var(--accent-g)' }}>
                  ✅ Chiave configurata — la generazione AI è attiva in Documenti e Contratti
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
