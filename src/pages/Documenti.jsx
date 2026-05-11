import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Topbar, Spinner, Modal, Empty } from '../components/layout'
import { supabase } from '../lib/supabase'
import { Plus, Edit, Trash2, FileText, Sparkles, Download } from 'lucide-react'

const TIPI_DOC = [
  { id: 'relazione',      label: 'Relazione particolareggiata', art: 'Art. 130 CCII', icon: '📋', sezioni: [
    { id: 'premessa',        label: 'Premessa e nomina',           hint: 'Descrivi la nomina del curatore, il decreto del Tribunale e le prime attività svolte.' },
    { id: 'cause',           label: 'Cause della crisi',           hint: 'Analizza le cause endogene ed esogene dell\'insolvenza e il momento di manifestazione.' },
    { id: 'diligenza',       label: 'Diligenza del debitore',      hint: 'Valuta le scelte gestionali, il rispetto degli obblighi contabili e i comportamenti pre-procedura.' },
    { id: 'responsabilita',  label: 'Responsabilità',              hint: 'Esamina eventuali responsabilità civili e penali di amministratori e organi di controllo.' },
    { id: 'attivo',          label: 'Consistenza dell\'attivo',    hint: 'Descrivi i beni dell\'attivo: immobili, mobili, crediti, partecipazioni.' },
    { id: 'passivo',         label: 'Consistenza del passivo',     hint: 'Descrivi il passivo: debiti verso banche, fornitori, Erario, dipendenti.' },
  ]},
  { id: 'programma_liq',  label: 'Programma di liquidazione',   art: 'Art. 213 CCII', icon: '📅', sezioni: [
    { id: 'immobili',     label: 'Liquidazione immobili',         hint: 'Modalità e tempistiche di vendita degli immobili, stima del realizzo.' },
    { id: 'mobili',       label: 'Liquidazione mobili',           hint: 'Modalità di vendita per categoria merceologica tramite commissionario.' },
    { id: 'crediti',      label: 'Recupero crediti',              hint: 'Prospettive di riscossione dei crediti commerciali, tributari e da revocatoria.' },
    { id: 'azioni',       label: 'Azioni giudiziali',             hint: 'Azioni revocatorie, di responsabilità e liti pendenti.' },
    { id: 'costi',        label: 'Costi e tempi',                 hint: 'Stima dei costi della procedura e cronoprogramma delle attività.' },
  ]},
  { id: 'rapporto',       label: 'Rapporto riepilogativo',       art: 'Art. 130 CCII', icon: '📊', sezioni: [
    { id: 'attivita',     label: 'Attività svolte',               hint: 'Descrivi le principali attività svolte nel periodo di riferimento.' },
    { id: 'stato_proc',   label: 'Stato della procedura',         hint: 'Aggiorna sullo stato attuale: liquidazione, creditori, incassi.' },
    { id: 'prospettive',  label: 'Prospettive',                   hint: 'Indica le prospettive di realizzo e i prossimi passi.' },
  ]},
]

function fmtDate(d) { if (!d) return '—'; return new Date(d).toLocaleDateString('it-IT') }

