const fs = require('fs')
let c = fs.readFileSync('src/pages/Inventario.jsx', 'utf8')

// 1. Aggiunge stato modal report
const oldStato = "  const [exportingFallco, setExportingFallco] = useState(false)"
const newStato = `  const [exportingFallco, setExportingFallco] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)`

// 2. Aggiunge funzione genReport prima di exportFallco
const oldExportFallco = "  const exportFallco = async () => {"
const newExportFallco = `  const genReport = async (estimativo) => {
    try {
      const { data: tutti, error } = await supabase.from('v_articoli_con_foto').select('*').eq('proc_id', currentProc.id).order('sort_order')
      if (error) throw error
      if (!tutti.length) { notify('Nessun articolo da esportare', 'warn'); return }

      const fmtEurLocal = (n) => '\u20ac' + parseFloat(n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      const proc = currentProc
      const titoloDoc = estimativo ? 'Report estimativo' : 'Report fotografico beni mobili'
      const coverTitle = estimativo ? 'REPORT ESTIMATIVO' : 'REPORT FOTOGRAFICO'
      const totVG = tutti.reduce((s, a) => s + (parseFloat(a.val_giud || 0) * parseFloat(a.qta || 1)), 0)

      const frontespizio = '<div style="page-break-after:always;min-height:100vh;display:flex;flex-direction:column;padding:50px 60px;background:#fff;box-sizing:border-box">'
        + '<div style="text-align:center;margin-bottom:auto">'
        + '<div style="font-size:22px;font-weight:700;color:#1a3a6b;margin-bottom:24px">Pro.Ges.S. Srl</div>'
        + '<div style="font-size:24px;font-weight:700;color:#1a1a16;letter-spacing:.03em;margin-bottom:28px">' + coverTitle + '</div>'
        + '<div style="font-size:17px;color:#333;margin-bottom:8px">' + (proc.tipo || '') + '</div>'
        + '<div style="font-size:15px;color:#555;margin-bottom:8px">N\u00b0 ' + (proc.numero || '') + '</div>'
        + '<div style="font-size:15px;color:#555">Tribunale di ' + (proc.tribunale || '') + '</div>'
        + (proc.nome ? '<div style="font-size:14px;font-weight:600;color:#333;margin-top:6px">' + proc.nome + '</div>' : '')
        + '</div>'
        + '<div style="text-align:center;margin-top:auto">'
        + (proc.giudice ? '<div style="font-size:14px;color:#333;margin-bottom:8px">Giudice Delegato: ' + proc.giudice + '</div>' : '')
        + (proc.curatore ? '<div style="font-size:14px;color:#333;margin-bottom:8px">Curatore: ' + proc.curatore + '</div>' : '')
        + '<div style="margin-top:16px;border-top:1px solid #ddd;padding-top:8px;font-size:10px;color:#888">Pro.Ges.S. Srl - Procedure Gestite e Servizi</div>'
        + '</div></div>'

      const artRows = tutti.map((a, i) => {
        const vg = parseFloat(a.val_giud || 0) * parseFloat(a.qta || 1)
        let metaLeft = ''
        metaLeft += '<tr><td class="lbl">Quantit\u00e0:</td><td>' + (a.qta || 1) + ' ' + (a.unita_misura || 'UN') + '</td></tr>'
        if (a.desc_breve || a.desc_estesa) metaLeft += '<tr><td class="lbl" style="vertical-align:top">Descrizione:</td><td>' + (a.desc_breve || '') + (a.desc_estesa ? '<br>' + a.desc_estesa : '') + '</td></tr>'
        let metaRight = ''
        if (a.anno_prod) metaRight += '<tr><td class="lbl">Anno:</td><td>' + a.anno_prod + '</td></tr>'
        if (a.stato) metaRight += '<tr><td class="lbl">Stato:</td><td>' + a.stato + '</td></tr>'
        if (a.marca) metaRight += '<tr><td class="lbl">Marca:</td><td>' + a.marca + '</td></tr>'
        if (a.modello) metaRight += '<tr><td class="lbl">Modello:</td><td>' + a.modello + '</td></tr>'
        if (a.matricola) metaRight += '<tr><td class="lbl">Matricola:</td><td>' + a.matricola + '</td></tr>'
        if (a.note) metaRight += '<tr><td class="lbl" style="vertical-align:top">Note:</td><td>' + a.note + '</td></tr>'
        const valoreHdr = estimativo ? '<div style="margin-left:auto;font-size:12px;font-weight:700;padding:0 14px;white-space:nowrap">Valore di Stima: ' + fmtEurLocal(vg) + '</div>' : ''

        // Foto dalla view
        let photosHtml = ''
        if (a.prima_foto_url) {
          photosHtml = '<div class="photos-wrap"><div class="photos-lbl"><b>Fotografie:</b></div><div class="photos-row"><img src="' + a.prima_foto_url + '" class="photo"></div></div>'
        }

        return '<div class="card"><div class="card-hdr"><div class="card-num">' + (i + 1) + '</div><div class="card-title">' + (a.desc_breve || 'Articolo ' + (i + 1)) + '</div>' + valoreHdr + '</div>'
          + '<table class="card-body"><tr><td class="meta-cell"><table class="meta-tbl">' + metaLeft + '</table></td>'
          + (metaRight ? '<td class="meta-cell"><table class="meta-tbl">' + metaRight + '</table></td>' : '')
          + '</tr></table>' + photosHtml + '</div>'
      }).join('')

      const totBanner = estimativo ? '<div class="tot-banner-est"><b>Valore di Stima totale:</b> ' + fmtEurLocal(totVG) + '</div>' : ''
      const printBtn = '<div class="print-bar no-print"><div style="flex:1"><div style="font-weight:700;font-size:14px;margin-bottom:3px">\uD83D\uDCCB ' + titoloDoc + '</div>'
        + '<div style="font-size:11px;opacity:.9">\u2460 Clicca <b>Stampa/Salva PDF</b> &nbsp;\u2461 Destinazione: <b>Salva come PDF</b> &nbsp;\u2462 Altre impostazioni: disattiva <b>Intestazioni e pi\u00e8 di pagina</b> + attiva <b>Grafica di sfondo</b></div></div>'
        + '<button onclick="window.print()" class="print-btn">\uD83D\uDDB8 Stampa / Salva PDF</button></div>'

      const pageHdr = '<div class="page-hdr"><div style="font-size:18px;font-weight:700;color:#1a3a6b">Pro.Ges.S. Srl</div>'
        + '<div class="page-hdr-info"><b>' + titoloDoc + '</b>' + (proc.tipo || '') + ' ' + (proc.nome || '') + '<br>n\u00b0 ' + (proc.numero || '') + ' - Tribunale di ' + (proc.tribunale || '') + '<br>'
        + (proc.giudice ? 'Giudice: <em>' + proc.giudice + '</em><br>' : '')
        + (proc.curatore ? 'Curatore: <em>' + proc.curatore + '</em>' : '') + '</div></div>'

      const css = '@page{size:A4 portrait;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px;color:#222;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}@media print{html,body{margin:0;padding:0}.report-wrap{padding:12mm 12mm 16mm 12mm}}.print-bar{position:sticky;top:0;background:#1d4ed8;color:#fff;padding:10px 20px;display:flex;align-items:center;gap:16px;z-index:999}.print-btn{background:#fff;color:#1d4ed8;border:none;padding:8px 18px;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px}.page-hdr{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:8px;border-bottom:2px solid #2d6a7f;margin-bottom:16px}.page-hdr-info{text-align:right;font-size:10px;line-height:1.7;color:#333}.page-hdr-info b{font-size:12px;color:#000;display:block}.card{border:1px solid #aaa;margin-bottom:16px;page-break-inside:avoid;break-inside:avoid}.card-hdr{background:#1a3a5c;color:#fff;display:flex;align-items:center;-webkit-print-color-adjust:exact;print-color-adjust:exact}.card-num{width:36px;min-height:36px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;background:rgba(255,255,255,.15)}.card-title{font-size:13px;font-weight:700;padding:8px 10px;flex:1}.card-body{width:100%;border-collapse:collapse;padding:8px 12px}.meta-cell{vertical-align:top;padding:8px 12px 8px 14px}.meta-tbl{border-collapse:collapse}.lbl{font-weight:700;padding-right:6px;white-space:nowrap;line-height:1.8;vertical-align:top}.photos-wrap{padding:0 12px 12px}.photos-lbl{margin-bottom:6px}.photos-row{display:flex;flex-wrap:wrap;gap:6px}.photo{width:190px;height:142px;object-fit:cover;border:1px solid #ccc}.tot-banner-est{background:#8b1a1a;color:#fff;padding:14px 24px;margin-top:16px;font-size:16px;text-align:center;-webkit-print-color-adjust:exact;print-color-adjust:exact}@media print{.no-print{display:none!important}}'

      const bodyHtml = printBtn + frontespizio + '<div class="report-wrap" style="padding:16px 16px 30px">' + pageHdr + artRows + totBanner + '</div>'
      const html = '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>' + titoloDoc + '</title><style>' + css + '</style></head><body>' + bodyHtml + '</body></html>'
      const win = window.open('', '_blank')
      if (win) { win.document.write(html); win.document.close() }
      else notify('Abilita i popup per generare il report', 'warn')
      setShowReportModal(false)
    } catch (e) { notify('Errore: ' + e.message, 'err') }
  }

  const exportFallco = async () => {`

