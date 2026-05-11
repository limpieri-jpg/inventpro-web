import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Topbar, Spinner, Modal, Empty } from '../components/layout'
import { supabase } from '../lib/supabase'
import { ArrowLeft, Edit, MapPin, Package, Layers, FileText, Plus, Trash2, Download } from 'lucide-react'
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, BorderStyle, WidthType, ShadingType, LevelFormat, ImageRun, Header, Footer } from 'docx'

function fmtDate(d) { if (!d) return '—'; return new Date(d).toLocaleDateString('it-IT') }
function fmtEur(n) {
  if (n === null || n === undefined || n === '') return '\u2014'
  const num = Number(n)
  if (isNaN(num)) return '\u2014'
  const [int, dec] = num.toFixed(2).split('.')
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return '\u20ac\u00a0' + intFmt + ',' + dec
}

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


// ─── Helpers docx mandati ─────────────────────────────────────────────────
const _MW = 11906; const _MM = 1000; const _MCW = _MW - _MM * 2
const _BN = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const _BNS = { top: _BN, bottom: _BN, left: _BN, right: _BN }
const _BT = { style: BorderStyle.SINGLE, size: 1, color: 'AAAAAA' }
const _BTS = { top: _BT, bottom: _BT, left: _BT, right: _BT }
const _J = AlignmentType.JUSTIFIED
const _C = AlignmentType.CENTER
const _R = AlignmentType.RIGHT

function _p(ch, opts = {}) { return new Paragraph({ children: Array.isArray(ch) ? ch : [ch], alignment: _J, ...opts }) }
function _pc(ch, opts = {}) { return new Paragraph({ children: Array.isArray(ch) ? ch : [ch], alignment: _C, ...opts }) }
function _t(text, opts = {}) { return new TextRun({ text: String(text || ''), font: 'Gadugi', size: 22, ...opts }) }
function _b(text, size = 22) { return _t(text, { bold: true, size }) }
function _br() { return new Paragraph({ children: [new TextRun('')], spacing: { before: 60, after: 60 } }) }
function _cell(text, isBold, shade) {
  return new TableCell({ borders: _BNS, width: { size: _MCW / 2, type: WidthType.DXA },
    shading: shade ? { fill: shade, type: ShadingType.CLEAR } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ children: [isBold ? _b(text) : _t(text)], alignment: _J })] })
}
function _cellW(text, w, isBold, shade) {
  return new TableCell({ borders: _BNS, width: { size: w, type: WidthType.DXA },
    shading: shade ? { fill: shade, type: ShadingType.CLEAR } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ children: [isBold ? _b(text) : _t(text)], alignment: _J })] })
}
function _tblInfo(rows) {
  return new Table({ width: { size: _MCW, type: WidthType.DXA }, columnWidths: [_MCW/2, _MCW/2], borders: _BTS,
    rows: rows.map(([l, v]) => new TableRow({ children: [_cell(l, false, 'EEF2F7'), _cell(v || '')] })) })
}
function _fatt(proc) {
  const sede = (proc.sedi || []).find(s => s.tipo === 'legale') || {}
  const ind = [sede.indirizzo, sede.civico, sede.cap, sede.comune, sede.provincia ? '('+sede.provincia+')' : ''].filter(Boolean).join(' ')
  const w1 = Math.floor(_MCW * 0.4); const w2 = Math.floor(_MCW * 0.45); const w3 = Math.floor(_MCW * 0.15)
  return new Table({ width: { size: _MCW, type: WidthType.DXA }, columnWidths: [_MCW/2, _MCW/2], borders: _BTS, rows: [
    new TableRow({ children: [new TableCell({ borders: _BTS, columnSpan: 2, shading: { fill: '244061', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [_pc(_b('INTESTATARIO FATTURA:'))] })] }),
    new TableRow({ children: [_cell('RAGIONE SOCIALE', false, 'EEF2F7'), _cell(proc.nome || '')] }),
    new TableRow({ children: [_cellW('SEDE LEGALE / INDIRIZZO', w1, false, 'EEF2F7'), _cellW(ind || '—', w2), _cellW('COD. SDI', w3, false, 'EEF2F7')] }),
    new TableRow({ children: [_cell('C.F. / P.IVA', false, 'EEF2F7'), _cell((proc.cf||'') + (proc.piva?' / '+proc.piva:''))] }),
    new TableRow({ children: [_cell('P.E.C. (fatturazione elettronica)', false, 'EEF2F7'), _cell(proc.pec||'')] }),
  ]})
}
function _fmtD(d) { if (!d) return '______'; const dt = new Date(d); return String(dt.getDate()).padStart(2,'0')+'/'+String(dt.getMonth()+1).padStart(2,'0')+'/'+dt.getFullYear() }
function _dl(blob, nome) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = nome
  document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(url), 3000)
}
function _numConf() {
  return { config: [{ reference: 'blt', levels: [{ level: 0, format: LevelFormat.BULLET, text: '-', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 360 } } } }] }] }
}
function _blt(ch) { return new Paragraph({ numbering: { reference: 'blt', level: 0 }, alignment: _J, children: Array.isArray(ch) ? ch : [ch] }) }
function _secN(label) { return _blt(_b(label)) }
function _hdr(logoB64) {
  const lr = logoB64 ? new ImageRun({ data: logoB64.split(',')[1], transformation: { width: 150, height: 50 }, type: 'png' }) : null
  return new Header({ children: [
    new Paragraph({ children: lr ? [lr] : [_b('PROCEDURE GESTITE E SERVIZI S.R.L.', 20)], alignment: AlignmentType.LEFT }),
    new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '244061', space: 1 } }, children: [] })
  ]})
}
function _ftr() {
  return new Footer({ children: [new Paragraph({
    alignment: _C,
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA', space: 1 } },
    children: [
      _b('Procedure Gestite E Servizi S.r.l.', 18),
      new TextRun({ text: '', break: 1 }),
      _t('Sede legale Via Giuseppe Parini, 29 - LECCO (LC) - 23900', { size: 16 }),
      new TextRun({ text: '', break: 1 }),
      _t('Codice Fiscale e Partita IVA 03546380134', { size: 16 }),
      new TextRun({ text: '', break: 1 }),
      _t('procedure@progess-italia.it | progess@arubapec.it', { size: 16 }),
    ]
  })]})}
function _firme(proc, dataC) {
  const nrg = (proc.num||'') + (proc.anno?'/'+proc.anno:'')
  return [
    _br(),
    _p([_t('Lecco, '+_fmtD(dataC))]),
    _br(),
    _p([_t('\t\t\t\t\t'), _b('Il Cliente')]),
    _p([_t('\t\t\t\t\t'), _b(proc.tipo+' '+nrg)]),
    _p([_t('\t\t\t\t\t'), _b(proc.nome||'')]),
    _p([_t('\t\t\t\t\t'), _t('Il Curatore '+(proc.curatore||''))]),
    _br(),
    _p(_t('________________________________')),
    _br(),
    _p([_t('\t\t\t\t\t'), _b('Pro.ges.s S.r.l.')]),
    _p([_t('\t\t\t\t\t'), _t("L'Amministratore Unico")]),
    _p([_t('\t\t\t\t\t'), _t('Luigi IMPIERI')]),
    _br(),
    _p(_t('________________________________')),
  ]
}

