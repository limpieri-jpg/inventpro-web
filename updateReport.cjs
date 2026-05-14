const fs = require('fs')

// ── Aggiorna Impostazioni.jsx: aggiunge tab Studio con logo ──
let imp = fs.readFileSync('src/pages/Impostazioni.jsx', 'utf8')

// 1. Aggiunge import Building
imp = imp.replace(
  "import { Eye, EyeOff, Save, Key, Building, User } from 'lucide-react'",
  "import { Eye, EyeOff, Save, Key, Building, User, Image } from 'lucide-react'"
)

// 2. Aggiunge stato logo e studio
const oldUseEffect = "  useEffect(() => {\n    if (profile) {\n      setProfilo({ ...profile })\n      setApiKey(localStorage.getItem('ip_apikey') || '')\n    }\n  }, [profile])"
const newUseEffect = `  const [studioLogo, setStudioLogo] = useState(localStorage.getItem('ip_logo') || '')
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
  }`

if (imp.includes(oldUseEffect)) {
  imp = imp.replace(oldUseEffect, newUseEffect)
  console.log('Impostazioni Step 1 OK - stato logo')
} else console.log('WARN: useEffect non trovato')

// 3. Aggiunge tab Studio
const oldTABS = "  const TABS = [\n    { id: 'profilo', label: 'Profilo utente', icon: User },\n    { id: 'api',     label: 'Chiave API AI',  icon: Key },\n  ]"
const newTABS = `  const TABS = [
    { id: 'profilo', label: 'Profilo utente', icon: User },
    { id: 'studio',  label: 'Studio / Logo',  icon: Building },
    { id: 'api',     label: 'Chiave API AI',  icon: Key },
  ]`

if (imp.includes(oldTABS)) {
  imp = imp.replace(oldTABS, newTABS)
  console.log('Impostazioni Step 2 OK - tab studio')
} else console.log('WARN: TABS non trovato')

// 4. Aggiunge sezione Studio prima della sezione API
const oldApiTab = "        {/* Chiave API */}\n        {tab === 'api' && ("
const newApiTab = `        {/* Studio */}
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
        {tab === 'api' && (`

if (imp.includes(oldApiTab)) {
  imp = imp.replace(oldApiTab, newApiTab)
  console.log('Impostazioni Step 3 OK - sezione studio')
} else console.log('WARN: tab api non trovato')

fs.writeFileSync('src/pages/Impostazioni.jsx', imp)
console.log('Impostazioni DONE - ' + imp.length + ' chars')

// ── Aggiorna Inventario.jsx: report con logo, dati studio, QR ──
let inv = fs.readFileSync('src/pages/Inventario.jsx', 'utf8')

const oldGenReport = "  const genReport = async (estimativo) => {\n    try {\n      const { data: tutti, error } = await supabase.from('v_articoli_con_foto').select('*').eq('proc_id', currentProc.id).order('sort_order')\n      if (error) throw error\n      if (!tutti.length) { notify('Nessun articolo da esportare', 'warn'); return }"

const newGenReport = `  const genReport = async (estimativo) => {
    try {
      const { data: tutti, error } = await supabase.from('v_articoli_con_foto').select('*').eq('proc_id', currentProc.id).order('sort_order')
      if (error) throw error
      if (!tutti.length) { notify('Nessun articolo da esportare', 'warn'); return }

      // Carica impostazioni studio dal localStorage
      const studioLogo = localStorage.getItem('ip_logo') || ''
      const studioNome = localStorage.getItem('ip_studio_nome') || 'Pro.Ges.S. Srl'

      // Funzione QR code semplice via API gratuita (no libreria)
      const makeQRUrl = (text) => {
        const safe = encodeURIComponent((text || 'INV').substring(0, 100))
        return \`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=\${safe}\`
      }`

if (inv.includes(oldGenReport)) {
  inv = inv.replace(oldGenReport, newGenReport)
  console.log('Inventario Step 1 OK - QR e logo setup')
} else console.log('WARN: genReport inizio non trovato')

// Aggiorna frontespizio con logo reale e QR
const oldFrontespizio = `      const frontespizio = '<div style="page-break-after:always;min-height:100vh;display:flex;flex-direction:column;padding:50px 60px;background:#fff;box-sizing:border-box">'
        + '<div style="text-align:center;margin-bottom:auto">'
        + '<div style="font-size:22px;font-weight:700;color:#1a3a6b;margin-bottom:24px">Pro.Ges.S. Srl</div>'`

