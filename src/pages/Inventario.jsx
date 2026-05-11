import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Topbar, Spinner, Modal, Empty } from '../components/layout'
import { supabase } from '../lib/supabase'
import { Plus, Search, Upload, X, Edit, Trash2, Camera, FileDown } from 'lucide-react'
import * as XLSX from 'xlsx'

function fmtEur(n) { return n ? '€ ' + Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—' }

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

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const inp = (k, type = 'text') => ({ value: form[k] ?? '', type, onChange: e => set(k, e.target.value), className: 'form-input' })

  // Carica foto esistenti
  useEffect(() => {
    if (articolo?.id) {
      supabase.from('foto').select('*').eq('articolo_id', articolo.id).order('sort_order')
        .then(({ data }) => { if (data) setPhotos(data) })
    }
  }, [articolo?.id])

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

        {/* Foto — solo per articoli esistenti */}
        {articolo?.id && (
          <>
            <div className="form-section">Fotografie</div>
            <div className="form-col-full">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                {photos.map(f => (
                  <div key={f.id} style={{ position: 'relative', width: 100, height: 80 }}>
                    <img src={f.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
                    <button onClick={() => deletePhoto(f)} style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(255,77,106,0.9)', border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={11} color="#fff" />
                    </button>
                  </div>
                ))}
                <label style={{ width: 100, height: 80, border: '2px dashed var(--border)', borderRadius: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text3)', gap: 4 }}>
                  <Camera size={20} />
                  <span style={{ fontSize: 11 }}>{uploading ? 'Carico…' : 'Aggiungi'}</span>
                  <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handlePhotoUpload} disabled={uploading} />
                </label>
              </div>
            </div>
          </>
        )}
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

  const [showFallcoModal, setShowFallcoModal] = useState(false)
  const [dataDeposito, setDataDeposito] = useState('')
  const [exportingFallco, setExportingFallco] = useState(false)

  const exportFallco = async () => {
    setExportingFallco(true)
    try {
      // Carica tutti gli articoli senza paginazione
      let q = supabase.from('v_articoli_con_foto').select('*').eq('proc_id', currentProc.id).order('sort_order')
      const { data: tutti, error } = await q
      if (error) throw error

      const fmtData = (d) => {
        if (!d) return ''
        const dt = new Date(d)
        if (isNaN(dt)) return d
        return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`
      }

      // Mappa tipologia SIECIC → codice FALLCO
      const mapTipologia = (t) => {
        if (!t) return 'M'
        const tl = t.toUpperCase()
        if (tl.includes('IMMOBILE') || tl.includes('FABBRICATO') || tl.includes('TERRENO')) return 'I'
        if (tl.includes('AZIENDA') || tl.includes('RAMO')) return 'A'
        return 'M'
      }

      const righe = tutti.map(a => ({
        'Descrizione': a.desc_breve || '',
        'Tipologia': mapTipologia(a.siecic_tipologia),
        'Società/Socio': a.societa || '0',
        'Titolo': a.titolo || 'piena_proprietà',
        'Quota %': a.quota_pct || '',
        'Codifica SIECIC': a.codice_siecic || '',
        'Società/Socio_1': '', 'Titolo_1': '', 'Quota %_1': '',
        'Società/Socio_2': '', 'Titolo_2': '', 'Quota %_2': '',
        'Società/Socio_3': '', 'Titolo_3': '', 'Quota %_3': '',
        'Misura': a.unita_misura || 'UN',
        'Quantità': a.qta || 1,
        'Valore di stima unitario': a.val_giud || 0,
        'Data deposito perizia': dataDeposito ? fmtData(dataDeposito) : '',
        'Nazione': 'Italia',
        'Provincia': currentProc.provincia || '',
        'Comune ': currentProc.comune || '',
        'Cap ': currentProc.cap || '',
        'Zip ': '',
        'Indirizzo': currentProc.indirizzo || '',
        'Quantità aggiudicata': '',
        'Valore aggiudicato': '',
        'Data decreto di trasferimento': '',
        'Operazione chiusa': '',
        'Codice Lotto': '',
        'Descrizione Lotto': '',
        'Note': a.note || '',
        // Campi catastali (solo immobili)
        'Sezione': a.sezione || '',
        'Foglio': a.foglio || '',
        'Particella': a.mappale || '',
        'Subparticella': '',
        'Subalterno': a.subalterno || '',
        'Graffato': '',
        'Categoria': a.classe_catastale || a.categoria || '',
        'Classe': a.classe || '',
        'Catasto': a.comune_cat || '',
        'Superficie mq': a.superficie || '',
        'Rendita Catastale': a.rendita || '',
        'Edificio': '', 'Scala': '', 'Interno': '', 'Piano': a.piano || '',
        'Numero vani': a.vani || '',
        'Reddito Domenicale': '',
        'Reddito Agrario': ''
      }))

      const ws = XLSX.utils.json_to_sheet(righe)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Inventario')
      const nomeFile = `FALLCO_${currentProc.nome?.replace(/\s+/g,'_') || 'inventario'}_${new Date().toISOString().slice(0,10)}.xlsx`
      XLSX.writeFile(wb, nomeFile)
      notify('Export FALLCO completato', 'ok')
      setShowFallcoModal(false)
    } catch (e) { notify('Errore export: ' + e.message, 'err') }
    finally { setExportingFallco(false) }
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
            <button className="btn btn-ghost btn-sm" onClick={() => setShowFallcoModal(true)}>
              <FileDown size={14} /> Export FALLCO
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

      <Modal open={showFallcoModal} onClose={() => setShowFallcoModal(false)} title="Export FALLCO">
        <div style={{ padding: '8px 0' }}>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>
            Genera il file Excel nel formato FALLCO con tutti i {articoli.length} articoli dell'inventario.
          </p>
          <div className="form-group">
            <label className="form-label">Data deposito perizia</label>
            <input
              type="date"
              className="form-input"
              value={dataDeposito}
              onChange={e => setDataDeposito(e.target.value)}
            />
            <span style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, display: 'block' }}>
              Lascia vuoto se non ancora depositata
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
            <button className="btn btn-ghost" onClick={() => setShowFallcoModal(false)}>Annulla</button>
            <button className="btn btn-primary" onClick={exportFallco} disabled={exportingFallco}>
              <FileDown size={14} /> {exportingFallco ? 'Generazione…' : 'Scarica FALLCO.xlsx'}
            </button>
          </div>
        </div>
      </Modal>

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
