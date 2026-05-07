import { Topbar, Empty } from '../components/layout'
import { useStore } from '../store/useStore'

function PlaceholderPage({ title, icon, sub }) {
  const { currentProc } = useStore()
  return (
    <>
      <Topbar title={title} subtitle={currentProc?.nome || ''} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <Empty icon={icon} title={title} sub={sub || 'In sviluppo — Sprint 4'} />
      </div>
    </>
  )
}

export function Contratti() { return <PlaceholderPage title="Contratti & Documenti" icon="📝" sub="Mandati, relazioni di stima e documenti AI — Sprint 4" /> }
export function Impostazioni() { return <PlaceholderPage title="Impostazioni" icon="⚙️" sub="Configurazione studio e API key" /> }
export function Admin() { return <PlaceholderPage title="Amministrazione utenti" icon="👥" sub="Gestione accessi e profili" /> }
