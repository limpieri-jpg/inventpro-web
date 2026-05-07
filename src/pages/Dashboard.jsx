import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Topbar, Spinner, Empty } from '../components/layout'
import { TrendingUp, FolderOpen, Package, Gavel, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'

function fmtEur(n) {
  return '€ ' + Number(n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('it-IT')
}

const STATUS_BADGE = {
  attiva:   { cls: 'badge-green',  label: 'Attiva' },
  chiusa:   { cls: 'badge-gray',   label: 'Chiusa' },
  sospesa:  { cls: 'badge-yellow', label: 'Sospesa' },
}

export default function Dashboard() {
  const { profile, fetchProcedure, setCurrentProc } = useStore()
  const navigate = useNavigate()
  const [procedure, setProcedure] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchProcedure({ status: 'attiva' })
      .then(setProcedure)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const totArticoli = procedure.reduce((s, p) => s + (p.n_articoli || 0), 0)
  const totValGiud  = procedure.reduce((s, p) => s + Number(p.totale_val_giud || 0), 0)
  const totLotti    = procedure.reduce((s, p) => s + (p.n_lotti || 0), 0)

  return (
    <>
      <Topbar
        title={`Ciao, ${profile?.nome || 'Utente'} 👋`}
        subtitle="Panoramica generale delle procedure attive"
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
            <div className="stat-value stat-blue">{procedure.length}</div>
            <div className="stat-sub">in gestione</div>
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
            <div className="stat-value stat-yellow" style={{ fontSize: 18 }}>
              {fmtEur(totValGiud)}
            </div>
            <div className="stat-sub">valore giudiziario</div>
          </div>
        </div>

        {/* Tabella procedure */}
        <div className="table-card">
          <div className="table-header">
            <div className="table-title">Procedure attive</div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/procedure')}>
              Vedi tutte →
            </button>
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
                {procedure.slice(0, 10).map(p => {
                  const sb = STATUS_BADGE[p.status] || { cls: 'badge-gray', label: p.status }
                  return (
                    <tr key={p.id} onClick={() => {
                      setCurrentProc(p)
                      navigate(`/procedure/${p.id}`)
                    }}>
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
