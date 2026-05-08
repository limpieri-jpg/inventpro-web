import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Topbar, Spinner, Modal, Empty } from '../components/layout'
import { supabase } from '../lib/supabase'
import { ArrowLeft, Edit, MapPin, Package, Layers, FileText, Plus, Trash2 } from 'lucide-react'

function fmtDate(d) { if (!d) return '—'; return new Date(d).toLocaleDateString('it-IT') }
function fmtEur(n) { if (!n) return '—'; return '€ ' + Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

const TIPI = ['Liquidazione Giudiziale', 'Liquidazione Controllata', 'Fallimento', 'Concordato Preventivo', 'Concordato in Continuità', 'Liquidazione Coatta', 'Amministrazione Straordinaria', 'Altro']
const STATUS_OPTIONS = ['attiva', 'chiusa', 'sospesa']
const TIPI_SEDE = ['legale', 'operativa', 'magazzino', 'altra']
const STATUS_BADGE = { attiva: { cls: 'badge-green', label: 'Attiva' }, chiusa: { cls: 'badge-gray', label: 'Chiusa' }, sospesa: { cls: 'badge-yellow', label: 'Sospesa' } }

function ProcForm({ proc, onSave, onClose }) {
  const { notify } = useStore()
  const [form, setForm] = useState({ ...proc })
  const [loading, setLoading] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const inp = (k, type = 'text') => ({ value: form[k] || '', type, onChange: e => set(k, e.target.value), className: 'form-input' })
  const handleSave = async () => {
    if (!form.nome) { notify('Inserisci il nome', 'warn'); return }
    setLoading(true)
    try {
      // Rimuove campi relazionali non colonne della tabella
      const { sedi: _, lotti_articoli: __, ...formClean } = form
      const { data, error } = await supabase.from('procedure').update(formClean).eq('id', proc.id).select().single()
      if (error) throw error
      notify('Procedura aggiornata', 'ok')
      onSave(data)
    } catch (e) { notify('Errore: ' + e.message, 'err') }
    finally { setLoading(false) }
  }
  return (
    <>
      <div className="form-grid">
        <div className="form-section">Dati principali</div>
        <div className="form-col-full form-group"><label className="form-label">Denominazione *</label><input {...inp('nome')} /></div>
        <div className="form-group"><label className="form-label">Tipo procedura</label><select {...inp('tipo')}>{TIPI.map(t => <option key={t}>{t}</option>)}</select></div>
        <div className="form-group"><label className="form-label">Stato</label><select {...inp('status')}>{STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}</select></div>
        <div className="form-group"><label className="form-label">N. R.G.</label><input {...inp('num')} /></div>
        <div className="form-group"><label className="form-label">Anno</label><input {...inp('anno')} /></div>
        <div className="form-group"><label className="form-label">Tribunale</label><input {...inp('tribunale')} /></div>
        <div className="form-group"><label className="form-label">Giudice Delegato</label><input {...inp('giudice')} /></div>
        <div className="form-group"><label className="form-label">Professionista</label><input {...inp('curatore')} placeholder="Es. Dott. Mario Rossi" /></div>
        <div className="form-group"><label className="form-label">Commissionario</label><input {...inp('commissionario')} /></div>
        <div className="form-section">Date e sentenza</div>
        <div className="form-group"><label className="form-label">Data apertura</label><input {...inp('data_apertura', 'date')} /></div>
        <div className="form-group"><label className="form-label">N. sentenza/decreto</label><input {...inp('sentenza_num')} /></div>
        <div className="form-section">Dati fiscali</div>
        <div className="form-group"><label className="form-label">Codice Fiscale</label><input {...inp('cf')} /></div>
        <div className="form-group"><label className="form-label">P.IVA</label><input {...inp('piva')} /></div>
        <div className="form-col-full form-group"><label className="form-label">PEC procedura</label><input {...inp('pec', 'email')} /></div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
        <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={loading}>{loading ? 'Salvataggio…' : 'Salva modifiche'}</button>
      </div>
    </>
  )
}

function TabAnagrafica({ proc, onEdit }) {
  const fields = [
    ['Tipo procedura', proc.tipo], ['N. R.G.', proc.num && proc.anno ? proc.num+'/'+proc.anno : proc.num],
    ['Tribunale', proc.tribunale], ['Giudice Delegato', proc.giudice], ['Curatore', proc.curatore],
    ['Commissionario', proc.commissionario], ['Data apertura', fmtDate(proc.data_apertura)],
    ['N. sentenza', proc.sentenza_num], ['Codice Fiscale', proc.cf], ['P.IVA', proc.piva], ['PEC', proc.pec], ['Stato', proc.status],
  ]
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">Dati procedura</div>
        <button className="btn btn-ghost btn-sm" onClick={onEdit}><Edit size={13} /> Modifica</button>
      </div>
      <div className="card-body">
        <div className="detail-grid">
          {fields.map(([label, value]) => (
            <div key={label} className="detail-row">
              <div className="detail-label">{label}</div>
              <div className="detail-value">{value || '—'}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function TabSedi({ procId }) {
  const { notify } = useStore()
  const [sedi, setSedi] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editSede, setEditSede] = useState(null)
  const [form, setForm] = useState({ tipo: 'legale', indirizzo: '', civico: '', cap: '', comune: '', provincia: '', note: '' })
  const s = (k) => ({ value: form[k] || '', onChange: e => setForm(f => ({ ...f, [k]: e.target.value })), className: 'form-input' })

  useEffect(() => { loadSedi() }, [procId])
  const loadSedi = async () => { const { data } = await supabase.from('sedi').select('*').eq('proc_id', procId).order('sort_order'); setSedi(data || []); setLoading(false) }
  const saveSede = async () => {
    try {
      if (editSede?.id) await supabase.from('sedi').update(form).eq('id', editSede.id)
      else await supabase.from('sedi').insert({ ...form, proc_id: procId })
      notify('Sede salvata', 'ok'); setShowForm(false); setEditSede(null); loadSedi()
    } catch (e) { notify('Errore: ' + e.message, 'err') }
  }
  const deleteSede = async (id) => { if (!confirm('Eliminare questa sede?')) return; await supabase.from('sedi').delete().eq('id', id); loadSedi() }
  const openForm = (sede = null) => { setEditSede(sede); setForm(sede || { tipo: 'legale', indirizzo: '', civico: '', cap: '', comune: '', provincia: '', note: '' }); setShowForm(true) }

  if (loading) return <Spinner />
  return (
    <>
      <div className="section-header">
        <div className="section-title">Sedi</div>
        <button className="btn btn-primary btn-sm" onClick={() => openForm()}><Plus size={13} /> Aggiungi sede</button>
      </div>
      {sedi.length === 0 ? <Empty icon="📍" title="Nessuna sede" sub="Aggiungi la sede legale della procedura" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sedi.map(s2 => (
            <div key={s2.id} className="card">
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><MapPin size={14} color="var(--accent)" /><span className="card-title" style={{ textTransform: 'capitalize' }}>{s2.tipo}</span></div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openForm(s2)}><Edit size={13} /></button>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent-r)' }} onClick={() => deleteSede(s2.id)}><Trash2 size={13} /></button>
                </div>
              </div>
              <div className="card-body">
                <div style={{ fontSize: 13 }}>{[s2.indirizzo, s2.civico].filter(Boolean).join(' ')}{s2.comune && ` — ${[s2.cap, s2.comune, s2.provincia ? '('+s2.provincia+')' : ''].filter(Boolean).join(' ')}`}</div>
                {s2.note && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{s2.note}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editSede ? 'Modifica sede' : 'Nuova sede'} footer={<><button className="btn btn-ghost" onClick={() => setShowForm(false)}>Annulla</button><button className="btn btn-primary" onClick={saveSede}>Salva</button></>}>
        <div className="form-grid">
          <div className="form-group"><label className="form-label">Tipo sede</label><select className="form-input" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>{TIPI_SEDE.map(t => <option key={t}>{t}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Provincia</label><input className="form-input" value={form.provincia || ''} onChange={e => setForm(f => ({ ...f, provincia: e.target.value }))} maxLength={2} /></div>
          <div className="form-group"><label className="form-label">Indirizzo</label><input className="form-input" value={form.indirizzo || ''} onChange={e => setForm(f => ({ ...f, indirizzo: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">N. civico</label><input className="form-input" value={form.civico || ''} onChange={e => setForm(f => ({ ...f, civico: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">CAP</label><input className="form-input" value={form.cap || ''} onChange={e => setForm(f => ({ ...f, cap: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Comune</label><input className="form-input" value={form.comune || ''} onChange={e => setForm(f => ({ ...f, comune: e.target.value }))} /></div>
          <div className="form-col-full form-group"><label className="form-label">Note</label><textarea className="form-input" value={form.note || ''} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={2} /></div>
        </div>
      </Modal>
    </>
  )
}

function TabInventarioPreview({ procId }) {
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  useEffect(() => {
    supabase.from('articoli').select('id, val_giud, qta, categoria').eq('proc_id', procId).then(({ data }) => {
      if (!data) return
      const totVal = data.reduce((sum, a) => sum + (Number(a.val_giud) * Number(a.qta || 1)), 0)
      const categorie = [...new Set(data.map(a => a.categoria).filter(Boolean))]
      setStats({ count: data.length, totVal, categorie })
    })
  }, [procId])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {stats && (
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
          <div className="stat-card"><div className="stat-label">Articoli totali</div><div className="stat-value stat-blue">{stats.count}</div></div>
          <div className="stat-card"><div className="stat-label">Valore giudiziario</div><div className="stat-value stat-green" style={{ fontSize: 18 }}>{fmtEur(stats.totVal)}</div></div>
          <div className="stat-card"><div className="stat-label">Categorie</div><div className="stat-value">{stats.categorie.length}</div></div>
        </div>
      )}
      <div style={{ textAlign: 'center', padding: 24 }}>
        <button className="btn btn-primary" onClick={() => navigate('/inventario')}><Package size={14} /> Vai all'inventario completo</button>
      </div>
    </div>
  )
}

const TABS = [
  { id: 'anagrafica', label: 'Anagrafica', icon: FileText },
  { id: 'sedi', label: 'Sedi', icon: MapPin },
  { id: 'inventario', label: 'Inventario', icon: Package },
  { id: 'lotti', label: 'Lotti', icon: Layers },
]

export default function ProceduraDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { setCurrentProc, notify } = useStore()
  const [proc, setProc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('anagrafica')
  const [showEdit, setShowEdit] = useState(false)

  useEffect(() => {
    supabase.from('procedure').select('*, sedi(*)').eq('id', id).single().then(({ data, error }) => {
      if (error) { notify('Procedura non trovata', 'err'); navigate('/procedure'); return }
      setProc(data); setCurrentProc(data); setLoading(false)
    })
  }, [id])

  if (loading) return <><Topbar title="Caricamento…" /><div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div></>
  if (!proc) return null
  const sb = STATUS_BADGE[proc.status] || { cls: 'badge-gray', label: proc.status }

  return (
    <>
      <Topbar
        title={proc.nome}
        subtitle={`${proc.tipo} · ${proc.tribunale || ''} · ${proc.num ? proc.num+(proc.anno?'/'+proc.anno:'') : ''}`}
        actions={<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className={`badge ${sb.cls}`}>{sb.label}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/procedure')}><ArrowLeft size={13} /> Procedure</button>
        </div>}
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <div className="tabs">
          {TABS.map(t => <div key={t.id} className={`tab ${tab===t.id?'active':''}`} onClick={() => setTab(t.id)}><t.icon size={13} style={{ marginRight: 6, verticalAlign: 'middle' }} />{t.label}</div>)}
        </div>
        {tab === 'anagrafica' && <TabAnagrafica proc={proc} onEdit={() => setShowEdit(true)} />}
        {tab === 'sedi' && <TabSedi procId={proc.id} />}
        {tab === 'inventario' && <TabInventarioPreview procId={proc.id} />}
        {tab === 'lotti' && <Empty icon="📋" title="Lotti" sub="Vai alla sezione Lotti per gestire i lotti di vendita" />}
      </div>
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Modifica procedura" wide>
        <ProcForm proc={proc} onClose={() => setShowEdit(false)} onSave={(p) => { setProc(p); setCurrentProc(p); setShowEdit(false) }} />
      </Modal>
    </>
  )
}
