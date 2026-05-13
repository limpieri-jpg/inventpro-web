import { useCallback, useState } from 'react'
import { useStore } from '../store/useStore'
import { Topbar, Modal, Empty } from '../components/layout'
import { Download, Plus } from 'lucide-react'
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
         AlignmentType, BorderStyle, WidthType, ShadingType, LevelFormat,
         ImageRun, Header, Footer } from 'docx'

// ─── Costanti ─────────────────────────────────────────────────────────────────
const MW = 11906, MM = 1000, CW = MW - MM * 2

const TIPI_ASTA = [
  { id: 'asincrona_pvp',  label: 'Asincrona telematica \u2014 Portale Vendite Pubbliche (PVP)' },
  { id: 'sincrona_pvp',   label: 'Sincrona telematica \u2014 Portale Vendite Pubbliche (PVP)' },
  { id: 'sincrona_amag',  label: 'Sincrona telematica \u2014 AsteMagazine' },
  { id: 'asincrona_amag', label: 'Asincrona telematica \u2014 AsteMagazine' },
  { id: 'mista',          label: 'Vendita telematica mista (sincrona + asincrona)' },
]

// ─── Helpers docx ─────────────────────────────────────────────────────────────
const fmtEur = (n) => {
  const p = parseFloat((n||'0').toString().replace(',','.') || 0).toFixed(2).split('.')
  p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return 'Euro\u00a0' + p[0] + ',' + p[1]
}
const fmtD = (d) => {
  if (!d) return '_______________'
  const dt = new Date(d)
  return String(dt.getDate()).padStart(2,'0')+'/'+String(dt.getMonth()+1).padStart(2,'0')+'/'+dt.getFullYear()
}
const fmtDT = (d, h) => fmtD(d) + (h ? ' alle ore ' + h : '')

const BN  = { style:BorderStyle.NONE, size:0, color:'FFFFFF' }
const BNS = { top:BN, bottom:BN, left:BN, right:BN }
const BT  = { style:BorderStyle.SINGLE, size:1, color:'AAAAAA' }
const BTS = { top:BT, bottom:BT, left:BT, right:BT }
const J   = AlignmentType.JUSTIFIED
const C   = AlignmentType.CENTER

const T   = (text, o={}) => new TextRun({ text:String(text||''), font:'Gadugi', size:22, ...o })
const B   = (text, s=22) => T(text, { bold:true, size:s })
const P   = (ch, o={}) => new Paragraph({ children:Array.isArray(ch)?ch:[ch], alignment:J, spacing:{before:80,after:80,line:276,lineRule:'auto'}, ...o })
const PC  = (ch, o={}) => new Paragraph({ children:Array.isArray(ch)?ch:[ch], alignment:C, spacing:{before:60,after:60}, ...o })
const BR  = () => new Paragraph({ children:[], spacing:{before:60,after:60} })
const BLT = (ch) => new Paragraph({ numbering:{reference:'blt',level:0}, alignment:J, spacing:{before:40,after:40,line:276,lineRule:'auto'}, children:Array.isArray(ch)?ch:[ch] })
const numConf = { config:[{ reference:'blt', levels:[{ level:0, format:LevelFormat.BULLET, text:'-', alignment:AlignmentType.LEFT, style:{ paragraph:{ indent:{ left:360, hanging:360 } } } }] }] }

const mkCell = (ch, w, opts={}) => new TableCell({
  borders: opts.nb ? BNS : BTS,
  width:{ size:w, type:WidthType.DXA },
  shading: opts.fill ? { fill:opts.fill, type:ShadingType.CLEAR } : undefined,
  margins:{ top:80, bottom:80, left:120, right:120 },
  columnSpan: opts.span,
  children:[new Paragraph({ children:Array.isArray(ch)?ch:[ch], alignment:opts.align||J })]
})

