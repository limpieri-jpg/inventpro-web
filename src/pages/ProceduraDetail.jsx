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


// ─── Helpers docx ──────────────────────────────────────────────────────────
const _PAGE_W = 11906; const _MARGIN = 1000; const _CONTENT_W = _PAGE_W - _MARGIN * 2
const _BN = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const _BNS = { top: _BN, bottom: _BN, left: _BN, right: _BN }
const _BT = { style: BorderStyle.SINGLE, size: 1, color: 'AAAAAA' }
const _BTS = { top: _BT, bottom: _BT, left: _BT, right: _BT }
function _p(ch, opts = {}) { return new Paragraph({ children: Array.isArray(ch) ? ch : [ch], ...opts }) }
function _t(text, opts = {}) { return new TextRun({ text: String(text || ''), font: 'Gadugi', size: 22, ...opts }) }
function _b(text, size = 22) { return _t(text, { bold: true, size }) }
function _br() { return new Paragraph({ children: [], spacing: { before: 80, after: 80 } }) }
function _cell(text, isBold, shade) {
  return new TableCell({ borders: _BNS, width: { size: _CONTENT_W / 2, type: WidthType.DXA },
    shading: shade ? { fill: shade, type: ShadingType.CLEAR } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [_p(isBold ? _b(text) : _t(text))] })
}
function _tblInfo(rows) {
  return new Table({ width: { size: _CONTENT_W, type: WidthType.DXA }, columnWidths: [_CONTENT_W/2, _CONTENT_W/2], borders: _BTS,
    rows: rows.map(([l, v]) => new TableRow({ children: [_cell(l, false, 'EEF2F7'), _cell(v || '')] })) })
}
function _fatt(proc) {
  const sede = (proc.sedi || []).find(s => s.tipo === 'legale') || {}
  const ind = [sede.indirizzo, sede.civico, sede.cap, sede.comune, sede.provincia ? '('+sede.provincia+')' : ''].filter(Boolean).join(' ')
  return new Table({ width: { size: _CONTENT_W, type: WidthType.DXA }, columnWidths: [_CONTENT_W/2, _CONTENT_W/2], borders: _BTS,
    rows: [
      new TableRow({ children: [new TableCell({ borders: _BTS, columnSpan: 2, shading: { fill: '244061', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [_p(_b('INTESTATARIO FATTURA:'))] })] }),
      new TableRow({ children: [_cell('RAGIONE SOCIALE', false, 'EEF2F7'), _cell(proc.nome || '')] }),
      new TableRow({ children: [_cell('SEDE LEGALE / INDIRIZZO', false, 'EEF2F7'), _cell(ind || '—')] }),
      new TableRow({ children: [_cell('C.F. / P.IVA', false, 'EEF2F7'), _cell((proc.cf||'') + (proc.piva?' / '+proc.piva:''))] }),
      new TableRow({ children: [_cell('P.E.C. (fatturazione elettronica)', false, 'EEF2F7'), _cell(proc.pec||'')] }),
    ] })
}
function _firme(proc) {
  const nrg = (proc.num||'') + (proc.anno?'/'+proc.anno:'')
  return [_br(), _p([_t(proc.tipo+' '+nrg), new TextRun({ text: '', break: 1 }), _b(proc.nome||'')]),
    _br(), _p(_t("Il Curatore " + (proc.curatore||''))), _p(_t('________________________________')),
    _br(), _p(_b("Pro.ges.s S.r.l.")), _p(_t("L'Amministratore Unico")), _p(_t('Luigi IMPIERI')), _p(_t('________________________________'))]
}
function _hdr(logoB64) {
  const lr = logoB64 ? new ImageRun({ data: logoB64.split(',')[1], transformation: { width: 150, height: 50 }, type: 'png' }) : null
  return new Header({ children: [
    new Paragraph({ children: lr ? [lr] : [_b('PROCEDURE GESTITE E SERVIZI S.R.L.', 20)], alignment: AlignmentType.LEFT }),
    new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '244061', space: 1 } }, children: [] })
  ]})
}
function _ftr() {
  return new Footer({ children: [new Paragraph({
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA', space: 1 } },
    children: [_t('Procedure Gestite E Servizi S.r.l. — Via Giuseppe Parini, 29 - LECCO (LC) - 23900', { size: 16 }),
               new TextRun({ text: '', break: 1 }),
               _t('procedure@progess-italia.it | progess@arubapec.it | C.F. e P.IVA 03546380134', { size: 16 })]
  })]})
}
function _fmtD(d) { if (!d) return '______'; const dt = new Date(d); return String(dt.getDate()).padStart(2,'0')+'/'+String(dt.getMonth()+1).padStart(2,'0')+'/'+dt.getFullYear() }
function _dl(blob, nome) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = nome
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}
function _numConf() {
  return { config: [{ reference: 'blt', levels: [{ level: 0, format: LevelFormat.BULLET, text: '-', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }] }
}
function _secProps() {
  return { properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1200, right: _MARGIN, bottom: 1400, left: _MARGIN } } }, headers: { default: _hdr(null) }, footers: { default: _ftr() } }
}
function _blt(children) { return new Paragraph({ numbering: { reference: 'blt', level: 0 }, children: Array.isArray(children) ? children : [children] }) }