const newFrontespizio = `      const logoHtml = studioLogo
        ? \`<img src="\${studioLogo}" style="max-height:80px;max-width:220px;object-fit:contain">\`
        : \`<div style="font-size:20px;font-weight:700;color:#1a3a6b">\${studioNome}</div>\`

      const procQR = makeQRUrl([(proc.tipo||''),(proc.nome||''),(proc.numero||'')].join(' '))

      const frontespizio = '<div style="page-break-after:always;min-height:100vh;display:flex;flex-direction:column;padding:50px 60px;background:#fff;box-sizing:border-box">'
        + '<div style="text-align:center;margin-bottom:auto">'
        + '<div style="margin-bottom:24px">' + logoHtml + '</div>'`

if (inv.includes(oldFrontespizio)) {
  inv = inv.replace(oldFrontespizio, newFrontespizio)
  console.log('Inventario Step 2 OK - frontespizio logo')
} else console.log('WARN: frontespizio non trovato')

// Aggiorna pageHdr con logo e QR procedura
const oldPageHdr = `      const pageHdr = '<div class="page-hdr"><div style="font-size:18px;font-weight:700;color:#1a3a6b">Pro.Ges.S. Srl</div>'`
const newPageHdr = `      const pageHdr = '<div class="page-hdr"><div>' + logoHtml + '</div><div style="display:flex;align-items:center;gap:10px"><img src="' + procQR + '" style="width:60px;height:60px">'`

if (inv.includes(oldPageHdr)) {
  inv = inv.replace(oldPageHdr, newPageHdr)
  console.log('Inventario Step 3 OK - pageHdr logo+QR')
} else console.log('WARN: pageHdr non trovato')

// Aggiunge QR articolo in ogni card
const oldArtQR = `        return '<div class="card"><div class="card-hdr"><div class="card-num">' + (i + 1) + '</div><div class="card-title">' + (a.desc_breve || 'Articolo ' + (i + 1)) + '</div>' + valoreHdr + '</div>'
          + '<table class="card-body"><tr><td class="meta-cell"><table class="meta-tbl">' + metaLeft + '</table></td>'`

const newArtQR = `        const artQRurl = makeQRUrl(a.codice_siecic || ('ART-' + (i + 1)))
        const artQRhtml = '<img src="' + artQRurl + '" style="width:66px;height:66px">'
        return '<div class="card"><div class="card-hdr"><div class="card-num">' + (i + 1) + '</div><div class="card-title">' + (a.desc_breve || 'Articolo ' + (i + 1)) + '</div>' + valoreHdr + '</div>'
          + '<table class="card-body"><tr><td class="qr-cell">' + artQRhtml + '</td><td class="meta-cell"><table class="meta-tbl">' + metaLeft + '</table></td>'`

if (inv.includes(oldArtQR)) {
  inv = inv.replace(oldArtQR, newArtQR)
  console.log('Inventario Step 4 OK - QR articolo')
} else console.log('WARN: artQR non trovato')

// Aggiunge .qr-cell al CSS
const oldQrCss = "'.photos-wrap{padding:0 12px 12px}"
const newQrCss = "'.qr-cell{width:88px;vertical-align:top;padding:8px 6px 8px 12px}.photos-wrap{padding:0 12px 12px}"
if (inv.includes(oldQrCss)) {
  inv = inv.replace(oldQrCss, newQrCss)
  console.log('Inventario Step 5 OK - CSS qr-cell')
} else console.log('WARN: CSS qr-cell non trovato')

// Aggiorna footer con dati studio
const oldFoot = `      const footerTxt = 'Pro.Ges.S. Srl - Procedure Gestite e Servizi'`
if (!inv.includes(oldFoot)) {
  // Il footer è inline nel frontespizio - aggiorniamo la stringa
  inv = inv.replace(
    "'Pro.Ges.S. Srl - Procedure Gestite e Servizi'",
    "studioNome + ' - Procedure Gestite e Servizi'"
  )
  console.log('Inventario Step 6 OK - footer studio nome')
}

fs.writeFileSync('src/pages/Inventario.jsx', inv)
console.log('Inventario DONE - ' + inv.length + ' chars')
