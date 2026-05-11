import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Topbar, Modal } from '../components/layout'
import { supabase } from '../lib/supabase'
import { FileText, Download } from 'lucide-react'
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, BorderStyle, WidthType, ShadingType, LevelFormat, ImageRun, Header, Footer, PageNumber, TabStopType, TabStopPosition } from 'docx'

// ─── Servizi predefiniti ───────────────────────────────────────────────────
const SERVIZI_MOBILI = [
  'Predisposizione Relazione di stima e Report Fotografico valorizzato',
  'Coadiuvare il/la Curatore/Curatrice nella predisposizione degli Avvisi di vendita e dei modelli per offerte irrevocabili',
  'Accompagnare gli utenti interessati alla visita dei beni mobili posti in vendita',
  'Pubblicità Legale su "Progess Italia"',
  'Pubblicità Legale sul Portale delle Vendite Pubbliche (PVP)',
  'Esperire i tentativi di vendita mediante procedure competitive (art. 216 CCII)',
  'Comunicare esiti delle vendite al Curatore con Verbale e Report piattaforma',
]
const SERVIZI_IMMOBILI = [
  'Coadiuvare il Curatore nella predisposizione degli Avvisi di vendita e dei modelli per offerte irrevocabili di acquisto',
  'Accompagnare gli utenti interessati alla visita dei beni immobili posti in vendita',
  'Pubblicità Legale su "Progess Italia"',
  'Pubblicità Legale sul Portale delle Vendite Pubbliche (PVP), previa nomina in qualità di soggetto abilitato da parte della Cancelleria',
  'Esperire i tentativi di vendita necessari per la liquidazione totale dei beni immobili mediante procedure competitive (art. 216 CCII)',
  'Comunicare gli esiti delle vendite al Curatore con Verbale delle operazioni di vendita e Report della piattaforma Progess Italia',
]

// ─── Helper docx ───────────────────────────────────────────────────────────
function p(children, opts = {}) {
  return new Paragraph({ children: Array.isArray(children) ? children : [children], ...opts })
}
function t(text, opts = {}) { return new TextRun({ text, font: 'Gadugi', size: 22, ...opts }) }
function bold(text, size = 22) { return t(text, { bold: true, size }) }
function br() { return new Paragraph({ children: [], spacing: { before: 80, after: 80 } }) }
const BORDER_NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const BORDERS_NONE = { top: BORDER_NONE, bottom: BORDER_NONE, left: BORDER_NONE, right: BORDER_NONE }
const BORDER_THIN = { style: BorderStyle.SINGLE, size: 1, color: 'AAAAAA' }
const BORDERS_THIN = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN }
const PAGE_W = 11906; const MARGIN = 1000; const CONTENT_W = PAGE_W - MARGIN * 2

function cellNoBorder(text, isBold = false, shade = null) {
  return new TableCell({
    borders: BORDERS_NONE,
    width: { size: CONTENT_W / 2, type: WidthType.DXA },
    shading: shade ? { fill: shade, type: ShadingType.CLEAR } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [p(isBold ? bold(text) : t(text))]
  })
}

function tableRow2(label, value) {
  return new TableRow({ children: [cellNoBorder(label, false, 'EEF2F7'), cellNoBorder(value || '—')] })
}

function tableInfoProc(rows) {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W / 2, CONTENT_W / 2],
    borders: BORDERS_THIN,
    rows: rows.map(([l, v]) => tableRow2(l, v))
  })
}

function fatturazione(proc) {
  const sede = (proc.sedi || []).find(s => s.tipo === 'legale') || {}
  const indirizzoCompleto = [sede.indirizzo, sede.civico, sede.cap, sede.comune, sede.provincia ? '(' + sede.provincia + ')' : ''].filter(Boolean).join(' ')
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W / 2, CONTENT_W / 2],
    borders: BORDERS_THIN,
    rows: [
      new TableRow({ children: [new TableCell({ borders: BORDERS_THIN, columnSpan: 2, shading: { fill: '244061', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [p(bold('INTESTATARIO FATTURA:', 22))] })] }),
      tableRow2('RAGIONE SOCIALE', proc.nome || ''),
      new TableRow({ children: [
        new TableCell({ borders: BORDERS_THIN, width: { size: CONTENT_W / 2, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [p(t('SEDE LEGALE / INDIRIZZO'))] }),
        new TableCell({ borders: BORDERS_THIN, width: { size: CONTENT_W / 2, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [p(t(indirizzoCompleto || '—'))] }),
      ] }),
      tableRow2('C.F. / P.IVA', (proc.cf || '') + (proc.piva ? ' / ' + proc.piva : '')),
      tableRow2('P.E.C. (fatturazione elettronica)', proc.pec || ''),
    ]
  })
}