const SMOB = [
  'Predisposizione Relazione di stima e Report Fotografico valorizzato',
  'Coadiuvare il/la Curatore/Curatrice nella predisposizione degli Avvisi di vendita e dei modelli per offerte irrevocabili',
  'Accompagnare gli utenti interessati alla visita dei beni mobili posti in vendita',
  'Pubblicità Legale su "Progess Italia"',
  'Pubblicità Legale sul Portale delle Vendite Pubbliche (PVP)',
  'Esperire i tentativi di vendita mediante procedure competitive (art. 216 CCII)',
  'Comunicare esiti delle vendite al Curatore con Verbale e Report piattaforma',
]
const SIMM = [
  'Coadiuvare il Curatore nella predisposizione degli Avvisi di vendita e dei modelli per offerte irrevocabili di acquisto',
  'Accompagnare gli utenti interessati alla visita dei beni immobili posti in vendita',
  'Pubblicità Legale su "Progess Italia"',
  'Pubblicità Legale sul Portale delle Vendite Pubbliche (PVP), previa nomina in qualità di soggetto abilitato da parte della Cancelleria',
  'Esperire i tentativi di vendita necessari per la liquidazione totale dei beni immobili mediante procedure competitive (art. 216 CCII)',
  'Comunicare gli esiti delle vendite al Curatore con Verbale delle operazioni di vendita e Report della piattaforma Progess Italia',
]

function _intro(proc, tipo) {
  const nrg = (proc.num||'') + (proc.anno?'/'+proc.anno:'')
  const sede = (proc.sedi||[]).find(s => s.tipo==='legale') || {}
  const ind = [sede.indirizzo, sede.civico, sede.cap, sede.comune, sede.provincia?'('+sede.provincia+')':''].filter(Boolean).join(' ')
  return [
    _br(),
    _p([_t('Con il presente contratto, da valersi ad ogni effetto di legge, tra:')]),
    _br(),
    _p([_t('la '), _b(proc.tipo||''), _t(' '), _b('R.G. '+nrg+' - '+(proc.nome||'')),
        _t(', C.F. e P.IVA '+(proc.cf||'')+(proc.piva?' P.IVA '+proc.piva:'')+', con sede legale in '+ind+', rappresentata in questa sede dal Curatore '),
        _b(proc.curatore||''), _t(' con sentenza n. '+(proc.sentenza_num||'n. _______')+' dal Tribunale di '+(proc.tribunale||'')+
        ', PEC della procedura '+(proc.pec||'')+' (di seguito "'), _b('Cliente'), _t('") da una parte')]),
    _br(), _p(_b('e')), _br(),
    _p([_t('la società '), _b('"PROCEDURE GESTITE E SERVIZI S.R.L."'), _t(' - in forma abbreviata '), _b('"PRO.GES.S. S.R.L."'),
        _t(', C.F. e P.IVA 03546380134, con sede legale in Via Giuseppe Parini n.ro 29, PEC progess@arubapec.it, in persona '),
        _t("dell\'Amministratore Unico Sig. "), _b('Luigi IMPIERI'), _t(', C.F. MPRLGU72S12D086V, (di seguito "'),
        _b('Pro.Ges.S.'), _t('"), dall\'altra parte')]),
    _br(),
    _p(_b('PREMESSO CHE')),
    _blt([_t('il Cliente intende conferire a Pro.Ges.S. il mandato per la vendita dei '), _b('beni '+tipo), _t(' acquisiti all\'attivo della procedura')]),
    _blt([_t('Pro.Ges.S. ha le competenze e gli strumenti per adempiere il suddetto incarico, quale soggetto specializzato ai sensi dell\'Art. 216 CCII;')]),
    _br(), _p(_t('Tutto ciò premesso, tra le Parti')), _br(),
    _p(_b('SI STIPULA E CONVIENE QUANTO SEGUE')), _br(),
    _blt(_b("OGGETTO DELL'INCARICO")), _br(),
    _p(_t('Il Cliente conferisce incarico a Pro.Ges.S., la quale accetta di:')),
  ]
}

