import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Topbar, Spinner, Modal, Empty } from '../components/layout'
import { supabase } from '../lib/supabase'
import { callAI } from '../lib/ai'
import { Plus, Trash2, Edit, Package, ChevronDown, ChevronUp, Sparkles } from 'lucide-react'

function fmtEur(n) {
  if (n === null || n === undefined || n === '') return '\u2014'
  const num = Number(n)
  if (isNaN(num)) return '\u2014'
  const [int, dec] = num.toFixed(2).split('.')
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return '\u20ac\u00a0' + intFmt + ',' + dec
}

// ── Form lotto ───────────────────────────────────────────────────────
function LottoForm({ lotto, procId, articoliDisponibili, onSave, onClose }) {
  const { notify } = useStore()
  const [form, setForm] = useState({ numero: '', nome: '', descrizione: '', note: '', prezzo_base: '', offerta_minima: '', rilancio_min: '', ...lotto })
  const [selArticoli, setSelArticoli] = useState([])
  const [saving, setSaving] = useState(false)
  const [generandoDesc, setGenerandoDesc] = useState(false)

  const generaDescrizione = async () => {
    const arts = articoliDisponibili.filter(a => selArticoli.includes(a.id))
    if (arts.length === 0) { notify('Seleziona prima gli articoli del lotto', 'warn'); return }
    setGenerandoDesc(true)
    try {
      const isImmobile = arts.some(a => (a.tipologia_siecic||'').includes('IMMOBILE'))
      const contenuto = arts.map(a => {
        if ((a.tipologia_siecic||'').includes('IMMOBILE')) {
          return [a.desc_breve, a.comune_catastale&&('Comune: '+a.comune_catastale),
            a.foglio&&('Foglio: '+a.foglio), a.mappale&&('Mappale: '+a.mappale),
            a.subalterno&&('Sub: '+a.subalterno), a.categoria_catastale&&('Cat: '+a.categoria_catastale),
            a.rendita&&('Rendita: €'+a.rendita), a.superficie&&('Sup: '+a.superficie+'mq'),
            a.indirizzo_immobile&&('Ind: '+a.indirizzo_immobile), a.desc_estesa].filter(Boolean).join(' | ')
        }
        return (a.qta>1?a.qta+' x ':'')+[a.marca,a.modello,a.desc_breve].filter(Boolean).join(' ')
      }).join(' / ')
      const prompt = isImmobile
        ? 'Sei un esperto di procedure concorsuali italiane. Redigi una descrizione sintetica del lotto immobiliare per un avviso di vendita giudiziaria. Includi dati catastali essenziali, tipologia, superficie e ubicazione. Max 80 parole, stile formale. Dati: '+contenuto
        : 'Sei un esperto di procedure concorsuali italiane. Redigi una descrizione sintetica del lotto di beni mobili per un avviso di vendita giudiziaria. Elenca i beni principali, max 60 parole, stile formale. Beni: '+contenuto
      const testo = await callAI({ messages: [{ role: 'user', content: prompt }], max_tokens: 300 })
      setForm(f => ({...f, descrizione: testo.trim()}))
      notify('Descrizione generata', 'ok')
    } catch(e) { notify('Errore AI: '+e.message, 'err') }
    finally { setGenerandoDesc(false) }
  }


  useEffect(() => {
    if (lotto?.id) {
      supabase.from('lotti_articoli').select('articolo_id').eq('lotto_id', lotto.id)
        .then(({ data }) => { if (data) setSelArticoli(data.map(r => r.articolo_id)) })
    }
  }, [lotto?.id])

  const toggleArticolo = (id) => {
    setSelArticoli(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const handleSave = async () => {
    if (!form.numero) { notify('Inserisci il numero del lotto', 'warn'); return }
    setSaving(true)
    try {
      // Rimuovi campi non scrivibili
      const { id: _id, created_at, updated_at, lotti_articoli: _la, articolo_ids: _ai, ...payload } = form
      let lottoId
      if (lotto?.id) {
        const { error } = await supabase.from('lotti').update(payload).eq('id', lotto.id)
        if (error) throw error
        lottoId = lotto.id
      } else {
        const { data, error } = await supabase.from('lotti').insert({ ...payload, proc_id: procId }).select().single()
        if (error) throw error
        lottoId = data.id
      }
      // Aggiorna articoli del lotto
      const { error: delErr } = await supabase.from('lotti_articoli').delete().eq('lotto_id', lottoId)
      if (delErr) throw delErr
      if (selArticoli.length > 0) {
        const { error: insErr } = await supabase.from('lotti_articoli').insert(
          selArticoli.map(aid => ({ lotto_id: lottoId, articolo_id: aid }))
        )
        if (insErr) throw insErr
      }
      notify('Lotto salvato', 'ok')
      onSave()
    } catch (e) { notify('Errore: ' + e.message, 'err') }
    finally { setSaving(false) }
  }

  const totValore = articoliDisponibili
    .filter(a => selArticoli.includes(a.id))
    .reduce((s, a) => s + (Number(a.val_giud || 0) * Number(a.qta || 1)), 0)

  // Aggiorna prezzo base automaticamente quando cambiano gli articoli selezionati
  useEffect(() => {
    if (totValore > 0) {
      setForm(f => {
        const newBase = Math.round(totValore)
        const abbPct  = f._abbattimento ? Number(f._abbattimento) : 25
        const newMin  = Math.round(newBase * (1 - abbPct/100))
        return { ...f, prezzo_base: String(newBase), offerta_minima: String(newMin) }
      })
    }
  }, [totValore])

  return (
    <>
      <div className="form-grid">
        <div className="form-section">Dati lotto</div>
        <div className="form-group">
          <label className="form-label">Numero lotto *</label>
          <input className="form-input" value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))} placeholder="Es. 1, 2A, 3B…" />
        </div>
        <div className="form-group">
          <label className="form-label">Nome lotto</label>
          <input className="form-input" value={form.nome || ''} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Es. Macchinari officina" />
        </div>

        <div className="form-section">Valori economici</div>
        <div className="form-group">
          <label className="form-label">Prezzo base (€) <span style={{fontSize:11,color:'var(--text3)'}}>calcolato automaticamente</span></label>
          <input className="form-input" value={form.prezzo_base || ''} onChange={e => setForm(f => ({ ...f, prezzo_base: e.target.value }))} placeholder="Calcolato dalla somma val. giudiziario articoli" />
        </div>
        <div className="form-group">
          <label className="form-label">Abbattimento (%)</label>
          <input type="number" className="form-input" value={form._abbattimento ?? 25}
            onChange={e => {
              const pct = Number(e.target.value)
              const base = Number(form.prezzo_base) || totValore
              setForm(f => ({ ...f, _abbattimento: e.target.value, offerta_minima: String(Math.round(base * (1 - pct/100))) }))
            }}
            min="0" max="100" placeholder="Es. 25" />
        </div>
        <div className="form-group">
          <label className="form-label">Offerta minima (€) <span style={{fontSize:11,color:'var(--text3)'}}>calcolata automaticamente</span></label>
          <input className="form-input" value={form.offerta_minima || ''} onChange={e => setForm(f => ({ ...f, offerta_minima: e.target.value }))} placeholder="Calcolata dall'abbattimento sul prezzo base" />
        </div>
        <div className="form-group">
          <label className="form-label">Rilancio minimo (€)</label>
          <input className="form-input" value={form.rilancio_min || ''} onChange={e => setForm(f => ({ ...f, rilancio_min: e.target.value }))} placeholder="Es. 250,00" />
        </div>

        <div className="form-col-full form-group">
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
            <label className="form-label" style={{marginBottom:0}}>Descrizione lotto</label>
            <button className="btn btn-ghost btn-sm" onClick={generaDescrizione} disabled={generandoDesc} type="button">
              <Sparkles size={12}/> {generandoDesc ? 'Generazione…' : 'Genera con AI'}
            </button>
          </div>
          <textarea className="form-input" value={form.descrizione || ''} onChange={e => setForm(f => ({ ...f, descrizione: e.target.value }))} rows={3}
            placeholder="Descrizione del lotto — generata automaticamente dall'AI o inserita manualmente" />
        </div>
        <div className="form-col-full form-group">
          <label className="form-label">Note</label>
          <textarea className="form-input" value={form.note || ''} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} rows={2} />
        </div>

        <div className="form-section">Articoli del lotto</div>
        <div className="form-col-full">
          {selArticoli.length > 0 && (
            <div style={{ marginBottom: 10, padding: '8px 12px', background: 'rgba(0,200,150,0.08)', border: '1px solid rgba(0,200,150,0.2)', borderRadius: 8, fontSize: 13, color: 'var(--accent-g)' }}>
              {selArticoli.length} articoli selezionati — Valore totale: {fmtEur(totValore)}
            </div>
          )}
          <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
            {articoliDisponibili.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Nessun articolo disponibile</div>
            ) : articoliDisponibili.map(a => (
              <div key={a.id}
                onClick={() => toggleArticolo(a.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                  borderBottom: '1px solid var(--border)', cursor: 'pointer',
                  background: selArticoli.includes(a.id) ? 'rgba(59,111,255,0.08)' : 'transparent',
                  transition: 'background 0.1s'
                }}>
                <div style={{
                  width: 18, height: 18, borderRadius: 4, border: `2px solid ${selArticoli.includes(a.id) ? 'var(--accent)' : 'var(--border2)'}`,
                  background: selArticoli.includes(a.id) ? 'var(--accent)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  {selArticoli.includes(a.id) && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
                </div>
                {a.prima_foto_url && <img src={a.prima_foto_url} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4 }} />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{a.desc_breve}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)' }}>{[a.marca, a.modello].filter(Boolean).join(' ')} · {a.qta} {a.unita_misura}</div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--accent-g)', fontFamily: 'DM Mono, monospace' }}>{fmtEur(Number(a.val_giud || 0) * Number(a.qta || 1))}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
        <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Salvataggio…' : lotto?.id ? 'Aggiorna lotto' : 'Crea lotto'}</button>
      </div>
    </>
  )
}

