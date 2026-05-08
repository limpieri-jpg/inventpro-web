import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Topbar, Spinner, Modal, Empty } from '../components/layout'
import { supabase } from '../lib/supabase'
import { Plus, Search, X, Trash2, Camera, Download, Sparkles, AlertTriangle } from 'lucide-react'

function fmtEur(n) { return n ? '€ ' + Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—' }

// ── Costanti SIECIC ────────────────────────────────────────────────────────
const SIECIC_TIPOLOGIE = ['BENE MOBILE','BENE MOBILE REGISTRATO','BENE IMMOBILE','CREDITO','PARTECIPAZIONE','BENE IMMATERIALE','AZIENDA/RAMO D\'AZIENDA','ALTRO']
const SIECIC_CODICI = {
  'BENE MOBILE': {'Arredi ufficio':'702.010','Arredi negozio':'702.020','Macchinari industriali':'702.030','Attrezzature':'702.040','Informatica e elettronica':'702.050','Utensili e attrezzi':'702.060','Merci e scorte':'702.070','Materie prime':'702.080','Prodotti finiti':'702.090','Altro':'702.999'},
  'BENE MOBILE REGISTRATO': {'Autovettura':'703.010','Autocarro':'703.020','Motoveicolo':'703.030','Natante':'703.040','Aeromobile':'703.050','Macchina operatrice':'703.060','Altro':'703.999'},
  'BENE IMMOBILE': {'Capannone':'701.010','Ufficio':'701.020','Negozio':'701.030','Abitazione':'701.040','Terreno':'701.050','Altro':'701.999'},
  'CREDITO': {'Credito commerciale':'705.010','Credito finanziario':'705.020','Deposito bancario':'705.030','Altro':'705.999'},
  'PARTECIPAZIONE': {'Quota s.r.l.':'706.010','Azioni s.p.a.':'706.020','Altra partecipazione':'706.999'},
  'BENE IMMATERIALE': {'Brevetto':'707.010','Marchio':'707.020','Software':'707.030','Licenza':'707.040','Avviamento':'707.050','Altro':'707.999'},
  'AZIENDA/RAMO D\'AZIENDA': {'Azienda':'708.010','Ramo d\'azienda':'708.020'},
  'ALTRO': {'Altro':'709.999'}
}
const UM_LIST = ['UN','KG','Q','T','MT','MQ','MC','L','SET','LOTTO']
const STATI = ['ottimo','buono','discreto','da revisionare','non funzionante']

function exportCSV(articoli, procNome) {
  const rows = [['N.','Tipologia SIECIC','Categoria','Descrizione','Marca','Modello','Anno','U.M.','Q.tà','Val. Mercato (€)','Val. Giudiziario (€)','Stato','Danni','Note']]
  articoli.forEach((a, i) => {
    rows.push([i+1, a.tipologia_siecic||'', a.sottocategoria||'', a.desc_breve||'', a.marca||'', a.modello||'', a.anno_prod||'', a.unita_misura||'UN', a.qta||1, a.val_mercato||0, a.val_giud||0, a.stato||'', a.danni||'', a.note||''])
  })
  const tot = articoli.reduce((s,a) => s + Number(a.val_giud||0)*Number(a.qta||1), 0)
  rows.push(['','','','TOTALE','','','','','','',tot,'','',''])
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url
  a.download = 'Inventario_'+(procNome||'').replace(/[^a-zA-Z0-9]/g,'_')+'.csv'
  a.click(); setTimeout(() => URL.revokeObjectURL(url), 3000)
}

// ── Form articolo ─────────────────────────────────────────────────────────
// ── Form articolo ─────────────────────────────────────────────────────────
function ArticoloForm({ articolo, procId, onSave, onClose }) {
  const { notify } = useStore()
  const [tab, setTab] = useState('dati')
  const [form, setForm] = useState({
    tipologia_siecic: 'BENE MOBILE', sottocategoria: 'Macchinari industriali',
    desc_breve: '', desc_estesa: '', marca: '', modello: '', anno_prod: '',
    matricola: '', targa: '', unita_misura: 'UN', qta: 1,
    val_mercato: 0, val_giud: 0, stato: 'buono', danni: '', note: '',
    ...articolo
  })
  const [photos, setPhotos] = useState([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [tempId] = useState(() => {
    if (articolo?.id) return articolo.id
    // Genera UUID v4 per articoli nuovi (compatibile con colonna UUID Supabase)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
    })
  })
  const artId = articolo?.id || tempId

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const inp = (k, type='text') => ({ value: form[k]??'', type, onChange: e => set(k, e.target.value), className: 'form-input' })
  const sottocategorie = Object.keys(SIECIC_CODICI[form.tipologia_siecic] || {})

  useEffect(() => {
    supabase.from('foto').select('*').eq('articolo_id', artId).order('sort_order')
      .then(({ data }) => { if (data) setPhotos(data) })
  }, [artId])

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setUploading(true)
    try {
      for (const file of files) {
        const ext = file.name.split('.').pop()
        const path = `${procId}/${artId}/${Date.now()}.${ext}`
        await supabase.storage.from('foto-inventario').upload(path, file)
        const { data: { publicUrl } } = supabase.storage.from('foto-inventario').getPublicUrl(path)
        await supabase.from('foto').insert({ articolo_id: artId, proc_id: procId, storage_path: path, url: publicUrl, sort_order: photos.length })
      }
      // Ricarica le foto dal DB usando artId
      const { data: fotoData } = await supabase.from('foto').select('*').eq('articolo_id', artId).order('sort_order')
      if (fotoData && fotoData.length > 0) {
        setPhotos(fotoData)
        notify(`${fotoData.length} foto caricate`, 'ok')
      } else {
        // Fallback: ricostruisci le foto dall'URL pubblico senza passare per DB
        notify('Foto caricate', 'ok')
      }
    } catch (err) { notify('Errore upload: ' + err.message, 'err') }
    finally { setUploading(false) }
  }

  const deletePhoto = async (foto) => {
    await supabase.storage.from('foto-inventario').remove([foto.storage_path])
    await supabase.from('foto').delete().eq('id', foto.id)
    setPhotos(p => p.filter(f => f.id !== foto.id))
  }

  const analizzaConAI = async () => {
    const apiKey = localStorage.getItem('ip_apikey') || ''
    if (!apiKey) { notify('Configura la chiave API in Impostazioni', 'warn'); return }
    if (photos.length === 0 && !form.desc_breve) { notify('Carica almeno una foto o inserisci una descrizione', 'warn'); return }
    setAnalyzing(true)
    try {
      const imgs = photos.slice(0, 5).map(f => ({ type: 'image', source: { type: 'url', url: f.url } }))
      const dati = [
        form.desc_breve && `Descrizione: ${form.desc_breve}`,
        form.marca && `Marca: ${form.marca}`,
        form.modello && `Modello: ${form.modello}`,
        form.anno_prod && `Anno: ${form.anno_prod}`,
        form.matricola && `Matricola: ${form.matricola}`,
        form.targa && `Targa: ${form.targa}`,
      ].filter(Boolean).join('\n')

      const prompt = `Sei un perito esperto in valutazioni per procedure concorsuali italiane.
Analizza ${photos.length > 0 ? 'le foto e ' : ''}i dati forniti e restituisci una valutazione professionale.
${dati ? `\nDATI GIÀ INSERITI (usali come priorità):\n${dati}` : ''}

CATEGORIE SIECIC DISPONIBILI:
${Object.entries(SIECIC_CODICI).map(([t, cats]) => `${t}: ${Object.keys(cats).join(', ')}`).join('\n')}

Rispondi SOLO con JSON valido:
{
  "tipologia_siecic": "tipologia SIECIC",
  "sottocategoria": "sottocategoria della tipologia",
  "desc_breve": "descrizione sintetica professionale max 80 caratteri",
  "desc_estesa": "descrizione tecnica dettagliata per perizia 200-400 caratteri",
  "marca": "marca se identificabile altrimenti stringa vuota",
  "modello": "modello se identificabile altrimenti stringa vuota",
  "anno_prod": "anno stimato altrimenti stringa vuota",
  "matricola": "matricola o seriale se visibile altrimenti stringa vuota",
  "stato": "uno tra: ottimo, buono, discreto, da revisionare, non funzionante",
  "danni": "descrizione danni usura anomalie visibili - vuoto se assenti",
  "val_mercato": valore mercato intero in euro,
  "val_giud": valore giudiziario intero in euro tipicamente 20-40 percento meno del mercato,
  "note": "note tecniche accessori certificazioni"
}`

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-opus-4-5',
          max_tokens: 1000,
          messages: [{ role: 'user', content: [...imgs, { type: 'text', text: prompt }] }]
        })
      })
      const data = await res.json()
      const text = data.content?.[0]?.text || ''
      const json = JSON.parse(text.replace(/```json|```/g, '').trim())
      setForm(f => ({
        ...f,
        tipologia_siecic: json.tipologia_siecic || f.tipologia_siecic,
        sottocategoria: json.sottocategoria || f.sottocategoria,
        desc_breve: f.desc_breve || json.desc_breve || '',
        desc_estesa: f.desc_estesa || json.desc_estesa || '',
        marca: f.marca || json.marca || '',
        modello: f.modello || json.modello || '',
        anno_prod: f.anno_prod || json.anno_prod || '',
        matricola: f.matricola || json.matricola || '',
        stato: json.stato || f.stato,
        danni: json.danni || f.danni || '',
        val_mercato: json.val_mercato || f.val_mercato,
        val_giud: json.val_giud || f.val_giud,
        note: f.note || json.note || '',
      }))
      if (json.danni) setTab('danni')
      notify('Analisi AI completata — verifica i valori generati', 'ok', 5000)
    } catch (e) { notify('Errore AI: ' + e.message, 'err') }
    finally { setAnalyzing(false) }
  }

  const handleSave = async () => {
    if (!form.desc_breve) { notify('Inserisci la descrizione', 'warn'); return }
    setSaving(true)
    try {
      const { id: _id, created_at, updated_at, prima_foto_path, prima_foto_url, n_foto, ...payload } = form
      let saved
      if (articolo?.id) {
        const { data, error } = await supabase.from('articoli').update(payload).eq('id', articolo.id).select().single()
        if (error) throw error
        saved = data
      } else {
        const { data: { user } } = await supabase.auth.getUser()
        const { data, error } = await supabase.from('articoli').insert({ ...payload, proc_id: procId, owner_id: user.id }).select().single()
        if (error) throw error
        saved = data
        // Aggiorna foto temporanee con ID reale
        if (photos.length > 0) {
          await supabase.from('foto').update({ articolo_id: saved.id }).eq('articolo_id', artId)
          for (const foto of photos) {
            const newPath = foto.storage_path.replace(artId, saved.id)
            try {
              await supabase.storage.from('foto-inventario').move(foto.storage_path, newPath)
              await supabase.from('foto').update({ storage_path: newPath }).eq('id', foto.id)
            } catch (_) {}
          }
        }
      }
      notify('Articolo salvato', 'ok')
      onSave(saved)
    } catch (e) { notify('Errore: ' + e.message, 'err') }
    finally { setSaving(false) }
  }

  const TABS = [
    { id: 'dati', label: '📷 Foto, AI & Dati' },
    { id: 'valori', label: '💶 Valori' },
    { id: 'danni', label: `⚠️ Danni${form.danni ? ' ●' : ''}` },
  ]

  return (
    <div>
      <div className="tabs" style={{ marginBottom: 20 }}>
        {TABS.map(t => <div key={t.id} className={`tab ${tab===t.id?'active':''}`} onClick={() => setTab(t.id)}>{t.label}</div>)}
      </div>

      {tab === 'dati' && (
        <div>
          {/* Sezione foto */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
              {photos.map(f => (
                <div key={f.id} style={{ position: 'relative', width: 110, height: 85 }}>
                  <img src={f.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                  <button onClick={() => deletePhoto(f)} style={{ position: 'absolute', top: 3, right: 3, background: 'rgba(255,77,106,0.85)', border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={11} color="#fff" />
                  </button>
                </div>
              ))}
              <label style={{ width: 110, height: 85, border: '2px dashed var(--border)', borderRadius: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text3)', gap: 5 }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                <Camera size={22} />
                <span style={{ fontSize: 11 }}>{uploading ? 'Carico…' : '+ Foto'}</span>
                <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handlePhotoUpload} disabled={uploading} />
              </label>
            </div>
            <button className="btn btn-primary btn-sm" onClick={analizzaConAI} disabled={analyzing}>
              <Sparkles size={13} />
              {analyzing ? 'Analisi in corso…' : 'Analizza con AI'}
            </button>
            <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 10 }}>
              {photos.length > 0 ? `${photos.length} foto · ` : ''}Carica foto e/o inserisci dati poi clicca Analizza
            </span>
          </div>

          <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />

          {/* Campi dati */}
          <div className="form-grid">
            <div className="form-section">Classificazione SIECIC</div>
            <div className="form-group">
              <label className="form-label">Tipologia SIECIC</label>
              <select className="form-input" value={form.tipologia_siecic} onChange={e => { set('tipologia_siecic', e.target.value); set('sottocategoria', Object.keys(SIECIC_CODICI[e.target.value]||{})[0]||'') }}>
                {SIECIC_TIPOLOGIE.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Sottocategoria</label>
              <select className="form-input" value={form.sottocategoria} onChange={e => set('sottocategoria', e.target.value)}>
                {sottocategorie.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            {form.tipologia_siecic && form.sottocategoria && SIECIC_CODICI[form.tipologia_siecic]?.[form.sottocategoria] && (
              <div className="form-col-full" style={{ marginTop: -8, marginBottom: 4 }}>
                <span className="badge badge-blue">Codice SIECIC: {SIECIC_CODICI[form.tipologia_siecic][form.sottocategoria]}</span>
              </div>
            )}
            <div className="form-section">Descrizione</div>
            <div className="form-col-full form-group">
              <label className="form-label">Descrizione breve *</label>
              <input {...inp('desc_breve')} placeholder="Es. Tornio parallelo CNC marca Morando" />
            </div>
            <div className="form-col-full form-group">
              <label className="form-label">Descrizione estesa</label>
              <textarea className="form-input" value={form.desc_estesa||''} onChange={e => set('desc_estesa', e.target.value)} rows={4} placeholder="Descrizione tecnica dettagliata per la perizia…" />
            </div>
            <div className="form-section">Identificazione</div>
            <div className="form-group"><label className="form-label">Marca</label><input {...inp('marca')} /></div>
            <div className="form-group"><label className="form-label">Modello</label><input {...inp('modello')} /></div>
            <div className="form-group"><label className="form-label">Anno produzione</label><input {...inp('anno_prod')} /></div>
            <div className="form-group"><label className="form-label">Matricola / N. Seriale</label><input {...inp('matricola')} /></div>
            <div className="form-group"><label className="form-label">Targa</label><input {...inp('targa')} /></div>
            <div className="form-group">
              <label className="form-label">Stato</label>
              <select className="form-input" value={form.stato||'buono'} onChange={e => set('stato', e.target.value)}>
                {STATI.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-section">Quantità</div>
            <div className="form-group">
              <label className="form-label">Unità di misura</label>
              <select className="form-input" value={form.unita_misura||'UN'} onChange={e => set('unita_misura', e.target.value)}>
                {UM_LIST.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Quantità</label>
              <input type="number" className="form-input" value={form.qta??1} onChange={e => set('qta', e.target.value)} min="0" step="0.001" />
            </div>
            <div className="form-col-full form-group">
              <label className="form-label">Note</label>
              <textarea className="form-input" value={form.note||''} onChange={e => set('note', e.target.value)} rows={2} placeholder="Note aggiuntive…" />
            </div>
          </div>
        </div>
      )}

      {tab === 'valori' && (
        <div className="form-grid">
          <div className="form-section">Valutazione economica</div>
          <div style={{ gridColumn: '1/-1', padding: '10px 14px', background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.2)', borderRadius: 8, fontSize: 12, color: 'var(--accent-y)', marginBottom: 8 }}>
            ⚠️ Valori generabili automaticamente con l'AI (tab Foto, AI & Dati) oppure inseribili manualmente.
          </div>
          <div className="form-group">
            <label className="form-label">Valore di mercato (€)</label>
            <input type="number" className="form-input" value={form.val_mercato??0} onChange={e => set('val_mercato', e.target.value)} min="0" step="1" />
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>Valore per bene usato in normali condizioni di vendita</div>
          </div>
          <div className="form-group">
            <label className="form-label">Valore giudiziario (€)</label>
            <input type="number" className="form-input" value={form.val_giud??0} onChange={e => set('val_giud', e.target.value)} min="0" step="1" />
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>Valore in ottica di vendita forzata (tipicamente -20/40% del mercato)</div>
          </div>
          <div className="form-col-full">
            <div style={{ padding: '12px 16px', background: 'var(--bg3)', borderRadius: 8, display: 'flex', gap: 24, fontSize: 13 }}>
              <div>
                <span style={{ color: 'var(--text2)' }}>Abbattimento: </span>
                <strong style={{ color: 'var(--accent-y)' }}>
                  {form.val_mercato > 0 ? Math.round((1 - form.val_giud / form.val_mercato) * 100) + '%' : '—'}
                </strong>
              </div>
              <div>
                <span style={{ color: 'var(--text2)' }}>Tot. giudiziario: </span>
                <strong style={{ color: 'var(--accent-g)' }}>
                  {fmtEur(Number(form.val_giud||0) * Number(form.qta||1))}
                </strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'danni' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '10px 14px', background: 'rgba(255,77,106,0.06)', border: '1px solid rgba(255,77,106,0.15)', borderRadius: 8 }}>
            <AlertTriangle size={16} color="var(--accent-r)" />
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>
              Danni, anomalie e usura riscontrati. Separato dalla descrizione, usato nella relazione di stima.
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Danni e anomalie riscontrati</label>
            <textarea className="form-input" value={form.danni||''} onChange={e => set('danni', e.target.value)} rows={8}
              placeholder="Es: Presenza di ruggine superficiale sul piano di lavoro. Cinghia di trasmissione usurata…" />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
            Se presenti danni significativi, considera di abbassare il valore giudiziario nel tab Valori.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>
          {articolo?.id ? `ID: ${articolo.id.substring(0,8)}…` : 'Nuovo articolo'}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvataggio…' : articolo?.id ? 'Aggiorna' : 'Crea articolo'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Pagina principale ────────────────────────────────────────────────────────
export default function Inventario() {
  const { currentProc, notify } = useStore()
  const navigate = useNavigate()
  const [articoli, setArticoli] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tipFilter, setTipFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editArticolo, setEditArticolo] = useState(null)
  const [page, setPage] = useState(0)
  const PER_PAGE = 25

  useEffect(() => {
    if (!currentProc) { navigate('/procedure'); return }
    loadArticoli()
  }, [currentProc, search, tipFilter])

  const loadArticoli = useCallback(async () => {
    if (!currentProc) return
    setLoading(true)
    try {
      let q = supabase.from('v_articoli_con_foto').select('*').eq('proc_id', currentProc.id).order('sort_order')
      if (search) q = q.or(`desc_breve.ilike.%${search}%,marca.ilike.%${search}%`)
      if (tipFilter) q = q.eq('tipologia_siecic', tipFilter)
      const { data, error } = await q
      if (error) throw error
      setArticoli(data || [])
    } catch (e) { notify('Errore: ' + e.message, 'err') }
    finally { setLoading(false) }
  }, [currentProc, search, tipFilter])

  const deleteArticolo = async (id) => {
    if (!confirm('Eliminare questo articolo?')) return
    await supabase.from('articoli').delete().eq('id', id)
    loadArticoli(); notify('Articolo eliminato', 'ok')
  }

  const totValore = articoli.reduce((s, a) => s + (Number(a.val_giud||0) * Number(a.qta||1)), 0)
  const paginated = articoli.slice(page * PER_PAGE, (page+1) * PER_PAGE)
  const totalPages = Math.ceil(articoli.length / PER_PAGE)

  if (!currentProc) return null

  return (
    <>
      <Topbar
        title="Inventario"
        subtitle={currentProc.nome}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => exportCSV(articoli, currentProc?.nome)} disabled={articoli.length===0}>
              <Download size={14} /> Esporta CSV
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => { setEditArticolo(null); setShowForm(true) }}>
              <Plus size={14} /> Nuovo articolo
            </button>
          </div>
        }
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 20 }}>
          <div className="stat-card"><div className="stat-label">Totale articoli</div><div className="stat-value stat-blue">{articoli.length}</div></div>
          <div className="stat-card"><div className="stat-label">Valore giudiziario</div><div className="stat-value stat-green" style={{ fontSize: 18 }}>{totValore ? '€ '+totValore.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—'}</div></div>
          <div className="stat-card"><div className="stat-label">Con danni rilevati</div><div className="stat-value stat-yellow">{articoli.filter(a=>a.danni).length}</div></div>
        </div>

        <div className="filter-bar">
          <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
            <input className="form-input" placeholder="Cerca articolo, marca…" style={{ paddingLeft: 32 }}
              value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
          </div>
          <select className="filter-select" value={tipFilter} onChange={e => { setTipFilter(e.target.value); setPage(0) }}>
            <option value="">Tutte le tipologie</option>
            {SIECIC_TIPOLOGIE.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>

        <div className="table-card">
          {loading ? <Spinner /> : articoli.length === 0 ? (
            <Empty icon="📦" title="Nessun articolo" sub="Crea il primo articolo dell'inventario" />
          ) : (
            <>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 46 }}></th>
                    <th>Descrizione</th>
                    <th>SIECIC</th>
                    <th>Marca / Anno</th>
                    <th>Q.tà</th>
                    <th>Val. Giud.</th>
                    <th>Stato</th>
                    <th style={{ width: 50 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(a => (
                    <tr key={a.id} onClick={() => { setEditArticolo(a); setShowForm(true) }}>
                      <td onClick={e => e.stopPropagation()}>
                        {a.prima_foto_url
                          ? <img src={a.prima_foto_url} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)' }} />
                          : <div style={{ width: 36, height: 36, background: 'var(--bg3)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>📦</div>
                        }
                      </td>
                      <td style={{ fontWeight: 500 }}>
                        {a.desc_breve || '—'}
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>
                          {a.n_foto > 0 && `📷${a.n_foto} `}{a.danni && '⚠️ danni'}
                        </div>
                      </td>
                      <td><span className="badge badge-blue" style={{ fontSize: 10 }}>{a.sottocategoria || a.tipologia_siecic || '—'}</span></td>
                      <td className="muted">{[a.marca, a.anno_prod].filter(Boolean).join(' · ') || '—'}</td>
                      <td className="mono">{a.qta} {a.unita_misura}</td>
                      <td className="mono">{fmtEur(Number(a.val_giud||0)*Number(a.qta||1))}</td>
                      <td><span className={`badge ${a.stato==='ottimo'||a.stato==='buono'?'badge-green':a.stato==='discreto'?'badge-yellow':'badge-red'}`}>{a.stato||'—'}</span></td>
                      <td onClick={e => e.stopPropagation()}>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent-r)', padding: '4px 8px' }} onClick={() => deleteArticolo(a.id)}>
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {totalPages > 1 && (
                <div className="pagination">
                  <div className="pagination-info">{page*PER_PAGE+1}–{Math.min((page+1)*PER_PAGE,articoli.length)} di {articoli.length}</div>
                  <div className="pagination-btns">
                    <button className="page-btn" disabled={page===0} onClick={() => setPage(p=>p-1)}>←</button>
                    {Array.from({length:totalPages},(_,i) => <button key={i} className={`page-btn ${i===page?'active':''}`} onClick={() => setPage(i)}>{i+1}</button>)}
                    <button className="page-btn" disabled={page>=totalPages-1} onClick={() => setPage(p=>p+1)}>→</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editArticolo ? 'Modifica articolo' : 'Nuovo articolo'} wide>
        <ArticoloForm
          articolo={editArticolo}
          procId={currentProc.id}
          onClose={() => setShowForm(false)}
          onSave={() => { setShowForm(false); loadArticoli() }}
        />
      </Modal>
    </>
  )
}