function _informativa(proc, dataC) {
  const nrg = (proc.num||'') + (proc.anno?'/'+proc.anno:'')
  return [
    new Paragraph({ children: [], pageBreakBefore: true }),
    _pc([_b('INFORMATIVA AI SENSI DEL REGOLAMENTO GENERALE '), new TextRun({ text: '', break: 1 }), _b('SULLA PROTEZIONE DEI DATI (Regolamento UE 2016/679)')]),
    _br(),
    _p(_t("Ai sensi degli Artt. 12 e 13 del Regolamento generale sulla protezione dei dati (GDPR - General Data Protection Regulation) approvato con Regolamento UE 2016/679 del Parlamento Europeo e del Consiglio del 27 aprile 2016 ed in relazione ai dati personali di Pro.Ges.S. entrerà in possesso con l'affidamento dell'incarico da Lei conferito, La informo di quanto segue:")),
    _br(),
    _secN('Finalità del trattamento dei dati'),
    _p(_t("Il trattamento è finalizzato unicamente alla corretta e completa esecuzione dell'incarico ricevuto.")),
    _br(),
    _secN('Modalità del trattamento dei dati'),
    _blt(_t('il trattamento può essere svolto con o senza l\'ausilio di strumenti elettronici o comunque automatizzati;')),
    _blt(_t('il trattamento è svolto dal titolare e/o dagli incaricati del trattamento.')),
    _br(),
    _secN('Conferimento dei dati'),
    _p(_t('Il conferimento di dati personali sensibili è strettamente necessario ai fini dello svolgimento delle attività di cui al punto 1.')),
    _br(),
    _secN('Rifiuto di conferimento dei dati'),
    _p(_t("L'eventuale rifiuto da parte dell'interessato di conferire dati personali comporta l'impossibilità di adempiere alle attività di cui al punto 1.")),
    _br(),
    _secN('Comunicazione dei dati'),
    _p(_t('I dati personali possono venire a conoscenza degli incaricati del trattamento e possono essere comunicati per le finalità di cui al punto 1 a collaboratori esterni, a soggetti operanti nel settore giudiziario e, in genere, a tutti quei soggetti pubblici e privati cui la comunicazione sia necessaria per il corretto adempimento delle finalità indicate al punto 1.')),
    _p(_t('Il trattamento dei dati avverrà anche per le finalità previste dalla normativa vigente in materia di antiriciclaggio.')),
    _br(),
    _secN('Diffusione dei dati'),
    _p(_t('I dati personali non sono soggetti a diffusione.')),
    _br(),
    _secN("Trasferimento dei dati all'estero"),
    _p(_t("I dati personali possono essere trasferiti verso Paesi dell'Unione Europea e verso Paesi terzi nell'ambito delle finalità di cui al punto 1.")),
    _br(),
    _secN("Diritti dell'interessato"),
    _p(_t("A norma degli Artt. 15 (Diritto di accesso), 16 (Diritto di rettifica), 17 (Diritto alla cancellazione), 18 (Diritto di limitazione di trattamento), 20 (Diritto alla portabilità dei dati) e 21 (Diritto di opposizione) del Regolamento UE 2016/679, l'interessato può in ogni momento richiedere l'accesso ai dati personali e la rettifica o la cancellazione degli stessi o la limitazione del trattamento che lo riguardano o di opporsi al loro trattamento, oltre al diritto alla portabilità dei dati, inoltrando comunicazione scritta al Titolare del Trattamento.")),
    _p(_t("L'interessato può proporre altresì reclamo all'Autorità di controllo dello stato in cui risiede o lavora.")),
    _p(_t("Anche ai fini della normativa in materia di antiriciclaggio, i dati relativi alle prestazioni rientranti nella predetta disciplina legislativa verranno conservati per dieci anni dall'ultimazione della prestazione.")),
    _br(),
    _secN('Consenso al trattamento dei dati'),
    _p(_t("Ai sensi dell'Art. 6, par. 1, lett. a) del Regolamento generale sulla protezione dei dati personali UE n. 2016/679, con l'apposizione della firma in calce al presente modulo, manifesta il consenso al trattamento dei dati nell'ambito delle finalità e modalità sopra richiamate. Tale consenso vale fino a revoca scritta da far pervenire tramite raccomandata con ricevuta di ritorno o a mezzo PEC.")),
    _br(),
    _secN('Titolare del trattamento'),
    _p(_t('Titolare del trattamento è il Signor Luigi Impieri, C.F. MPRLGU72S12D086V, con domicilio presso Pro.Ges.S. S.r.l., C.F. e P. IVA 03546380134, con sede in Lecco (LC), Via Giuseppe Parini 29, PEC progess@arubapec.it.')),
    _br(),
    _p(_t('Per ricevuta comunicazione e rilascio consenso')),
    _br(),
    ..._firme(proc, dataC),
  ]
}

function _intro(proc, tipo) {
  const nrg = (proc.num||'') + (proc.anno?'/'+proc.anno:'')
  const sede = (proc.sedi||[]).find(s => s.tipo==='legale') || {}
  const ind = [sede.indirizzo, sede.civico, sede.cap, sede.comune, sede.provincia?'('+sede.provincia+')':''].filter(Boolean).join(' ')
  return [
    _br(),
    _p([_t('Con il presente contratto, da valersi ad ogni effetto di legge, tra:')]),
    _br(),
    _p([_t('la '), _b(proc.tipo||''), _t(' '), _b('R.G. '+nrg+' - '+(proc.nome||'')),
        _t(', C.F. e P.IVA '+(proc.cf||'')+(proc.piva?' P.IVA '+proc.piva:'')+', con sede legale in '+ind+
        ', rappresentata in questa sede dal Curatore '), _b(proc.curatore||''),
        _t(' con sentenza n. '+(proc.sentenza_num||'n. _______')+' dal Tribunale di '+(proc.tribunale||'')+
        ', PEC della procedura '+(proc.pec||'')+' (di seguito "'), _b('Cliente'), _t('") da una parte')]),
    _br(), _p(_b('e')), _br(),
    _p([_t('la società '), _b('"PROCEDURE GESTITE E SERVIZI S.R.L."'), _t(' - in forma abbreviata '), _b('"PRO.GES.S. S.R.L."'),
        _t(", n.ro di iscrizione al Registro delle Imprese e Codice Fiscale 03546380134, Partita IVA 03546380134, con sede legale in Via Giuseppe Parini n.ro 29, PEC progess@arubapec.it, in persona dell"),
        _t("'Amministratore Unico Sig. "), _b('Luigi IMPIERI'),
        _t(', C.F. MPRLGU72S12D086V, (di seguito "'), _b('Pro.Ges.S.'), _t('"), dall'), _t("'altra parte (il Cliente e Pro.Ges.S., insieme, \""), _b('Parti'), _t('")')]),
    _br(),
    _p(_b('PREMESSO CHE')),
    _blt([_t("il Cliente intende conferire a Pro.Ges.S. il mandato per la vendita dei "), _b('beni '+tipo), _t(" acquisiti all"), _t("'attivo della procedura, con autorizzazione alla vendita e nomina di Pro.Ges.S., quale commissionario alla Vendita")]),
    _blt([_t("Pro.Ges.S. ha le competenze e gli strumenti per adempiere il suddetto incarico, quale soggetto specializzato ai sensi dell"), _t("'Art. 216 CCII;")]),
    _br(), _p(_t('Tutto ciò premesso, tra le Parti')), _br(),
    _p(_b('SI STIPULA E CONVIENE QUANTO SEGUE')), _br(),
    _secN('PREMESSE'),
    _p(_t('Le premesse costituiscono parte integrante e sostanziale del presente contratto.')),
    _br(),
    _secN("OGGETTO DELL'INCARICO"),
    _p(_t('Il Cliente conferisce incarico a Pro.Ges.S., la quale accetta di:')),
  ]
}

function _clausoleFinali(proc, dataC) {
  const nrg = (proc.num||'') + (proc.anno?'/'+proc.anno:'')
  return [
    _br(),
    _secN('DURATA'),
    _p(_t("La durata del presente contratto decorre dalla data della sua sottoscrizione sino all'espletamento dell'incarico, come sopra descritto.")),
    _br(),
    _secN('OBBLIGHI DEL CLIENTE'),
    _p(_t("Il Cliente si impegna a trasmettere a Pro.Ges.S. i documenti necessari per l'espletamento dell'incarico affidato, fra cui:")),
    _blt(_t('Conferimento di incarico a Pro.Ges.S., sottoscritto dal Curatore e autorizzazione dal Giudice;')),
    _blt([_t("Programma di Liquidazione predisposto dal Curatore e vistato/autorizzato dal Sig. Giudice Delegato ai sensi dell"), _t("'art. 275 c.c.i.i.;")]),
    _blt([_t("Autorizzazione alla vendita emessa dal Sig. Giudice Delegato, "), _b("con annessa nomina di Pro.Ges.S. quale soggetto autorizzato alla vendita"), _t(" dei beni della Procedura;")]),
    _p(_t("Tutta la documentazione sopra richiesta è da trasmettersi al seguente indirizzo di posta elettronica: procedure@progess-italia.it")),
    _br(),
    _secN('MODIFICHE'),
    _p(_t("Ogni modifica al presente contratto dovrà essere fatta per iscritto tra le Parti, a pena di nullità.")),
    _br(),
    _secN('COMUNICAZIONI'),
    _p(_t("Tutte le comunicazioni da eseguirsi in riferimento al presente mandato dovranno essere fatte per iscritto, a mezzo di posta elettronica certificata agli indirizzi indicati nelle premesse.")),
    _br(),
    _secN('FORO COMPETENTE'),
    _p(_t("Per qualsiasi controversia connessa al presente mandato sarà esclusivamente competente il Foro di Lecco, con esclusione di qualsivoglia foro alternativo applicabile per legge.")),
    _br(),
    ..._firme(proc, dataC),
    _br(), _br(),
    _p(_t("Si precisa che il presente contratto è stato discusso in ogni suo contenuto tra le Parti.")),
    _br(),
    _p([_t("Ad ogni modo, ai sensi e per gli effetti di cui all"), _t("'Art 1341 c.c., si approvano espressamente le clausole 3), 4), 6) e 9).")]),
    _br(),
    ..._firme(proc, dataC),
    ..._informativa(proc, dataC),
  ]
}