function firme(proc, data, tipo) {
  const nrg = (proc.num || '') + (proc.anno ? '/' + proc.anno : '')
  return [
    br(),
    p([t(tipo + ' ' + nrg), new TextRun({ text: '', break: 1 }), bold(proc.nome || '')], { alignment: AlignmentType.LEFT }),
    br(),
    p(t('Il Curatore ' + (proc.curatore || ''))),
    p(t('________________________________')),
    br(),
    p(bold('Pro.ges.s S.r.l.')),
    p(t('L\'Amministratore Unico')),
    p(t('Luigi IMPIERI')),
    p(t('________________________________')),
  ]
}

// ─── Generazione DOCX Mobili ────────────────────────────────────────────────
async function generaMandatoMobili(proc, opts, logoB64) {
  const { dataContratto, compenso, costoLotto, rt, servizi } = opts
  const nrg = (proc.num || '') + (proc.anno ? '/' + proc.anno : '')
  const sede = (proc.sedi || []).find(s => s.tipo === 'legale') || {}
  const indirizzoCompleto = [sede.indirizzo, sede.civico, sede.cap, sede.comune, sede.provincia ? '(' + sede.provincia + ')' : ''].filter(Boolean).join(' ')

  const fmtData = (d) => { if (!d) return '______'; const dt = new Date(d); return String(dt.getDate()).padStart(2,'0')+'/'+String(dt.getMonth()+1).padStart(2,'0')+'/'+dt.getFullYear() }

  const logoRun = logoB64 ? new ImageRun({ data: logoB64.split(',')[1], transformation: { width: 150, height: 50 }, type: 'png' }) : null

  const headerContent = [
    new Paragraph({
      children: logoRun ? [logoRun] : [bold('PROCEDURE GESTITE E SERVIZI S.R.L.', 20)],
      alignment: AlignmentType.LEFT
    }),
    new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '244061', space: 1 } }, children: [] })
  ]

  const footerContent = [
    new Paragraph({
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA', space: 1 } },
      children: [
        t('Procedure Gestite E Servizi S.r.l. — Via Giuseppe Parini, 29 - LECCO (LC) - 23900', { size: 16 }),
        new TextRun({ text: '', break: 1 }),
        t('procedure@progess-italia.it | progess@arubapec.it | C.F. e P.IVA 03546380134', { size: 16 }),
      ]
    })
  ]

  const serviziParagrafi = servizi.map(s => new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    children: [t(s)]
  }))

  const doc = new Document({
    numbering: {
      config: [{
        reference: 'bullets',
        levels: [{ level: 0, format: LevelFormat.BULLET, text: '-', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }]
      }]
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1200, right: MARGIN, bottom: 1400, left: MARGIN }
        }
      },
      headers: { default: new Header({ children: headerContent }) },
      footers: { default: new Footer({ children: footerContent }) },
      children: [
        p(bold('MANDATO PER LA VENDITA DI BENI MOBILI', 28), { alignment: AlignmentType.CENTER, spacing: { before: 240, after: 240 } }),
        br(),
        p(t('Con il presente contratto, da valersi ad ogni effetto di legge, tra:')),
        br(),
        p([t('la '), bold(proc.tipo || ''), t(' '), bold('R.G. ' + nrg + ' - ' + (proc.nome || '')), t(', C.F. e P.IVA ' + (proc.cf || '') + ' ' + (proc.piva ? 'P.IVA ' + proc.piva : '') + ', con sede legale in ' + indirizzoCompleto + ', rappresentata in questa sede dal Curatore '), bold(proc.curatore || ''), t(' con sentenza n. ' + (proc.sentenza_num ? 'n. ' + proc.sentenza_num : 'n. _______') + ' dal Tribunale di ' + (proc.tribunale || '') + ', PEC della procedura ' + (proc.pec || '') + ' (di seguito "'), bold('Cliente'), t('") da una parte')]),
        br(),
        p(bold('e')),
        br(),
        p([t('la società '), bold('"PROCEDURE GESTITE E SERVIZI S.R.L."'), t(' - in forma abbreviata '), bold('"PRO.GES.S. S.R.L."'), t(', n.ro di iscrizione al Registro delle Imprese e Codice Fiscale 03546380134, Partita IVA 03546380134, con sede legale in Via Giuseppe Parini n.ro 29, PEC progess@arubapec.it, in persona dell\'Amministratore Unico Sig. '), bold('Luigi IMPIERI'), t(', C.F. MPRLGU72S12D086V, (di seguito "'), bold('Pro.Ges.S.'), t('"), dall\'altra parte (il Cliente e Pro.Ges.S., insieme, "'), bold('Parti'), t('")')]),
        br(),
        p(bold('PREMESSO CHE')),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [t('il Cliente intende conferire a Pro.Ges.S. il mandato per la vendita dei '), bold('beni mobili'), t(' acquisiti all\'attivo della procedura, con autorizzazione alla vendita e nomina di Pro.Ges.S., quale commissionario alla Vendita')] }),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [t('Pro.Ges.S. ha le competenze e gli strumenti per adempiere il suddetto incarico, quale soggetto specializzato ai sensi dell\'Art. 216 CCII;')] }),
        br(),
        p(t('Tutto ciò premesso, tra le Parti')),
        br(),
        p(bold('SI STIPULA E CONVIENE QUANTO SEGUE')),
        br(),
        p([bold('OGGETTO DELL\'INCARICO')], { numbering: { reference: 'bullets', level: 0 } }),
        br(),
        p(t('Il Cliente conferisce incarico a Pro.Ges.S., la quale accetta di:')),
        ...serviziParagrafi,
        br(),
        p(bold('DATI DELLA PROCEDURA CONCORSUALE'), { alignment: AlignmentType.CENTER }),
        br(),
        tableInfoProc([
          ['Procedura', proc.nome || ''],
          ['Tipo', proc.tipo || ''],
          ['N. R.G.', nrg],
          ['Tribunale', proc.tribunale || ''],
          ['Curatore', proc.curatore || ''],
          ['PEC procedura', proc.pec || ''],
        ]),
        br(),
        p(t('Data contratto: ') , { children: [t('Data contratto: '), bold(fmtData(dataContratto))] }),
        br(),
        p(bold('Dati per fatturazione:')),
        br(),
        fatturazione(proc),
        br(),
        p([t('PAGAMENTO mediante bonifico bancario su conto corrente intestato a "'), bold('Pro.Ges.S. S.r.l.'), t('" Deutsche Bank filiale di Lecco — IBAN IT63J 03104 22903 000000820981')]),
        br(),
        p([bold('COMPENSO')], { numbering: { reference: 'bullets', level: 0 } }),
        br(),
        p([t('Per l\'espletamento dei servizi effettuati da Pro.Ges.S., quest\'ultima avrà diritto ad un compenso '), bold('pari ' + (compenso || '10') + '%'), t(', oltre IVA, il quale andrà calcolato sul prezzo di aggiudicazione definitivo, per ogni lotto venduto e '), bold('saranno ad esclusivo carico dell\'aggiudicatario.')]),
        br(),
        p(bold('Costi a carico della Procedura:')),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [t('Per il servizio di caricamento dei Lotti posti in vendita sulla piattaforma PVP e Progess Italia, Pro.Ges.S. avrà diritto ad un compenso ad '), bold('Euro ' + (costoLotto || '25,00') + ' oltre IVA'), t(', per ciascun Lotto pubblicato.')] }),
        rt ? new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [t('Acquisto della RT di pubblicazione '), bold('Euro ' + rt), t(' oltre commissioni bancarie per l\'acquisto (per i beni mobili registrati).')] }) : br(),
        br(),
        p([bold('FORO COMPETENTE')], { numbering: { reference: 'bullets', level: 0 } }),
        p(t('Per qualsiasi controversia connessa al presente mandato sarà esclusivamente competente il Foro di Lecco, con esclusione di qualsivoglia foro alternativo applicabile per legge.')),
        br(),
        p(t('Lecco, ' + fmtData(dataContratto))),
        br(),
        p(bold('Il Cliente')),
        ...firme(proc, dataContratto, proc.tipo || ''),
      ]
    }]
  })

  return Packer.toBlob(doc)
}

