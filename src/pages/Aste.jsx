import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { Topbar, Modal, Empty } from '../components/layout'
import { supabase } from '../lib/supabase'
import { Download, Plus } from 'lucide-react'
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
         AlignmentType, BorderStyle, WidthType, ShadingType, LevelFormat,
         ImageRun, Header, Footer } from 'docx'

// ─── Costanti ─────────────────────────────────────────────────────────────────
const MW = 11906, MM = 1000, CW = MW - MM * 2

const TIPI_ASTA = [
  { id: 'asincrona_pvp',  label: 'Asincrona telematica — Portale Vendite Pubbliche (PVP)' },
  { id: 'sincrona_pvp',   label: 'Sincrona telematica — Portale Vendite Pubbliche (PVP)' },
  { id: 'sincrona_amag',  label: 'Sincrona telematica — AsteMagazine' },
  { id: 'asincrona_amag', label: 'Asincrona telematica — AsteMagazine' },
  { id: 'mista',          label: 'Vendita telematica mista (sincrona + asincrona)' },
  { id: 'busta',          label: 'Vendita con offerte in busta chiusa' },
  { id: 'trattativa',     label: 'Vendita a trattativa privata' },
]

// ─── Helpers docx ─────────────────────────────────────────────────────────────
const fmtEur = (n) => {
  const p = parseFloat(n||0).toFixed(2).split('.')
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
  const { tipoAsta, dataAsta, oraAsta, dataTermine, oraTermine,
    prezzoBase, rilancioMin, cauzione, modalitaCauzione,
    luogoDeposito, referente, noteFinali,
    offertaIrrevocabile, dataOfferta, importoOfferta } = opts

  const nrg        = (proc.num||'') + (proc.anno?'/'+proc.anno:'')
  const isAsincrona = tipoAsta.includes('asincrona') || tipoAsta === 'mista'
  const isSincrona  = tipoAsta.includes('sincrona')
  const isPVP       = tipoAsta.includes('pvp')
  const isAMag      = tipoAsta.includes('amag')
  const isBusta     = tipoAsta === 'busta'
  const isTrattativa= tipoAsta === 'trattativa'
  const isMista     = tipoAsta === 'mista'
  const tipoLabel   = TIPI_ASTA.find(t => t.id === tipoAsta)?.label || tipoAsta
  const nomePortale = isAMag
    ? 'AsteMagazine (www.astemagazine.it)'
    : 'Portale delle Vendite Pubbliche (www.portalevenditepubbliche.it)'

  // Tabella lotti
  const colW = [Math.floor(CW*0.5), Math.floor(CW*0.08), Math.floor(CW*0.21), Math.floor(CW*0.21)]
  const tblLotti = new Table({ width:{size:CW,type:WidthType.DXA}, columnWidths:colW, borders:BTS, rows:[
    new TableRow({ children:[
      mkCell([B('Descrizione lotto',20)], colW[0], {fill:'244061', align:AlignmentType.LEFT}),
      mkCell([B('Q.ta',20)],              colW[1], {fill:'244061', align:C}),
      mkCell([B('Prezzo base',20)],       colW[2], {fill:'244061', align:AlignmentType.RIGHT}),
      mkCell([B('Rilancio minimo',20)],   colW[3], {fill:'244061', align:AlignmentType.RIGHT}),
    ]}),
    ...lotti.map((l,i) => {
      const shade = i%2===0 ? 'F8F9FA' : 'FFFFFF'
      return new TableRow({ children:[
        mkCell([T(l.desc||'—',{size:20})], colW[0], {fill:shade}),
        mkCell([T(String(l.qta||1),{size:20})], colW[1], {fill:shade, align:C}),
        mkCell([T(fmtEur(l.base||prezzoBase),{size:20})], colW[2], {fill:shade, align:AlignmentType.RIGHT}),
        mkCell([T(fmtEur(l.rilancio||rilancioMin),{size:20})], colW[3], {fill:shade, align:AlignmentType.RIGHT}),
      ]})
    }),
  ]})

  // Blocco offerta irrevocabile
  const blkOfferta = offertaIrrevocabile ? [
    BR(),
    P([B('AVVISA'), T(' che in data '), B(fmtD(dataOfferta)),
       T(' è stata ricevuta un\u2019offerta irrevocabile d\u2019acquisto a lotto unico per la somma di '),
       B(fmtEur(importoOfferta)+' OLTRE IVA SE DOVUTA E ONERI DI LEGGE'),
       T('. Nel rispetto dei principi di competitivit\u00e0 e trasparenza si avvia una gara competitiva telematica allo scopo di permettere a eventuali interessati di partecipare presentando la propria offerta a rialzo come da rilancio minimo indicato.')]),
  ] : []

  // Corpo in base al tipo vendita
  let corpo = []

  if (isBusta) {
    corpo = [
      P([B('AVVISA'), T(' che in esecuzione del programma di liquidazione, si proceder\u00e0 alla vendita mediante '),
         B('presentazione di offerte in busta chiusa'), T(', ai sensi dell\u2019art. 216 D.Lgs. 14/2019 (CCII).')]),
      ...blkOfferta, BR(),
      P(B('MODALIT\u00c0 DI PARTECIPAZIONE')),
      BLT([T('Le offerte dovranno essere presentate in busta chiusa sigillata entro il '), B(fmtDT(dataTermine, oraTermine)), T('.')]),
      BLT([T('La busta dovrà recare la dicitura: "OFFERTA DI ACQUISTO \u2014 '), B((proc.tipo||'')+' n. '+nrg+' \u2013 '+(proc.nome||'')), T('".')]),
      BLT([T('Luogo di deposito: '), B(luogoDeposito||'Via Giuseppe Parini, 29 \u2014 Lecco (LC)')]),
      BLT([T('Cauzione: '), B(cauzione||'10'), T('% del prezzo offerto, da versarsi mediante '), T(modalitaCauzione||'bonifico bancario alle coordinate indicate.')]),
      BR(),
      P([B('APERTURA BUSTE'), T(': in data '), B(fmtDT(dataAsta, oraAsta)), T('.')]),
    ]
  } else if (isTrattativa) {
    corpo = [
      P([B('AVVISA'), T(' che si proceder\u00e0 alla vendita dei seguenti beni mediante '),
         B('trattativa privata'), T(', ai sensi dell\u2019art. 216 D.Lgs. 14/2019 (CCII).')]),
      ...blkOfferta, BR(),
      P([T('Le offerte dovranno pervenire entro il '), B(fmtDT(dataTermine, oraTermine)),
         T(' a mezzo e-mail a '), B('procedure@progess-italia.it'),
         T(' o PEC a '), B(proc.pec||''), T('.')]),
      BLT([T('Prezzo base: '), B(fmtEur(prezzoBase)), T(' OLTRE IVA SE DOVUTA E ONERI DI LEGGE.')]),
      BLT([T('Cauzione: '), B(cauzione||'10'), T('% del prezzo base, da versarsi mediante '), T(modalitaCauzione||'bonifico bancario.')]),
    ]
  } else {
    // Telematica (sincrona, asincrona, mista)
    const modalita = isMista ? 'mista (sincrona e asincrona)'
      : isSincrona ? 'sincrona'
      : 'asincrona'
    corpo = [
      P([B('AVVISA'), T(' che in esecuzione del programma di liquidazione si proceder\u00e0 alla vendita telematica '),
         B(modalita), T(' dei seguenti beni, tramite la piattaforma '), B(nomePortale), T('.')]),
      ...blkOfferta, BR(),
      P(B('DATI DELLA VENDITA')),
      ...(isAsincrona ? [
        P([T('Periodo di presentazione offerte: dal '), B(fmtDT(dataAsta, oraAsta)),
           T(' al '), B(fmtDT(dataTermine, oraTermine))]),
      ] : [
        P([T('Data e ora dell\u2019asta: '), B(fmtDT(dataAsta, oraAsta))]),
      ]),
      BR(),
      P(B('MODALIT\u00c0 DI PARTECIPAZIONE')),
      BLT([T('Prezzo base: '), B(fmtEur(prezzoBase)), T(' OLTRE IVA SE DOVUTA E ONERI DI LEGGE.')]),
      BLT([T('Rilancio minimo: '), B(fmtEur(rilancioMin))]),
      BLT([T('Cauzione: '), B(cauzione||'10'), T('% del prezzo base, da versarsi mediante '), T(modalitaCauzione||'bonifico bancario alle coordinate indicate.')]),
      ...(isPVP ? [
        BLT(T('La partecipazione avviene esclusivamente per via telematica tramite il Portale delle Vendite Pubbliche del Ministero della Giustizia (www.portalevenditepubbliche.it).')),
        BLT(T('Per registrazione e istruzioni tecniche consultare il portale PVP.')),
      ] : [
        BLT(T('La partecipazione avviene tramite la piattaforma AsteMagazine (www.astemagazine.it).')),
        BLT(T('Le istruzioni per la partecipazione telematica sono disponibili sul portale AsteMagazine nella sezione dedicata alla presente vendita.')),
        BLT(T('Per la registrazione e il supporto tecnico contattare AsteMagazine tramite il sito o il numero verde indicato sul portale.')),
      ]),
    ]
  }

  const doc = new Document({ numbering:numConf, sections:[{
    properties:{ page:{ size:{width:MW,height:16838}, margin:{top:1200,right:MM,bottom:1400,left:MM} } },
    headers:{ default:mkHdr(logoB64) },
    footers:{ default:mkFtr() },
    children:[
      PC([B('AVVISO DI VENDITA',28)], {spacing:{before:240,after:80}}),
      PC([T((proc.tipo||'').toUpperCase()+' N. '+nrg, {size:22})]),
      PC([B('"'+(proc.nome||'')+'"',24)], {spacing:{before:40,after:40}}),
      PC([T('Tribunale di '+(proc.tribunale||''), {size:20,italics:true})]),
      BR(),
      PC([T('Modalit\u00e0 di vendita: ',{size:20}), B(tipoLabel,20)]),
      BR(),
      new Paragraph({ border:{ bottom:{ style:BorderStyle.SINGLE, size:4, color:'244061', space:4 } }, children:[] }),
      BR(),
      P([B('Il/La '+(proc.tipo||'')), T(' '), B(proc.curatore||''),
         T(', della procedura di '+(proc.tipo||'')+' n. '+nrg+' denominata "'),
         B(proc.nome||''), T('" pendente avanti il Tribunale di '+(proc.tribunale||'')+
         ', Giudice Delegato '+(proc.giudice||'')+',')]),
      ...corpo,
      BR(),
      P(B('BENI OGGETTO DI VENDITA')),
      BR(), tblLotti, BR(),
      P([B('Per informazioni, visita dei beni e chiarimenti: '), T(referente||'Pro.Ges.S. Srl \u2014 procedure@progess-italia.it')]),
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

// ─── Wizard ───────────────────────────────────────────────────────────────────
function WizardAvviso({ proc, onClose, notify }) {
  const today = new Date().toISOString().slice(0,10)
  const [tipoAsta, setTipoAsta]           = useState('asincrona_pvp')
  const [dataAsta, setDataAsta]           = useState(today)
  const [oraAsta, setOraAsta]             = useState('12:00')
  const [dataTermine, setDataTermine]     = useState(today)
  const [oraTermine, setOraTermine]       = useState('12:00')
  const [prezzoBase, setPrezzoBase]       = useState('')
  const [rilancioMin, setRilancioMin]     = useState('')
  const [cauzione, setCauzione]           = useState('10')
  const [modalitaCauzione, setModalitaCauzione] = useState('bonifico bancario sulle coordinate indicate nel presente avviso')
  const [luogoDeposito, setLuogoDeposito] = useState('Via Giuseppe Parini, 29 — Lecco (LC)')
  const [referente, setReferente]         = useState('Pro.Ges.S. Srl — procedure@progess-italia.it')
  const [noteFinali, setNoteFinali]       = useState('')
  const [lotti, setLotti]                 = useState([{ desc:'Lotto unico — tutti i beni mobili inventariati', qta:1, base:'', rilancio:'' }])
  const [offertaIrrevocabile, setOffertaIrrevocabile] = useState(false)
  const [dataOfferta, setDataOfferta]     = useState(today)
  const [importoOfferta, setImportoOfferta] = useState('')
  const [gen, setGen]                     = useState(false)

  const isAsincrona = tipoAsta.includes('asincrona') || tipoAsta === 'mista'
  const isBusta     = tipoAsta === 'busta'
  const isTrattativa= tipoAsta === 'trattativa'
  const isTelematica= !isBusta && !isTrattativa

  const genera = async () => {
    setGen(true)
    try {
      const logo = localStorage.getItem('ip_logo') || null
      const blob = await genAvviso(proc, lotti, {
        tipoAsta, dataAsta, oraAsta, dataTermine, oraTermine,
        prezzoBase, rilancioMin, cauzione, modalitaCauzione,
        luogoDeposito, referente, noteFinali,
        offertaIrrevocabile, dataOfferta, importoOfferta,
      }, logo)
      const nome = 'Avviso_Vendita_'+(proc.nome||'').replace(/\s+/g,'_')+'.docx'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href=url; a.download=nome
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      setTimeout(()=>URL.revokeObjectURL(url),3000)
      notify('Avviso di vendita generato', 'ok')
      onClose()
    } catch(e) { notify('Errore: '+e.message, 'err') }
    finally { setGen(false) }
  }

  const Inp = ({label, val, set, placeholder='', type='text', full=false}) => (
    <div className={full ? 'form-col-full form-group' : 'form-group'}>
      <label className="form-label">{label}</label>
      <input type={type} className="form-input" value={val} onChange={e=>set(e.target.value)} placeholder={placeholder} />
    </div>
  )

  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>

      {/* Tipo */}
      <div className="card">
        <div className="card-header"><div className="card-title">📋 Modalità di vendita</div></div>
        <div className="card-body">
          <div className="form-col-full form-group">
            <label className="form-label">Tipo di vendita</label>
            <select className="form-input" value={tipoAsta} onChange={e=>setTipoAsta(e.target.value)}>
              {TIPI_ASTA.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
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
          <div className="card-body">
            <div className="form-grid">
              <Inp label="Data ricezione offerta" val={dataOfferta} set={setDataOfferta} type="date" />
              <Inp label="Importo offerta (€)" val={importoOfferta} set={setImportoOfferta} placeholder="Es: 3500,00" />
            </div>
            <div style={{background:'var(--bg2)',borderRadius:6,padding:'10px 14px',fontSize:12,color:'var(--text2)',marginTop:8,lineHeight:1.6}}>
              <b>Anteprima testo:</b><br/>
              "AVVISA che in data <b>{fmtD(dataOfferta)}</b> è stata ricevuta un&apos;offerta irrevocabile d&apos;acquisto a lotto unico per la somma di <b>{importoOfferta ? fmtEur(importoOfferta) : '...'} OLTRE IVA SE DOVUTA E ONERI DI LEGGE</b>. Nel rispetto dei principi di competitività e trasparenza si avvia una gara competitiva telematica..."
            </div>
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
            </>) : isBusta ? (<>
              <Inp label="Termine presentazione offerte" val={dataTermine} set={setDataTermine} type="date" />
              <Inp label="Ora termine" val={oraTermine} set={setOraTermine} placeholder="12:00" />
              <Inp label="Data apertura buste" val={dataAsta} set={setDataAsta} type="date" />
              <Inp label="Ora apertura" val={oraAsta} set={setOraAsta} placeholder="10:00" />
            </>) : isTrattativa ? (<>
              <Inp label="Termine presentazione offerte" val={dataTermine} set={setDataTermine} type="date" />
              <Inp label="Ora termine" val={oraTermine} set={setOraTermine} placeholder="12:00" />
            </>) : (<>
              <Inp label="Data asta" val={dataAsta} set={setDataAsta} type="date" />
              <Inp label="Ora asta" val={oraAsta} set={setOraAsta} placeholder="12:00" />
            </>)}
          </div>
        </div>
      </div>

      {/* Prezzi */}
      <div className="card">
        <div className="card-header"><div className="card-title">💶 Prezzi e cauzione</div></div>
        <div className="card-body">
          <div className="form-grid">
            <Inp label="Prezzo base (€)" val={prezzoBase} set={setPrezzoBase} placeholder="Es: 5000,00" />
            {isTelematica && <Inp label="Rilancio minimo (€)" val={rilancioMin} set={setRilancioMin} placeholder="Es: 250,00" />}
            <Inp label="Cauzione (%)" val={cauzione} set={setCauzione} />
            <Inp label="Modalità versamento cauzione" val={modalitaCauzione} set={setModalitaCauzione} full />
          </div>
        </div>
      </div>

      {/* Lotti */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">📦 Lotti in vendita</div>
          <button className="btn btn-ghost btn-sm" onClick={()=>setLotti(l=>[...l,{desc:'',qta:1,base:'',rilancio:''}])}>
            <Plus size={13}/> Aggiungi lotto
          </button>
        </div>
        <div className="card-body" style={{display:'flex',flexDirection:'column',gap:12}}>
          {lotti.map((l,i)=>(
            <div key={i} style={{background:'var(--bg2)',borderRadius:8,padding:'12px 14px'}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
                <span style={{fontWeight:600,fontSize:13}}>Lotto {i+1}</span>
                {lotti.length>1 && <button className="btn btn-ghost btn-sm" style={{color:'var(--accent-r)'}} onClick={()=>setLotti(ls=>ls.filter((_,j)=>j!==i))}>✕</button>}
              </div>
              <div className="form-grid">
                <div className="form-col-full form-group">
                  <label className="form-label">Descrizione lotto</label>
                  <input className="form-input" value={l.desc} onChange={e=>setLotti(ls=>ls.map((x,j)=>j===i?{...x,desc:e.target.value}:x))} placeholder="Es: Lotto 1 — macchinari officina" />
                </div>
                <div className="form-group">
                  <label className="form-label">Q.tà</label>
                  <input className="form-input" type="number" min="1" value={l.qta} onChange={e=>setLotti(ls=>ls.map((x,j)=>j===i?{...x,qta:e.target.value}:x))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Prezzo base lotto (€) — vuoto = globale</label>
                  <input className="form-input" value={l.base} onChange={e=>setLotti(ls=>ls.map((x,j)=>j===i?{...x,base:e.target.value}:x))} placeholder="Lascia vuoto per usare prezzo base globale" />
                </div>
                {isTelematica && <div className="form-group">
                  <label className="form-label">Rilancio min. lotto (€) — vuoto = globale</label>
                  <input className="form-input" value={l.rilancio} onChange={e=>setLotti(ls=>ls.map((x,j)=>j===i?{...x,rilancio:e.target.value}:x))} placeholder="Lascia vuoto per usare rilancio globale" />
                </div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Contatti */}
      <div className="card">
        <div className="card-header"><div className="card-title">📞 Contatti e note</div></div>
        <div className="card-body">
          <div className="form-grid">
            {isBusta && <Inp label="Luogo deposito offerte" val={luogoDeposito} set={setLuogoDeposito} full />}
            <Inp label="Referente per informazioni e visite" val={referente} set={setReferente} full />
            <div className="form-col-full form-group">
              <label className="form-label">Note finali (facoltativo)</label>
              <textarea className="form-input" value={noteFinali} onChange={e=>setNoteFinali(e.target.value)} rows={3} placeholder="Es: La vendita è soggetta all'imposta di registro..." />
            </div>
          </div>
        </div>
      </div>

      {/* Azioni */}
      <div style={{display:'flex',justifyContent:'flex-end',gap:10,paddingBottom:24}}>
        <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" onClick={genera} disabled={gen} style={{minWidth:260,justifyContent:'center'}}>
          <Download size={14}/> {gen?'Generazione…':'Genera Avviso di Vendita (.docx)'}
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
        <Empty icon="⚖️" title="Nessuna procedura selezionata" sub="Seleziona una procedura dalla sezione Procedure per generare gli avvisi di vendita" />
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
                  Genera l&apos;avviso di vendita per aste telematiche (PVP, AsteMagazine, sincrona/asincrona), vendite con offerte in busta chiusa o trattativa privata. Supporta offerta irrevocabile pre-asta.
                </div>
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  {['Asincrona PVP','Sincrona PVP','Sincrona AsteMagazine','Asincrona AsteMagazine','Mista','Busta chiusa','Trattativa'].map(t=>(
                    <span key={t} style={{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:4,padding:'2px 8px',fontSize:11}}>{t}</span>
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
                    <span style={{fontWeight:500}}>{v||'—'}</span>
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
