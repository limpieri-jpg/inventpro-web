import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Topbar, Spinner, Empty } from '../components/layout'
import { supabase } from '../lib/supabase'
import { Plus, ArrowRight, Package, Layers, Gavel, FileText } from 'lucide-react'

function fmtEur(n) {
  if (n === null || n === undefined || n === '') return '\u2014'
  const num = Number(n)
  if (isNaN(num)) return '\u2014'
  const [int, dec] = num.toFixed(2).split('.')
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return '\u20ac\u00a0' + intFmt + ',' + dec
}

const STATUS_BADGE = {
  attiva:  { cls: 'badge-green',  label: 'Attiva' },
  chiusa:  { cls: 'badge-gray',   label: 'Chiusa' },
  sospesa: { cls: 'badge-yellow', label: 'Sospesa' },
}

export default function Dashboard() {
  const { profile, currentProc, setCurrentProc, notify } = useStore()
  const navigate = useNavigate()
  const [procedure, setProcedure] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('v_procedure_riepilogo').select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) notify('Errore caricamento: ' + error.message, 'err')
        setProcedure(data || [])
        setLoading(false)
      })
  }, [])

  const attive = procedure.filter(p => p.status === 'attiva')
  const totArticoli = attive.reduce((s, p) => s + (p.n_articoli || 0), 0)
  const totValGiud = attive.reduce((s, p) => s + Number(p.totale_val_giud || 0), 0)
  const totLotti = attive.reduce((s, p) => s + (p.n_lotti || 0), 0)

  const ora = new Date().getHours()
  const saluto = ora < 12 ? 'Buongiorno' : ora < 18 ? 'Buon pomeriggio' : 'Buonasera'

  return (
    <>
      <Topbar
        title={`${saluto}, ${profile?.nome || 'Utente'} 👋`}
        subtitle="Panoramica generale delle procedure"
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/procedure')}>
            <Plus size={14} /> Nuova procedura
          </button>
        }
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

        {/* Stats */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Procedure attive</div>
            <div className="stat-value stat-blue">{attive.length}</div>
            <div className="stat-sub">{procedure.length} totali</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Beni inventariati</div>
            <div className="stat-value stat-green">{totArticoli.toLocaleString('it-IT')}</div>
            <div className="stat-sub">articoli totali</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Lotti di vendita</div>
            <div className="stat-value">{totLotti}</div>
            <div className="stat-sub">lotti creati</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Valore stimato</div>
            <div className="stat-value stat-yellow" style={{ fontSize: 18 }}>{fmtEur(totValGiud)}</div>
            <div className="stat-sub">valore giudiziario</div>
          </div>
        </div>

        {/* Procedura corrente — accesso rapido */}
        {currentProc && (
          <div style={{ marginBottom: 20, padding: '16px 20px', background: 'rgba(59,111,255,0.06)', border: '1px solid rgba(59,111,255,0.2)', borderRadius: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Procedura corrente</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{currentProc.nome}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{currentProc.tipo} · Tribunale di {currentProc.tribunale}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/procedure/${currentProc.id}`)}>
                Apri scheda <ArrowRight size={13} />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
              {[
                { icon: Package, label: 'Inventario', path: '/inventario' },
                { icon: Layers,  label: 'Lotti',      path: '/lotti' },
                { icon: Gavel,   label: 'Aste',        path: '/aste' },
                { icon: FileText,label: 'Documenti',   path: '/contratti' },
              ].map(item => (
                <button key={item.path} className="btn btn-ghost btn-sm" onClick={() => navigate(item.path)}
                  style={{ flexDirection: 'column', gap: 4, height: 56, fontSize: 11 }}>
                  <item.icon size={16} color="var(--accent)" />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tabella procedure */}
        <div className="table-card">
          <div className="table-header">
            <div className="table-title">Procedure recenti</div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/procedure')}>Vedi tutte →</button>
          </div>
          {loading ? <Spinner /> : procedure.length === 0 ? (
            <Empty icon="📂" title="Nessuna procedura" sub="Crea la prima procedura per iniziare" />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Denominazione</th>
                  <th>Tipo</th>
                  <th>Tribunale</th>
                  <th>Beni</th>
                  <th>Val. Giudiziario</th>
                  <th>Stato</th>
                </tr>
              </thead>
              <tbody>
                {procedure.slice(0, 8).map(p => {
                  const sb = STATUS_BADGE[p.status] || { cls: 'badge-gray', label: p.status }
                  return (
                    <tr key={p.id} onClick={() => { setCurrentProc(p); navigate(`/procedure/${p.id}`) }}>
                      <td style={{ fontWeight: 500 }}>{p.nome}</td>
                      <td className="muted">{p.tipo}</td>
                      <td className="muted">{p.tribunale || '—'}</td>
                      <td className="mono">{p.n_articoli || 0}</td>
                      <td className="mono">{fmtEur(p.totale_val_giud)}</td>
                      <td><span className={`badge ${sb.cls}`}>{sb.label}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}