// ── Card lotto ───────────────────────────────────────────────────────
function LottoCard({ lotto, articoli, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const lottoArticoli = articoli.filter(a => lotto.articolo_ids?.includes(a.id))
  const totValore = lottoArticoli.reduce((s, a) => s + (Number(a.val_giud || 0) * Number(a.qta || 1)), 0)

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card-header" style={{ cursor: 'pointer' }} onClick={() => setExpanded(e => !e)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, background: 'rgba(59,111,255,0.15)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>
            {lotto.numero}
          </div>
          <div>
            <div className="card-title">{lotto.nome || `Lotto ${lotto.numero}`}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
              {lottoArticoli.length} articoli · {fmtEur(totValore)}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); onEdit(lotto) }}><Edit size={13} /></button>
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent-r)' }} onClick={e => { e.stopPropagation(); onDelete(lotto.id) }}><Trash2 size={13} /></button>
          {expanded ? <ChevronUp size={16} color="var(--text3)" /> : <ChevronDown size={16} color="var(--text3)" />}
        </div>
      </div>
      {expanded && (
        <div style={{ padding: '0 20px 16px' }}>
          {lotto.descrizione && <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>{lotto.descrizione}</div>}
          {lottoArticoli.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text3)', fontStyle: 'italic' }}>Nessun articolo assegnato</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'left', padding: '6px 0', borderBottom: '1px solid var(--border)', textTransform: 'uppercase' }}>Descrizione</th>
                  <th style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'right', padding: '6px 0', borderBottom: '1px solid var(--border)', textTransform: 'uppercase' }}>Q.tà</th>
                  <th style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'right', padding: '6px 0', borderBottom: '1px solid var(--border)', textTransform: 'uppercase' }}>Val. Giud.</th>
                </tr>
              </thead>
              <tbody>
                {lottoArticoli.map(a => (
                  <tr key={a.id}>
                    <td style={{ padding: '8px 0', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: 500 }}>{a.desc_breve}</div>
                      {(a.marca || a.modello) && <div style={{ fontSize: 11, color: 'var(--text2)' }}>{[a.marca, a.modello].filter(Boolean).join(' ')}</div>}
                    </td>
                    <td style={{ padding: '8px 0', fontSize: 12, fontFamily: 'DM Mono, monospace', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>{a.qta} {a.unita_misura}</td>
                    <td style={{ padding: '8px 0', fontSize: 12, fontFamily: 'DM Mono, monospace', textAlign: 'right', color: 'var(--accent-g)', borderBottom: '1px solid var(--border)' }}>{fmtEur(Number(a.val_giud || 0) * Number(a.qta || 1))}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={2} style={{ padding: '8px 0', fontSize: 12, fontWeight: 700 }}>TOTALE LOTTO</td>
                  <td style={{ padding: '8px 0', fontSize: 13, fontFamily: 'DM Mono, monospace', textAlign: 'right', fontWeight: 700, color: 'var(--accent-g)' }}>{fmtEur(totValore)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

// ── Pagina principale ────────────────────────────────────────────────
export default function Lotti() {
  const { currentProc, notify } = useStore()
  const navigate = useNavigate()
  const [lotti, setLotti] = useState([])
  const [articoli, setArticoli] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editLotto, setEditLotto] = useState(null)

  useEffect(() => {
    if (!currentProc) { navigate('/procedure'); return }
    loadAll()
  }, [currentProc])

  const loadAll = async () => {
    setLoading(true)
    const [{ data: lottiData }, { data: artsData }] = await Promise.all([
      supabase.from('lotti').select('*, lotti_articoli(articolo_id)').eq('proc_id', currentProc.id).order('numero'),
      supabase.from('v_articoli_con_foto').select('*').eq('proc_id', currentProc.id).order('sort_order')
    ])
    // Mappa articolo_ids su ogni lotto
    const lottiMapped = (lottiData || []).map(l => ({
      ...l,
      articolo_ids: (l.lotti_articoli || []).map(r => r.articolo_id)
    }))
    setLotti(lottiMapped)
    setArticoli(artsData || [])
    setLoading(false)
  }

  const deleteLotto = async (id) => {
    if (!confirm('Eliminare questo lotto?')) return
    await supabase.from('lotti').delete().eq('id', id)
    notify('Lotto eliminato', 'ok')
    loadAll()
  }

  const openEdit = (lotto) => { setEditLotto(lotto); setShowForm(true) }

  const totLotti = lotti.length
  const totArticoliInLotti = [...new Set(lotti.flatMap(l => l.articolo_ids || []))].length
  const totValore = lotti.reduce((sum, l) => {
    return sum + (l.articolo_ids || []).reduce((s, aid) => {
      const a = articoli.find(x => x.id === aid)
      return s + (a ? Number(a.val_giud || 0) * Number(a.qta || 1) : 0)
    }, 0)
  }, 0)

  if (!currentProc) return null

  return (
    <>
      <Topbar
        title="Lotti di vendita"
        subtitle={currentProc.nome}
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => { setEditLotto(null); setShowForm(true) }}>
            <Plus size={14} /> Nuovo lotto
          </button>
        }
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 20 }}>
          <div className="stat-card"><div className="stat-label">Lotti creati</div><div className="stat-value stat-blue">{totLotti}</div></div>
          <div className="stat-card"><div className="stat-label">Articoli in lotti</div><div className="stat-value">{totArticoliInLotti} / {articoli.length}</div></div>
          <div className="stat-card"><div className="stat-label">Valore totale lotti</div><div className="stat-value stat-green" style={{ fontSize: 18 }}>{fmtEur(totValore)}</div></div>
        </div>

        {loading ? <Spinner /> : lotti.length === 0 ? (
          <Empty icon="📋" title="Nessun lotto" sub="Crea il primo lotto di vendita selezionando gli articoli dall'inventario" />
        ) : (
          lotti.map(l => <LottoCard key={l.id} lotto={l} articoli={articoli} onEdit={openEdit} onDelete={deleteLotto} />)
        )}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editLotto ? `Modifica lotto ${editLotto.numero}` : 'Nuovo lotto'} wide>
        <LottoForm
          lotto={editLotto}
          procId={currentProc.id}
          articoliDisponibili={articoli}
          onClose={() => setShowForm(false)}
          onSave={() => { setShowForm(false); loadAll() }}
        />
      </Modal>
    </>
  )
}