// ─── Generazione DOCX Immobili ──────────────────────────────────────────────
async function generaMandatoImmobili(proc, opts, logoB64) {
  const { dataContratto, scaglioni, costoLotto, iban, dataAutorizzazione, servizi } = opts
  const nrg = (proc.num || '') + (proc.anno ? '/' + proc.anno : '')
  const sede = (proc.sedi || []).find(s => s.tipo === 'legale') || {}
  const indirizzoCompleto = [sede.indirizzo, sede.civico, sede.cap, sede.comune, sede.provincia ? '(' + sede.provincia + ')' : ''].filter(Boolean).join(' ')
  const fmtData = (d) => { if (!d) return '______'; const dt = new Date(d); return String(dt.getDate()).padStart(2,'0')+'/'+String(dt.getMonth()+1).padStart(2,'0')+'/'+dt.getFullYear() }

  const logoRun = logoB64 ? new ImageRun({ data: logoB64.split(',')[1], transformation: { width: 150, height: 50 }, type: 'png' }) : null

  const headerContent = [
    new Paragraph({ children: logoRun ? [logoRun] : [bold('PROCEDURE GESTITE E SERVIZI S.R.L.', 20)], alignment: AlignmentType.LEFT }),
    new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '244061', space: 1 } }, children: [] })
  ]
  const footerContent = [
    new Paragraph({
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'AAAAAA', space: 1 } },
      children: [
        t('Procedure Gestite E Servizi S.r.l. — Via Giuseppe Parini, 29 - LECCO (LC) - 23900', { size: 16 }),
        new TextRun({ text: '', break: 1 }),
        t('procedure@progess-italia.it | progess@arubapec.it | C.F. e P.IVA 03546380134', { size: 16 }),
      ]
    })
  ]

  const serviziParagrafi = servizi.map(s => new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [t(s)] }))

  const tabellaScaglioni = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W / 2, CONTENT_W / 2],
    borders: BORDERS_THIN,
    rows: [
      new TableRow({ children: [cellNoBorder('Fino ad € 350.000', false, 'EEF2F7'), cellNoBorder((scaglioni[0] || '3') + '%', true)] }),
      new TableRow({ children: [cellNoBorder('Da € 350.001 a € 700.000', false, 'EEF2F7'), cellNoBorder((scaglioni[1] || '2.5') + '%', true)] }),
      new TableRow({ children: [cellNoBorder('Da € 700.001 a € 1.000.000', false, 'EEF2F7'), cellNoBorder((scaglioni[2] || '2') + '%', true)] }),
      new TableRow({ children: [cellNoBorder('Oltre € 1.000.000', false, 'EEF2F7'), cellNoBorder((scaglioni[3] || '1.5') + '%', true)] }),
    ]
  })

  const doc = new Document({
    numbering: {
      config: [{
        reference: 'bullets',
        levels: [{ level: 0, format: LevelFormat.BULLET, text: '-', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }]
      }]
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1200, right: MARGIN, bottom: 1400, left: MARGIN }
        }
      },
      headers: { default: new Header({ children: headerContent }) },
      footers: { default: new Footer({ children: footerContent }) },
      children: [
        p(bold('MANDATO PER LA VENDITA DI BENI IMMOBILI', 28), { alignment: AlignmentType.CENTER, spacing: { before: 240, after: 240 } }),
        br(),
        p(t('Con il presente contratto, da valersi ad ogni effetto di legge, tra:')),
        br(),
        p([t('la '), bold(proc.tipo || ''), t(' '), bold('R.G. ' + nrg + ' - ' + (proc.nome || '')), t(', C.F. e P.IVA ' + (proc.cf || '') + (proc.piva ? ' P.IVA ' + proc.piva : '') + ', con sede legale in ' + indirizzoCompleto + ', rappresentata in questa sede dal Curatore '), bold(proc.curatore || ''), t(' con sentenza n. ' + (proc.sentenza_num ? 'n. ' + proc.sentenza_num : 'n. _______') + ' dal Tribunale di ' + (proc.tribunale || '') + ', PEC della procedura ' + (proc.pec || '') + ' (di seguito "'), bold('Cliente'), t('") da una parte')]),
        br(),
        p(bold('e')),
        br(),
        p([t('la società '), bold('"PROCEDURE GESTITE E SERVIZI S.R.L."'), t(' - in forma abbreviata '), bold('"PRO.GES.S. S.R.L."'), t(', n.ro di iscrizione al Registro delle Imprese e Codice Fiscale 03546380134, Partita IVA 03546380134, con sede legale in Via Giuseppe Parini n.ro 29, PEC progess@arubapec.it, in persona dell\'Amministratore Unico Sig. '), bold('Luigi IMPIERI'), t(', C.F. MPRLGU72S12D086V, (di seguito "'), bold('Pro.Ges.S.'), t('"), dall\'altra parte')]),
        br(),
        p(bold('PREMESSO CHE')),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [t('il Cliente intende conferire a Pro.Ges.S. il mandato per la vendita dei '), bold('beni immobili'), t(' acquisiti all\'attivo della procedura')] }),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [t('Pro.Ges.S. ha le competenze e gli strumenti per adempiere il suddetto incarico, quale soggetto specializzato ai sensi dell\'Art. 216 CCII;')] }),
        br(),
        p(t('Tutto ciò premesso, tra le Parti')),
        br(),
        p(bold('SI STIPULA E CONVIENE QUANTO SEGUE')),
        br(),
        p([bold('OGGETTO DELL\'INCARICO')], { numbering: { reference: 'bullets', level: 0 } }),
        br(),
        p(t('Il Cliente conferisce incarico a Pro.Ges.S., la quale accetta di:')),
        ...serviziParagrafi,
        br(),
        p(bold('DATI DELLA PROCEDURA CONCORSUALE'), { alignment: AlignmentType.CENTER }),
        br(),
        tableInfoProc([
          ['Procedura', proc.nome || ''],
          ['Tipo', proc.tipo || ''],
          ['N. R.G.', nrg],
          ['Tribunale', proc.tribunale || ''],
          ['Curatore', proc.curatore || ''],
          ['PEC procedura', proc.pec || ''],
        ]),
        br(),
        p([t('Data contratto: '), bold(fmtData(dataContratto))]),
        iban ? p([t('IBAN procedura (per trasferimento somme): '), bold(iban)]) : br(),
        dataAutorizzazione ? p([t('Data autorizzazione Giudice Delegato: '), bold(fmtData(dataAutorizzazione))]) : br(),
        br(),
        p(bold('Dati per fatturazione:')),
        br(),
        fatturazione(proc),
        br(),
        p([t('PAGAMENTO mediante bonifico bancario su conto corrente intestato a "'), bold('Pro.Ges.S. S.r.l.'), t('" Deutsche Bank filiale di Lecco — IBAN IT63J 03104 22903 000000820981')]),
        br(),
        p([bold('COMPENSO')], { numbering: { reference: 'bullets', level: 0 } }),
        br(),
        p(t('Per l\'espletamento dei servizi, per ogni lotto venduto, Pro.Ges.S. avrà diritto ad un compenso calcolato a SCAGLIONI sul valore di aggiudicazione definitivo, OLTRE IVA, a esclusivo carico dell\'aggiudicatario:')),
        br(),
        tabellaScaglioni,
        br(),
        p(bold('Costi a carico della Procedura:')),
        new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [t('Caricamento lotti su PVP e Progess Italia: '), bold('Euro ' + (costoLotto || '25,00') + ' oltre IVA'), t(' per ciascun lotto.')] }),
        br(),
        p([bold('FORO COMPETENTE')], { numbering: { reference: 'bullets', level: 0 } }),
        p(t('Per qualsiasi controversia connessa al presente mandato sarà esclusivamente competente il Foro di Lecco.')),
        br(),
        p(t('Lecco, ' + fmtData(dataContratto))),
        br(),
        p(bold('Il Cliente')),
        ...firme(proc, dataContratto, proc.tipo || ''),
      ]
    }]
  })

  return Packer.toBlob(doc)
}