// ── Form documento ───────────────────────────────────────────────────
function DocumentoForm({ tipo, procId, documento, onSave, onClose }) {
  const { notify, profile } = useStore()
  const [sezioni, setSezioni] = useState(documento?.sezioni || {})
  const [loading, setLoading] = useState({})
  const [saving, setSaving] = useState(false)
  const [dataDoc, setDataDoc] = useState(documento?.data_doc || new Date().toISOString().substr(0, 10))

  const apiKey = localStorage.getItem('ip_apikey') || ''

  const generaSezione = async (sez) => {
    if (!apiKey) { notify('Inserisci la chiave API in Impostazioni', 'warn'); return }
    setLoading(l => ({ ...l, [sez.id]: true }))
    try {
      const proc = (await supabase.from('procedure').select('*').eq('id', procId).single()).data || {}
      const prompt = `Sei un esperto di diritto concorsuale italiano con ventennale esperienza nella redazione di atti giudiziali.
${[
  'STILE OBBLIGATORIO: italiano forense formale e tecnico-giuridico.',
  'Usa: "si è proceduto a", "è stato accertato che", "si evidenzia che", "ai sensi di", "alla luce di".',
  'Frasi complete con subordinate. Niente telegrafismo.',
  'Cita norme pertinenti con articolo e fonte precisi (es. art. 130 CCII, art. 2392 c.c.).',
  'Usa "•" per elenchi puntati. Ogni voce termina con punto e virgola.',
  'Genera SOLO il corpo del testo, senza titoli o note. 400-600 parole.',
].join('\n')}

PROCEDURA: ${proc.tipo || ''} "${proc.nome || ''}" n. ${proc.num || ''}/${proc.anno || ''}, Tribunale di ${proc.tribunale || ''}
CURATORE: ${proc.curatore || ''}
SEZIONE DA REDIGERE: ${sez.label} (${tipo.art})
ISTRUZIONI SPECIFICHE: ${sez.hint}
${sezioni[sez.id] ? 'BOZZA PRECEDENTE (migliora e arricchisci): ' + sezioni[sez.id].substring(0, 500) : ''}`

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
          max_tokens: 1500,
          messages: [{ role: 'user', content: prompt }]
        })
      })
      const data = await res.json()
      const testo = data.content?.[0]?.text || ''
      if (!testo) throw new Error('Risposta AI vuota')
      setSezioni(s => ({ ...s, [sez.id]: testo }))
      notify('Sezione generata', 'ok')
    } catch (e) { notify('Errore AI: ' + e.message, 'err') }
    finally { setLoading(l => ({ ...l, [sez.id]: false })) }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = { tipo: tipo.id, proc_id: procId, sezioni, data_doc: dataDoc, titolo: tipo.label }
      let res
      if (documento?.id) {
        res = await supabase.from('documenti').update(payload).eq('id', documento.id).select().single()
      } else {
        res = await supabase.from('documenti').insert(payload).select().single()
      }
      if (res.error) throw res.error
      notify('Documento salvato', 'ok')
      onSave(res.data)
    } catch (e) { notify('Errore: ' + e.message, 'err') }
    finally { setSaving(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: 14, background: 'rgba(59,111,255,0.06)', borderRadius: 10, border: '1px solid rgba(59,111,255,0.15)' }}>
        <span style={{ fontSize: 28 }}>{tipo.icon}</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{tipo.label}</div>
          <div style={{ fontSize: 12, color: 'var(--accent)' }}>{tipo.art}</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <label className="form-label" style={{ marginBottom: 4 }}>Data documento</label>
          <input type="date" className="form-input" value={dataDoc} onChange={e => setDataDoc(e.target.value)} style={{ width: 160 }} />
        </div>
      </div>

      {!apiKey && (
        <div className="alert alert-warn" style={{ marginBottom: 16 }}>
          ⚠️ Nessuna chiave API configurata. Vai in Impostazioni per aggiungere la chiave Anthropic e abilitare la generazione AI.
        </div>
      )}

      {tipo.sezioni.map((sez, i) => (
        <div key={sez.id} style={{ marginBottom: 20, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg3)', borderBottom: sezioni[sez.id] ? '1px solid var(--border)' : 'none' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{i + 1}. {sez.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{sez.hint.substring(0, 80)}…</div>
            </div>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => generaSezione(sez)}
              disabled={loading[sez.id]}
              style={{ flexShrink: 0 }}>
              <Sparkles size={12} />
              {loading[sez.id] ? 'Generazione…' : sezioni[sez.id] ? 'Rigenera' : 'Genera con AI'}
            </button>
          </div>
          <div style={{ padding: '12px 16px' }}>
            <textarea
              className="form-input"
              value={sezioni[sez.id] || ''}
              onChange={e => setSezioni(s => ({ ...s, [sez.id]: e.target.value }))}
              rows={sezioni[sez.id] ? 8 : 3}
              placeholder={loading[sez.id] ? 'Generazione in corso…' : 'Clicca "Genera con AI" oppure scrivi il testo manualmente…'}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
        <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvataggio…' : documento?.id ? 'Aggiorna documento' : 'Salva documento'}
        </button>
      </div>
    </div>
  )
}

// ── Pagina principale ────────────────────────────────────────────────
export default function Contratti() {
  const { currentProc, notify } = useStore()
  const navigate = useNavigate()
  const [documenti, setDocumenti] = useState([])
  const [loading, setLoading] = useState(true)
  const [showTipi, setShowTipi] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [selTipo, setSelTipo] = useState(null)
  const [editDoc, setEditDoc] = useState(null)

  useEffect(() => {
    if (!currentProc) { navigate('/procedure'); return }
    loadDocumenti()
  }, [currentProc])

  const loadDocumenti = async () => {
    setLoading(true)
    const { data } = await supabase.from('documenti').select('*').eq('proc_id', currentProc.id).order('created_at', { ascending: false })
    setDocumenti(data || [])
    setLoading(false)
  }

  const deleteDoc = async (id) => {
    if (!confirm('Eliminare questo documento?')) return
    await supabase.from('documenti').delete().eq('id', id)
    notify('Documento eliminato', 'ok')
    loadDocumenti()
  }

  const openNuovo = (tipo) => {
    setSelTipo(tipo)
    setEditDoc(null)
    setShowTipi(false)
    setShowForm(true)
  }

  const openEdit = (doc) => {
    const tipo = TIPI_DOC.find(t => t.id === doc.tipo)
    if (!tipo) return
    setSelTipo(tipo)
    setEditDoc(doc)
    setShowForm(true)
  }

  if (!currentProc) return null

  return (
    <>
      <Topbar
        title="Documenti procedura"
        subtitle={currentProc.nome}
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setShowTipi(true)}>
            <Plus size={14} /> Nuovo documento
          </button>
        }
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

        {loading ? <Spinner /> : documenti.length === 0 ? (
          <Empty icon="📝" title="Nessun documento" sub="Crea il primo documento della procedura con l'AI" />
        ) : (
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Tipo documento</th>
                  <th>Norma</th>
                  <th>Data</th>
                  <th>Sezioni compilate</th>
                  <th style={{ width: 100 }}></th>
                </tr>
              </thead>
              <tbody>
                {documenti.map(doc => {
                  const tipo = TIPI_DOC.find(t => t.id === doc.tipo)
                  const nSezioni = Object.keys(doc.sezioni || {}).filter(k => doc.sezioni[k]).length
                  const totSezioni = tipo?.sezioni.length || 0
                  return (
                    <tr key={doc.id} onClick={() => openEdit(doc)}>
                      <td style={{ fontWeight: 500 }}>
                        <span style={{ marginRight: 8 }}>{tipo?.icon}</span>{tipo?.label || doc.tipo}
                      </td>
                      <td><span className="badge badge-blue">{tipo?.art}</span></td>
                      <td className="muted">{fmtDate(doc.data_doc)}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, maxWidth: 80 }}>
                            <div style={{ height: '100%', background: nSezioni === totSezioni ? 'var(--accent-g)' : 'var(--accent)', borderRadius: 3, width: totSezioni ? `${(nSezioni / totSezioni) * 100}%` : '0%' }} />
                          </div>
                          <span style={{ fontSize: 12, color: 'var(--text2)' }}>{nSezioni}/{totSezioni}</span>
                        </div>
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent-r)' }} onClick={() => deleteDoc(doc.id)}>
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Seleziona tipo documento */}
      <Modal open={showTipi} onClose={() => setShowTipi(false)} title="Seleziona tipo documento">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {TIPI_DOC.map(t => (
            <div key={t.id} onClick={() => openNuovo(t)} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
              border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer',
              transition: 'all 0.15s', background: 'var(--bg3)'
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'rgba(59,111,255,0.06)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg3)' }}>
              <span style={{ fontSize: 28, flexShrink: 0 }}>{t.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{t.label}</div>
                <div style={{ fontSize: 11, color: 'var(--accent)' }}>{t.art}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{t.sezioni.length} sezioni con generazione AI</div>
              </div>
              <FileText size={16} color="var(--text3)" />
            </div>
          ))}
        </div>
      </Modal>

      {/* Editor documento */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={selTipo?.label || ''} wide>
        {selTipo && (
          <DocumentoForm
            tipo={selTipo}
            procId={currentProc.id}
            documento={editDoc}
            onClose={() => setShowForm(false)}
            onSave={() => { setShowForm(false); loadDocumenti() }}
          />
        )}
      </Modal>
    </>
  )
}