const SMOB = [
  "Predisposizione della Relazione di stima e del Report Fotografico valorizzato dei beni mobili oggetto del presente incarico;",
  "Coadiuvare il Curatore nella predisposizione degli Avvisi di vendita e dei modelli utili agli utenti per formulare offerte irrevocabili di acquisto;",
  "Accompagnare gli utenti interessati alla visita dei beni mobili posti in vendita;",
  'Effettuare la Pubblicità Legale su "Progess Italia";',
  "Effettuare la Pubblicità Legale sul Portale delle Vendite Pubbliche, previo nomina in qualità di soggetto abilitato alla pubblicazione da parte della Cancelleria;",
  "Esperire i tentativi di vendita necessari per la liquidazione totale dei beni mobili acquisiti all'attivo della Procedura, mediante procedure competitive ai sensi dell'art. 216 c.c.i.i.;",
  "Comunicare gli esiti delle vendite al Curatore, fornendo a quest'ultimo il Verbale delle operazioni di vendita ed il Report rilasciato dalla piattaforma di proprietà di Progess Italia.",
]
const SIMM = [
  "Coadiuvare il Curatore nella predisposizione degli Avvisi di vendita e dei modelli per offerte irrevocabili di acquisto;",
  "Accompagnare gli utenti interessati alla visita dei beni immobili posti in vendita;",
  'Effettuare la Pubblicità Legale su "Progess Italia";',
  "Effettuare la Pubblicità Legale sul Portale delle Vendite Pubbliche (PVP), previa nomina in qualità di soggetto abilitato da parte della Cancelleria;",
  "Esperire i tentativi di vendita necessari per la liquidazione totale dei beni immobili mediante procedure competitive (art. 216 CCII);",
  "Comunicare gli esiti delle vendite al Curatore con Verbale delle operazioni di vendita e Report della piattaforma Progess Italia.",
]

async function _genMob(proc, opts, logoB64) {
  const { dataContratto, compenso, costoLotto, rt, servizi } = opts
  const nrg = (proc.num||'') + (proc.anno?'/'+proc.anno:'')
  const hasRT = rt && rt.trim() !== ''
  const sp = servizi.map(s => _blt(_t(s)))
  const doc = new Document({ numbering: _numConf(), sections: [{ properties: { page: { size: { width: _MW, height: 16838 }, margin: { top: 1134, right: _MM, bottom: 1134, left: _MM } } }, headers: { default: _hdr(logoB64) }, footers: { default: _ftr() }, children: [
    _pc(_b('MANDATO PER LA VENDITA DI BENI MOBILI', 28), { spacing: { before: 240, after: 240 } }),
    ..._intro(proc, 'mobili'), ...sp,
    _br(),
    _p(_b('DATI DELLA PROCEDURA CONCORSUALE'), { alignment: _C }),
    _br(),
    _p([_t("Indicare se la procedura dispone di liquidità per il pagamento delle somme che verranno anticipate:   "), _b("SÌ"), _t("          NO")]),
    _br(),
    _secN('Dati per fatturazione:'),
    _fatt(proc),
    _br(),
    _p([_t('PAGAMENTO mediante bonifico bancario su conto corrente intestato a "'), _b('Pro.Ges.S. S.r.l.'), _t('"')]),
    _p(_t('Deutsche Bank filiale di Lecco agenzia di Castello')),
    _p(_t('IBAN IT63J 03104 22903 000000820981')),
    _br(),
    _p([_t("Il pagamento della fattura dovrà essere effettuato entro e non oltre il termine di "), _b("30 (trenta)"), _t(" giorni dalla data di emissione della stessa. Qualora il pagamento non venga effettuato entro il suddetto termine, saranno applicati gli interessi di mora al tasso stabilito dal D.L. nr. 231 del 9 ottobre 2002.")]),
    _br(),
    _secN('COMPENSO'),
    _p([_t("Per l"), _t("'espletamento dei servizi effettuati da Pro.Ges.S., quest"), _t("'ultima avrà diritto ad un compenso "), _b("pari "+compenso+"%"), _t(", oltre IVA, il quale andrà calcolato sul prezzo di aggiudicazione definitivo, per ogni lotto venduto e "), _b("saranno ad esclusivo carico dell"), _b("'aggiudicatario.")]),
    _br(),
    _p(_b('Costi a carico della Procedura:')),
    _p([_t("Per il servizio di caricamento dei Lotti posti in vendita sulla piattaforma PVP e Progess Italia, Pro.Ges.S. avrà diritto ad un compenso ad "), _b("Euro "+(costoLotto||'25,00')+" oltre IVA"), _t(", per ciascun Lotto pubblicato.")]),
    ...(hasRT ? [_p([_t("Acquisto della RT di pubblicazione "), _b("Euro "+rt), _t(" oltre commissioni bancarie per l"), _t("'acquisto (per i beni mobili registrati).")])] : []),
    ..._clausoleFinali(proc, dataContratto),
  ]}] })
  return Packer.toBlob(doc)
}

async function _genImm(proc, opts, logoB64) {
  const { dataContratto, scaglioni, costoLotto, iban, dataAut, servizi } = opts
  const nrg = (proc.num||'') + (proc.anno?'/'+proc.anno:'')
  const sp = servizi.map(s => _blt(_t(s)))
  const tblS = new Table({ width: { size: _MCW, type: WidthType.DXA }, columnWidths: [_MCW/2, _MCW/2], borders: _BTS, rows: [
    new TableRow({ children: [_cell('Fino ad € 350.000', false, 'EEF2F7'), _cell((scaglioni[0]||'3')+'%', true)] }),
    new TableRow({ children: [_cell('Da € 350.001 a € 700.000', false, 'EEF2F7'), _cell((scaglioni[1]||'2.5')+'%', true)] }),
    new TableRow({ children: [_cell('Da € 700.001 a € 1.000.000', false, 'EEF2F7'), _cell((scaglioni[2]||'2')+'%', true)] }),
    new TableRow({ children: [_cell('Oltre € 1.000.000', false, 'EEF2F7'), _cell((scaglioni[3]||'1.5')+'%', true)] }),
  ]})
  const doc = new Document({ numbering: _numConf(), sections: [{ properties: { page: { size: { width: _MW, height: 16838 }, margin: { top: 1134, right: _MM, bottom: 1134, left: _MM } } }, headers: { default: _hdr(logoB64) }, footers: { default: _ftr() }, children: [
    _pc(_b('MANDATO PER LA VENDITA DI BENI IMMOBILI', 28), { spacing: { before: 240, after: 240 } }),
    ..._intro(proc, 'immobili'), ...sp,
    _br(),
    _p(_b('DATI DELLA PROCEDURA CONCORSUALE'), { alignment: _C }),
    _br(),
    _p([_t("Indicare se la procedura dispone di liquidità per il pagamento delle somme che verranno anticipate:   "), _b("SÌ"), _t("          NO")]),
    _br(),
    _secN('Dati per fatturazione:'),
    _fatt(proc),
    _br(),
    _p([_t('PAGAMENTO mediante bonifico bancario su conto corrente intestato a "'), _b('Pro.Ges.S. S.r.l.'), _t('"')]),
    _p(_t('Deutsche Bank filiale di Lecco agenzia di Castello')),
    _p(_t('IBAN IT63J 03104 22903 000000820981')),
    _br(),
    _p([_t("Il pagamento della fattura dovrà essere effettuato entro e non oltre il termine di "), _b("30 (trenta)"), _t(" giorni dalla data di emissione della stessa.")]),
    _br(),
    ...(iban ? [_p([_t('IBAN procedura (per trasferimento somme): '), _b(iban)])] : []),
    ...(dataAut ? [_p([_t('Data autorizzazione Giudice Delegato: '), _b(_fmtD(dataAut))])] : []),
    _br(),
    _secN('COMPENSO'),
    _p(_t("Per l'espletamento dei servizi, per ogni lotto venduto, Pro.Ges.S. avrà diritto ad un compenso calcolato a SCAGLIONI sul valore di aggiudicazione definitivo, OLTRE IVA, a esclusivo carico dell'aggiudicatario:")),
    _br(), tblS, _br(),
    _p(_b('Costi a carico della Procedura:')),
    _p([_t("Caricamento lotti su PVP e Progess Italia: "), _b("Euro "+(costoLotto||'25,00')+" oltre IVA"), _t(", per ciascun lotto.")]),
    ..._clausoleFinali(proc, dataContratto),
  ]}] })
  return Packer.toBlob(doc)
}