function _chiusura(proc, dataContratto) {
  return [
    _br(),
    _blt(_b('FORO COMPETENTE')),
    _p(_t('Per qualsiasi controversia connessa al presente mandato sarà esclusivamente competente il Foro di Lecco.')),
    _br(),
    _p(_t('Lecco, '+_fmtD(dataContratto))), _br(),
    _p(_b('Il Cliente')),
    ..._firme(proc),
  ]
}

async function _genMob(proc, opts, logoB64) {
  const { dataContratto, compenso, costoLotto, rt, servizi } = opts
  const nrg = (proc.num||'') + (proc.anno?'/'+proc.anno:'')
  const hasRT = rt && rt.trim() !== ''
  const sp = servizi.map(s => _blt(_t(s)))
  const secP = _secProps(); secP.headers = { default: _hdr(logoB64) }; secP.footers = { default: _ftr() }
  const doc = new Document({ numbering: _numConf(), sections: [{ ...secP, children: [
    _p(_b('MANDATO PER LA VENDITA DI BENI MOBILI', 28), { alignment: AlignmentType.CENTER, spacing: { before: 240, after: 240 } }),
    ..._intro(proc, 'mobili'), ...sp, _br(),
    _p(_b('DATI DELLA PROCEDURA CONCORSUALE'), { alignment: AlignmentType.CENTER }), _br(),
    _tblInfo([['Procedura', proc.nome||''], ['Tipo', proc.tipo||''], ['N. R.G.', nrg], ['Tribunale', proc.tribunale||''], ['Curatore', proc.curatore||''], ['PEC procedura', proc.pec||'']]),
    _br(), _p([_t('Data contratto: '), _b(_fmtD(dataContratto))]),
    _br(), _p(_b('Dati per fatturazione:')), _br(), _fatt(proc), _br(),
    _p([_t('PAGAMENTO mediante bonifico bancario su conto corrente intestato a "'), _b('Pro.Ges.S. S.r.l.'), _t('" Deutsche Bank filiale di Lecco — IBAN IT63J 03104 22903 000000820981')]),
    _br(), _blt(_b('COMPENSO')), _br(),
    _p([_t("Per l'espletamento dei servizi effettuati da Pro.Ges.S., quest'ultima avrà diritto ad un compenso "),
        _b('pari '+(compenso||'10')+'%'), _t(', oltre IVA, calcolato sul prezzo di aggiudicazione definitivo, per ogni lotto venduto e '),
        _b("saranno ad esclusivo carico dell\'aggiudicatario.")]),
    _br(), _p(_b('Costi a carico della Procedura:')),
    _blt([_t('Per il servizio di caricamento dei Lotti su PVP e Progess Italia, Pro.Ges.S. avrà diritto ad un compenso di '),
          _b('Euro '+(costoLotto||'25,00')+' oltre IVA'), _t(', per ciascun Lotto pubblicato.')]),
    ...(hasRT ? [_blt([_t('Acquisto della RT di pubblicazione '), _b('Euro '+rt), _t(' oltre commissioni bancarie (per i beni mobili registrati).')])] : []),
    ..._chiusura(proc, dataContratto),
  ]}] })
  return Packer.toBlob(doc)
}

