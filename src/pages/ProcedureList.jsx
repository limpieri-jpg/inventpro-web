import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Topbar, Spinner, Empty, Modal } from '../components/layout'
import { Plus, Search, Filter } from 'lucide-react'
import { supabase } from '../lib/supabase'

const TIPI = ['Liquidazione Giudiziale', 'Fallimento', 'Concordato Preventivo', 'Liquidazione Coatta', 'Altro']
const STATUS_BADGE = {
  attiva:  { cls: 'badge-green',  label: 'Attiva' },
  chiusa:  { cls: 'badge-gray',   label: 'Chiusa' },
  sospesa: { cls: 'badge-yellow', label: 'Sospesa' },
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('it-IT')
}

function ProcForm({ proc, onSave, onClose }) {
  const { notify } = useStore()
  const [form, setForm] = useState({
    nome: '', tipo: 'Liquidazione Giudiziale', num: '', anno: new Date().getFullYear(),
    tribunale: '', giudice: '', curatore: '', commissionario: 'Pro.Ges.S. S.r.l.',
    data_apertura: '', sentenza_num: '', pec: '', cf: '', piva: '',
    ...proc
  })
  const [loading, setLoading] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const inp = (k) => ({ value: form[k] || '', onChange: e => set(k, e.target.value), className: 'form-input' })

  const handleSave = async () => {
    if (!form.nome) { notify('Inserisci il nome della procedura', 'warn'); return }
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const payload = { ...form, owner_id: user.id }
      let res
      if (proc?.id) {
        res = await supabase.from('procedure').update(payload).eq('id', proc.id).select().single()
      } else {
        res = await supabase.from('procedure').insert(payload).select().single()
      }
      if (res.error) throw res.error
      notify(proc?.id ? 'Procedura aggiornata' : 'Procedura creata', 'ok')
      onSave(res.data)
    } catch (e) {
      notify('Errore: ' + e.message, 'err')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="form-grid">
        <div className="form-section">Dati principali</div>
        <div className="form-col-full">
          <div className="form-group">
            <label className="form-label">Denominazione *</label>
            <input {...inp('nome')} placeholder="Es. Rossi Mario" />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Tipo procedura</label>
          <select {...inp('tipo')}>
            {TIPI.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Tribunale</label>
          <input {...inp('tribunale')} placeholder="Es. Lecco" />
        </div>
        <div className="form-group">
          <label className="form-label">N. R.G.</label>
          <input {...inp('num')} placeholder="Es. 12" />
        </div>
        <div className="form-group">
          <label className="form-label">Anno</label>
          <input {...inp('anno')} type="number" placeholder={new Date().getFullYear()} />
        </div>
        <div className="form-group">
          <label className="form-label">Giudice Delegato</label>
          <input {...inp('giudice')} placeholder="Dott. / Dott.ssa..." />
        </div>
        <div className="form-group">
          <label className="form-label">Curatore</label>
          <input {...inp('curatore')} placeholder="Dott. / Dott.ssa..." />
        </div>
        <div className="form-group">
          <label className="form-label">Data apertura</label>
          <input {...inp('data_apertura')} type="date" />
        </div>
        <div className="form-group">
          <label className="form-label">N. sentenza/decreto</label>
          <input {...inp('sentenza_num')} placeholder="Es. 12/2025" />
        </div>
        <div className="form-section">Dati fiscali</div>
        <div className="form-group">
          <label className="form-label">Codice Fiscale</label>
          <input {...inp('cf')} placeholder="CF debitore" />
        </div>
        <div className="form-group">
          <label className="form-label">P.IVA</label>
          <input {...inp('piva')} />
        </div>
        <div className="form-group">
          <label className="form-label">PEC procedura</label>
          <input {...inp('pec')} type="email" />
        </div>
        <div className="form-group">
          <label className="form-label">Commissionario</label>
          <input {...inp('commissionario')} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
        <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
          {loading ? 'Salvataggio…' : proc?.id ? 'Aggiorna' : 'Crea procedura'}
        </button>
      </div>
    </>
  )
}

export default function ProcedureList() {
  const { setCurrentProc, notify } = useStore()
  const navigate = useNavigate()
  const [procedure, setProcedure] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [page, setPage] = useState(0)
  const PER_PAGE = 20

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let q = supabase
        .from('v_procedure_riepilogo')
        .select('*')
        .order('created_at', { ascending: false })
      if (statusFilter) q = q.eq('status', statusFilter)
      if (search) q = q.ilike('nome', `%${search}%`)
      const { data, error } = await q
      if (error) throw error
      setProcedure(data || [])
    } catch (e) {
      notify('Errore caricamento: ' + e.message, 'err')
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter])

  useEffect(() => { load() }, [load])

  const paginated = procedure.slice(page * PER_PAGE, (page + 1) * PER_PAGE)
  const totalPages = Math.ceil(procedure.length / PER_PAGE)

  return (
    <>
      <Topbar
        title="Procedure"
        subtitle={`${procedure.length} procedure trovate`}
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
            <Plus size={14} /> Nuova procedura
          </button>
        }
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

        {/* Filtri */}
        <div className="filter-bar">
          <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
            <input
              className="form-input" placeholder="Cerca procedura…"
              style={{ paddingLeft: 32 }}
              value={search} onChange={e => { setSearch(e.target.value); setPage(0) }}
            />
          </div>
          <select className="filter-select" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0) }}>
            <option value="">Tutti gli stati</option>
            <option value="attiva">Attive</option>
            <option value="chiusa">Chiuse</option>
            <option value="sospesa">Sospese</option>
          </select>
        </div>

        {/* Tabella */}
        <div className="table-card">
          {loading ? <Spinner /> : procedure.length === 0 ? (
            <Empty icon="📂" title="Nessuna procedura" sub={search ? 'Nessun risultato per la ricerca' : 'Crea la prima procedura'} />
          ) : (
            <>
              <table>
                <thead>
                  <tr>
                    <th>Denominazione</th>
                    <th>Tipo</th>
                    <th>N. R.G.</th>
                    <th>Tribunale</th>
                    <th>Beni</th>
                    <th>Stato</th>
                    <th>Data apertura</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(p => {
                    const sb = STATUS_BADGE[p.status] || { cls: 'badge-gray', label: p.status }
                    return (
                      <tr key={p.id} onClick={() => {
                        setCurrentProc(p)
                        navigate(`/procedure/${p.id}`)
                      }}>
                        <td style={{ fontWeight: 500 }}>{p.nome}</td>
                        <td className="muted">{p.tipo}</td>
                        <td className="mono">{p.num}{p.anno ? `/${p.anno}` : ''}</td>
                        <td className="muted">{p.tribunale || '—'}</td>
                        <td className="mono">{p.n_articoli || 0}</td>
                        <td><span className={`badge ${sb.cls}`}>{sb.label}</span></td>
                        <td className="muted">{p.data_apertura ? new Date(p.data_apertura).toLocaleDateString('it-IT') : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {totalPages > 1 && (
                <div className="pagination">
                  <div className="pagination-info">
                    {page * PER_PAGE + 1}–{Math.min((page + 1) * PER_PAGE, procedure.length)} di {procedure.length}
                  </div>
                  <div className="pagination-btns">
                    <button className="page-btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>←</button>
                    {Array.from({ length: totalPages }, (_, i) => (
                      <button key={i} className={`page-btn ${i === page ? 'active' : ''}`} onClick={() => setPage(i)}>{i + 1}</button>
                    ))}
                    <button className="page-btn" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>→</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal crea procedura */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Nuova procedura" wide>
        <ProcForm
          onClose={() => setShowForm(false)}
          onSave={(p) => {
            setShowForm(false)
            setCurrentProc(p)
            navigate(`/procedure/${p.id}`)
          }}
        />
      </Modal>
    </>
  )
}
