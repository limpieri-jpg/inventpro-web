import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
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
    prezzoBase, offertaMinima, rilancioMin, cauzione, dirittiAsta,
    termSaldo, ibanProcedura, intestazioneProcedura,
    ibanCauzione: _ibanCau, bancaCauzione: _bancaCau,
    ibanDiritti: _ibanDir, bancaDiritti: _bancaDir,
    referente, noteFinali,
    offertaIrrevocabile, offertaIrrevData, offertaIrrevImporto, testoOfferta } = opts

  const nrg      = (proc.num||'') + (proc.anno?'/'+proc.anno:'')
  const isPVP    = tipoAsta.includes('pvp')
  const isAMag   = tipoAsta.includes('amag')
  const isMista  = tipoAsta === 'mista'
  const isAsin   = tipoAsta.includes('asincrona') || isMista
  const isSin    = tipoAsta.includes('sincrona')
  const cau      = cauzione || '10'
  const dir      = dirittiAsta || '2'
  const saldo    = termSaldo || '120'
  const nEsp     = nEsperimento ? nEsperimento + '\u00b0 ESPERIMENTO DI VENDITA' : ''

  // IBAN da settings (fallback ai valori hardcoded)
  const IBAN_CAU  = _ibanCau  || 'IT63 Y031 0422 9030 0000 0400 014'
  const IBAN_DIR  = _ibanDir  || 'IT63 J031 0422 9030 0000 0820 981'
  const BANCA_PGS = _bancaCau || 'Deutsche Bank \u2014 Filiale di Lecco, Agenzia di Castello'
  const BANCA_DIR = _bancaDir || BANCA_PGS

  const causale = (tipo) => {
    const base = (proc.tipo||'') + ' n. ' + nrg + ' \u2014 Tribunale di ' + (proc.tribunale||'')
    return tipo === 'cau' ? 'Cauzione Lotto ___ \u2014 ' + base
         : tipo === 'dir' ? 'Diritti d\u2019asta Lotto ___ \u2014 ' + base
         : 'Saldo Lotto ___ \u2014 ' + base
  }

  // ── Tabella lotti ─────────────────────────────────────────────────────────
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
      const shade   = i%2===0 ? 'F8F9FA' : 'FFFFFF'
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

  // ── Paragrafo AVVISA ──────────────────────────────────────────────────────
  let pAvvisa
  if (offertaIrrevocabile && (testoOfferta||'').trim()) {
    pAvvisa = P([B('AVVISA'), T(' ' + testoOfferta.trim())])
  } else if (isAMag) {
    pAvvisa = P([
      B('AVVISA'),
      T(isAsin && !isMista
        ? ' del farsi luogo alla vendita dei beni di pertinenza della procedura in epigrafe, con modalit\u00e0 di vendita \u201casincrona telematica\u201d, nonch\u00e9 \u201casta a tempo\u201d, con apertura della gara dal giorno ' + fmtDT(dataAsta, oraAsta) + ' al giorno ' + fmtDT(dataTermine, oraTermine) + ', accessibile sul sito di gara del Soggetto Specializzato alla Vendita Procedure Gestite e Servizi S.r.l. \u2013 PRO.GES.S. \u2013 www.astemagazine.com, oltre che sul sito www.progess-italia.it, dei seguenti lotti:'
        : ' del farsi luogo alla vendita dei beni di pertinenza della procedura in epigrafe, con modalit\u00e0 di vendita \u201csincrona telematica\u201d, per il giorno ' + fmtDT(dataAsta, oraAsta) + ' accessibile sul sito di gara del Soggetto Specializzato alla Vendita Procedure Gestite e Servizi S.r.l. \u2013 PRO.GES.S. \u2013 www.astemagazine.com, oltre che sul sito www.progess-italia.it.')
    ])
  } else {
    pAvvisa = P([
      B('AVVISA'),
      T(isAsin && !isMista
        ? ' del farsi luogo alla vendita dei beni di pertinenza della procedura in epigrafe, con modalit\u00e0 di vendita \u201cASINCRONA TELEMATICA\u201d, tramite la piattaforma di gara \u201cProgess Italia\u201d autorizzata dal Ministero della Giustizia PGT n. 51 del 15/05/2019 \u2013 www.progess-italia.it. La gara si terr\u00e0 dal giorno ' + fmtDT(dataAsta, oraAsta) + ' al giorno ' + fmtDT(dataTermine, oraTermine) + '.'
        : isMista
        ? ' del farsi luogo alla vendita dei beni di pertinenza della procedura in epigrafe, con modalit\u00e0 di vendita \u201cSINCRONA MISTA\u201d come meglio oltre descritti, nei lotti e con i prezzi base di seguito indicati, nonch\u00e9 con le seguenti modalit\u00e0 e condizioni, per il giorno ' + fmtDT(dataAsta, oraAsta) + ' presso la sala d\u2019aste del Soggetto Specializzato alla Vendita \u201cPro.Ges.S. S.r.l.\u201d \u2013 Via Giuseppe Parini n.ro 29 \u2013 Lecco (Lc).'
        : ' del farsi luogo alla vendita dei beni di pertinenza della procedura in epigrafe, con modalit\u00e0 di vendita \u201cSINCRONA TELEMATICA\u201d, per il giorno ' + fmtDT(dataAsta, oraAsta) + ' tramite la piattaforma di gara \u201cProgess Italia\u201d autorizzata dal Ministero della Giustizia PGT n. 51 del 15/05/2019 \u2013 www.progess-italia.it.')
    ])
  }

  // ── Tabella lotti nel corpo del documento ────────────────────────────────
  const sezioneDescrizioneLotti = [
    BR(),
    P(B('DESCRIZIONE DEI BENI POSTI IN VENDITA E PREZZI')),
    BR(), tblLotti, BR(),
  ]

  // ── Sezione: Modalità offerte ─────────────────────────────────────────────
  let sezioneOfferte
  if (isAMag) {
    sezioneOfferte = [
      BR(),
      P(B('MODALIT\u00c0 DI PRESENTAZIONE DELLE OFFERTE E VERSAMENTO DELLA CAUZIONE')),
      P(T('Gli interessati potranno presentare le offerte secondo le seguenti modalit\u00e0:')),
      BR(),
      P(T('Saranno considerate ammissibili esclusivamente le offerte TELEMATICHE che rispettano i requisiti riportati sul presente avviso di vendita, fermo che in caso di mere irregolarit\u00e0 formali, l\u2019offerente potr\u00e0 essere invitato a regolarizzare l\u2019offerta.')),
      BR(),
      BLT(T('Gli interessati a partecipare dovranno procedere alla registrazione gratuita sul sito www.astemagazine.com, accettando espressamente le condizioni generali nonch\u00e9 le condizioni ed i termini prescritti nel presente avviso di vendita.')),
      BLT(T('Al momento della registrazione verr\u00e0 richiesto di inserire un indirizzo e-mail valido ed una password; tali dati costituiranno le credenziali per poter accedere alla piattaforma Aste Magazine.')),
      BLT(T('Se il partecipante alla gara \u00e8 una societ\u00e0 o persona giuridica, dovr\u00e0 registrarsi indicando i dati societari e allegando la visura camerale di data non anteriore a tre mesi, copia del documento d\u2019identit\u00e0 e del codice fiscale del legale rappresentante, copia del documento da cui risultino i poteri.')),
      BLT(T('Se il partecipante alla gara \u00e8 coniugato in regime di comunione legale dei beni, dovr\u00e0 allegare copia del documento di identit\u00e0 e copia del codice fiscale del coniuge (salvo la facolt\u00e0 del deposito successivo all\u2019esito dell\u2019aggiudicazione e del versamento del prezzo).')),
      BLT(T('Il partecipante all\u2019asta, regolarmente registrato e che intende agire in rappresentanza di terzi, dovr\u00e0 essere obbligatoriamente dotato di procura riportante i riferimenti dei soggetti nonch\u00e9 del lotto in vendita per il quale intende procedere. Dovr\u00e0 trasmettere suddetta procura a mezzo PEC all\u2019indirizzo PEC della procedura e in c.c. a progess@arubapec.it specificando ID ASTA, RG numero, anno e Tribunale di riferimento.')),
      BLT(T('Non saranno accettate partecipazioni con deleghe generiche \u201cper persona da nominare\u201d.')),
      BR(),
      P(B('DEPOSITO CAUZIONALE')),
      P([T('Il deposito cauzionale nella misura pari al '), B(cau + '%'), T(' del prezzo offerto, necessario per l\u2019iscrizione alla gara, dovr\u00e0 essere versato sul conto corrente del soggetto specializzato alla vendita:')]),
      BR(),
      P(B('Pro.Ges.S. S.r.l.')),
      P([B('c/o ' + BANCA_PGS)]),
      P([B('IBAN:\u00a0 ' + IBAN_CAU)]),
      P([B('Causale: \u201c'), T(causale('cau')), B('\u201d')]),
      BR(),
      P([T('La presentazione delle offerte e l\u2019accredito della relativa cauzione dovranno pervenire entro il giorno '), B(fmtD(dataTermine)), T(' alle ore '), B(oraTermine || '12:00'), T('.')]),
    ]
  } else if (isMista) {
    sezioneOfferte = [
      BR(),
      P(B('CONDIZIONI DELLA VENDITA')),
      P(T('La vendita avr\u00e0 luogo avvalendosi del Gestore della Vendita Telematica \u2013 Pro.Ges.S. S.r.l. \u2013 Procedure Gestite e Servizi, con sede in Lecco (Lc) Via Giuseppe Parini, 29.')),
      P(T("La vendita avverr\u00e0 nello stato di fatto e di diritto in cui i beni si trovano. L\u2019offerente viene messo a conoscenza che: la procedura \u00e8 esonerata da ogni responsabilit\u00e0 connessa con lo stato dei beni; la vendita non \u00e8 soggetta alle norme concernenti la garanzia per vizi; l\u2019esistenza di eventuali vizi o difformit\u00e0 non potr\u00e0 dare luogo ad alcun risarcimento, indennit\u00e0 o riduzione del prezzo.")),
      BR(),
      P(B('MODALIT\u00c0 DI PRESENTAZIONE DELLE OFFERTE E VERSAMENTO DELLA CAUZIONE')),
      P(T('Saranno considerate ammissibili esclusivamente le offerte depositate in modalit\u00e0 cartacea o telematica e che rispettano i requisiti riportati sul presente avviso di vendita.')),
      BR(),
      P(B('OFFERTA CARTACEA:')),
      P([T("L'offerta dovr\u00e0 essere presentata presso la sede del Soggetto Specializzato alla Vendita \u201cPro.Ges.S. S.r.l.\u201d \u2013 Lecco (Lc) Via Giuseppe Parini n. 29, nei giorni feriali, escluso il sabato, dalle ore 9:00 alle ore 13:00 e dalle ore 14:30 alle ore 18:30, entro e non oltre le ore 12:00 del secondo giorno lavorativo precedente la data di vendita ("), B(fmtD(dataAsta)), T("), in busta chiusa sigillata, distintamente per ciascun Lotto, e controfirmata sul lembo di chiusura.")]),
      P(T("L'offerta dovr\u00e0 essere redatta in bollo da euro 16,00 e dovr\u00e0 contenere: le generalit\u00e0 complete dell'offerente (o i dati societari e del legale rappresentante se persona giuridica); copia del documento d'identit\u00e0 in corso di validit\u00e0; il certificato di matrimonio se coniugato; la dichiarazione di accettazione del presente avviso; l'assegno circolare intestato alla procedura a titolo di cauzione. Non sono ammesse offerte per persona da nominare.")),
      BR(),
      P(B('OFFERTA TELEMATICA:')),
      BLT(T("dovr\u00e0 essere formulata esclusivamente tramite il modulo web \u201cOfferta Telematica\u201d del Ministero della Giustizia, accessibile dal portale www.progess-italia.it o dal portale ministeriale http://venditepubbliche.giustizia.it;")),
      BLT(T("dovr\u00e0 essere inviata con le modalit\u00e0 previste dall'art. 12 del DM 32/2015;")),
      BLT([T("dovr\u00e0 essere trasmessa all'indirizzo PEC del Ministero della Giustizia "), B('offertapvp.dgsia@giustiziacert.it'), T('.')]),
      BR(),
      P([T('La cauzione, nella misura del '), B(cau + '%'), T(' del prezzo offerto, dovr\u00e0 risultare accreditata almeno entro le ore 12:00 del secondo giorno lavorativo antecedente la data di apertura buste ('), B(fmtD(dataAsta)), T(') sul conto corrente:')]),
      BR(),
      P(B('Beneficiario: Pro.Ges.S. S.r.l.')),
      P([B('Banca: ' + BANCA_PGS)]),
      P([B('IBAN: ' + IBAN_CAU)]),
      P([B('Causale: \u201c'), T(causale('cau')), B('\u201d')]),
      BR(),
      P([T('Tutorial per la compilazione PVP: '), T('https://www.progess-italia.it/video-tutorial')]),
      BR(),
      P(B('SVOLGIMENTO DELLA PROCEDURA COMPETITIVA')),
      P([T('La procedura si svolger\u00e0 con modalit\u00e0 SINCRONA MISTA. Il giorno '), B(fmtDT(dataAsta, oraAsta)), T(' si proceder\u00e0 all\u2019apertura delle buste presso la sala d\u2019aste di Pro.Ges.S. S.r.l. \u2013 Via Giuseppe Parini n. 29 \u2013 Lecco (Lc), alla presenza del Curatore.')]),
      P(T('Almeno 30 minuti prima dell\u2019inizio, gli offerenti telematici riceveranno dal Gestore le credenziali per accedere all\u2019area riservata dell\u2019asta. Le offerte cartacee saranno inserite manualmente nel portale www.progess-italia.it.')),
      P(T('In caso di unica offerta efficace si procede all\u2019aggiudicazione anche in assenza dell\u2019offerente. In caso di pi\u00f9 offerte valide si d\u00e0 corso alla gara partendo dall\u2019offerta pi\u00f9 alta, con i rilanci minimi fissati. Trascorso 1 (uno) minuto dall\u2019ultimo rilancio, il Lotto \u00e8 aggiudicato al miglior offerente.')),
      P(T('La cauzione dell\u2019aggiudicatario \u00e8 imputata in acconto sul prezzo. La cauzione dei non aggiudicatari \u00e8 restituita entro 7 giorni lavorativi, dedotte commissioni bancarie pari a \u20ac 5,00.')),
    ]
  } else {
    sezioneOfferte = [
      BR(),
      P(B('CONDIZIONI DELLA VENDITA')),
      P(T('La vendita avr\u00e0 luogo avvalendosi del Gestore della Vendita Telematica \u2013 Pro.Ges.S. S.r.l. \u2013 Procedure Gestite e Servizi, con sede in Lecco (Lc) Via Giuseppe Parini, 29, sulla piattaforma di gara www.progess-italia.it.')),
      P(T('La vendita avverr\u00e0 nello stato di fatto e di diritto in cui i beni si trovano, con tutte le eventuali pertinenze, accessioni, ragioni ed azioni, servit\u00f9 attive e passive; la vendita avverr\u00e0 a corpo e non a misura. Ai sensi dell\u2019art. 2922 c.c., la vendita forzata non \u00e8 soggetta alle norme concernenti la garanzia per vizi o per mancanza di qualit\u00e0. L\u2019esistenza di eventuali vizi o difformit\u00e0, anche se occulti, non potranno dare luogo ad alcun risarcimento, indennit\u00e0 o riduzione di prezzo.')),
      P(T('Si precisa che, ai sensi dell\u2019art. 217, comma 1, CCII, il Giudice Delegato potr\u00e0 in ogni momento sospendere le operazioni di vendita qualora ricorrano gravi e giustificati motivi, ovvero qualora il prezzo risulti notevolmente inferiore a quello ritenuto congruo.')),
      BR(),
      P(B('MODALIT\u00c0 DI PRESENTAZIONE DELLE OFFERTE E VERSAMENTO DELLA CAUZIONE')),
      P(T('Saranno considerate ammissibili esclusivamente le offerte depositate in modalit\u00e0 telematica e che rispettino i requisiti riportati nel presente avviso di vendita.')),
      BR(),
      P(B('OFFERTA TELEMATICA:')),
      P([T("L'offerta irrevocabile di acquisto dovr\u00e0 essere formulata entro il giorno "), B(isAsin ? fmtD(dataTermine) : fmtD(dataAsta)), T(" esclusivamente tramite il modulo web \u201cOfferta Telematica\u201d fornito dal Ministero della Giustizia, scaricabile dal portale ministeriale http://venditepubbliche.giustizia.it. L\u2019accesso potr\u00e0 avvenire anche attraverso www.progess-italia.it.")]),
      P([T("L'offerta dovr\u00e0 essere inviata con le modalit\u00e0 previste dall'art. 12 del DM 32/2015 e trasmessa all'indirizzo PEC del Ministero della Giustizia "), B('offertapvp.dgsia@giustiziacert.it'), T('. Una volta trasmessa, non sar\u00e0 pi\u00f9 possibile modificare o cancellare l\u2019offerta.')]),
      P([T('La cauzione, nella misura del '), B(cau + '%'), T(" del prezzo offerto, dovr\u00e0 essere versata ai sensi dell'art. 12 DM 32/2015, mediante bonifico bancario, con accredito almeno entro le ore 12:00 del secondo giorno lavorativo antecedente l\u2019esperimento sul seguente conto corrente:")]),
      BR(),
      P(B('Beneficiario: Pro.Ges.S. S.r.l.')),
      P([B('Banca beneficiario: ' + BANCA_PGS)]),
      P([B('IBAN: ' + IBAN_CAU)]),
      P([B('Causale: \u201c'), T(causale('cau')), B('\u201d')]),
      BR(),
      P(T('Il mancato tempestivo accredito della cauzione \u00e8 causa di nullit\u00e0 ed inefficacia dell\u2019offerta. La copia della contabile del versamento deve essere allegata nella busta telematica contenente l\u2019offerta.')),
      P([T('Tutorial: https://www.progess-italia.it/video-tutorial \u2013 Guida PDF: https://www.progess-italia.it/download/Guida%20per%20la%20formulazione%20di%20offerte%20sul%20PVP.pdf')]),
      BR(),
      P(B('SVOLGIMENTO DELLA PROCEDURA COMPETITIVA')),
      P([T('La procedura competitiva si svolger\u00e0 con modalit\u00e0 '), B(isAsin ? 'ASINCRONA TELEMATICA' : 'SINCRONA TELEMATICA'), T(' sul sito di Progess Italia \u2013 www.progess-italia.it.')]),
      ...(isAsin ? [
        P([T('La gara \u00e8 fissata dal '), B(fmtDT(dataAsta, oraAsta)), T(' al '), B(fmtDT(dataTermine, oraTermine)), T('. Almeno 30 minuti prima dell\u2019inizio, gli offerenti riceveranno le credenziali per accedere all\u2019area riservata.')]),
      ] : [
        P([T('Il giorno della gara, almeno 30 minuti prima dell\u2019asta fissata per il '), B(fmtDT(dataAsta, oraAsta)), T(', il presentatore ricever\u00e0 all\u2019indirizzo PEC indicato nell\u2019offerta le credenziali di accesso alla piattaforma.')]),
      ]),
      P(T('Nel caso di unica offerta valida, il Lotto verr\u00e0 aggiudicato all\u2019unico migliore offerente, anche se non collegato telematicamente. Nel caso di pluralit\u00e0 di offerte valide, il Curatore indirà la gara tra gli offerenti, partendo dall\u2019offerta valida pi\u00f9 alta pervenuta, con i rilanci minimi fissati per il Lotto. Trascorso 1 (uno) minuto dall\u2019ultima offerta senza rilanci, il Lotto sar\u00e0 aggiudicato al miglior offerente.')),
      P(T("L'aggiudicazione \u00e8 definitiva e non verranno prese in considerazione offerte successive, anche in aumento. La cauzione dell\u2019aggiudicatario \u00e8 imputata in acconto sul prezzo. La cauzione dei non aggiudicatari sar\u00e0 restituita entro 7 giorni lavorativi.")),
    ]
  }

  // ── Sezione: Saldo e diritti d'asta ──────────────────────────────────────
  const sezioneSaldo = isAMag ? [
    BR(),
    P(B('TERMINE DELLA GARA E AGGIUDICAZIONE')),
    BLT(T('Al termine della gara verr\u00e0 dichiarato aggiudicatario provvisorio il soggetto che avr\u00e0 presentato la migliore offerta valida entro il termine di fine gara.')),
    BLT(T("All'esito della gara, il soggetto specializzato alla vendita invierà una Relazione finale (report) all'indirizzo E-mail/PEC della procedura con le generalit\u00e0 complete dell'aggiudicatario e tutta la documentazione annessa.")),
    BLT(T('La restituzione delle cauzioni ai soggetti non aggiudicatari verr\u00e0 effettuata dal Soggetto specializzato \u2013 Pro.Ges.S. \u2013 entro sette giorni lavorativi dal termine della gara.')),
    BLT([T('I diritti d\u2019asta pari al '), B(dir + '%'), T(' oltre IVA, calcolati sul prezzo di aggiudicazione, dovranno essere versati entro 15 giorni dall\u2019aggiudicazione definitiva su:')]),
    BR(),
    P(B('Pro.Ges.S. S.r.l.')),
    P([B('c/o ' + BANCA_PGS)]),
    P([B('IBAN:\u00a0 ' + IBAN_DIR)]),
    P([B('Causale: \u201c'), T(causale('dir')), B('\u201d')]),
    BR(),
    BLT([T('Il saldo prezzo, dedotta la cauzione gi\u00e0 versata, dovr\u00e0 essere corrisposto entro 30 giorni dall\u2019aggiudicazione definitiva, a mezzo bonifico bancario sul conto corrente della procedura intestato a '), B((intestazioneProcedura || proc.nome || '').toUpperCase()), T(' \u2013 IBAN: '), B(ibanProcedura || '______________________________'), T('.')]),
    BLT(T("In caso di mancato versamento del saldo prezzo, l\u2019aggiudicatario sar\u00e0 dichiarato decaduto e la procedura incamerer\u00e0 la cauzione a titolo di penale, salvo il diritto al risarcimento del maggior danno.")),
    BLT([T('Le eventuali offerte migliorative per un importo non inferiore al 10% del prezzo di aggiudicazione a norma dell\u2019art. 584 c.p.c. dovranno pervenire a mezzo PEC all\u2019indirizzo della procedura e in c.c. a '), B('progess@arubapec.it'), T(', entro 10 giorni dall\u2019aggiudicazione provvisoria.')]),
  ] : [
    BR(),
    P(B('PAGAMENTO DEL SALDO PREZZO \u2013 ONERI FISCALI \u2013 DIRITTI D\u2019ASTA')),
    P([T('Entro il termine di '), B(saldo + ' giorni'), T(' dalla data di aggiudicazione, oppure nel minor termine contenuto nell\u2019offerta irrevocabile (termine migliorativo), l\u2019aggiudicatario dovr\u00e0 provvedere al versamento integrale del saldo prezzo dovuto (oltre oneri di Legge ove dovuti), dedotta la cauzione gi\u00e0 versata, a mezzo bonifico bancario sul c/c intestato a:')]),
    BR(),
    P([B('Beneficiario: '), T((intestazioneProcedura || proc.nome || '').toUpperCase())]),
    P([B('IBAN: '), T(ibanProcedura || '______________________________')]),
    P([B('Causale: \u201c'), T(causale('saldo')), B('\u201d')]),
    BR(),
    P(T("Se l'aggiudicatario non provveder\u00e0 al pagamento nel termine, sar\u00e0 dichiarato decaduto con conseguente incameramento della cauzione a titolo di penale. In caso di successiva vendita a prezzo inferiore, l'aggiudicatario sar\u00e0 tenuto al pagamento della differenza.")),
    BR(),
    P([T('Entro 30 giorni dalla data di aggiudicazione, l\u2019aggiudicatario dovr\u00e0 versare i diritti d\u2019asta dovuti a Pro.Ges.S. S.r.l., nella misura del '), B(dir + '%'), T(' calcolato sul prezzo di aggiudicazione, oltre IVA al 22%, a mezzo bonifico a:')]),
    BR(),
    P(B('Beneficiario: Pro.Ges.S. S.r.l.')),
    P([B('Banca beneficiario: ' + BANCA_DIR)]),
    P([B('IBAN: ' + IBAN_DIR)]),
    P([B('Causale: \u201c'), T(causale('dir')), B('\u201d')]),
  ]

  // ── Sezione: Condizioni generali AsteMagazine ─────────────────────────────
  const sezioneCondizioniAMag = isAMag ? [
    BR(),
    P(B('CONDIZIONI DELLA VENDITA')),
    BLT(T('Il Curatore si riserva di valutare nell\u2019esclusivo interesse della procedura la facolt\u00e0 di sospendere la vendita.')),
    BLT(T('La vendita avviene nello stato di fatto e di diritto in cui i beni si trovano.')),
    BLT(T('I beni sono posti in vendita nella consistenza indicata nella perizia redatta dallo stimatore e pubblicata sui siti www.progess-italia.it e www.astemagazine.com.')),
    BLT(T('La vendita \u00e8 a corpo e non a misura; eventuali differenze di misura non potranno dar luogo ad alcun risarcimento, indennit\u00e0 o riduzione del prezzo.')),
    BLT(T('La vendita non \u00e8 soggetta alle norme concernenti la garanzia per vizi o mancanza di qualit\u00e0 ai sensi dell\u2019art. 2922 c.c.')),
    BLT(T("L'esistenza di eventuali vizi, mancanza di qualit\u00e0 o difformit\u00e0, oneri urbanistici, ecologici e ambientali, anche se occulti o non evidenziati nelle relazioni peritali, non potranno dar luogo ad alcuna indennit\u00e0, risarcimento o riduzione del prezzo; i relativi oneri saranno a carico dell'aggiudicatario.")),
    BLT(T('La presentazione dell\u2019offerta equivale ad espressa dichiarazione di conoscenza ed accettazione integrale delle condizioni di vendita previste dal programma di liquidazione e riassunte nel presente avviso.')),
    BLT(T('I beni potranno essere visionati, previa richiesta da inoltrare direttamente al Curatore o al Commissionario.')),
  ] : []

  // ── Sezione: Pubblicità ───────────────────────────────────────────────────
  const sezionePubblicita = [
    BR(),
    P(B('PUBBLICIT\u00c0')),
    ...(isAMag ? [
      BLT(T('Copia del presente avviso sar\u00e0 pubblicato all\u2019interno del Portale delle Vendite Pubbliche a norma dell\u2019art. 490 I comma c.p.c.')),
      BLT([T('Copia del presente avviso sar\u00e0 pubblicata e visionabile sui siti autorizzati dal D.M. 31/10/2006: '), B('www.progess-italia.it'), T(', oltre che sul sito '), B('www.astemagazine.com'), T('.')]),
      BLT(T('Apposite campagne pubblicitarie saranno eseguite attraverso canali commerciali individuate dal soggetto specializzato alla vendita concordate con gli organi della procedura.')),
    ] : [
      P(T('Il presente Regolamento sar\u00e0 pubblicato sul Portale delle Vendite Pubbliche a norma del D.L. n. 853/2015 convertito dalla Legge n. 132/2015, nonch\u00e9 sui seguenti portali:')),
      BLT(B('www.progess-italia.it')),
      BLT(B('www.progess-immobili.it')),
      BLT(B('www.immobiliare.it')),
      BLT(B('www.casa.it')),
      BLT(B('www.idealista.it')),
    ]),
    BR(),
    P(B('VARIE')),
    P([T('I beni posti in vendita potranno essere visionati, previo appuntamento con il Gestore della Vendita Pro.Ges.S., al numero '), B('0341.593511'), T(' oppure all\u2019indirizzo e-mail: '), B('info@progess-italia.it'), T('.')]),
    P([T('Ogni ulteriore informazione potr\u00e0 essere chiesta a Pro.Ges.S. S.r.l. all\u2019indirizzo e-mail info@progess-italia.it \u2013 Tel. 0341.593511 \u2013 oppure al '), T(referente || 'Curatore della procedura'), T('.')]),
    BR(),
    P(B('FORO DI COMPETENZA')),
    P([T('Per qualsivoglia controversia comunque riferibile al presente Regolamento di vendita, sar\u00e0 competente in via esclusiva il Tribunale di '), B(proc.tribunale || '__________'), T('.')]),
    BR(),
    P(B('DISPOSIZIONI FINALI')),
    P(T('Il presente Regolamento di vendita sostituisce ogni precedente regolamento eventualmente pubblicato.')),
    ...(noteFinali ? [BR(), P(T(noteFinali))] : []),
  ]

  // ── Titolo modalità per intestazione ─────────────────────────────────────
  const titoloModalita = isAMag
    ? (isAsin && !isMista ? 'SENZA INCANTO CON MODALIT\u00c0 COMPETITIVA TELEMATICA' : 'SENZA INCANTO CON MODALIT\u00c0 SINCRONA TELEMATICA ASTEMAGAZINE')
    : (isAsin && !isMista ? 'CON MODALIT\u00c0 ASINCRONA TELEMATICA' : isMista ? 'SENZA INCANTO CON MODALIT\u00c0 SINCRONA MISTA' : 'CON MODALIT\u00c0 SINCRONA TELEMATICA')

  const doc = new Document({ numbering:numConf, sections:[{
    properties:{ page:{ size:{width:MW,height:16838}, margin:{top:1200,right:MM,bottom:1400,left:MM} } },
    headers:{ default:mkHdr(logoB64) },
    footers:{ default:mkFtr() },
    children:[
      PC([B('TRIBUNALE DI '+(proc.tribunale||'').toUpperCase(),22)], {spacing:{before:240,after:40}}),
      PC([T((proc.sezione ? 'SEZIONE '+proc.sezione.toUpperCase()+' \u2013 ' : '')+(proc.tipo||'').toUpperCase(),{size:20})]),
      PC([B('"'+(proc.nome||'')+'"',22)], {spacing:{before:20,after:20}}),
      PC([T('RG NR./ANNO ' + nrg,{size:20})]),
      ...(proc.giudice  ? [PC([T('GIUDICE DELEGATO: '+(proc.giudice||'').toUpperCase(),{size:20})])]  : []),
      ...(proc.curatore ? [PC([T('CURATORE: '+(proc.curatore||'').toUpperCase(),{size:20})])] : []),
      BR(),
      new Paragraph({ border:{ bottom:{ style:BorderStyle.SINGLE, size:6, color:'244061', space:4 } }, children:[] }),
      BR(),
      PC([B('AVVISO DI VENDITA',28)], {spacing:{before:80,after:40}}),
      PC([B(titoloModalita,20)]),
      ...(nEsp ? [PC([B(nEsp,20)], {spacing:{before:20}})] : []),
      BR(),
      new Paragraph({ border:{ bottom:{ style:BorderStyle.SINGLE, size:2, color:'AAAAAA', space:4 } }, children:[] }),
      BR(),
      P([T('Il/La sottoscritto/a ', {italics:true}), T(proc.curatore||'', {italics:true}),
         T(', nella sua qualit\u00e0 di '+(proc.tipo||'')+' della procedura n. '+nrg+
           (proc.nome ? ' denominata \u201c'+proc.nome+'\u201d' : '')+
           ' dichiarata dal Tribunale di '+(proc.tribunale||'')+
           (proc.giudice ? ', Giudice Delegato '+(proc.giudice||'') : '')+',')]),
      BR(),
      pAvvisa,
      ...sezioneDescrizioneLotti,
      ...sezioneOfferte,
      ...sezioneSaldo,
      ...sezioneCondizioniAMag,
      ...sezionePubblicita,
      BR(), BR(),
      P([T((proc.tribunale ? proc.tribunale.charAt(0).toUpperCase()+proc.tribunale.slice(1) : 'Lecco') + ', ' + fmtD(new Date().toISOString().slice(0,10)))]),
      BR(),
      P([T('\t\t\t\t\t'), B('Il '+(proc.tipo||'Curatore'))]),
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
          <label className="form-label">Prezzo base (€) — vuoto = globale</label>
          <div style={{position:'relative'}}>
            <input className="form-input" defaultValue={lotto.base}
              onBlur={e => onChange(idx,'base',e.target.value)}
              placeholder="Es: 5.000,00" style={{paddingLeft:28}} />
            <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--text3)',fontSize:13,pointerEvents:'none'}}>€</span>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Offerta minima (€) — vuoto = prezzo base</label>
          <div style={{position:'relative'}}>
            <input className="form-input" defaultValue={lotto.offertaMinima}
              onBlur={e => onChange(idx,'offertaMinima',e.target.value)}
              placeholder="Es: 4.500,00" style={{paddingLeft:28}} />
            <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--text3)',fontSize:13,pointerEvents:'none'}}>€</span>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Rilancio min. (€) — vuoto = globale</label>
          <div style={{position:'relative'}}>
            <input className="form-input" defaultValue={lotto.rilancio}
              onBlur={e => onChange(idx,'rilancio',e.target.value)}
              placeholder="Es: 250,00" style={{paddingLeft:28}} />
            <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--text3)',fontSize:13,pointerEvents:'none'}}>€</span>
          </div>
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
  const [tipoBene, setTipoBene]               = useState('mobile')
  const [nEsperimento, setNEsperimento]       = useState('1')
  const [dataAsta, setDataAsta]               = useState(today)
  const [oraAsta, setOraAsta]                 = useState('12:00')
  const [dataTermine, setDataTermine]         = useState(today)
  const [oraTermine, setOraTermine]           = useState('12:00')
  const [prezzoBase, setPrezzoBase]           = useState('')
  const [offertaMinima, setOffertaMinima]     = useState('')
  const [rilancioMin, setRilancioMin]         = useState('')
  const [cauzione, setCauzione]               = useState('10')
  const [dirittiAsta, setDirittiAsta]         = useState('2')
  const [termSaldo, setTermSaldo]             = useState('120')
  const [ibanProcedura, setIbanProcedura]     = useState('')
  const [intestazioneProcedura, setIntestazioneProcedura] = useState('')
  const [ibanCauzione, setIbanCauzione]       = useState('')
  const [bancaCauzione, setBancaCauzione]     = useState('')
  const [ibanDiritti, setIbanDiritti]         = useState('')
  const [bancaDiritti, setBancaDiritti]       = useState('')
  const [referente, setReferente]             = useState('Pro.Ges.S. Srl \u2014 procedure@progess-italia.it')
  const [noteFinali, setNoteFinali]           = useState('')
  // Lotti: 'manual' | 'db'
  const [lottiMode, setLottiMode]             = useState('manual')
  const [lottiDb, setLottiDb]                 = useState([])
  const [lottiDbSel, setLottiDbSel]           = useState([])
  const [loadingLotti, setLoadingLotti]       = useState(false)
  const [lotti, setLotti]                     = useState([{ desc:'Lotto unico \u2014 tutti i beni inventariati', qta:1, base:'', offertaMinima:'', rilancio:'' }])
  // Offerta irrevocabile
  const [offertaIrrevocabile, setOffertaIrrevocabile] = useState(false)
  const [offertaIrrevGg,    setOffertaIrrevGg]    = useState('')
  const [offertaIrrevMm,    setOffertaIrrevMm]    = useState('')
  const [offertaIrrevAa,    setOffertaIrrevAa]    = useState('')
  const [offertaIrrevImporto, setOffertaIrrevImporto] = useState('')
  // computa data formattata gg/mm/aaaa
  const offertaIrrevData = [offertaIrrevGg, offertaIrrevMm, offertaIrrevAa].filter(Boolean).join('/')
  const [testoOfferta, setTestoOfferta]       = useState('')
  const [savingTesto, setSavingTesto]         = useState(false)
  const [gen, setGen]                         = useState(false)

  const isAsincrona = tipoAsta.includes('asincrona') || tipoAsta === 'mista'

  // Carica IBAN da settings e testo AVVISA dal DB all'apertura
  useEffect(() => {
    const load = async () => {
      // IBAN da settings
      const { data: s } = await supabase.from('settings').select('iban_cauzione,banca_cauzione,iban_diritti,banca_diritti').maybeSingle()
      if (s) {
        setIbanCauzione(s.iban_cauzione || 'IT63 Y031 0422 9030 0000 0400 014')
        setBancaCauzione(s.banca_cauzione || 'Deutsche Bank \u2014 Filiale di Lecco, Agenzia di Castello')
        setIbanDiritti(s.iban_diritti || 'IT63 J031 0422 9030 0000 0820 981')
        setBancaDiritti(s.banca_diritti || 'Deutsche Bank \u2014 Filiale di Lecco, Agenzia di Castello')
      } else {
        setIbanCauzione('IT63 Y031 0422 9030 0000 0400 014')
        setBancaCauzione('Deutsche Bank \u2014 Filiale di Lecco, Agenzia di Castello')
        setIbanDiritti('IT63 J031 0422 9030 0000 0820 981')
        setBancaDiritti('Deutsche Bank \u2014 Filiale di Lecco, Agenzia di Castello')
      }
      // Testo AVVISA personalizzato (ultimo avviso della procedura)
      const { data: av } = await supabase.from('avvisi').select('testo_avvisa').eq('proc_id', proc.id).order('updated_at', { ascending: false }).limit(1).maybeSingle()
      setTestoOfferta(av?.testo_avvisa || TESTO_OFFERTA_DEFAULT)
    }
    load()
  }, [proc.id])

  // Carica lotti dal DB quando si passa a modalità DB
  useEffect(() => {
    if (lottiMode !== 'db') return
    const load = async () => {
      setLoadingLotti(true)
      const { data } = await supabase.from('lotti').select('*').eq('proc_id', proc.id).order('numero')
      setLottiDb(data || [])
      setLottiDbSel((data || []).map(l => l.id))
      setLoadingLotti(false)
    }
    load()
  }, [lottiMode, proc.id])

  // useCallback evita che la funzione cambi identità ad ogni render → LottoRow non si rimonta
  const handleLottoChange = useCallback((idx, field, val) => {
    setLotti(ls => ls.map((x, j) => j === idx ? {...x, [field]: val} : x))
  }, [])

  const handleLottoRemove = useCallback((idx) => {
    setLotti(ls => ls.filter((_, j) => j !== idx))
  }, [])

  // Lotti effettivi da passare a genAvviso
  const lottiEffettivi = lottiMode === 'db'
    ? lottiDb.filter(l => lottiDbSel.includes(l.id)).map(l => ({
        desc: l.nome || l.descrizione || '\u2014',
        qta: 1,
        base: l.prezzo_base || '',
        offertaMinima: l.offerta_minima || '',
        rilancio: l.rilancio_min || '',
      }))
    : lotti

  const salvaTestoAvvisa = async () => {
    setSavingTesto(true)
    try {
      await supabase.from('avvisi').upsert({
        proc_id: proc.id,
        modalita: tipoAsta,
        testo_avvisa: testoOfferta,
      }, { onConflict: 'proc_id,modalita' })
      notify('Testo AVVISA salvato', 'ok')
    } catch(e) { notify('Errore salvataggio: '+e.message, 'err') }
    finally { setSavingTesto(false) }
  }

  const genera = async () => {
    setGen(true)
    try {
      const logo = localStorage.getItem('ip_logo') || null
      const blob = await genAvviso(proc, lottiEffettivi, {
        tipoAsta, tipoBene, nEsperimento, dataAsta, oraAsta, dataTermine, oraTermine,
        prezzoBase, offertaMinima, rilancioMin, cauzione, dirittiAsta,
        termSaldo, ibanProcedura, intestazioneProcedura,
        ibanCauzione, bancaCauzione, ibanDiritti, bancaDiritti,
        referente, noteFinali,
        offertaIrrevocabile, offertaIrrevData, offertaIrrevImporto, testoOfferta,
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
      <input type={type} className="form-input"
        defaultValue={val}
        onBlur={e => set(e.target.value)}
        placeholder={placeholder} />
    </div>
  )

  // Input importo italiano — defaultValue + onBlur per evitare ogni problema di focus
  const InpEur = ({ label, val, set, placeholder='Es: 5.000,00', full=false }) => (
    <div className={full ? 'form-col-full form-group' : 'form-group'}>
      <label className="form-label">{label}</label>
      <div style={{position:'relative'}}>
        <input className="form-input"
          defaultValue={val}
          onBlur={e => set(e.target.value)}
          placeholder={placeholder}
          style={{paddingLeft:28}} />
        <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--text3)',fontSize:13,pointerEvents:'none'}}>€</span>
      </div>
    </div>
  )

  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>

      {/* Modalità + Tipo bene + Esperimento */}
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
            <div className="form-group">
              <label className="form-label">Tipo di bene</label>
              <select className="form-input" value={tipoBene} onChange={e=>setTipoBene(e.target.value)}>
                <option value="mobile">Beni mobili</option>
                <option value="immobile">Beni immobili</option>
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
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Data ricezione offerta irrevocabile</label>
                <div style={{display:'flex',gap:6}}>
                  <input className="form-input" value={offertaIrrevGg} onChange={e=>setOffertaIrrevGg(e.target.value)}
                    placeholder="GG" maxLength={2} style={{width:56,textAlign:'center'}} />
                  <input className="form-input" value={offertaIrrevMm} onChange={e=>setOffertaIrrevMm(e.target.value)}
                    placeholder="MM" maxLength={2} style={{width:56,textAlign:'center'}} />
                  <input className="form-input" value={offertaIrrevAa} onChange={e=>setOffertaIrrevAa(e.target.value)}
                    placeholder="AAAA" maxLength={4} style={{width:72,textAlign:'center'}} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Importo offerta irrevocabile (€)</label>
                <div style={{position:'relative'}}>
                  <input className="form-input" value={offertaIrrevImporto}
                    onChange={e=>setOffertaIrrevImporto(e.target.value)}
                    placeholder="Es: 50.000,00" style={{paddingLeft:28}} />
                  <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--text3)',fontSize:13,pointerEvents:'none'}}>€</span>
                </div>
              </div>
            </div>
            <div className="form-group form-col-full">
              <label className="form-label">
                Testo paragrafo AVVISA
                <span style={{fontWeight:400,color:'var(--text3)',marginLeft:6,fontSize:11}}>(personalizzabile — salvato nel database)</span>
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
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              <button className="btn btn-ghost btn-sm" onClick={()=>setTestoOfferta(TESTO_OFFERTA_DEFAULT)}>
                ↺ Ripristina testo predefinito
              </button>
              <button className="btn btn-ghost btn-sm" onClick={salvaTestoAvvisa} disabled={savingTesto}>
                💾 {savingTesto ? 'Salvataggio…' : 'Salva testo nel database'}
              </button>
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
            <InpEur label="Prezzo base (€)" val={prezzoBase} set={setPrezzoBase} />
            <InpEur label="Offerta minima ammissibile (€)" val={offertaMinima} set={setOffertaMinima} placeholder="Vuoto = uguale al prezzo base" />
            <InpEur label="Rilancio minimo (€)" val={rilancioMin} set={setRilancioMin} placeholder="Es: 250,00" />
            <Inp label="Deposito cauzionale (%)" val={cauzione} set={setCauzione} placeholder="10" />
            <Inp label="Diritti d'asta (%)" val={dirittiAsta} set={setDirittiAsta} placeholder="2" />
            <Inp label="Termine saldo prezzo (giorni)" val={termSaldo} set={setTermSaldo} placeholder="120 (PVP) / 30 (AsteMagazine)" />
            <Inp label="IBAN conto procedura (per saldo)" val={ibanProcedura} set={setIbanProcedura} placeholder="IT00 X000 0000 0000 0000 0000 000" full />
            <Inp label="Intestazione conto procedura" val={intestazioneProcedura} set={setIntestazioneProcedura} placeholder="Es: Liquidazione Giudiziale Rossi S.r.l." full />
          </div>
        </div>
      </div>

      {/* Lotti */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">📦 Lotti in vendita</div>
          <div style={{display:'flex',gap:6}}>
            <button className="btn btn-ghost btn-sm" style={{fontWeight: lottiMode==='manual'?700:'normal'}}
              onClick={()=>setLottiMode('manual')}>✏️ Manuale</button>
            <button className="btn btn-ghost btn-sm" style={{fontWeight: lottiMode==='db'?700:'normal'}}
              onClick={()=>setLottiMode('db')}>🗄 Da procedura</button>
          </div>
        </div>
        <div className="card-body" style={{display:'flex',flexDirection:'column',gap:12}}>
          {lottiMode === 'manual' ? (<>
            {lotti.map((l,i) => (
              <LottoRow key={i} lotto={l} idx={i} total={lotti.length}
                onChange={handleLottoChange} onRemove={() => handleLottoRemove(i)} />
            ))}
            <button className="btn btn-ghost btn-sm" style={{alignSelf:'flex-start'}}
              onClick={()=>setLotti(l=>[...l,{desc:'',qta:1,base:'',offertaMinima:'',rilancio:''}])}>
              <Plus size={13}/> Aggiungi lotto
            </button>
          </>) : loadingLotti ? (
            <div style={{textAlign:'center',padding:20,color:'var(--text3)'}}>Caricamento lotti…</div>
          ) : lottiDb.length === 0 ? (
            <div style={{textAlign:'center',padding:20,color:'var(--text3)'}}>Nessun lotto trovato per questa procedura</div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              <div style={{fontSize:12,color:'var(--text3)',marginBottom:4}}>
                Seleziona i lotti da includere nell&apos;avviso. I prezzi non compilati useranno i valori globali sotto.
              </div>
              {lottiDb.map(l => (
                <label key={l.id} style={{display:'flex',alignItems:'flex-start',gap:10,background:'var(--bg2)',borderRadius:8,padding:'10px 14px',cursor:'pointer'}}>
                  <input type="checkbox" style={{marginTop:2}} checked={lottiDbSel.includes(l.id)}
                    onChange={e => setLottiDbSel(s => e.target.checked ? [...s,l.id] : s.filter(x=>x!==l.id))} />
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600,fontSize:13}}>Lotto {l.numero} — {l.nome||l.descrizione||'—'}</div>
                    {l.descrizione && l.nome && <div style={{fontSize:12,color:'var(--text3)',marginTop:2}}>{l.descrizione}</div>}
                    <div style={{display:'flex',gap:16,marginTop:6,fontSize:12,flexWrap:'wrap'}}>
                      {l.prezzo_base    && <span>Base: <b>€ {l.prezzo_base}</b></span>}
                      {l.offerta_minima && <span>Min: <b>€ {l.offerta_minima}</b></span>}
                      {l.rilancio_min   && <span>Rilancio: <b>€ {l.rilancio_min}</b></span>}
                    </div>
                  </div>
                </label>
              ))}
              <div style={{fontSize:11,color:'var(--text3)',marginTop:4}}>
                I prezzi non presenti nei lotti verranno sostituiti dai valori globali inseriti nella sezione Prezzi.
              </div>
            </div>
          )}
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
