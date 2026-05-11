import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Topbar, Spinner, Modal, Empty } from '../components/layout'
import { supabase } from '../lib/supabase'
import { Plus, Search, X, Trash2, Camera, FileDown } from 'lucide-react'
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
        if (photos.length > 0) notify('Articolo creato. Riapri per caricare le foto.', 'info', 4000)
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
  const [showFallcoModal, setShowFallcoModal] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [dataDeposito, setDataDeposito] = useState('')
  const [exportingFallco, setExportingFallco] = useState(false)
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

  const genReport = async (estimativo) => {
    try {
      const { data: tutti, error } = await supabase.from('v_articoli_con_foto').select('*').eq('proc_id', currentProc.id).order('sort_order')
      if (error) throw error
      if (!tutti.length) { notify('Nessun articolo da esportare', 'warn'); return }

      const studioLogo = localStorage.getItem('ip_logo') || ''
      const studioNome = localStorage.getItem('ip_studio_nome') || 'Pro.Ges.S. Srl'
      const studioIndirizzo = localStorage.getItem('ip_studio_indirizzo') || ''
      const footerTxt = studioNome + (studioIndirizzo ? ' — ' + studioIndirizzo : '')
      const logoHtml = studioLogo
        ? `<img src="${studioLogo}" style="max-height:70px;max-width:200px;object-fit:contain">`
        : `<div style="font-size:18px;font-weight:700;color:#1a3a6b">${studioNome}</div>`
      const makeQRUrl = (text) => `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent((text || 'INV').substring(0, 100))}`
      const proc = currentProc
      const titoloDoc = estimativo ? 'Report estimativo' : 'Report fotografico beni mobili'
      const coverTitle = estimativo ? 'REPORT ESTIMATIVO' : 'REPORT FOTOGRAFICO'
      const totVG = tutti.reduce((s, a) => s + (parseFloat(a.val_giud || 0) * parseFloat(a.qta || 1)), 0)
      const fmtEurLocal = (n) => '€' + parseFloat(n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      const procQR = makeQRUrl([(proc.tipo || ''), (proc.nome || ''), (proc.numero || '')].join(' '))

      const frontespizio = '<div style="page-break-after:always;min-height:100vh;display:flex;flex-direction:column;padding:50px 60px;background:#fff;box-sizing:border-box">'
        + '<div style="text-align:center;margin-bottom:auto">'
        + '<div style="margin-bottom:24px">' + logoHtml + '</div>'
        + '<div style="font-size:24px;font-weight:700;color:#1a1a16;letter-spacing:.03em;margin-bottom:28px">' + coverTitle + '</div>'
        + '<div style="font-size:17px;color:#333;margin-bottom:8px">' + (proc.tipo || '') + '</div>'
        + '<div style="font-size:15px;color:#555;margin-bottom:8px">N\u00b0 ' + (proc.numero || '') + '</div>'
        + '<div style="font-size:15px;color:#555">Tribunale di ' + (proc.tribunale || '') + '</div>'
        + (proc.nome ? '<div style="font-size:14px;font-weight:600;color:#333;margin-top:6px">' + proc.nome + '</div>' : '')
        + '</div>'
        + '<div style="text-align:center;margin-top:auto">'
        + (proc.giudice ? '<div style="font-size:14px;color:#333;margin-bottom:8px">Giudice Delegato: ' + proc.giudice + '</div>' : '')
        + (proc.curatore ? '<div style="font-size:14px;color:#333;margin-bottom:8px">Curatore: ' + proc.curatore + '</div>' : '')
        + '<div style="font-size:14px;color:#1a3a6b;font-weight:600;margin-bottom:8px">Commissionario: ' + studioNome + '</div>'
        + '<div style="margin-top:16px;border-top:1px solid #ddd;padding-top:8px;font-size:10px;color:#888">' + footerTxt + '</div>'
        + '</div></div>'

      const artRows = tutti.map((a, i) => {
        const vg = parseFloat(a.val_giud || 0) * parseFloat(a.qta || 1)
        const artQR = makeQRUrl(a.codice_siecic || ('ART-' + (i + 1)))
        let metaLeft = ''
        metaLeft += '<tr><td class="lbl">Quantit\u00e0:</td><td>' + (a.qta || 1) + ' ' + (a.unita_misura || 'UN') + '</td></tr>'
        if (a.desc_breve || a.desc_estesa) metaLeft += '<tr><td class="lbl" style="vertical-align:top">Descrizione:</td><td>' + (a.desc_breve || '') + (a.desc_estesa ? '<br><span style="color:#555">' + a.desc_estesa + '</span>' : '') + '</td></tr>'
        let metaRight = ''
        if (a.anno_prod) metaRight += '<tr><td class="lbl">Anno:</td><td>' + a.anno_prod + '</td></tr>'
        if (a.stato) metaRight += '<tr><td class="lbl">Stato:</td><td>' + a.stato + '</td></tr>'
        if (a.marca) metaRight += '<tr><td class="lbl">Marca:</td><td>' + a.marca + '</td></tr>'
        if (a.modello) metaRight += '<tr><td class="lbl">Modello:</td><td>' + a.modello + '</td></tr>'
        if (a.matricola) metaRight += '<tr><td class="lbl">Matricola:</td><td>' + a.matricola + '</td></tr>'
        if (a.note) metaRight += '<tr><td class="lbl" style="vertical-align:top">Note:</td><td>' + a.note + '</td></tr>'
        const valoreHdr = estimativo ? '<div style="margin-left:auto;font-size:12px;font-weight:700;padding:0 14px;white-space:nowrap">Valore di Stima: ' + fmtEurLocal(vg) + '</div>' : ''
        let photosHtml = ''
        if (a.prima_foto_url) photosHtml = '<div class="photos-wrap"><div class="photos-lbl"><b>Fotografie:</b></div><div class="photos-row"><img src="' + a.prima_foto_url + '" class="photo"></div></div>'
        return '<div class="card"><div class="card-hdr"><div class="card-num">' + (i + 1) + '</div><div class="card-title">' + (a.desc_breve || 'Articolo ' + (i + 1)) + '</div>' + valoreHdr + '</div>'
          + '<table class="card-body"><tr>'
          + '<td class="qr-cell"><img src="' + artQR + '" style="width:66px;height:66px"></td>'
          + '<td class="meta-cell"><table class="meta-tbl">' + metaLeft + '</table></td>'
          + (metaRight ? '<td class="meta-cell"><table class="meta-tbl">' + metaRight + '</table></td>' : '')
          + '</tr></table>' + photosHtml + '</div>'
      }).join('')

      const totBanner = estimativo ? '<div class="tot-banner-est"><b>Valore di Stima totale:</b> ' + fmtEurLocal(totVG) + '</div>' : ''
      const printBtn = '<div class="print-bar no-print"><div style="flex:1"><div style="font-weight:700;font-size:14px;margin-bottom:3px">\uD83D\uDCCB ' + titoloDoc + '</div>'
        + '<div style="font-size:11px;opacity:.9">\u2460 Clicca <b>Stampa/Salva PDF</b> &nbsp;\u2461 Destinazione: <b>Salva come PDF</b> &nbsp;\u2462 Disattiva <b>Intestazioni e pi\u00e8 di pagina</b> + attiva <b>Grafica di sfondo</b></div></div>'
        + '<button onclick="window.print()" class="print-btn">\uD83D\uDDB8 Stampa / Salva PDF</button></div>'
      const pageHdr = '<div class="page-hdr"><div>' + logoHtml + '</div>'
        + '<div style="display:flex;align-items:center;gap:10px">'
        + '<div class="page-hdr-info"><b>' + titoloDoc + '</b>' + (proc.tipo || '') + ' ' + (proc.nome || '') + '<br>n\u00b0 ' + (proc.numero || '') + ' - Tribunale di ' + (proc.tribunale || '') + '<br>'
        + (proc.giudice ? 'Giudice: <em>' + proc.giudice + '</em><br>' : '')
        + (proc.curatore ? 'Curatore: <em>' + proc.curatore + '</em>' : '') + '</div>'
        + '<img src="' + procQR + '" style="width:60px;height:60px">'
        + '</div></div>'
      const css = '@page{size:A4 portrait;margin:0 0 20mm 0;-webkit-print-color-adjust:exact;print-color-adjust:exact}*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px;color:#222;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}@media print{html,body{margin:0;padding:0}.report-wrap{padding:12mm 12mm 16mm 12mm}}.print-bar{position:sticky;top:0;background:#1d4ed8;color:#fff;padding:10px 20px;display:flex;align-items:center;gap:16px;z-index:999}.print-btn{background:#fff;color:#1d4ed8;border:none;padding:8px 18px;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px}.page-hdr{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:8px;border-bottom:2px solid #2d6a7f;margin-bottom:16px}.page-hdr-info{text-align:right;font-size:10px;line-height:1.7;color:#333}.page-hdr-info b{font-size:12px;color:#000;display:block}.card{border:1px solid #aaa;margin-bottom:16px;page-break-inside:avoid;break-inside:avoid}.card-hdr{background:#1a3a5c;color:#fff;display:flex;align-items:center;-webkit-print-color-adjust:exact;print-color-adjust:exact}.card-num{width:36px;min-height:36px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;background:rgba(255,255,255,.15)}.card-title{font-size:13px;font-weight:700;padding:8px 10px;flex:1}.card-body{width:100%;border-collapse:collapse;padding:8px 12px}.qr-cell{width:88px;vertical-align:top;padding:8px 6px 8px 12px}.meta-cell{vertical-align:top;padding:8px 12px 8px 14px}.meta-tbl{border-collapse:collapse}.lbl{font-weight:700;padding-right:6px;white-space:nowrap;line-height:1.8;vertical-align:top}.photos-wrap{padding:0 12px 12px}.photos-lbl{margin-bottom:6px}.photos-row{display:flex;flex-wrap:wrap;gap:6px}.photo{width:190px;height:142px;object-fit:cover;border:1px solid #ccc}.tot-banner-est{background:#8b1a1a;color:#fff;padding:14px 24px;margin-top:16px;font-size:16px;text-align:center;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page-footer{position:fixed;bottom:0;left:0;right:0;border-top:1px solid #ccc;padding:5px 16px;font-size:9px;color:#666;text-align:center;background:#fff;display:flex;align-items:center;justify-content:space-between}@media print{.no-print{display:none!important}.page-footer{position:fixed;bottom:0}}'
      const pageFooter = '<div class="page-footer"><span>' + footerTxt + '</span><span>Procedura: ' + (proc.nome || '') + ' n° ' + (proc.numero || '') + '</span></div>'
      const bodyHtml = printBtn + frontespizio + '<div class="report-wrap" style="padding:16px 16px 30px">' + pageFooter + pageHdr + artRows + totBanner + '</div>'
      const html = '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>' + titoloDoc + '</title><style>' + css + '</style></head><body>' + bodyHtml + '</body></html>'
      const win = window.open('', '_blank')
      if (win) { win.document.write(html); win.document.close() }
      else notify('Abilita i popup per generare il report', 'warn')
      setShowReportModal(false)
    } catch (e) { notify('Errore: ' + e.message, 'err') }
  }

  const exportFallco = async () => {
    setExportingFallco(true)
    try {
      const { data: tutti, error } = await supabase.from('v_articoli_con_foto').select('*').eq('proc_id', currentProc.id).order('sort_order')
      if (error) throw error
      const fmtData = (d) => {
        if (!d) return ''
        const dt = new Date(d)
        if (isNaN(dt)) return d
        return String(dt.getDate()).padStart(2, '0') + '/' + String(dt.getMonth() + 1).padStart(2, '0') + '/' + dt.getFullYear()
      }
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
        'Quota %': (a.titolo === 'piena_proprietà' || !a.titolo) ? '100' : (a.quota_pct || ''),
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
        'Quantità aggiudicata': '', 'Valore aggiudicato': '',
        'Data decreto di trasferimento': '', 'Operazione chiusa': '',
        'Codice Lotto': '', 'Descrizione Lotto': '',
        'Note': a.note || '',
        'Sezione': a.sezione || '', 'Foglio': a.foglio || '',
        'Particella': a.mappale || '', 'Subparticella': '',
        'Subalterno': a.subalterno || '', 'Graffato': '',
        'Categoria': a.classe_catastale || a.categoria || '',
        'Classe': a.classe || '', 'Catasto': a.comune_cat || '',
        'Superficie mq': a.superficie || '', 'Rendita Catastale': a.rendita || '',
        'Edificio': '', 'Scala': '', 'Interno': '', 'Piano': a.piano || '',
        'Numero vani': a.vani || '', 'Reddito Domenicale': '', 'Reddito Agrario': ''
      }))
      const ws = XLSX.utils.json_to_sheet(righe)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Inventario')
      const nomeFile = 'FALLCO_' + (currentProc.nome || '').replace(/\s+/g, '_') + '_' + new Date().toISOString().slice(0, 10) + '.xlsx'
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
            <button className="btn btn-ghost btn-sm" onClick={() => setShowReportModal(true)}>📄 Report PDF</button>
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
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 20 }}>
          <div className="stat-card"><div className="stat-label">Totale articoli</div><div className="stat-value stat-blue">{articoli.length}</div></div>
          <div className="stat-card"><div className="stat-label">Valore giudiziario</div><div className="stat-value stat-green" style={{ fontSize: 18 }}>{totValore ? '€ ' + totValore.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</div></div>
          <div className="stat-card"><div className="stat-label">Visualizzati</div><div className="stat-value">{articoli.length}</div></div>
        </div>
        <div className="filter-bar">
          <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
            <input className="form-input" placeholder="Cerca articolo, marca…" style={{ paddingLeft: 32 }} value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
          </div>
          <select className="filter-select" value={catFilter} onChange={e => { setCatFilter(e.target.value); setPage(0) }}>
            <option value="">Tutte le categorie</option>
            {CATEGORIE.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="table-card">
          {loading ? <Spinner /> : articoli.length === 0 ? (
            <Empty icon="📦" title="Nessun articolo" sub={search ? 'Nessun risultato per la ricerca' : "Crea il primo articolo dell'inventario"} />
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
                      <td style={{ fontWeight: 500 }}>{a.desc_breve || '—'}{a.n_foto > 0 && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text3)' }}>📷{a.n_foto}</span>}</td>
                      <td className="muted">{[a.marca, a.modello].filter(Boolean).join(' ') || '—'}</td>
                      <td><span className="badge badge-blue" style={{ fontSize: 10 }}>{a.categoria || '—'}</span></td>
                      <td className="mono">{a.qta} {a.unita_misura}</td>
                      <td className="mono">{fmtEur(Number(a.val_giud || 0) * Number(a.qta || 1))}</td>
                      <td><span className={`badge ${a.stato === 'ottimo' || a.stato === 'buono' ? 'badge-green' : a.stato === 'discreto' ? 'badge-yellow' : 'badge-red'}`}>{a.stato || '—'}</span></td>
                      <td onClick={e => e.stopPropagation()}>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent-r)', padding: '4px 8px' }} onClick={() => deleteArticolo(a.id)}><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {totalPages > 1 && (
                <div className="pagination">
                  <div className="pagination-info">{page * PER_PAGE + 1}–{Math.min((page + 1) * PER_PAGE, articoli.length)} di {articoli.length}</div>
                  <div className="pagination-btns">
                    <button className="page-btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>←</button>
                    {Array.from({ length: totalPages }, (_, i) => <button key={i} className={`page-btn ${i === page ? 'active' : ''}`} onClick={() => setPage(i)}>{i + 1}</button>)}
                    <button className="page-btn" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>→</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Modal open={showReportModal} onClose={() => setShowReportModal(false)} title="Genera Report PDF">
        <div style={{ padding: '8px 0' }}>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>Scegli il tipo di report per i {articoli.length} articoli dell'inventario.</p>
          <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
            <div style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 8, padding: 16, textAlign: 'center', cursor: 'pointer' }} onClick={() => genReport(false)}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📷</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Report fotografico</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>Frontespizio + foto + descrizioni</div>
            </div>
            <div style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 8, padding: 16, textAlign: 'center', cursor: 'pointer' }} onClick={() => genReport(true)}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>💰</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Report estimativo</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>Valori mercato + giudiziale + totale</div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={() => setShowReportModal(false)}>Annulla</button>
          </div>
        </div>
      </Modal>

      <Modal open={showFallcoModal} onClose={() => setShowFallcoModal(false)} title="Export FALLCO">
        <div style={{ padding: '8px 0' }}>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>Genera il file Excel nel formato FALLCO con tutti i {articoli.length} articoli dell'inventario.</p>
          <div className="form-group">
            <label className="form-label">Data deposito perizia</label>
            <input type="date" className="form-input" value={dataDeposito} onChange={e => setDataDeposito(e.target.value)} />
            <span style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, display: 'block' }}>Lascia vuoto se non ancora depositata</span>
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
        <ArticoloForm articolo={editArticolo} procId={currentProc.id} onClose={() => setShowForm(false)} onSave={() => { setShowForm(false); loadArticoli() }} />
      </Modal>
    </>
  )
}