function mkHdr(logoB64) {
  const lr = logoB64 ? new ImageRun({ data:logoB64.split(',')[1], transformation:{width:150,height:50}, type:'png' }) : null
  return new Header({ children:[
    new Paragraph({ children:lr?[lr]:[B('PROCEDURE GESTITE E SERVIZI S.R.L.',20)], alignment:AlignmentType.LEFT }),
    new Paragraph({ border:{ bottom:{ style:BorderStyle.SINGLE, size:6, color:'244061', space:1 } }, children:[] })
  ]})
}
function mkFtr() {
  return new Footer({ children:[new Paragraph({
    alignment:C,
    border:{ top:{ style:BorderStyle.SINGLE, size:4, color:'AAAAAA', space:1 } },
    children:[
      B('Procedure Gestite E Servizi S.r.l.',18),
      new TextRun({text:'',break:1}),
      T('Via Giuseppe Parini, 29 - LECCO (LC) - 23900',{size:16}),
      new TextRun({text:'',break:1}),
      T('procedure@progess-italia.it | progess@arubapec.it | C.F. e P.IVA 03546380134',{size:16}),
    ]
  })]})
}

// ─── Generatore avviso ────────────────────────────────────────────────────────
async function genAvviso(proc, lotti, opts, logoB64) {
  const { tipoAsta, nEsperimento, dataAsta, oraAsta, dataTermine, oraTermine,
    prezzoBase, offertaMinima, rilancioMin, cauzione, modalitaCauzione,
    dirittiAsta, referente, noteFinali,
    offertaIrrevocabile, testoOfferta } = opts

  const nrg         = (proc.num||'') + (proc.anno?'/'+proc.anno:'')
  const isAsincrona = tipoAsta.includes('asincrona') || tipoAsta === 'mista'
  const isSincrona  = tipoAsta.includes('sincrona')
  const isPVP       = tipoAsta.includes('pvp')
  const isAMag      = tipoAsta.includes('amag')
  const isMista     = tipoAsta === 'mista'
  const tipoLabel   = TIPI_ASTA.find(t => t.id === tipoAsta)?.label || tipoAsta
  const nomePortale = isAMag
    ? 'AsteMagazine (www.astemagazine.it)'
    : 'Portale delle Vendite Pubbliche (www.portalevenditepubbliche.it)'
  const nEsp = nEsperimento ? nEsperimento + '\u00b0 ESPERIMENTO DI VENDITA' : ''

  // Tabella lotti: desc | qta | prezzo base | offerta min | rilancio
  const colW = [Math.floor(CW*0.40), Math.floor(CW*0.06), Math.floor(CW*0.18), Math.floor(CW*0.18), Math.floor(CW*0.18)]
  const tblLotti = new Table({ width:{size:CW,type:WidthType.DXA}, columnWidths:colW, borders:BTS, rows:[
    new TableRow({ children:[
      mkCell([B('Descrizione lotto',20)], colW[0], {fill:'244061', align:AlignmentType.LEFT}),
      mkCell([B('Q.t\u00e0',20)],         colW[1], {fill:'244061', align:C}),
      mkCell([B('Prezzo base',20)],       colW[2], {fill:'244061', align:AlignmentType.RIGHT}),
      mkCell([B('Offerta minima',20)],    colW[3], {fill:'244061', align:AlignmentType.RIGHT}),
      mkCell([B('Rilancio minimo',20)],   colW[4], {fill:'244061', align:AlignmentType.RIGHT}),
    ]}),
    ...lotti.map((l,i) => {
      const shade  = i%2===0 ? 'F8F9FA' : 'FFFFFF'
      const baseVal = l.base || prezzoBase
      const offMin  = l.offertaMinima || offertaMinima || baseVal
      return new TableRow({ children:[
        mkCell([T(l.desc||'\u2014',{size:20})],                        colW[0], {fill:shade}),
        mkCell([T(String(l.qta||1),{size:20})],                        colW[1], {fill:shade, align:C}),
        mkCell([T(fmtEur(baseVal),{size:20})],                         colW[2], {fill:shade, align:AlignmentType.RIGHT}),
        mkCell([T(fmtEur(offMin),{size:20})],                          colW[3], {fill:shade, align:AlignmentType.RIGHT}),
        mkCell([T(fmtEur(l.rilancio||rilancioMin),{size:20})],         colW[4], {fill:shade, align:AlignmentType.RIGHT}),
      ]})
    }),
  ]})

  const modalita = isMista ? 'mista (sincrona e asincrona)'
    : isSincrona ? 'sincrona'
    : 'asincrona'

  // Paragrafo AVVISA — include il testo dell'offerta irrevocabile se presente
  const pAvvisa = offertaIrrevocabile && (testoOfferta||'').trim()
    ? P([B('AVVISA'), T(' ' + testoOfferta.trim())])
    : P([B('AVVISA'), T(' che in esecuzione del programma di liquidazione si proceder\u00e0 alla vendita telematica '),
        B(modalita), T(' dei seguenti beni, tramite la piattaforma '), B(nomePortale), T('.')])

  const corpo = [
    pAvvisa,
    BR(),
    P(B('DATI DELLA VENDITA')),
    ...(isAsincrona ? [
      P([T('Periodo di presentazione offerte: dal '), B(fmtDT(dataAsta, oraAsta)),
         T(' al '), B(fmtDT(dataTermine, oraTermine))]),
    ] : [
      P([T('Data e ora dell\u2019asta: '), B(fmtDT(dataAsta, oraAsta))]),
    ]),
    BR(),
    P(B('CONDIZIONI DI PARTECIPAZIONE')),
    BLT([B('Prezzo base: '), T(fmtEur(prezzoBase)), T(' OLTRE IVA SE DOVUTA E ONERI DI LEGGE.')]),
    BLT([B('Offerta minima ammissibile: '), T(fmtEur(offertaMinima||prezzoBase)), T(' OLTRE IVA SE DOVUTA E ONERI DI LEGGE.')]),
    BLT([B('Rilancio minimo: '), T(fmtEur(rilancioMin))]),
    BLT([B('Deposito cauzionale: '), T((cauzione||'10')+'% del prezzo offerto, da versarsi mediante '), T(modalitaCauzione||'bonifico bancario alle coordinate indicate.')]),
    BLT([B('Diritti d\u2019asta: '), T((dirittiAsta||'2')+'% sul prezzo di aggiudicazione, oltre IVA al 22%.')]),
    BR(),
    ...(isPVP ? [
      P(B('MODALIT\u00c0 DI PARTECIPAZIONE \u2014 PORTALE VENDITE PUBBLICHE')),
      BLT(T('La partecipazione avviene esclusivamente per via telematica tramite il Portale delle Vendite Pubbliche del Ministero della Giustizia (www.portalevenditepubbliche.it).')),
      BLT(T('L\u2019offerta irrevocabile di acquisto dovr\u00e0 essere formulata esclusivamente tramite il modulo web "Offerta Telematica" fornito dal Ministero della Giustizia.')),
      BLT([T('L\u2019offerta dovr\u00e0 essere trasmessa all\u2019indirizzo PEC del Ministero della Giustizia: '), B('offertapvp.dgsia@giustiziacert.it')]),
      BLT([T('La cauzione dovr\u00e0 essere accreditata entro le ore 12:00 del secondo giorno lavorativo antecedente la vendita sul seguente conto corrente intestato a Pro.Ges.S. S.r.l.:')]),
      BLT([B('IBAN: '), T('IT63Y0310422903000000400014'), T(' \u2014 Deutsche Bank, Filiale Lecco')]),
      BLT([T('Causale: '), B('"Cauzione Lotto ___ \u2014 '+(proc.tipo||'')+' n. '+nrg+' \u2014 Tribunale di '+(proc.tribunale||'')+'"')]),
      BLT([T('Per tutorial e guida alla compilazione: '), T('www.progess-italia.it/video-tutorial')]),
    ] : [
      P(B('MODALIT\u00c0 DI PARTECIPAZIONE \u2014 ASTEMAGAZINE')),
      BLT(T('La partecipazione avviene tramite la piattaforma AsteMagazine (www.astemagazine.it).')),
      BLT(T('Le istruzioni per la partecipazione telematica sono disponibili sul portale AsteMagazine nella sezione dedicata alla presente vendita.')),
      BLT(T('Per la registrazione e il supporto tecnico contattare AsteMagazine tramite il sito o il numero verde indicato sul portale.')),
      BLT([T('La cauzione dovr\u00e0 essere versata mediante bonifico sul conto corrente intestato a Pro.Ges.S. S.r.l.:')]),
      BLT([B('IBAN: '), T('IT63Y0310422903000000400014'), T(' \u2014 Deutsche Bank, Filiale Lecco')]),
    ]),
    BR(),
    P(B('CONDIZIONI DELLA VENDITA')),
    P(T('La vendita avr\u00e0 luogo avvalendosi del Gestore della Vendita Telematica \u2014 Pro.Ges.S. S.r.l. \u2014 Procedure Gestite e Servizi, con sede in Lecco (LC) Via Giuseppe Parini, 29. La vendita avverr\u00e0 nello stato di fatto e di diritto in cui i beni si trovano. Ai sensi dell\u2019art. 2922 c.c., la vendita forzata non \u00e8 soggetta alle norme concernenti la garanzia per vizi o per mancanza di qualit\u00e0, n\u00e9 potr\u00e0 essere impugnata o revocata per alcun motivo.')),
    BR(),
    P(T('Si precisa che, ai sensi dell\u2019art. 216, comma 1, CCII, il Giudice Delegato potr\u00e0 in ogni momento sospendere le operazioni di vendita qualora ricorrano gravi e giustificati motivi, ovvero qualora il prezzo risulti notevolmente inferiore a quello ritenuto congruo.')),
  ]

  const doc = new Document({ numbering:numConf, sections:[{
    properties:{ page:{ size:{width:MW,height:16838}, margin:{top:1200,right:MM,bottom:1400,left:MM} } },
    headers:{ default:mkHdr(logoB64) },
    footers:{ default:mkFtr() },
    children:[
      PC([B('TRIBUNALE DI '+(proc.tribunale||'').toUpperCase(),22)], {spacing:{before:240,after:40}}),
      PC([T((proc.tipo||'').toUpperCase()+' N. '+nrg,{size:20})]),
      PC([B('"'+(proc.nome||'')+'"',22)], {spacing:{before:20,after:20}}),
      ...(proc.giudice  ? [PC([T('Giudice Delegato: '+(proc.giudice||''),{size:20,italics:true})])]  : []),
      ...(proc.curatore ? [PC([T('Curatore: '+(proc.curatore||''),{size:20,italics:true})])] : []),
      BR(),
      new Paragraph({ border:{ bottom:{ style:BorderStyle.SINGLE, size:6, color:'244061', space:4 } }, children:[] }),
      BR(),
      PC([B('AVVISO DI VENDITA',28)], {spacing:{before:80,after:40}}),
      PC([B('SENZA INCANTO CON MODALIT\u00c0 '+tipoLabel.toUpperCase(),20)]),
      ...(nEsp ? [PC([B(nEsp,20)])] : []),
      BR(),
      new Paragraph({ border:{ bottom:{ style:BorderStyle.SINGLE, size:2, color:'AAAAAA', space:4 } }, children:[] }),
      BR(),
      P([T('Il/La '+(proc.tipo||'')+' '), B(proc.curatore||''),
         T(', della procedura di '+(proc.tipo||'')+' n. '+nrg+' denominata "'),
         B(proc.nome||''), T('" pendente avanti il Tribunale di '+(proc.tribunale||'')+
         (proc.giudice ? ', Giudice Delegato '+(proc.giudice||'') : '')+',')]),
      ...corpo,
      BR(),
      P(B('BENI OGGETTO DI VENDITA')),
      BR(), tblLotti, BR(),
      P([B('Per informazioni, visita dei beni e chiarimenti: '), T(referente||'Pro.Ges.S. Srl \u2014 procedure@progess-italia.it | www.progess-italia.it')]),
      ...(noteFinali ? [BR(), P(T(noteFinali))] : []),
      BR(), BR(),
      P(T('Lecco, '+fmtD(new Date().toISOString().slice(0,10)))),
      BR(),
      P([T('\t\t\t\t\t'), B((proc.tipo||'')+' n. '+nrg)]),
      P([T('\t\t\t\t\t'), T(proc.curatore||'')]),
      BR(), P(T('________________________________')),
      BR(),
      P([T('\t\t\t\t\t'), B('Pro.Ges.S. Srl \u2014 Commissionario alla Vendita')]),
      BR(), P(T('________________________________')),
    ]
  }]})
  return Packer.toBlob(doc)
}