function WizardMandato({ tipo, proc, onClose }) {
  const { notify } = useStore()
  const isMob = tipo === 'mobili'
  const today = new Date().toISOString().slice(0, 10)
  const [dataC, setDataC] = useState(today)
  const [comp, setComp] = useState('10')
  const [cLotto, setCLotto] = useState('25,00')
  const [rt, setRt] = useState('')
  const [iban, setIban] = useState('')
  const [dataAut, setDataAut] = useState('')
  const [scag, setScag] = useState(['3', '2.5', '2', '1.5'])
  const [servizi, setServizi] = useState(isMob ? [...SMOB] : [...SIMM])
  const [nuovoS, setNuovoS] = useState('')
  const [gen, setGen] = useState(false)

  const genera = async () => {
    setGen(true)
    try {
      const logo = localStorage.getItem('ip_logo') || null
      const blob = isMob
        ? await _genMob(proc, { dataContratto: dataC, compenso: comp, costoLotto: cLotto, rt, servizi }, logo)
        : await _genImm(proc, { dataContratto: dataC, scaglioni: scag, costoLotto: cLotto, iban, dataAut, servizi }, logo)
      _dl(blob, 'Mandato_Beni_'+(isMob?'Mobili':'Immobili')+'_'+(proc.nome||'').replace(/\s+/g,'_')+'.docx')
      notify('Mandato generato con successo', 'ok')
      onClose()
    } catch (e) { notify('Errore: ' + e.message, 'err') }
    finally { setGen(false) }
  }

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: 13 }}>
        <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--text2)', fontSize: 11, textTransform: 'uppercase' }}>Auto-popolato da InventPro</div>
        {[['Procedura', proc.nome], ['Tipo', proc.tipo], ['N. R.G.', (proc.num||'')+(proc.anno?'/'+proc.anno:'')], ['Tribunale', proc.tribunale], ['Curatore', proc.curatore], ['PEC', proc.pec]].map(([l, v]) => (
          <div key={l} style={{ display: 'flex', gap: 12, marginBottom: 4 }}>
            <span style={{ color: 'var(--text3)', minWidth: 120 }}>{l}</span>
            <span style={{ fontWeight: 500 }}>{v || '—'}</span>
          </div>
        ))}
      </div>
      <div className="form-grid">
        <div className="form-col-full form-group">
          <label className="form-label">Data contratto</label>
          <input type="date" className="form-input" value={dataC} onChange={e => setDataC(e.target.value)} />
        </div>
        {isMob ? (<>
          <div className="form-group"><label className="form-label">Compenso % (su aggiudicazione)</label><input className="form-input" value={comp} onChange={e => setComp(e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Costo caricamento lotto (€)</label><input className="form-input" value={cLotto} onChange={e => setCLotto(e.target.value)} /></div>
          <div className="form-col-full form-group">
            <label className="form-label">RT pubblicazione beni registrati (€) — lascia vuoto se non presenti</label>
            <input className="form-input" value={rt} onChange={e => setRt(e.target.value)} placeholder="Es. 100,00 — lascia vuoto se assente" />
          </div>
        </>) : (<>
          <div style={{ gridColumn: '1/-1', fontSize: 12, fontWeight: 600, color: 'var(--text2)', margin: '8px 0 4px' }}>Compenso a scaglioni (su valore aggiudicazione — a carico aggiudicatario)</div>
          {[['Fino a €350.000 (%)', 0], ['Da €350.001 a €700.000 (%)', 1], ['Da €700.001 a €1.000.000 (%)', 2], ['Oltre €1.000.000 (%)', 3]].map(([l, i]) => (
            <div key={i} className="form-group"><label className="form-label">{l}</label><input className="form-input" value={scag[i]} onChange={e => setScag(s => s.map((x, j) => j===i ? e.target.value : x))} /></div>
          ))}
          <div className="form-group"><label className="form-label">IBAN procedura (per trasferimento somme)</label><input className="form-input" value={iban} onChange={e => setIban(e.target.value)} placeholder="Es. IT60 X054 2811 1010 00" /></div>
          <div className="form-group"><label className="form-label">Costo caricamento lotto (€)</label><input className="form-input" value={cLotto} onChange={e => setCLotto(e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Data autorizzazione Giudice Delegato</label><input type="date" className="form-input" value={dataAut} onChange={e => setDataAut(e.target.value)} /></div>
        </>)}
      </div>
      <div style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Servizi inclusi nel mandato</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {servizi.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 12px', background: 'var(--bg2)', borderRadius: 6, fontSize: 13 }}>
              <span style={{ color: 'var(--accent-g)', fontSize: 16, marginTop: 1 }}>✓</span>
              <span style={{ flex: 1 }}>{s}</span>
              <button onClick={() => setServizi(sv => sv.filter((_, j) => j!==i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16 }}>×</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <input className="form-input" placeholder="Aggiungi servizio personalizzato..." value={nuovoS} onChange={e => setNuovoS(e.target.value)} onKeyDown={e => e.key==='Enter' && nuovoS.trim() && (setServizi(sv => [...sv, nuovoS.trim()]), setNuovoS(''))} style={{ flex: 1 }} />
            <button className="btn btn-ghost btn-sm" onClick={() => nuovoS.trim() && (setServizi(sv => [...sv, nuovoS.trim()]), setNuovoS(''))}>+ Aggiungi</button>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
        <button className="btn btn-ghost" onClick={onClose}>Chiudi</button>
        <button className="btn btn-primary" onClick={genera} disabled={gen}>
          <Download size={14} /> {gen ? 'Generazione…' : 'Genera Word su carta intestata'}
        </button>
      </div>
    </div>
  )
}

function TabContratti({ proc }) {
  const [showM, setShowM] = useState(null)
  const cards = [
    { tipo: 'mobili', titolo: 'Mandato vendita beni mobili', icon: '📦', desc: 'Genera il mandato per la vendita di beni mobili con compenso percentuale fisso.' },
    { tipo: 'immobili', titolo: 'Mandato vendita beni immobili', icon: '🏠', desc: 'Genera il mandato per la vendita di beni immobili con compenso a scaglioni.' },
  ]
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {cards.map(c => (
          <div key={c.tipo} className="card" style={{ cursor: 'pointer' }} onClick={() => setShowM(c.tipo)}>
            <div className="card-body" style={{ textAlign: 'center', padding: 28 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>{c.icon}</div>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>{c.titolo}</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>{c.desc}</div>
              <button className="btn btn-primary btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
                <FileText size={13} /> Genera documento
              </button>
            </div>
          </div>
        ))}
      </div>
      {showM && (
        <Modal open={!!showM} onClose={() => setShowM(null)}
          title={showM==='mobili' ? 'Mandato vendita beni mobili' : 'Mandato vendita beni immobili'} wide>
          <WizardMandato tipo={showM} proc={proc} onClose={() => setShowM(null)} />
        </Modal>
      )}
    </>
  )
}


// ─── Relazione di Stima ────────────────────────────────────────────────────
const CONTESTI_STIMA = [
  'Liquidazione giudiziale (valori liquidatori)',
  'Liquidazione volontaria',
  'Vendita a valore di mercato',
  'Vendita in blocco',
  'Vendita frazionata',
]

async function _genRelazioneStima(proc, opts, articoli, logoB64) {
  const { dataSopralluogo, sito, attivita, causeCresi, decurtazione, contestoStima,
          noteCriteri, contestoMacro, codiceAteco, beniEsclusi, noteConclusive, testoAI } = opts
  const nrg = (proc.num||'') + (proc.anno?'/'+proc.anno:'')
  const fmtEur = (n) => { const p = parseFloat(n||0).toFixed(2).split('.'); p[0]=p[0].replace(/\B(?=(\d{3})+(?!\d))/g,'.'); return '\u20ac '+p[0]+','+p[1] }
  const fmtD2 = (d) => { if(!d) return '—'; const dt=new Date(d); return String(dt.getDate()).padStart(2,'0')+'/'+String(dt.getMonth()+1).padStart(2,'0')+'/'+dt.getFullYear() }
  const totVM = articoli.reduce((s,a) => s+(parseFloat(a.val_mercato||0)*parseFloat(a.qta||1)),0)
  const totVG = articoli.reduce((s,a) => s+(parseFloat(a.val_giud||0)*parseFloat(a.qta||1)),0)

  // Parse testo AI in sezioni
  const sezioni = { premessa:'', metodologia:'', contesto:'', inventario:'', conclusioni:'' }
  if (testoAI) {
    const lines = testoAI.split('\n')
    let cur = 'premessa'
    lines.forEach(l => {
      const lu = l.toUpperCase()
      if (lu.includes('METODOLOG')) cur = 'metodologia'
      else if (lu.includes('CONTESTO') || lu.includes('MACROEC')) cur = 'contesto'
      else if (lu.includes('INVENTARIO') || lu.includes('ANALITICO')) cur = 'inventario'
      else if (lu.includes('CONCLUS')) cur = 'conclusioni'
      sezioni[cur] += l + '\n'
    })
  }

  const numConf = { config: [{ reference: 'blt', levels: [{ level: 0, format: LevelFormat.BULLET, text: '-', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 360 } } } }] }] }
  const lr = logoB64 ? new ImageRun({ data: logoB64.split(',')[1], transformation: { width: 150, height: 50 }, type: 'png' }) : null
  const hdr = new Header({ children: [
    new Paragraph({ children: lr ? [lr] : [new TextRun({ text: 'PROCEDURE GESTITE E SERVIZI S.R.L.', font:'Gadugi', bold:true, size:20 })], alignment: AlignmentType.LEFT }),
    new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '244061', space: 1 } }, children: [] })
  ]})
  const ftr = new Footer({ children: [new Paragraph({
    alignment: AlignmentType.CENTER,
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA', space: 1 } },
    children: [
      new TextRun({ text: 'Procedure Gestite E Servizi S.r.l. — Via Giuseppe Parini, 29 - LECCO (LC) - 23900', font:'Gadugi', size:16 }),
      new TextRun({ text: '', break:1 }),
      new TextRun({ text: 'procedure@progess-italia.it | progess@arubapec.it | C.F. e P.IVA 03546380134', font:'Gadugi', size:16 }),
    ]
  })]})

  const T = (text, opts={}) => new TextRun({ text: String(text||''), font:'Gadugi', size:22, ...opts })
  const B = (text, size=22) => T(text, { bold:true, size })
  const P = (ch, opts={}) => new Paragraph({ children: Array.isArray(ch)?ch:[ch], alignment: AlignmentType.JUSTIFIED, spacing:{before:60,after:60}, ...opts })
  const PC = (ch, opts={}) => new Paragraph({ children: Array.isArray(ch)?ch:[ch], alignment: AlignmentType.CENTER, ...opts })
  const BR = () => new Paragraph({ children:[], spacing:{before:40,after:40} })
  const H1 = (text) => new Paragraph({ children:[B(text,26)], alignment:AlignmentType.LEFT, spacing:{before:200,after:100}, border:{ bottom:{style:BorderStyle.SINGLE,size:4,color:'244061',space:4} } })

  // Tabella info procedura
  const BN = { style:BorderStyle.NONE,size:0,color:'FFFFFF' }
  const BNS = { top:BN,bottom:BN,left:BN,right:BN }
  const BT = { style:BorderStyle.SINGLE,size:1,color:'AAAAAA' }
  const BTS = { top:BT,bottom:BT,left:BT,right:BT }
  const cw = _MCW
  const cell = (text,bold,shade) => new TableCell({ borders:BNS, width:{size:cw/2,type:WidthType.DXA}, shading:shade?{fill:shade,type:ShadingType.CLEAR}:undefined, margins:{top:80,bottom:80,left:120,right:120}, children:[new Paragraph({children:[bold?B(text):T(text)],alignment:AlignmentType.JUSTIFIED})] })
  const tblProc = new Table({ width:{size:cw,type:WidthType.DXA}, columnWidths:[cw/2,cw/2], borders:BTS, rows:[
    new TableRow({children:[cell('Procedura',false,'EEF2F7'), cell(proc.nome||'')]}),
    new TableRow({children:[cell('Tipo',false,'EEF2F7'), cell(proc.tipo||'')]}),
    new TableRow({children:[cell('N. R.G.',false,'EEF2F7'), cell(nrg)]}),
    new TableRow({children:[cell('Tribunale',false,'EEF2F7'), cell(proc.tribunale||'')]}),
    new TableRow({children:[cell('Giudice Delegato',false,'EEF2F7'), cell(proc.giudice||'')]}),
    new TableRow({children:[cell('Curatore',false,'EEF2F7'), cell(proc.curatore||'')]}),
    new TableRow({children:[cell('Commissionario',false,'EEF2F7'), cell('Pro.Ges.S. Srl')]}),
    new TableRow({children:[cell('Data sopralluogo',false,'EEF2F7'), cell(fmtD2(dataSopralluogo))]}),
  ]})

  // Tabella inventario analitico
  const colW = [Math.floor(cw*0.45), Math.floor(cw*0.1), Math.floor(cw*0.1), Math.floor(cw*0.17), Math.floor(cw*0.18)]
  const hdrRow = new TableRow({ children:[
    new TableCell({ borders:BTS, width:{size:colW[0],type:WidthType.DXA}, shading:{fill:'244061',type:ShadingType.CLEAR}, margins:{top:80,bottom:80,left:120,right:120}, children:[new Paragraph({children:[B('Descrizione',20)],alignment:AlignmentType.LEFT})] }),
    new TableCell({ borders:BTS, width:{size:colW[1],type:WidthType.DXA}, shading:{fill:'244061',type:ShadingType.CLEAR}, margins:{top:80,bottom:80,left:120,right:120}, children:[new Paragraph({children:[B('U.M.',20)],alignment:AlignmentType.CENTER})] }),
    new TableCell({ borders:BTS, width:{size:colW[2],type:WidthType.DXA}, shading:{fill:'244061',type:ShadingType.CLEAR}, margins:{top:80,bottom:80,left:120,right:120}, children:[new Paragraph({children:[B('Q.tà',20)],alignment:AlignmentType.CENTER})] }),
    new TableCell({ borders:BTS, width:{size:colW[3],type:WidthType.DXA}, shading:{fill:'244061',type:ShadingType.CLEAR}, margins:{top:80,bottom:80,left:120,right:120}, children:[new Paragraph({children:[B('Valore unit. (€)',20)],alignment:AlignmentType.RIGHT})] }),
    new TableCell({ borders:BTS, width:{size:colW[4],type:WidthType.DXA}, shading:{fill:'244061',type:ShadingType.CLEAR}, margins:{top:80,bottom:80,left:120,right:120}, children:[new Paragraph({children:[B('Totale (€)',20)],alignment:AlignmentType.RIGHT})] }),
  ]})
  const artRows = articoli.map((a,i) => {
    const vg = parseFloat(a.val_giud||0)
    const qta = parseFloat(a.qta||1)
    const tot = vg * qta
    const shade = i%2===0 ? 'F8F9FA' : 'FFFFFF'
    return new TableRow({ children:[
      new TableCell({ borders:BTS, width:{size:colW[0],type:WidthType.DXA}, shading:{fill:shade,type:ShadingType.CLEAR}, margins:{top:60,bottom:60,left:120,right:120}, children:[new Paragraph({children:[T(a.desc_breve||'—',{size:20})],alignment:AlignmentType.JUSTIFIED})] }),
      new TableCell({ borders:BTS, width:{size:colW[1],type:WidthType.DXA}, shading:{fill:shade,type:ShadingType.CLEAR}, margins:{top:60,bottom:60,left:120,right:120}, children:[new Paragraph({children:[T(a.unita_misura||'UN',{size:20})],alignment:AlignmentType.CENTER})] }),
      new TableCell({ borders:BTS, width:{size:colW[2],type:WidthType.DXA}, shading:{fill:shade,type:ShadingType.CLEAR}, margins:{top:60,bottom:60,left:120,right:120}, children:[new Paragraph({children:[T(String(qta),{size:20})],alignment:AlignmentType.CENTER})] }),
      new TableCell({ borders:BTS, width:{size:colW[3],type:WidthType.DXA}, shading:{fill:shade,type:ShadingType.CLEAR}, margins:{top:60,bottom:60,left:120,right:120}, children:[new Paragraph({children:[T(fmtEur(vg),{size:20})],alignment:AlignmentType.RIGHT})] }),
      new TableCell({ borders:BTS, width:{size:colW[4],type:WidthType.DXA}, shading:{fill:shade,type:ShadingType.CLEAR}, margins:{top:60,bottom:60,left:120,right:120}, children:[new Paragraph({children:[T(fmtEur(tot),{size:20})],alignment:AlignmentType.RIGHT})] }),
    ]})
  })
  const totRow = new TableRow({ children:[
    new TableCell({ borders:BTS, columnSpan:3, width:{size:colW[0]+colW[1]+colW[2],type:WidthType.DXA}, shading:{fill:'244061',type:ShadingType.CLEAR}, margins:{top:80,bottom:80,left:120,right:120}, children:[new Paragraph({children:[B('TOTALE',20)],alignment:AlignmentType.LEFT})] }),
    new TableCell({ borders:BTS, columnSpan:2, width:{size:colW[3]+colW[4],type:WidthType.DXA}, shading:{fill:'244061',type:ShadingType.CLEAR}, margins:{top:80,bottom:80,left:120,right:120}, children:[new Paragraph({children:[B(fmtEur(totVG),22)],alignment:AlignmentType.RIGHT})] }),
  ]})
  const tblInventario = new Table({ width:{size:cw,type:WidthType.DXA}, columnWidths:colW, borders:BTS, rows:[hdrRow, ...artRows, totRow] })

  // Testo AI in paragrafi
  const cleanAI = (testo) => testo
    .replace(/##[^\n]*/g, '')  // rimuove intestazioni markdown
    .replace(/\*\*/g, '')       // rimuove bold markdown
    .replace(/valore di mercato[^\n]*(\n|$)/gi, '')  // rimuove righe con valore di mercato
    .replace(/Val\.? merc[^\n]*(\n|$)/gi, '')
  const aiParas = (testo) => cleanAI(testo).split('\n').filter(l=>l.trim()).map(l => P(T(l.trim())))

  const doc = new Document({ numbering:numConf, sections:[{
    properties:{ page:{ size:{width:_MW,height:16838}, margin:{top:1200,right:_MM,bottom:1400,left:_MM} } },
    headers:{ default:hdr },
    footers:{ default:ftr },
    children:[
      PC([B('RELAZIONE DI STIMA', 30)], {spacing:{before:240,after:80}}),
      PC([T(proc.nome||'', {size:24})], {spacing:{before:0,after:40}}),
      PC([T('Tribunale di '+(proc.tribunale||'')+' — '+(proc.tipo||'')+' N. R.G. '+nrg, {size:20,italics:true})]),
      BR(),

      H1('1. DATI DELLA PROCEDURA'),
      BR(),
      tblProc,
      BR(),

      H1('2. PREMESSA E OGGETTO DELL\'INCARICO'),
      ...(sezioni.premessa ? aiParas(sezioni.premessa) : [
        P([T("La presente relazione di stima è stata redatta su incarico "), T(proc.curatore ? "del/della "+proc.curatore+", nella sua qualità di Liquidatore/Curatore della procedura di " : "del Curatore della procedura di "), T(proc.tipo+" n. "+nrg+" – "+(proc.nome||"")+", con l"), T("'obiettivo di determinare in maniera puntuale e trasparente il valore complessivo dei beni mobili, macchinari e attrezzature costituenti il patrimonio aziendale del/della debitore/trice, ai fini della liquidazione concorsuale ai sensi del D.Lgs. 14/2019 (CCII). La valutazione è stata condotta secondo criteri di stretta prudenzialità e con particolare riferimento al contesto liquidatorio, adottando parametri coerenti con le finalità della procedura concorsuale e con le aspettative di realizzo in sede di vendita forzata.")]),
        P([T("Il sopralluogo e la rilevazione dei beni sono stati effettuati in data "), B(fmtD2(dataSopralluogo)), T(". Al fine di pervenire ad una stima quanto più possibile aderente alla realtà economica e di mercato, si è proceduto attraverso le seguenti attività tecniche: rilevazione fisica diretta e documentazione fotografica dei beni presenti nei locali aziendali; attribuzione del valore economico al cespite sulla base di parametri di mercato e dello stato conservativo rilevato; applicazione di abbattimenti prudenziali ove ritenuto necessario in funzione delle condizioni d'uso e delle prospettive di realizzo.")]),
        ...(attivita ? [P([B("Attività aziendale: "), T(attivita)])] : []),
      ]),
      BR(),

      H1('3. METODOLOGIA DI VALUTAZIONE'),
      ...(sezioni.metodologia ? aiParas(sezioni.metodologia) : [
        P(T("La valutazione dei beni è stata condotta secondo il metodo comparativo di mercato, integrato con il metodo del costo di riproduzione deprezzato, tenendo conto dello stato d'uso effettivo, del grado di obsolescenza tecnica ed economica, nonché delle concrete possibilità di realizzo in sede di vendita giudiziale. Si è altresì considerato il livello di specializzazione dei beni, la loro ricollocabilità sul mercato dell'usato e la documentazione tecnica disponibile.")),
        P([B("Contesto di stima: "), T(contestoStima||'Liquidazione giudiziale (valori liquidatori)')]),
        P([B("Decurtazione prudenziale applicata: "), T((decurtazione||'15')+'% a titolo di visto e piaciuto e per riflettere il rischio di realizzo in sede di vendita giudiziale')]),
        ...(noteCriteri ? [P([B("Note aggiuntive sui criteri: "), T(noteCriteri)])] : []),
      ]),
      BR(),

      H1('4. CAUSE DELLA CRISI AZIENDALE'),
      ...(sezioni.contesto.length > 20 ? aiParas(sezioni.contesto) : (causeCresi ? [P(T(causeCresi))] : [P(T("Le cause della crisi aziendale sono in corso di accertamento da parte degli organi della procedura."))])),
      BR(),

      H1('5. CONTESTO MACROECONOMICO DEL SETTORE'),
      ...(contestoMacro ? aiParas(contestoMacro) : [P(T("L'analisi del contesto macroeconomico di riferimento è stata condotta tenendo conto delle condizioni di mercato del settore di appartenenza dell'azienda debitrice."))]),
      ...(codiceAteco ? [P([B("Codice ATECO di riferimento: "), T(codiceAteco)])] : []),
      BR(),

      ...(beniEsclusi ? [H1('6. BENI ESCLUSI DALLA STIMA'), P(T(beniEsclusi)), BR()] : []),

      H1('7. INVENTARIO ANALITICO E VALORIZZAZIONE'),
      P(T("Si riporta di seguito l'inventario analitico dei beni mobili rilevati, con l'indicazione del valore unitario e totale ai fini della presente stima:")),
      BR(),
      tblInventario,
      BR(),
      P([T("Il valore complessivo stimato dei beni mobili, ai fini della procedura concorsuale, ammonta a: "), B(fmtEur(totVG))]),
      BR(),

      H1('7. PROSPETTO DI SINTESI DELLA STIMA'),
      P(T("Si riporta di seguito il prospetto di sintesi del valore complessivo dei beni oggetto di perizia:")),
      BR(),
      new Table({ width:{size:cw,type:WidthType.DXA}, columnWidths:[Math.floor(cw*0.7),Math.floor(cw*0.3)], borders:BTS, rows:[
        new TableRow({ children:[
          new TableCell({ borders:BTS, width:{size:Math.floor(cw*0.7),type:WidthType.DXA}, shading:{fill:'244061',type:ShadingType.CLEAR}, margins:{top:80,bottom:80,left:120,right:120}, children:[new Paragraph({children:[B('Descrizione',20)],alignment:AlignmentType.LEFT})] }),
          new TableCell({ borders:BTS, width:{size:Math.floor(cw*0.3),type:WidthType.DXA}, shading:{fill:'244061',type:ShadingType.CLEAR}, margins:{top:80,bottom:80,left:120,right:120}, children:[new Paragraph({children:[B('Valore stimato',20)],alignment:AlignmentType.RIGHT})] }),
        ]}),
        new TableRow({ children:[
          new TableCell({ borders:BTS, width:{size:Math.floor(cw*0.7),type:WidthType.DXA}, margins:{top:80,bottom:80,left:120,right:120}, children:[new Paragraph({children:[T('Beni mobili e attrezzature aziendali',{size:20})],alignment:AlignmentType.LEFT})] }),
          new TableCell({ borders:BTS, width:{size:Math.floor(cw*0.3),type:WidthType.DXA}, margins:{top:80,bottom:80,left:120,right:120}, children:[new Paragraph({children:[T(fmtEur(totVG),{size:20})],alignment:AlignmentType.RIGHT})] }),
        ]}),
        new TableRow({ children:[
          new TableCell({ borders:BTS, width:{size:Math.floor(cw*0.7),type:WidthType.DXA}, shading:{fill:'EEF2F7',type:ShadingType.CLEAR}, margins:{top:80,bottom:80,left:120,right:120}, children:[new Paragraph({children:[B('TOTALE',20)],alignment:AlignmentType.LEFT})] }),
          new TableCell({ borders:BTS, width:{size:Math.floor(cw*0.3),type:WidthType.DXA}, shading:{fill:'EEF2F7',type:ShadingType.CLEAR}, margins:{top:80,bottom:80,left:120,right:120}, children:[new Paragraph({children:[B('€ '+fmtEur(totVG).replace('€ ',''),22)],alignment:AlignmentType.RIGHT})] }),
        ]}),
      ]}),
      BR(),
      H1('8. CONCLUSIONI'),
      ...(sezioni.conclusioni ? aiParas(sezioni.conclusioni) : [
        P([T("La presente perizia di stima, redatta in ottica di "), T(contestoStima||"liquidazione giudiziale"), T(", rappresenta un quadro realistico e prudenziale del valore di realizzo dei beni appartenenti alla procedura "), B(proc.tipo+" n. "+nrg+" – "+(proc.nome||"")), T(". Si evidenzia che i valori indicati tengono debitamente conto delle attuali condizioni del mercato dell'usato, dello stato d'uso effettivo dei beni nonché delle concrete possibilità di alienazione in un contesto di vendita forzata.")]),
        P([T("Il valore complessivo stimato, pari ad "), B(fmtEur(totVG)), T(", costituisce quindi un riferimento attendibile e coerente per le finalità della procedura concorsuale. Si precisa che eventuali variazioni delle condizioni di mercato, ovvero differenti modalità di vendita – sia in blocco che frazionata – potrebbero determinare oscillazioni rispetto ai valori qui determinati.")]),
        ...(noteConclusive ? [BR(), P(T(noteConclusive))] : []),
      ]),
      BR(),
      BR(),
      P(T("Lecco, "+fmtD2(dataSopralluogo||new Date().toISOString().slice(0,10)))),
      BR(),
      P([T("\t\t\t\t\tIl Commissionario")]),
      P([T("\t\t\t\t\t"), B("Pro.Ges.S. Srl")]),
      P([T("\t\t\t\t\tL"), T("'Amministratore Unico")]),
      P([T("\t\t\t\t\tLuigi IMPIERI")]),
      BR(),
      P(T("________________________________")),
    ]
  }]})
  return Packer.toBlob(doc)
}

