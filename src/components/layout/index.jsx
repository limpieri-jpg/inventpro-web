import { useNavigate, useLocation } from 'react-router-dom'
import { useStore } from '../../store/useStore'
import {
  LayoutDashboard, FolderOpen, Package, Layers, Gavel,
  FileText, Settings, LogOut, Users, ChevronRight, Lock
} from 'lucide-react'

const NAV = [
  { section: 'Principale' },
  { label: 'Dashboard',    icon: LayoutDashboard, path: '/' },
  { label: 'Procedure',    icon: FolderOpen,       path: '/procedure' },
  { section: 'Procedura corrente' },
  { label: 'Inventario',   icon: Package,          path: '/inventario',  needProc: true },
  { label: 'Lotti',        icon: Layers,           path: '/lotti',       needProc: true },
  { label: 'Aste',         icon: Gavel,            path: '/aste',        needProc: true },
  { label: 'Documenti',    icon: FileText,         path: '/documenti',   needProc: true },
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
      flexDirection: 'column', height: '100%'
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, background: 'var(--accent)', borderRadius: 9,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0
          }}>IP</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.2 }}>InventPro</div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>Inventari Concorsuali</div>
          </div>
        </div>
      </div>

      {/* Procedura corrente */}
      {currentProc && (
        <div style={{ padding: '10px 12px' }}>
          <div
            onClick={() => navigate(`/procedure/${currentProc.id}`)}
            style={{
              padding: '10px 12px', background: 'rgba(59,111,255,0.08)',
              border: '1px solid rgba(59,111,255,0.2)', borderRadius: 8, cursor: 'pointer'
            }}>
            <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 }}>
              Procedura attiva
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>
                {currentProc.nome}
              </span>
              <ChevronRight size={12} color="var(--text3)" style={{ flexShrink: 0 }} />
            </div>
            <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2 }}>
              {currentProc.tribunale || currentProc.tipo}
            </div>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav style={{ flex: 1, padding: '4px 12px', overflowY: 'auto' }}>
        {NAV.map((item, i) => {
          if (item.section) return (
            <div key={i} style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1px', padding: '12px 8px 4px' }}>
              {item.section}
            </div>
          )
          if (item.adminOnly && !isAdmin) return null
          const locked = item.needProc && !currentProc
          const active = !locked && (location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path)))

          return (
            <div key={i}
              onClick={() => !locked && navigate(item.path)}
              title={locked ? 'Seleziona prima una procedura' : ''}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                borderRadius: 8, marginBottom: 2, fontSize: 13, fontWeight: 500,
                cursor: locked ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
                color: locked ? 'var(--text3)' : active ? 'var(--accent)' : 'var(--text2)',
                background: active ? 'rgba(59,111,255,0.12)' : 'transparent',
                opacity: locked ? 0.5 : 1,
              }}
              onMouseEnter={e => { if (!active && !locked) { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.color = 'var(--text)' } }}
              onMouseLeave={e => { if (!active && !locked) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = locked ? 'var(--text3)' : 'var(--text2)' } }}
            >
              <item.icon size={15} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {locked && <Lock size={11} color="var(--text3)" />}
            </div>
          )
        })}
      </nav>

      {/* User footer */}
      <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, background: 'var(--accent)', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 600, color: '#fff', flexShrink: 0
          }}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profile?.titolo ? profile.titolo + ' ' : ''}{profile?.nome} {profile?.cognome}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profile?.ruolo || profile?.email}
            </div>
          </div>
          <button onClick={signOut} title="Esci" style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
            <LogOut size={14} />
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
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>{actions}</div>}
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
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100, padding: 24
    }} onClick={e => { if (e.target === e.currentTarget) onClose?.() }}>
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', width: '100%',
        maxWidth: wide ? 920 : 700, maxHeight: '92vh',
        display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow)'
      }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '2px 6px' }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>{children}</div>
        {footer && (
          <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
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