// ─── Componente riga lotto — ESTRATTO fuori dal wizard per evitare re-mount ──
// Se il componente è definito dentro WizardAvviso, React lo ricrea ad ogni render
// e l'input perde il focus dopo ogni carattere. Estratto fuori = identità stabile.
function LottoRow({ lotto, idx, total, onChange, onRemove }) {
  return (
    <div style={{background:'var(--bg2)',borderRadius:8,padding:'12px 14px'}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
        <span style={{fontWeight:600,fontSize:13}}>Lotto {idx+1}</span>
        {total > 1 && (
          <button className="btn btn-ghost btn-sm" style={{color:'var(--accent-r)'}} onClick={onRemove}>✕</button>
        )}
      </div>
      <div className="form-grid">
        <div className="form-col-full form-group">
          <label className="form-label">Descrizione lotto</label>
          <input className="form-input" value={lotto.desc}
            onChange={e => onChange(idx,'desc',e.target.value)}
            placeholder="Es: Lotto 1 \u2014 macchinari officina" />
        </div>
        <div className="form-group">
          <label className="form-label">Q.t\u00e0</label>
          <input className="form-input" type="number" min="1" value={lotto.qta}
            onChange={e => onChange(idx,'qta',e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Prezzo base (€) \u2014 vuoto = globale</label>
          <input className="form-input" value={lotto.base}
            onChange={e => onChange(idx,'base',e.target.value)}
            placeholder="Lascia vuoto per il valore globale" />
        </div>
        <div className="form-group">
          <label className="form-label">Offerta minima (€) \u2014 vuoto = prezzo base</label>
          <input className="form-input" value={lotto.offertaMinima}
            onChange={e => onChange(idx,'offertaMinima',e.target.value)}
            placeholder="Lascia vuoto per il prezzo base" />
        </div>
        <div className="form-group">
          <label className="form-label">Rilancio min. (€) \u2014 vuoto = globale</label>
          <input className="form-input" value={lotto.rilancio}
            onChange={e => onChange(idx,'rilancio',e.target.value)}
            placeholder="Lascia vuoto per il valore globale" />
        </div>
      </div>
    </div>
  )
}

// ─── Testo default offerta irrevocabile ───────────────────────────────────────
const TESTO_OFFERTA_DEFAULT =
  'che in esecuzione del programma di liquidazione, e a seguito di offerta irrevocabile d\u2019acquisto ' +
  'pervenuta in data ___, si proceder\u00e0 alla vendita telematica dei seguenti beni. ' +
  'Nel rispetto dei principi di competitivit\u00e0 e trasparenza si avvia una gara competitiva ' +
  'telematica allo scopo di permettere a eventuali interessati di partecipare presentando ' +
  'la propria offerta a rialzo come da rilancio minimo indicato.'

// ─── Wizard ───────────────────────────────────────────────────────────────────
function WizardAvviso({ proc, onClose, notify }) {
  const today = new Date().toISOString().slice(0,10)
  const [tipoAsta, setTipoAsta]               = useState('asincrona_pvp')
  const [nEsperimento, setNEsperimento]       = useState('1')
  const [dataAsta, setDataAsta]               = useState(today)
  const [oraAsta, setOraAsta]                 = useState('12:00')
  const [dataTermine, setDataTermine]         = useState(today)
  const [oraTermine, setOraTermine]           = useState('12:00')
  const [prezzoBase, setPrezzoBase]           = useState('')
  const [offertaMinima, setOffertaMinima]     = useState('')
  const [rilancioMin, setRilancioMin]         = useState('')
  const [cauzione, setCauzione]               = useState('10')
  const [modalitaCauzione, setModalitaCauzione] = useState('bonifico bancario sulle coordinate indicate nel presente avviso')
  const [dirittiAsta, setDirittiAsta]         = useState('2')
  const [referente, setReferente]             = useState('Pro.Ges.S. Srl \u2014 procedure@progess-italia.it')
  const [noteFinali, setNoteFinali]           = useState('')
  const [lotti, setLotti]                     = useState([{ desc:'Lotto unico \u2014 tutti i beni inventariati', qta:1, base:'', offertaMinima:'', rilancio:'' }])
  const [offertaIrrevocabile, setOffertaIrrevocabile] = useState(false)
  const [testoOfferta, setTestoOfferta]       = useState(TESTO_OFFERTA_DEFAULT)
  const [gen, setGen]                         = useState(false)

  const isAsincrona = tipoAsta.includes('asincrona') || tipoAsta === 'mista'

  // useCallback evita che la funzione cambi identità ad ogni render → LottoRow non si rimonta
  const handleLottoChange = useCallback((idx, field, val) => {
    setLotti(ls => ls.map((x, j) => j === idx ? {...x, [field]: val} : x))
  }, [])

  const handleLottoRemove = useCallback((idx) => {
    setLotti(ls => ls.filter((_, j) => j !== idx))
  }, [])

  const genera = async () => {
    setGen(true)
    try {
      const logo = localStorage.getItem('ip_logo') || null
      const blob = await genAvviso(proc, lotti, {
        tipoAsta, nEsperimento, dataAsta, oraAsta, dataTermine, oraTermine,
        prezzoBase, offertaMinima, rilancioMin, cauzione, modalitaCauzione,
        dirittiAsta, referente, noteFinali,
        offertaIrrevocabile, testoOfferta,
      }, logo)
      const nome = 'Avviso_Vendita_'+(proc.nome||'').replace(/\s+/g,'_')+'.docx'
      const url  = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href=url; a.download=nome
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      setTimeout(()=>URL.revokeObjectURL(url),3000)
      notify('Avviso di vendita generato', 'ok')
      onClose()
    } catch(e) { notify('Errore: '+e.message, 'err') }
    finally { setGen(false) }
  }

  // Inp definito FUORI dalla funzione (sopra) sarebbe ideale, ma qui usiamo
  // un componente inline semplice con setter diretto — ok perché i setter
  // di useState hanno identità stabile, quindi non causano re-mount
  const Inp = ({ label, val, set, placeholder='', type='text', full=false }) => (
    <div className={full ? 'form-col-full form-group' : 'form-group'}>
      <label className="form-label">{label}</label>
      <input type={type} className="form-input" value={val}
        onChange={e => set(e.target.value)} placeholder={placeholder} />
    </div>
  )

  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>

      {/* Modalità + Esperimento */}
      <div className="card">
        <div className="card-header"><div className="card-title">📋 Modalità di vendita</div></div>
        <div className="card-body">
          <div className="form-grid">
            <div className="form-col-full form-group">
              <label className="form-label">Tipo di vendita</label>
              <select className="form-input" value={tipoAsta} onChange={e=>setTipoAsta(e.target.value)}>
                {TIPI_ASTA.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <Inp label="N° esperimento di vendita" val={nEsperimento} set={setNEsperimento} placeholder="Es: 1" />
          </div>
        </div>
      </div>

      {/* Offerta irrevocabile */}
      <div className="card">
        <div className="card-header" style={{flexDirection:'column',alignItems:'flex-start',gap:8}}>
          <div className="card-title">📩 Offerta irrevocabile pre-asta</div>
          <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:13,fontWeight:'normal'}}>
            <input type="checkbox" checked={offertaIrrevocabile} onChange={e=>setOffertaIrrevocabile(e.target.checked)} />
            È stata ricevuta un&apos;offerta irrevocabile cauzionata prima dell&apos;asta
          </label>
        </div>
        {offertaIrrevocabile && (
          <div className="card-body" style={{display:'flex',flexDirection:'column',gap:12}}>
            <div className="form-group form-col-full">
              <label className="form-label">
                Testo paragrafo AVVISA
                <span style={{fontWeight:400,color:'var(--text3)',marginLeft:6,fontSize:11}}>(personalizzabile — sostituisce il testo standard)</span>
              </label>
              <textarea
                className="form-input"
                value={testoOfferta}
                onChange={e=>setTestoOfferta(e.target.value)}
                rows={5}
                style={{fontFamily:'inherit',fontSize:13,lineHeight:1.6}}
              />
              <div style={{fontSize:11,color:'var(--text3)',marginTop:4}}>
                Il testo inizia automaticamente con <b>AVVISA</b> (in grassetto) nel documento finale.
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" style={{alignSelf:'flex-start'}}
              onClick={()=>setTestoOfferta(TESTO_OFFERTA_DEFAULT)}>
              ↺ Ripristina testo predefinito
            </button>
          </div>
        )}
      </div>

      {/* Date */}
      <div className="card">
        <div className="card-header"><div className="card-title">📅 Date e orari</div></div>
        <div className="card-body">
          <div className="form-grid">
            {isAsincrona ? (<>
              <Inp label="Inizio periodo offerte" val={dataAsta} set={setDataAsta} type="date" />
              <Inp label="Ora inizio" val={oraAsta} set={setOraAsta} placeholder="12:00" />
              <Inp label="Fine periodo offerte" val={dataTermine} set={setDataTermine} type="date" />
              <Inp label="Ora fine" val={oraTermine} set={setOraTermine} placeholder="12:00" />
            </>) : (<>
              <Inp label="Data asta" val={dataAsta} set={setDataAsta} type="date" />
              <Inp label="Ora asta" val={oraAsta} set={setOraAsta} placeholder="12:00" />
            </>)}
          </div>
        </div>
      </div>

      {/* Prezzi globali */}
      <div className="card">
        <div className="card-header"><div className="card-title">💶 Prezzi e condizioni</div></div>
        <div className="card-body">
          <div className="form-grid">
            <Inp label="Prezzo base (€)" val={prezzoBase} set={setPrezzoBase} placeholder="Es: 5.000,00" />
            <Inp label="Offerta minima ammissibile (€)" val={offertaMinima} set={setOffertaMinima} placeholder="Vuoto = uguale al prezzo base" />
            <Inp label="Rilancio minimo (€)" val={rilancioMin} set={setRilancioMin} placeholder="Es: 250,00" />
            <Inp label="Deposito cauzionale (%)" val={cauzione} set={setCauzione} placeholder="10" />
            <Inp label="Diritti d'asta (%)" val={dirittiAsta} set={setDirittiAsta} placeholder="2" />
            <Inp label="Modalità versamento cauzione" val={modalitaCauzione} set={setModalitaCauzione} full />
          </div>
        </div>
      </div>

      {/* Lotti */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">📦 Lotti in vendita</div>
          <button className="btn btn-ghost btn-sm"
            onClick={()=>setLotti(l=>[...l,{desc:'',qta:1,base:'',offertaMinima:'',rilancio:''}])}>
            <Plus size={13}/> Aggiungi lotto
          </button>
        </div>
        <div className="card-body" style={{display:'flex',flexDirection:'column',gap:12}}>
          {lotti.map((l,i) => (
            <LottoRow
              key={i}
              lotto={l}
              idx={i}
              total={lotti.length}
              onChange={handleLottoChange}
              onRemove={() => handleLottoRemove(i)}
            />
          ))}
        </div>
      </div>

      {/* Contatti e note */}
      <div className="card">
        <div className="card-header"><div className="card-title">📞 Contatti e note</div></div>
        <div className="card-body">
          <div className="form-grid">
            <Inp label="Referente per informazioni e visite" val={referente} set={setReferente} full />
            <div className="form-col-full form-group">
              <label className="form-label">Note finali (facoltativo)</label>
              <textarea className="form-input" value={noteFinali}
                onChange={e=>setNoteFinali(e.target.value)} rows={3}
                placeholder="Es: La vendita è soggetta all'imposta di registro..." />
            </div>
          </div>
        </div>
      </div>

      {/* Azioni */}
      <div style={{display:'flex',justifyContent:'flex-end',gap:10,paddingBottom:24}}>
        <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" onClick={genera} disabled={gen} style={{minWidth:260,justifyContent:'center'}}>
          <Download size={14}/> {gen?'Generazione\u2026':'Genera Avviso di Vendita (.docx)'}
        </button>
      </div>
    </div>
  )
}

// ─── Pagina principale ────────────────────────────────────────────────────────
export default function Aste() {
  const { currentProc, notify } = useStore()
  const [showWizard, setShowWizard] = useState(false)

  if (!currentProc) return (
    <>
      <Topbar title="Aste e Vendite" subtitle="Seleziona una procedura" />
      <div style={{flex:1,overflowY:'auto',padding:24}}>
        <Empty icon="\u2696\ufe0f" title="Nessuna procedura selezionata"
          sub="Seleziona una procedura dalla sezione Procedure per generare gli avvisi di vendita" />
      </div>
    </>
  )

  return (
    <>
      <Topbar title="Aste e Vendite" subtitle={currentProc.nome||''} />
      <div style={{flex:1,overflowY:'auto',padding:24}}>
        <div style={{maxWidth:900,margin:'0 auto',display:'flex',flexDirection:'column',gap:20}}>

          <div className="card" style={{cursor:'pointer'}} onClick={()=>setShowWizard(true)}>
            <div className="card-body" style={{display:'flex',alignItems:'center',gap:20,padding:28}}>
              <div style={{fontSize:48}}>📄</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:16,marginBottom:6}}>Avviso di Vendita</div>
                <div style={{fontSize:13,color:'var(--text3)',marginBottom:12}}>
                  Genera l&apos;avviso di vendita per aste telematiche: PVP, AsteMagazine, sincrona, asincrona, mista.
                </div>
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  {TIPI_ASTA.map(t=>(
                    <span key={t.id} style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:4,padding:'2px 8px',fontSize:11}}>
                      {t.label.split('\u2014')[0].trim()}
                    </span>
                  ))}
                </div>
              </div>
              <button className="btn btn-primary" onClick={e=>{e.stopPropagation();setShowWizard(true)}}>
                <Plus size={14}/> Nuovo avviso
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><div className="card-title">🏛 Procedura attiva</div></div>
            <div className="card-body">
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px 24px',fontSize:13}}>
                {[['Procedura',currentProc.nome],['Tipo',currentProc.tipo],
                  ['N. R.G.',(currentProc.num||'')+(currentProc.anno?'/'+currentProc.anno:'')],
                  ['Tribunale',currentProc.tribunale],['Giudice',currentProc.giudice],
                  ['Curatore',currentProc.curatore]].map(([l,v])=>(
                  <div key={l} style={{display:'flex',gap:8}}>
                    <span style={{color:'var(--text3)',minWidth:110}}>{l}</span>
                    <span style={{fontWeight:500}}>{v||'\u2014'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>

      {showWizard && (
        <Modal open={showWizard} onClose={()=>setShowWizard(false)} title="Genera Avviso di Vendita" wide>
          <WizardAvviso proc={currentProc} onClose={()=>setShowWizard(false)} notify={notify} />
        </Modal>
      )}
    </>
  )
}