async function _genImm(proc, opts, logoB64) {
  const { dataContratto, scaglioni, costoLotto, iban, dataAut, servizi } = opts
  const nrg = (proc.num||'') + (proc.anno?'/'+proc.anno:'')
  const sp = servizi.map(s => _blt(_t(s)))
  const tblS = new Table({ width: { size: _CONTENT_W, type: WidthType.DXA }, columnWidths: [_CONTENT_W/2, _CONTENT_W/2], borders: _BTS,
    rows: [
      new TableRow({ children: [_cell('Fino ad € 350.000', false, 'EEF2F7'), _cell((scaglioni[0]||'3')+'%', true)] }),
      new TableRow({ children: [_cell('Da € 350.001 a € 700.000', false, 'EEF2F7'), _cell((scaglioni[1]||'2.5')+'%', true)] }),
      new TableRow({ children: [_cell('Da € 700.001 a € 1.000.000', false, 'EEF2F7'), _cell((scaglioni[2]||'2')+'%', true)] }),
      new TableRow({ children: [_cell('Oltre € 1.000.000', false, 'EEF2F7'), _cell((scaglioni[3]||'1.5')+'%', true)] }),
    ] })
  const secP = _secProps(); secP.headers = { default: _hdr(logoB64) }; secP.footers = { default: _ftr() }
  const doc = new Document({ numbering: _numConf(), sections: [{ ...secP, children: [
    _p(_b('MANDATO PER LA VENDITA DI BENI IMMOBILI', 28), { alignment: AlignmentType.CENTER, spacing: { before: 240, after: 240 } }),
    ..._intro(proc, 'immobili'), ...sp, _br(),
    _p(_b('DATI DELLA PROCEDURA CONCORSUALE'), { alignment: AlignmentType.CENTER }), _br(),
    _tblInfo([['Procedura', proc.nome||''], ['Tipo', proc.tipo||''], ['N. R.G.', nrg], ['Tribunale', proc.tribunale||''], ['Curatore', proc.curatore||''], ['PEC procedura', proc.pec||'']]),
    _br(), _p([_t('Data contratto: '), _b(_fmtD(dataContratto))]),
    ...(iban ? [_p([_t('IBAN procedura (per trasferimento somme): '), _b(iban)])] : []),
    ...(dataAut ? [_p([_t('Data autorizzazione Giudice Delegato: '), _b(_fmtD(dataAut))])] : []),
    _br(), _p(_b('Dati per fatturazione:')), _br(), _fatt(proc), _br(),
    _p([_t('PAGAMENTO mediante bonifico bancario su conto corrente intestato a "'), _b('Pro.Ges.S. S.r.l.'), _t('" Deutsche Bank filiale di Lecco — IBAN IT63J 03104 22903 000000820981')]),
    _br(), _blt(_b('COMPENSO')), _br(),
    _p(_t("Per l'espletamento dei servizi, per ogni lotto venduto, Pro.Ges.S. avrà diritto ad un compenso calcolato a SCAGLIONI sul valore di aggiudicazione definitivo, OLTRE IVA, a esclusivo carico dell\'aggiudicatario:")),
    _br(), tblS, _br(),
    _p(_b('Costi a carico della Procedura:')),
    _blt([_t('Caricamento lotti su PVP e Progess Italia: '), _b('Euro '+(costoLotto||'25,00')+' oltre IVA'), _t(', per ciascun lotto.')]),
    ..._chiusura(proc, dataContratto),
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

const TABS = [
  { id: 'anagrafica', label: 'Anagrafica', icon: FileText },
  { id: 'sedi', label: 'Sedi', icon: MapPin },
  { id: 'inventario', label: 'Inventario', icon: Package },
  { id: 'lotti', label: 'Lotti', icon: Layers },
  { id: 'contratti', label: 'Contratti', icon: Download },
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
      </div>
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Modifica procedura" wide>
        <ProcForm proc={proc} onClose={() => setShowEdit(false)} onSave={(p) => { setProc(p); setCurrentProc(p); setShowEdit(false) }} />
      </Modal>
    </>
  )
}
