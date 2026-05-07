import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Topbar, Spinner, Modal, Empty } from '../components/layout'
import { supabase } from '../lib/supabase'
import { Plus, Edit, Trash2, ChevronRight, Calendar, Clock } from 'lucide-react'

function fmtDate(d) { if (!d) return '—'; return new Date(d).toLocaleDateString('it-IT') }
function fmtEur(n) { return n ? '€ ' + Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—' }

const MODALITA = [
  { id: 'sincrona_mista',    label: 'Sincrona mista',     desc: 'Offerte telematiche + presenza fisica' },
  { id: 'sincrona_tel',      label: 'Sincrona telematica', desc: 'Solo offerte telematiche' },
  { id: 'asincrona_progess', label: 'Asincrona Progess',   desc: 'Aste asincrone su Progess PVP' },
  { id: 'asincrona_mag',     label: 'Asincrona AsteMag',   desc: 'Aste asincrone su AsteMagazine' },
]

// ── Wizard avviso ────────────────────────────────────────────────────
function AvvisoWizard({ avviso, procId, lotti, onSave, onClose }) {
  const { notify } = useStore()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    n_esperimento: '1°', modalita: 'sincrona_mista',
    data_asta: '', ora_asta: '10:00',
    termine_offerte_data: '', termine_offerte_ora: '12:00',
    termine_saldo: '60', data_aut_gd: '',
    cauz_default: '10', rilanci_default: '500',
    diritti_tipo: 'fisso', diritti_default: '10',
    iban: '', banca: '', intestaz_cc: '',
    notaio: '', studio_notaio: '',
    data_avviso: new Date().toISOString().substr(0, 10),
    lotti_ids: [], lotti_config: {},
    ...avviso
  })
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const inp = (k, type = 'text') => ({ value: form[k] ?? '', type, onChange: e => set(k, e.target.value), className: 'form-input' })

  const toggleLotto = (id) => {
    set('lotti_ids', form.lotti_ids.includes(id) ? form.lotti_ids.filter(x => x !== id) : [...form.lotti_ids, id])
  }

  const setLottoConfig = (lottoId, key, val) => {
    set('lotti_config', { ...form.lotti_config, [lottoId]: { ...(form.lotti_config[lottoId] || {}), [key]: val } })
  }

  const getLottoVal = (lottoId, key, def = '') => (form.lotti_config[lottoId] || {})[key] ?? def

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = { ...form, proc_id: procId }
      let res
      if (avviso?.id) {
        res = await supabase.from('avvisi').update(payload).eq('id', avviso.id).select().single()
      } else {
        res = await supabase.from('avvisi').insert(payload).select().single()
      }
      if (res.error) throw res.error
      notify('Avviso salvato', 'ok')
      onSave(res.data)
    } catch (e) { notify('Errore: ' + e.message, 'err') }
    finally { setSaving(false) }
  }

  const steps = ['Modalità', 'Date e termini', 'Lotti', 'Condizioni', 'Dati bancari']
  const selectedLotti = lotti.filter(l => form.lotti_ids.includes(l.id))

  return (
    <div>
      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, background: 'var(--bg3)', borderRadius: 10, padding: 3 }}>
        {steps.map((s, i) => (
          <div key={i} onClick={() => i < step - 1 && setStep(i + 1)} style={{
            flex: 1, padding: '7px 4px', borderRadius: 8, textAlign: 'center', fontSize: 12, fontWeight: 500, cursor: i < step - 1 ? 'pointer' : 'default',
            background: i + 1 === step ? 'var(--bg2)' : 'transparent',
            color: i + 1 === step ? 'var(--text)' : i + 1 < step ? 'var(--accent)' : 'var(--text3)',
            boxShadow: i + 1 === step ? '0 1px 4px rgba(0,0,0,0.3)' : 'none'
          }}>
            <span style={{ marginRight: 4 }}>{i + 1 < step ? '✓' : i + 1}</span>{s}
          </div>
        ))}
      </div>

      {/* Step 1: Modalità */}
      {step === 1 && (
        <div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>Seleziona la modalità di vendita per questo esperimento</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            {MODALITA.map(m => (
              <div key={m.id} onClick={() => set('modalita', m.id)} style={{
                padding: '14px 16px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s',
                border: `2px solid ${form.modalita === m.id ? 'var(--accent)' : 'var(--border)'}`,
                background: form.modalita === m.id ? 'rgba(59,111,255,0.08)' : 'var(--bg3)'
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: form.modalita === m.id ? 'var(--accent)' : 'var(--text)', marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>{m.desc}</div>
              </div>
            ))}
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">N. Esperimento</label>
              <input {...inp('n_esperimento')} placeholder="Es. 1°, 2°…" />
            </div>
            <div className="form-group">
              <label className="form-label">Data avviso</label>
              <input {...inp('data_avviso', 'date')} />
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Date e termini */}
      {step === 2 && (
        <div className="form-grid">
          <div className="form-section">Data e ora asta</div>
          <div className="form-group">
            <label className="form-label">Data asta</label>
            <input {...inp('data_asta', 'date')} />
          </div>
          <div className="form-group">
            <label className="form-label">Ora asta</label>
            <input {...inp('ora_asta', 'time')} />
          </div>
          <div className="form-section">Termine presentazione offerte</div>
          <div className="form-group">
            <label className="form-label">Data termine offerte</label>
            <input {...inp('termine_offerte_data', 'date')} />
          </div>
          <div className="form-group">
            <label className="form-label">Ora termine offerte</label>
            <input {...inp('termine_offerte_ora', 'time')} />
          </div>
          <div className="form-section">Altri termini</div>
          <div className="form-group">
            <label className="form-label">Termine saldo (giorni)</label>
            <input {...inp('termine_saldo', 'number')} />
          </div>
          <div className="form-group">
            <label className="form-label">Data autorizzazione GD</label>
            <input {...inp('data_aut_gd', 'date')} />
          </div>
        </div>
      )}

      {/* Step 3: Lotti */}
      {step === 3 && (
        <div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>Seleziona i lotti da includere in questo avviso e configura i valori per ciascuno</div>
          {lotti.length === 0 ? (
            <Empty icon="📋" title="Nessun lotto" sub="Crea prima i lotti nella sezione Lotti" />
          ) : lotti.map(l => {
            const sel = form.lotti_ids.includes(l.id)
            return (
              <div key={l.id} style={{ marginBottom: 12, border: `1px solid ${sel ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 10, overflow: 'hidden' }}>
                <div onClick={() => toggleLotto(l.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', background: sel ? 'rgba(59,111,255,0.06)' : 'var(--bg3)' }}>
                  <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${sel ? 'var(--accent)' : 'var(--border2)'}`, background: sel ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {sel && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Lotto {l.numero}{l.nome ? ' — ' + l.nome : ''}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>{(l.lotti_articoli || []).length} articoli</div>
                  </div>
                </div>
                {sel && (
                  <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
                    <div className="form-grid" style={{ gap: 10 }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Valore di stima (€)</label>
                        <input type="number" className="form-input" value={getLottoVal(l.id, 'stima')} onChange={e => setLottoConfig(l.id, 'stima', e.target.value)} placeholder="0,00" />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Prezzo base (€)</label>
                        <input type="number" className="form-input" value={getLottoVal(l.id, 'base')} onChange={e => setLottoConfig(l.id, 'base', e.target.value)} placeholder="0,00" />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Offerta minima (€)</label>
                        <input type="number" className="form-input" value={getLottoVal(l.id, 'minima')} onChange={e => setLottoConfig(l.id, 'minima', e.target.value)} placeholder="0,00" />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Cauzione (€)</label>
                        <input type="number" className="form-input" value={getLottoVal(l.id, 'cauz', form.cauz_default)} onChange={e => setLottoConfig(l.id, 'cauz', e.target.value)} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Step 4: Condizioni */}
      {step === 4 && (
        <div className="form-grid">
          <div className="form-section">Cauzione e rilanci</div>
          <div className="form-group">
            <label className="form-label">Cauzione minima (€)</label>
            <input {...inp('cauz_default', 'number')} />
          </div>
          <div className="form-group">
            <label className="form-label">Rilanci minimi (€)</label>
            <input {...inp('rilanci_default', 'number')} />
          </div>
          <div className="form-section">Diritti d'asta</div>
          <div className="form-group">
            <label className="form-label">Tipo diritti</label>
            <select className="form-input" value={form.diritti_tipo} onChange={e => set('diritti_tipo', e.target.value)}>
              <option value="fisso">Percentuale fissa</option>
              <option value="fasce">Per fasce di prezzo</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Diritti d'asta (%)</label>
            <input {...inp('diritti_default', 'number')} />
          </div>
          <div className="form-section">Notaio (se richiesto)</div>
          <div className="form-group">
            <label className="form-label">Notaio</label>
            <input {...inp('notaio')} />
          </div>
          <div className="form-group">
            <label className="form-label">Studio notarile</label>
            <input {...inp('studio_notaio')} />
          </div>
        </div>
      )}

      {/* Step 5: Dati bancari */}
      {step === 5 && (
        <div className="form-grid">
          <div className="form-section">Conto corrente procedura</div>
          <div className="form-col-full form-group">
            <label className="form-label">IBAN</label>
            <input {...inp('iban')} placeholder="IT00A0000000000000000000000" />
          </div>
          <div className="form-group">
            <label className="form-label">Banca</label>
            <input {...inp('banca')} />
          </div>
          <div className="form-group">
            <label className="form-label">Intestazione CC</label>
            <input {...inp('intestaz_cc')} />
          </div>
          {/* Riepilogo */}
          <div className="form-section">Riepilogo avviso</div>
          <div className="form-col-full">
            <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 14, fontSize: 13 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  ['Modalità', MODALITA.find(m => m.id === form.modalita)?.label],
                  ['N. Esperimento', form.n_esperimento],
                  ['Data asta', fmtDate(form.data_asta)],
                  ['Ora asta', form.ora_asta],
                  ['Termine offerte', fmtDate(form.termine_offerte_data) + ' ore ' + form.termine_offerte_ora],
                  ['Lotti inclusi', selectedLotti.length],
                  ['Cauzione min.', fmtEur(form.cauz_default)],
                  ['Rilanci min.', fmtEur(form.rilanci_default)],
                ].map(([k, v]) => (
                  <div key={k}><span style={{ color: 'var(--text3)', marginRight: 6 }}>{k}:</span><strong>{v || '—'}</strong></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigazione */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <div>
          {step > 1 && <button className="btn btn-ghost" onClick={() => setStep(s => s - 1)}>← Indietro</button>}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
          {step < steps.length
            ? <button className="btn btn-primary" onClick={() => setStep(s => s + 1)}>Avanti →</button>
            : <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Salvataggio…' : '✓ Salva avviso'}</button>
          }
        </div>
      </div>
    </div>
  )
}

// ── Card avviso ──────────────────────────────────────────────────────
function AvvisoCard({ avviso, onEdit, onDelete }) {
  const mod = MODALITA.find(m => m.id === avviso.modalita)
  const nLotti = (avviso.lotti_ids || []).length
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, background: 'rgba(59,111,255,0.12)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🔨</div>
          <div>
            <div className="card-title">{avviso.n_esperimento || '1°'} Esperimento — {mod?.label || avviso.modalita}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, display: 'flex', gap: 12 }}>
              {avviso.data_asta && <span><Calendar size={11} style={{ marginRight: 3 }} />{fmtDate(avviso.data_asta)} ore {avviso.ora_asta}</span>}
              <span>📋 {nLotti} lott{nLotti === 1 ? 'o' : 'i'}</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => onEdit(avviso)}><Edit size={13} /> Modifica</button>
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent-r)' }} onClick={() => onDelete(avviso.id)}><Trash2 size={13} /></button>
        </div>
      </div>
      <div style={{ padding: '0 20px 14px', display: 'flex', gap: 24, fontSize: 12, color: 'var(--text2)' }}>
        {avviso.termine_offerte_data && <span>Termine offerte: <strong style={{ color: 'var(--text)' }}>{fmtDate(avviso.termine_offerte_data)} ore {avviso.termine_offerte_ora}</strong></span>}
        {avviso.cauz_default && <span>Cauzione: <strong style={{ color: 'var(--text)' }}>{fmtEur(avviso.cauz_default)}</strong></span>}
        {avviso.rilanci_default && <span>Rilanci min.: <strong style={{ color: 'var(--text)' }}>{fmtEur(avviso.rilanci_default)}</strong></span>}
      </div>
    </div>
  )
}

// ── Pagina principale ────────────────────────────────────────────────
export default function Aste() {
  const { currentProc, notify } = useStore()
  const navigate = useNavigate()
  const [avvisi, setAvvisi] = useState([])
  const [lotti, setLotti] = useState([])
  const [loading, setLoading] = useState(true)
  const [showWizard, setShowWizard] = useState(false)
  const [editAvviso, setEditAvviso] = useState(null)

  useEffect(() => {
    if (!currentProc) { navigate('/procedure'); return }
    loadAll()
  }, [currentProc])

  const loadAll = async () => {
    setLoading(true)
    const [{ data: avvData }, { data: lottiData }] = await Promise.all([
      supabase.from('avvisi').select('*').eq('proc_id', currentProc.id).order('created_at', { ascending: false }),
      supabase.from('lotti').select('*, lotti_articoli(articolo_id)').eq('proc_id', currentProc.id).order('numero')
    ])
    setAvvisi(avvData || [])
    setLotti(lottiData || [])
    setLoading(false)
  }

  const deleteAvviso = async (id) => {
    if (!confirm('Eliminare questo avviso?')) return
    await supabase.from('avvisi').delete().eq('id', id)
    notify('Avviso eliminato', 'ok')
    loadAll()
  }

  if (!currentProc) return null

  return (
    <>
      <Topbar
        title="Aste"
        subtitle={currentProc.nome}
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => { setEditAvviso(null); setShowWizard(true) }}>
            <Plus size={14} /> Nuovo avviso
          </button>
        }
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 20 }}>
          <div className="stat-card"><div className="stat-label">Avvisi creati</div><div className="stat-value stat-blue">{avvisi.length}</div></div>
          <div className="stat-card"><div className="stat-label">Lotti disponibili</div><div className="stat-value">{lotti.length}</div></div>
          <div className="stat-card"><div className="stat-label">Prossima asta</div>
            <div className="stat-value" style={{ fontSize: 16 }}>
              {avvisi.find(a => a.data_asta) ? fmtDate(avvisi.sort((a, b) => new Date(a.data_asta) - new Date(b.data_asta)).find(a => a.data_asta)?.data_asta) : '—'}
            </div>
          </div>
        </div>

        {loading ? <Spinner /> : avvisi.length === 0 ? (
          <Empty icon="🔨" title="Nessun avviso" sub="Crea il primo avviso di vendita con il wizard" />
        ) : (
          avvisi.map(a => <AvvisoCard key={a.id} avviso={a} onEdit={(av) => { setEditAvviso(av); setShowWizard(true) }} onDelete={deleteAvviso} />)
        )}
      </div>

      <Modal open={showWizard} onClose={() => setShowWizard(false)} title={editAvviso ? 'Modifica avviso' : 'Nuovo avviso di vendita'} wide>
        <AvvisoWizard
          avviso={editAvviso}
          procId={currentProc.id}
          lotti={lotti}
          onClose={() => setShowWizard(false)}
          onSave={() => { setShowWizard(false); loadAll() }}
        />
      </Modal>
    </>
  )
}