// Applica modifiche
if (c.includes(oldStato)) {
  c = c.replace(oldStato, newStato)
  console.log('Step 1 OK - stato modal')
} else {
  console.log('WARN: stato modal non trovato')
}

if (c.includes(oldExportFallco)) {
  c = c.replace(oldExportFallco, newExportFallco)
  console.log('Step 2 OK - funzione genReport')
} else {
  console.log('WARN: exportFallco non trovato')
}

// 3. Aggiunge pulsante Report nella toolbar
const oldBtn = `            <button className="btn btn-ghost btn-sm" onClick={() => setShowFallcoModal(true)}>
              <FileDown size={14} /> Export FALLCO
            </button>`
const newBtn = `            <button className="btn btn-ghost btn-sm" onClick={() => setShowReportModal(true)}>
              📄 Report PDF
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowFallcoModal(true)}>
              <FileDown size={14} /> Export FALLCO
            </button>`

if (c.includes(oldBtn)) {
  c = c.replace(oldBtn, newBtn)
  console.log('Step 3 OK - pulsante toolbar')
} else {
  console.log('WARN: pulsante toolbar non trovato')
}

// 4. Aggiunge modal Report prima del modal FALLCO
const oldModalFallco = `      <Modal open={showFallcoModal}`
const newModalFallco = `      <Modal open={showReportModal} onClose={() => setShowReportModal(false)} title="Genera Report PDF">
        <div style={{ padding: '8px 0' }}>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>
            Scegli il tipo di report da generare per i {articoli.length} articoli dell'inventario.
          </p>
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

      <Modal open={showFallcoModal}`

if (c.includes(oldModalFallco)) {
  c = c.replace(oldModalFallco, newModalFallco)
  console.log('Step 4 OK - modal report')
} else {
  console.log('WARN: modal FALLCO non trovato')
}

fs.writeFileSync('src/pages/Inventario.jsx', c)
console.log('DONE - ' + c.length + ' chars')
