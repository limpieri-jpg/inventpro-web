import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Topbar, Spinner, Modal, Empty } from '../components/layout'
import { supabase } from '../lib/supabase'
import { Plus, Search, X, Trash2, Camera, Download } from 'lucide-react'

function fmtEur(n) { return n ? '€ ' + Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—' }

function exportXLSX(articoli, procNome) {
  const rows = [['N.', 'Descrizione', 'Marca', 'Modello', 'Categoria', 'U.M.', 'Quantità', 'Val. Unitario (€)', 'Val. Totale (€)', 'Stato', 'Note']]
  articoli.forEach((a, i) => {
    const vu = Number(a.val_giud || 0)
    const qt = Number(a.qta || 1)
    rows.push([i+1, a.desc_breve||'', a.marca||'', a.modello||'', a.categoria||'', a.unita_misura||'UN', qt, vu, vu*qt, a.stato||'', a.note||''])
  })
  const tot = articoli.reduce((s,a) => s + Number(a.val_giud||0)*Number(a.qta||1), 0)
  rows.push(['', 'TOTALE', '', '', '', '', '', '', tot, '', ''])

  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'Inventario_' + (procNome||'').replace(/[^a-zA-Z0-9]/g,'_') + '.csv'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

const CATEGORIE = [
  'Macchinari e impianti', 'Attrezzature', 'Arredi e ufficio', 'Veicoli e mezzi',
  'Informatica ed elettronica', 'Materie prime e scorte', 'Titoli e quote societarie', 'Altro'
]
const UM_LIST = ['UN', 'KG', 'MT', 'MQ', 'LT', 'SET', 'LOTTO']

function ArticoloForm({ articolo, procId, onSave, onClose }) {
  const { notify } = useStore()
  const [form, setForm] = useState({
    desc_breve: '', desc_estesa: '', marca: '', modello: '', categoria: 'Macchinari e impianti',
    unita_misura: 'UN', qta: 1, val_mercato: 0, val_giud: 0,
    stato: 'buono', note: '', matricola: '', anno_prod: '',
    ...articolo
  })
  const [photos, setPhotos] = useState([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generatingAI, setGeneratingAI] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const inp = (k, type = 'text') => ({ value: form[k] ?? '', type, onChange: e => set(k, e.target.value), className: 'form-input' })

  // Carica foto esistenti
  useEffect(() => {
    if (articolo?.id) {
      supabase.from('foto').select('*').eq('articolo_id', articolo.id).order('sort_order')
        .then(({ data }) => { if (data) setPhotos(data) })
    }
  }, [articolo?.id])

  const generaDescrizioneAI = async () => {
    const apiKey = localStorage.getItem('ip_apikey') || ''
    if (!apiKey) { notify('Configura la chiave API in Impostazioni', 'warn'); return }
    if (photos.length === 0) { notify('Carica almeno una foto prima di generare la descrizione', 'warn'); return }
    setGeneratingAI(true)
    try {
      // Prepara le immagini per l'API
      const imageContents = photos.slice(0, 4).map(foto => ({
        type: 'image',
        source: { type: 'url', url: foto.url }
      }))
      const prompt = `Analizza queste foto di un bene da inventariare in una procedura concorsuale italiana.
Rispondi SOLO con un JSON valido (nessun testo prima o dopo) con questi campi:
{
  "desc_breve": "descrizione sintetica del bene (max 60 caratteri)",
  "desc_estesa": "descrizione tecnica dettagliata del bene, caratteristiche, condizioni visibili (150-300 caratteri)",
  "marca": "marca/produttore se visibile, altrimenti stringa vuota",
  "modello": "modello se visibile, altrimenti stringa vuota",
  "categoria": "una di: Macchinari e impianti, Attrezzature, Arredi e ufficio, Veicoli e mezzi, Informatica ed elettronica, Materie prime e scorte, Altro",
  "stato": "una di: ottimo, buono, discreto, da revisionare, non funzionante",
  "note": "eventuali note su danni visibili, certificazioni CE visibili, targhe, numeri di serie visibili"
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
          max_tokens: 800,
          messages: [{ role: 'user', content: [...imageContents, { type: 'text', text: prompt }] }]
        })
      })
      const data = await res.json()
      const text = data.content?.[0]?.text || ''
      const json = JSON.parse(text.replace(/```json|```/g, '').trim())
      setForm(f => ({
        ...f,
        desc_breve: json.desc_breve || f.desc_breve,
        desc_estesa: json.desc_estesa || f.desc_estesa,
        marca: json.marca || f.marca,
        modello: json.modello || f.modello,
        categoria: json.categoria || f.categoria,
        stato: json.stato || f.stato,
        note: json.note || f.note,
      }))
      notify('Descrizione generata dall\'AI — verifica e correggi i campi', 'ok', 4000)
    } catch (e) {
      notify('Errore AI: ' + e.message, 'err')
    } finally {
      setGeneratingAI(false)
    }
  }

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setUploading(true)
    try {
      for (const file of files) {
        const ext = file.name.split('.').pop()
        const path = `${procId}/${articolo?.id || 'new'}/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('foto-inventario').upload(path, file)
        if (upErr) throw upErr
        const { data: { publicUrl } } = supabase.storage.from('foto-inventario').getPublicUrl(path)
        if (articolo?.id) {
          await supabase.from('foto').insert({ articolo_id: articolo.id, proc_id: procId, storage_path: path, url: publicUrl, sort_order: photos.length })
        }
      }
      if (articolo?.id) {
        const { data } = await supabase.from('foto').select('*').eq('articolo_id', articolo.id).order('sort_order')
        setPhotos(data || [])
      }
      notify('Foto caricate', 'ok')
    } catch (err) { notify('Errore upload: ' + err.message, 'err') }
    finally { setUploading(false) }
  }

  const deletePhoto = async (foto) => {
    await supabase.storage.from('foto-inventario').remove([foto.storage_path])
    await supabase.from('foto').delete().eq('id', foto.id)
    setPhotos(p => p.filter(f => f.id !== foto.id))
  }

  const handleSave = async () => {
    if (!form.desc_breve) { notify('Inserisci la descrizione', 'warn'); return }
    setSaving(true)
    try {
      let saved
      if (articolo?.id) {
        const { data, error } = await supabase.from('articoli').update(form).eq('id', articolo.id).select().single()
        if (error) throw error
        saved = data
      } else {
        const { data: { user } } = await supabase.auth.getUser()
        const { data, error } = await supabase.from('articoli').insert({ ...form, proc_id: procId, owner_id: user.id }).select().single()
        if (error) throw error
        saved = data
        // Carica foto per il nuovo articolo
        if (photos.length > 0) {
          notify('Articolo creato. Riapri per caricare le foto.', 'info', 4000)
        }
      }
      notify('Articolo salvato', 'ok')
      onSave(saved)
    } catch (e) { notify('Errore: ' + e.message, 'err') }
    finally { setSaving(false) }
  }

  return (
    <>
      <div className="form-grid">
        <div className="form-section">Foto articolo</div>
        <div className="form-col-full">
          {articolo?.id ? (
            <div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                {photos.map(f => (
                  <div key={f.id} style={{ position: 'relative', width: 90, height: 75 }}>
                    <img src={f.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
                    <button onClick={() => deletePhoto(f)} style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(255,77,106,0.9)', border: 'none', borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={10} color="#fff" />
                    </button>
                  </div>
                ))}
                <label style={{ width: 90, height: 75, border: '2px dashed var(--border)', borderRadius: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text3)', gap: 3 }}>
                  <Camera size={18} />
                  <span style={{ fontSize: 10 }}>{uploading ? 'Carico…' : '+ Foto'}</span>
                  <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handlePhotoUpload} disabled={uploading} />
                </label>
              </div>
              {photos.length > 0 && (
                <button type="button" className="btn btn-primary btn-sm" onClick={generaDescrizioneAI} disabled={generatingAI}
                  style={{ marginBottom: 8 }}>
                  ✨ {generatingAI ? 'Analisi AI in corso…' : 'Genera descrizione con AI dalle foto'}
                </button>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic', padding: '8px 0' }}>
              Salva prima l'articolo per poter caricare le foto e usare l'AI
            </div>
          )}
        </div>
      <div className="form-section">Descrizione</div>
        <div className="form-col-full form-group">
          <label className="form-label">Descrizione breve *</label>
          <input {...inp('desc_breve')} placeholder="Es. Tornio parallelo CNC" />
        </div>
        <div className="form-col-full form-group">
          <label className="form-label">Descrizione estesa</label>
          <textarea className="form-input" value={form.desc_estesa || ''} onChange={e => set('desc_estesa', e.target.value)} rows={3} placeholder="Dettagli aggiuntivi…" />
        </div>
        <div className="form-section">Identificazione</div>
        <div className="form-group"><label className="form-label">Marca</label><input {...inp('marca')} /></div>
        <div className="form-group"><label className="form-label">Modello</label><input {...inp('modello')} /></div>
        <div className="form-group"><label className="form-label">Anno produzione</label><input {...inp('anno_prod')} /></div>
        <div className="form-group"><label className="form-label">Matricola / Serial N.</label><input {...inp('matricola')} /></div>
        <div className="form-section">Classificazione e quantità</div>
        <div className="form-group">
          <label className="form-label">Categoria</label>
          <select className="form-input" value={form.categoria || ''} onChange={e => set('categoria', e.target.value)}>
            {CATEGORIE.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Stato</label>
          <select className="form-input" value={form.stato || ''} onChange={e => set('stato', e.target.value)}>
            {['ottimo', 'buono', 'discreto', 'da revisionare', 'non funzionante'].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Unità di misura</label>
          <select className="form-input" value={form.unita_misura || 'UN'} onChange={e => set('unita_misura', e.target.value)}>
            {UM_LIST.map(u => <option key={u}>{u}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Quantità</label>
          <input type="number" className="form-input" value={form.qta ?? 1} onChange={e => set('qta', e.target.value)} min="0" step="0.01" />
        </div>
        <div className="form-section">Valutazione</div>
        <div className="form-group">
          <label className="form-label">Valore di mercato (€)</label>
          <input type="number" className="form-input" value={form.val_mercato ?? 0} onChange={e => set('val_mercato', e.target.value)} min="0" step="0.01" />
        </div>
        <div className="form-group">
          <label className="form-label">Valore giudiziario (€)</label>
          <input type="number" className="form-input" value={form.val_giud ?? 0} onChange={e => set('val_giud', e.target.value)} min="0" step="0.01" />
        </div>
        <div className="form-col-full form-group">
          <label className="form-label">Note</label>
          <textarea className="form-input" value={form.note || ''} onChange={e => set('note', e.target.value)} rows={2} />
        </div>


      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
        <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Salvataggio…' : articolo?.id ? 'Aggiorna' : 'Crea articolo'}</button>
      </div>
    </>
  )
}

export default function Inventario() {
  const { currentProc, notify } = useStore()
  const navigate = useNavigate()
  const [articoli, setArticoli] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editArticolo, setEditArticolo] = useState(null)
  const [page, setPage] = useState(0)
  const PER_PAGE = 25

  useEffect(() => {
    if (!currentProc) { navigate('/procedure'); return }
    loadArticoli()
  }, [currentProc, search, catFilter])

  const loadArticoli = useCallback(async () => {
    if (!currentProc) return
    setLoading(true)
    try {
      let q = supabase.from('v_articoli_con_foto').select('*').eq('proc_id', currentProc.id).order('sort_order')
      if (search) q = q.or(`desc_breve.ilike.%${search}%,marca.ilike.%${search}%`)
      if (catFilter) q = q.eq('categoria', catFilter)
      const { data, error } = await q
      if (error) throw error
      setArticoli(data || [])
    } catch (e) { notify('Errore: ' + e.message, 'err') }
    finally { setLoading(false) }
  }, [currentProc, search, catFilter])

  const deleteArticolo = async (id) => {
    if (!confirm('Eliminare questo articolo?')) return
    await supabase.from('articoli').delete().eq('id', id)
    loadArticoli()
    notify('Articolo eliminato', 'ok')
  }

  const totValore = articoli.reduce((s, a) => s + (Number(a.val_giud || 0) * Number(a.qta || 1)), 0)
  const paginated = articoli.slice(page * PER_PAGE, (page + 1) * PER_PAGE)
  const totalPages = Math.ceil(articoli.length / PER_PAGE)

  if (!currentProc) return null

  return (
    <>
      <Topbar
        title="Inventario"
        subtitle={currentProc.nome}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => exportXLSX(articoli, currentProc?.nome)} disabled={articoli.length===0}>
              <Download size={14} /> Esporta CSV
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => { setEditArticolo(null); setShowForm(true) }}>
              <Plus size={14} /> Nuovo articolo
            </button>
          </div>
        }
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

        {/* Stats */}
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 20 }}>
          <div className="stat-card">
            <div className="stat-label">Totale articoli</div>
            <div className="stat-value stat-blue">{articoli.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Valore giudiziario</div>
            <div className="stat-value stat-green" style={{ fontSize: 18 }}>
              {totValore ? '€ ' + totValore.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Visualizzati</div>
            <div className="stat-value">{articoli.length}</div>
          </div>
        </div>

        {/* Filtri */}
        <div className="filter-bar">
          <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
            <input className="form-input" placeholder="Cerca articolo, marca…" style={{ paddingLeft: 32 }}
              value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
          </div>
          <select className="filter-select" value={catFilter} onChange={e => { setCatFilter(e.target.value); setPage(0) }}>
            <option value="">Tutte le categorie</option>
            {CATEGORIE.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>

        {/* Tabella */}
        <div className="table-card">
          {loading ? <Spinner /> : articoli.length === 0 ? (
            <Empty icon="📦" title="Nessun articolo" sub={search ? 'Nessun risultato per la ricerca' : 'Crea il primo articolo dell\'inventario'} />
          ) : (
            <>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 50 }}></th>
                    <th>Descrizione</th>
                    <th>Marca / Modello</th>
                    <th>Categoria</th>
                    <th>Q.tà</th>
                    <th>Val. Giud.</th>
                    <th>Stato</th>
                    <th style={{ width: 80 }}></th>
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
                        {a.n_foto > 0 && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text3)' }}>📷{a.n_foto}</span>}
                      </td>
                      <td className="muted">{[a.marca, a.modello].filter(Boolean).join(' ') || '—'}</td>
                      <td><span className="badge badge-blue" style={{ fontSize: 10 }}>{a.categoria || '—'}</span></td>
                      <td className="mono">{a.qta} {a.unita_misura}</td>
                      <td className="mono">{fmtEur(Number(a.val_giud || 0) * Number(a.qta || 1))}</td>
                      <td><span className={`badge ${a.stato === 'ottimo' || a.stato === 'buono' ? 'badge-green' : a.stato === 'discreto' ? 'badge-yellow' : 'badge-red'}`}>{a.stato || '—'}</span></td>
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
                  <div className="pagination-info">{page * PER_PAGE + 1}–{Math.min((page+1)*PER_PAGE, articoli.length)} di {articoli.length}</div>
                  <div className="pagination-btns">
                    <button className="page-btn" disabled={page===0} onClick={() => setPage(p=>p-1)}>←</button>
                    {Array.from({ length: totalPages }, (_, i) => <button key={i} className={`page-btn ${i===page?'active':''}`} onClick={() => setPage(i)}>{i+1}</button>)}
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