// ─── Wizard Mandato ─────────────────────────────────────────────────────────
function WizardMandato({ tipo, proc, onClose }) {
  const { notify } = useStore()
  const isMobili = tipo === 'mobili'
  const today = new Date().toISOString().slice(0, 10)
  const [dataContratto, setDataContratto] = useState(today)
  const [compenso, setCompenso] = useState('10')
  const [costoLotto, setCostoLotto] = useState('25,00')
  const [rt, setRt] = useState('100,00')
  const [iban, setIban] = useState(proc.iban || '')
  const [dataAut, setDataAut] = useState('')
  const [scaglioni, setScaglioni] = useState(['3', '2.5', '2', '1.5'])
  const [servizi, setServizi] = useState(isMobili ? [...SERVIZI_MOBILI] : [...SERVIZI_IMMOBILI])
  const [nuovoServizio, setNuovoServizio] = useState('')
  const [generating, setGenerating] = useState(false)

  const toggleServizio = (i) => setServizi(s => s.map((x, j) => j === i ? null : x).filter(Boolean))
  const aggiungiServizio = () => { if (nuovoServizio.trim()) { setServizi(s => [...s, nuovoServizio.trim()]); setNuovoServizio('') } }

  const genera = async () => {
    setGenerating(true)
    try {
      const logoB64 = localStorage.getItem('ip_logo') || null
      let blob
      if (isMobili) {
        blob = await generaMandatoMobili(proc, { dataContratto, compenso, costoLotto, rt, servizi }, logoB64)
      } else {
        blob = await generaMandatoImmobili(proc, { dataContratto, scaglioni, costoLotto, iban, dataAutorizzazione: dataAut, servizi }, logoB64)
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Mandato_Beni_${isMobili ? 'Mobili' : 'Immobili'}_${(proc.nome || '').replace(/\s+/g, '_')}.docx`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 3000)
      notify('Mandato generato con successo', 'ok')
      onClose()
    } catch (e) { notify('Errore: ' + e.message, 'err') }
    finally { setGenerating(false) }
  }

  return (
    <div style={{ padding: '8px 0' }}>
      {/* Info procedura */}
      <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: 13 }}>
        <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--text2)', fontSize: 11, textTransform: 'uppercase' }}>Auto-popolato da InventPro</div>
        {[['Procedura', proc.nome], ['Tipo', proc.tipo], ['N. R.G.', (proc.num || '') + (proc.anno ? '/' + proc.anno : '')], ['Tribunale', proc.tribunale], ['Curatore', proc.curatore], ['PEC procedura', proc.pec]].map(([l, v]) => (
          <div key={l} style={{ display: 'flex', gap: 12, marginBottom: 4 }}>
            <span style={{ color: 'var(--text3)', minWidth: 120 }}>{l}</span>
            <span style={{ fontWeight: 500 }}>{v || '—'}</span>
          </div>
        ))}
      </div>

      {/* Data contratto */}
      <div className="form-grid">
        <div className="form-col-full form-group">
          <label className="form-label">Data contratto</label>
          <input type="date" className="form-input" value={dataContratto} onChange={e => setDataContratto(e.target.value)} />
        </div>

        {isMobili ? (
          <>
            <div className="form-group">
              <label className="form-label">Compenso % (su aggiudicazione)</label>
              <input className="form-input" value={compenso} onChange={e => setCompenso(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Costo caricamento lotto (€)</label>
              <input className="form-input" value={costoLotto} onChange={e => setCostoLotto(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">RT pubblicazione beni registrati (€)</label>
              <input className="form-input" value={rt} onChange={e => setRt(e.target.value)} />
            </div>
          </>
        ) : (
          <>
            <div className="form-section" style={{ gridColumn: '1/-1', fontSize: 12, fontWeight: 600, color: 'var(--text2)', margin: '8px 0 4px' }}>Compenso a scaglioni (su valore aggiudicazione — a carico aggiudicatario)</div>
            {[['Fino a €350.000 (%)', 0], ['Da €350.001 a €700.000 (%)', 1], ['Da €700.001 a €1.000.000 (%)', 2], ['Oltre €1.000.000 (%)', 3]].map(([l, i]) => (
              <div key={i} className="form-group">
                <label className="form-label">{l}</label>
                <input className="form-input" value={scaglioni[i]} onChange={e => setScaglioni(s => s.map((x, j) => j === i ? e.target.value : x))} />
              </div>
            ))}
            <div className="form-group">
              <label className="form-label">IBAN procedura (per trasferimento somme)</label>
              <input className="form-input" value={iban} onChange={e => setIban(e.target.value)} placeholder="Es. IT60 X054 2811 1010 00" />
            </div>
            <div className="form-group">
              <label className="form-label">Costo caricamento lotto (€)</label>
              <input className="form-input" value={costoLotto} onChange={e => setCostoLotto(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Data autorizzazione Giudice Delegato</label>
              <input type="date" className="form-input" value={dataAut} onChange={e => setDataAut(e.target.value)} />
            </div>
          </>
        )}
      </div>

      {/* Servizi */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Servizi inclusi nel mandato</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {servizi.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 12px', background: 'var(--bg2)', borderRadius: 6, fontSize: 13 }}>
              <span style={{ color: 'var(--accent-g)', fontSize: 16, marginTop: 1 }}>✓</span>
              <span style={{ flex: 1 }}>{s}</span>
              <button onClick={() => toggleServizio(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16 }}>×</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <input className="form-input" placeholder="Aggiungi servizio personalizzato..." value={nuovoServizio} onChange={e => setNuovoServizio(e.target.value)} onKeyDown={e => e.key === 'Enter' && aggiungiServizio()} style={{ flex: 1 }} />
            <button className="btn btn-ghost btn-sm" onClick={aggiungiServizio}>+ Aggiungi</button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
        <button className="btn btn-ghost" onClick={onClose}>Chiudi</button>
        <button className="btn btn-primary" onClick={genera} disabled={generating}>
          <Download size={14} /> {generating ? 'Generazione…' : 'Genera Word su carta intestata'}
        </button>
      </div>
    </div>
  )
}

// ─── Pagina principale ──────────────────────────────────────────────────────
export default function Documenti() {
  const { currentProc, notify } = useStore()
  const navigate = useNavigate()
  const [proc, setProc] = useState(null)
  const [showMandato, setShowMandato] = useState(null) // 'mobili' | 'immobili'

  useEffect(() => {
    if (!currentProc) { navigate('/procedure'); return }
    // Carica procedura completa con sedi
    supabase.from('procedure').select('*, sedi(*)').eq('id', currentProc.id).single()
      .then(({ data }) => { if (data) setProc(data) })
  }, [currentProc])

  if (!proc) return null

  const cards = [
    { tipo: 'mobili', titolo: 'Mandato vendita beni mobili', icon: '📦', desc: 'Genera il mandato per la vendita di beni mobili con compenso percentuale fisso.' },
    { tipo: 'immobili', titolo: 'Mandato vendita beni immobili', icon: '🏠', desc: 'Genera il mandato per la vendita di beni immobili con compenso a scaglioni.' },
  ]

  return (
    <>
      <Topbar title="Documenti" subtitle={proc.nome} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {cards.map(c => (
            <div key={c.tipo} className="card" style={{ cursor: 'pointer' }} onClick={() => setShowMandato(c.tipo)}>
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
      </div>

      {showMandato && (
        <Modal
          open={!!showMandato}
          onClose={() => setShowMandato(null)}
          title={showMandato === 'mobili' ? 'Mandato vendita beni mobili' : 'Mandato vendita beni immobili'}
          wide
        >
          <WizardMandato tipo={showMandato} proc={proc} onClose={() => setShowMandato(null)} />
        </Modal>
      )}
    </>
  )
}