function TabRelazioneStima({ proc }) {
  const { notify } = useStore()
  const [dataSopralluogo, setDataSopralluogo] = useState(new Date().toISOString().slice(0,10))
  const [sito, setSito] = useState('')
  const [attivita, setAttivita] = useState('')
  const [causeCrisi, setCauseCrisi] = useState('')
  const [decurtazione, setDecurtazione] = useState('15')
  const [contestoStima, setContestoStima] = useState(CONTESTI_STIMA[0])
  const [noteCriteri, setNoteCriteri] = useState('')
  const [contestoMacro, setContestoMacro] = useState('')
  const [codiceAteco, setCodiceAteco] = useState('')
  const [beniEsclusi, setBeniEsclusi] = useState('')
  const [noteConclusive, setNoteConclusive] = useState('')
  const [articoli, setArticoli] = useState([])
  const [generating, setGenerating] = useState(false)
  const [genAI, setGenAI] = useState(false)
  const [testoAI, setTestoAI] = useState('')

  useEffect(() => {
    if (proc?.id) {
      supabase.from('v_articoli_con_foto').select('*').eq('proc_id', proc.id).order('sort_order')
        .then(({ data }) => setArticoli(data || []))
    }
  }, [proc?.id])

  const generaConAI = async () => {
    const apiKey = localStorage.getItem('ip_apikey') || ''
    if (!apiKey || apiKey.length < 20) { notify('Inserisci la chiave API in Impostazioni', 'warn'); return }
    setGenAI(true)
    try {
      const nrg = (proc.num||'') + (proc.anno?'/'+proc.anno:'')
      const totVG = articoli.reduce((s,a) => s+(parseFloat(a.val_giud||0)*parseFloat(a.qta||1)),0)
      const fmtEur = (n) => { const p = parseFloat(n||0).toFixed(2).split('.'); p[0]=p[0].replace(/\B(?=(\d{3})+(?!\d))/g,'.'); return '\u20ac '+p[0]+','+p[1] }
      const elenco = articoli.slice(0,30).map((a,i) => `${i+1}. ${a.desc_breve||'—'} (q.tà ${a.qta||1}, val. giud. ${fmtEur(a.val_giud||0)})`).join('\n')
      const prompt = `Sei un perito giudiziario esperto in valutazioni per procedure concorsuali italiane ai sensi del D.Lgs. 14/2019 (CCII).

Redigi una RELAZIONE DI STIMA DETTAGLIATA E ARTICOLATA per la seguente procedura:
- Procedura: ${proc.tipo||''} n. ${nrg} – ${proc.nome||''}
- Tribunale di ${proc.tribunale||''}, Giudice Delegato: ${proc.giudice||''}
- Liquidatore/Curatore: ${proc.curatore||''}
- Data sopralluogo: ${dataSopralluogo}
${sito ? '- Sito aziendale: '+sito : ''}
${attivita ? '- Attività esercitata: '+attivita : ''}
${causeCrisi ? '- Cause della crisi: '+causeCrisi : ''}
${contestoMacro ? '- Contesto macroeconomico: '+contestoMacro : ''}
${codiceAteco ? '- Codice ATECO: '+codiceAteco : ''}
- Contesto di stima: ${contestoStima}
- Decurtazione prudenziale applicata: ${decurtazione}%
${noteCriteri ? '- Note aggiuntive sui criteri: '+noteCriteri : ''}
${beniEsclusi ? '- Beni esclusi dalla stima: '+beniEsclusi : ''}

Inventario (${articoli.length} articoli, valore giudiziario totale ${fmtEur(totVG)}):
${elenco}
${articoli.length > 30 ? '...e altri '+(articoli.length-30)+' articoli' : ''}

ISTRUZIONI FONDAMENTALI:
1. Usa ESCLUSIVAMENTE linguaggio tecnico-giuridico forense italiano (es. "si è proceduto a", "è stato accertato che", "ai sensi dell'art.", "nel caso di specie", "si evidenzia che").
2. Ogni sezione deve essere LUNGA e ARTICOLATA: almeno 3-4 paragrafi per sezione, con frasi complete e subordinate.
3. NON riportare mai il valore di mercato — usa SOLO il valore giudiziario/liquidatorio.
4. Integra i dati dell'inventario nella narrativa delle sezioni (categorie di beni, tipologie, stato d'uso).
5. NON includere tabelle inventario (vengono aggiunte automaticamente dopo).

Struttura OBBLIGATORIA con queste sezioni:
## 1. INTRODUZIONE ALLA PERIZIA DI STIMA
## 2. DESCRIZIONE DELL'ATTIVITÀ E DELL'IMPRESA  
## 3. BENI AZIENDALI OGGETTO DI PERIZIA
## 4. CAUSE DELLA CRISI AZIENDALE
## 5. ANALISI MACROECONOMICA DEL SETTORE
## 6. CRITERI DI STIMA
## 7. CONCLUSIONI

Ogni sezione deve essere esaustiva e professionale, con riferimenti normativi dove pertinente.`

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 3000,
          messages: [{ role: 'user', content: prompt }]
        })
      })
      const data = await res.json()
      const testo = data.content?.[0]?.text || ''
      if (!testo) throw new Error('Risposta AI vuota')
      setTestoAI(testo)
      notify('Relazione AI generata — verifica e genera il documento', 'ok', 5000)
    } catch (e) { notify('Errore AI: ' + e.message, 'err') }
    finally { setGenAI(false) }
  }

  const genera = async () => {
    setGenerating(true)
    try {
      const logo = localStorage.getItem('ip_logo') || null
      const blob = await _genRelazioneStima(proc, {
        dataSopralluogo, sito, attivita, causeCresi: causeCrisi,
        decurtazione, contestoStima, noteCriteri, contestoMacro,
        codiceAteco, beniEsclusi, noteConclusive, testoAI
      }, articoli, logo)
      _dl(blob, 'Relazione_Stima_'+(proc.nome||'').replace(/\s+/g,'_')+'.docx')
      notify('Relazione di Stima generata', 'ok')
    } catch (e) { notify('Errore: ' + e.message, 'err') }
    finally { setGenerating(false) }
  }

  const inp = (label, val, set, placeholder='', type='text') => (
    <div className="form-col-full form-group">
      <label className="form-label">{label}</label>
      {type === 'textarea'
        ? <textarea className="form-input" value={val} onChange={e=>set(e.target.value)} placeholder={placeholder} rows={3} />
        : <input type={type} className="form-input" value={val} onChange={e=>set(e.target.value)} placeholder={placeholder} />
      }
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Dati procedura */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">🏛 Dati procedura (da InventPro)</div>
        </div>
        <div className="card-body">
          <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: '12px 16px', fontSize: 13 }}>
            {[['Procedura', proc.nome],['Tipo', proc.tipo],['N. R.G.', (proc.num||'')+(proc.anno?'/'+proc.anno:'')],['Tribunale', proc.tribunale],['Giudice Delegato', proc.giudice],['Curatore', proc.curatore],['Commissionario', 'Pro.Ges.S. Srl']].map(([l,v]) => (
              <div key={l} style={{ display:'flex', gap:12, marginBottom:4 }}>
                <span style={{ color:'var(--text3)', minWidth:140 }}>{l}</span>
                <span style={{ fontWeight:500 }}>{v||'—'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Info per AI */}
      <div className="card">
        <div className="card-header"><div className="card-title">🌐 Informazioni azienda per l'AI</div></div>
        <div className="card-body">
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Sito internet azienda (facoltativo)</label>
              <input className="form-input" value={sito} onChange={e=>setSito(e.target.value)} placeholder="https://www.esempio.it" />
            </div>
            <div className="form-group">
              <label className="form-label">Data sopralluogo / perizia</label>
              <input type="date" className="form-input" value={dataSopralluogo} onChange={e=>setDataSopralluogo(e.target.value)} />
            </div>
            {inp("Di cosa si occupa / si occupava l'azienda", attivita, setAttivita, "Es: officina metalmeccanica specializzata in lavorazioni per conto terzi...", 'textarea')}
          </div>
        </div>
      </div>

      {/* Cause crisi */}
      <div className="card">
        <div className="card-header"><div className="card-title">📉 Cause della crisi aziendale</div></div>
        <div className="card-body">
          <div className="form-grid">
            {inp('', causeCrisi, setCauseCrisi, 'Es: difficoltà finanziarie legate a calo ordini, perdita commesse principali, aumento costi energia...', 'textarea')}
          </div>
        </div>
      </div>

      {/* Criteri */}
      <div className="card">
        <div className="card-header"><div className="card-title">⚖️ Criteri di valutazione applicati</div></div>
        <div className="card-body">
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Decurtazione prudenziale (%)</label>
              <input className="form-input" value={decurtazione} onChange={e=>setDecurtazione(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Contesto di stima</label>
              <select className="form-input" value={contestoStima} onChange={e=>setContestoStima(e.target.value)}>
                {CONTESTI_STIMA.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            {inp('Note aggiuntive sui criteri (facoltativo)', noteCriteri, setNoteCriteri, 'Es: macchinari privi di certificazione CE valorizzati come rottame...', 'textarea')}
          </div>
        </div>
      </div>

      {/* Contesto macro */}
      <div className="card">
        <div className="card-header"><div className="card-title">📊 Contesto macroeconomico del settore</div></div>
        <div className="card-body">
          <div className="form-grid">
            {inp('', contestoMacro, setContestoMacro, 'Es: il settore manifatturiero ha subito pressioni a aumento costi energetici...', 'textarea')}
            <div className="form-col-full form-group">
              <label className="form-label">Codice ATECO del settore (facoltativo)</label>
              <input className="form-input" value={codiceAteco} onChange={e=>setCodiceAteco(e.target.value)} placeholder="Es: 25.62 - Lavori di meccanica" />
            </div>
          </div>
        </div>
      </div>

      {/* Beni esclusi */}
      <div className="card">
        <div className="card-header"><div className="card-title">🚫 Beni esclusi dalla stima</div></div>
        <div className="card-body">
          <div className="form-grid">
            {inp('', beniEsclusi, setBeniEsclusi, 'Es: beni in leasing, beni di proprietà di terzi, assets immateriali...', 'textarea')}
          </div>
        </div>
      </div>

      {/* Note conclusive */}
      <div className="card">
        <div className="card-header"><div className="card-title">📝 Note conclusive</div></div>
        <div className="card-body">
          <div className="form-grid">
            {inp('', noteConclusive, setNoteConclusive, 'Es: i valori riportati sono da ritenersi stime prudenziali in ottica liquidatoria...', 'textarea')}
          </div>
        </div>
      </div>

      {/* Inventario */}
      <div className="card">
        <div className="card-header"><div className="card-title">📦 Inventario analitico</div></div>
        <div className="card-body">
          <p style={{ fontSize:13, color:'var(--text2)' }}>
            {articoli.length > 0
              ? `${articoli.length} articoli da InventPro verranno inclusi nel documento con descrizione, quantità e valori.`
              : 'Nessun articolo trovato per questa procedura.'}
          </p>
        </div>
      </div>

      {/* Testo AI generato */}
      {testoAI && (
        <div className="card">
          <div className="card-header"><div className="card-title">✦ Testo generato dall'AI</div></div>
          <div className="card-body">
            <textarea className="form-input" value={testoAI} onChange={e=>setTestoAI(e.target.value)} rows={12} style={{ fontFamily:'monospace', fontSize:12 }} />
            <div style={{ fontSize:11, color:'var(--text3)', marginTop:4 }}>Puoi modificare il testo prima di generare il documento.</div>
          </div>
        </div>
      )}

      {/* Azioni */}
      <div style={{ display:'flex', justifyContent:'flex-end', gap:10, paddingBottom:24 }}>
        <button className="btn btn-ghost" onClick={generaConAI} disabled={genAI || articoli.length===0}>
          ✦ {genAI ? 'Generazione AI…' : 'Genera testo con AI'}
        </button>
        <button className="btn btn-primary" onClick={genera} disabled={generating || articoli.length===0}>
          <Download size={14} /> {generating ? 'Generazione…' : 'Genera Relazione di Stima (.docx)'}
        </button>
      </div>
    </div>
  )
}

const TABS = [
  { id: 'anagrafica', label: 'Anagrafica', icon: FileText },
  { id: 'sedi', label: 'Sedi', icon: MapPin },
  { id: 'inventario', label: 'Inventario', icon: Package },
  { id: 'lotti', label: 'Lotti', icon: Layers },
  { id: 'contratti', label: 'Contratti', icon: Download },
  { id: 'relazione', label: 'Rel. di Stima', icon: FileText },
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
        {tab === 'contratti' && <TabContratti proc={proc} />}
        {tab === 'relazione' && <TabRelazioneStima proc={proc} />}
      </div>
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Modifica procedura" wide>
        <ProcForm proc={proc} onClose={() => setShowEdit(false)} onSave={(p) => { setProc(p); setCurrentProc(p); setShowEdit(false) }} />
      </Modal>
    </>
  )
}
