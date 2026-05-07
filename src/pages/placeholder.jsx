import { Topbar, Empty } from '../components/layout'
import { useStore } from '../store/useStore'

function PlaceholderPage({ title, icon, sub }) {
  const { currentProc } = useStore()
  return (
    <>
      <Topbar title={title} subtitle={currentProc?.nome || ''} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <Empty icon={icon} title={title} sub={sub || 'In sviluppo — prossimo sprint'} />
      </div>
    </>
  )
}

export function Admin() { return <PlaceholderPage title="Amministrazione utenti" icon="👥" sub="Gestione accessi e profili — in arrivo" /> }
