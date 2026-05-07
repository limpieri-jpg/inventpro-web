import { useNavigate, useLocation } from 'react-router-dom'
import { useStore } from '../../store/useStore'
import {
  LayoutDashboard, FolderOpen, Package, Layers, Gavel,
  FileText, Settings, LogOut, Users, ChevronRight
} from 'lucide-react'

const NAV = [
  { section: 'Principale' },
  { label: 'Dashboard',    icon: LayoutDashboard, path: '/' },
  { label: 'Procedure',    icon: FolderOpen,       path: '/procedure' },
  { section: 'Procedura corrente' },
  { label: 'Inventario',   icon: Package,          path: '/inventario',  needProc: true },
  { label: 'Lotti',        icon: Layers,           path: '/lotti',       needProc: true },
  { label: 'Aste',         icon: Gavel,            path: '/aste',        needProc: true },
  { label: 'Contratti',    icon: FileText,         path: '/contratti',   needProc: true },
  { section: 'Sistema' },
  { label: 'Impostazioni', icon: Settings,         path: '/impostazioni' },
  { label: 'Utenti',       icon: Users,            path: '/admin',       adminOnly: true },
]

export function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile, currentProc, signOut } = useStore()
  const isAdmin = profile?.is_admin

  const initials = profile
    ? `${profile.nome?.[0] || ''}${profile.cognome?.[0] || ''}`.toUpperCase()
    : '?'

  return (
    <aside style={{
      width: 220, minWidth: 220, background: 'var(--bg2)',
      borderRight: '1px solid var(--border)', display: 'flex',
      flexDirection: 'column', padding: '20px 0', height: '100%'
    }}>
      {/* Logo */}
      <div style={{ padding: '0 20px 20px', borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, background: 'var(--accent)', borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 700, color: '#fff'
          }}>IP</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>InventPro</div>
            <div style={{ fontSize: 11, color: 'var(--text2)' }}>Inventari Concorsuali</div>
          </div>
        </div>
      </div>

      {/* Procedura corrente */}
      {currentProc && (
        <div style={{
          margin: '0 12px 12px', padding: '10px 12px',
          background: 'rgba(59,111,255,0.08)', border: '1px solid rgba(59,111,255,0.2)',
          borderRadius: 8, cursor: 'pointer'
        }} onClick={() => navigate(`/procedure/${currentProc.id}`)}>
          <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 }}>
            Procedura attiva
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 4 }}>
            {currentProc.nome?.substring(0, 22)}{currentProc.nome?.length > 22 ? '…' : ''}
            <ChevronRight size={12} color="var(--text3)" />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
            {currentProc.tipo} · {currentProc.tribunale}
          </div>
        </div>
      )}

      {/* Nav */}
      <nav style={{ flex: 1, padding: '0 12px', overflowY: 'auto' }}>
        {NAV.map((item, i) => {
          if (item.section) {
            return (
              <div key={i} style={{
                fontSize: 10, fontWeight: 600, color: 'var(--text3)',
                textTransform: 'uppercase', letterSpacing: '1px',
                padding: '12px 8px 4px'
              }}>{item.section}</div>
            )
          }
          if (item.adminOnly && !isAdmin) return null
          if (item.needProc && !currentProc) {
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
                borderRadius: 8, color: 'var(--text3)', fontSize: 13, marginBottom: 2,
                opacity: 0.4
              }}>
                <item.icon size={16} />
                {item.label}
              </div>
            )
          }
          const active = location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path))
          return (
            <div key={i}
              onClick={() => navigate(item.path)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
                borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500,
                marginBottom: 2, transition: 'all 0.15s',
                color: active ? 'var(--accent)' : 'var(--text2)',
                background: active ? 'rgba(59,111,255,0.12)' : 'transparent',
              }}
              onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.color = 'var(--text)' } }}
              onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text2)' } }}
            >
              <item.icon size={16} />
              {item.label}
            </div>
          )
        })}
      </nav>

      {/* User footer */}
      <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, background: 'var(--accent)', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 600, color: '#fff', flexShrink: 0
          }}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profile?.nome} {profile?.cognome}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profile?.email}
            </div>
          </div>
          <button onClick={signOut} title="Esci" style={{
            background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 4
          }}>
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  )
}

export function Topbar({ title, subtitle, actions }) {
  return (
    <div style={{
      height: 56, borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', padding: '0 24px',
      gap: 12, background: 'var(--bg2)', flexShrink: 0
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>{subtitle}</div>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{actions}</div>}
    </div>
  )
}

export function Toast() {
  const toasts = useStore(s => s.toasts)
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>{t.msg}</div>
      ))}
    </div>
  )
}

export function Modal({ open, onClose, title, children, footer, wide }) {
  if (!open) return null
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 24
    }} onClick={e => { if (e.target === e.currentTarget) onClose?.() }}>
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', width: '100%',
        maxWidth: wide ? 900 : 680, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow)'
      }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: 4 }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>{children}</div>
        {footer && (
          <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export function Spinner() {
  return <div className="loading"><div className="spinner" /></div>
}

export function Empty({ icon = '📭', title = 'Nessun dato', sub = '' }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <div className="empty-title">{title}</div>
      {sub && <div className="empty-sub">{sub}</div>}
    </div>
  )
}
