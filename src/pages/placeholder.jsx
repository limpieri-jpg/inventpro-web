import { Topbar, Empty } from '../components/layout'
import { useStore } from '../store/useStore'

function PlaceholderPage({ title, subtitle, icon, sub }) {
  const { currentProc } = useStore()
  return (
    <>
      <Topbar title={title} subtitle={currentProc ? currentProc.nome : subtitle} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <Empty icon={icon} title={title} sub={sub || 'Questa sezione è in sviluppo — Sprint 3'} />
      </div>
    </>
  )
}

export function Lotti() { return <PlaceholderPage title="Lotti di vendita" icon="📋" sub="Composizione e gestione lotti — in arrivo" /> }
export function Aste() { return <PlaceholderPage title="Aste" icon="🔨" sub="Wizard avvisi di vendita — in arrivo" /> }
export function Contratti() { return <PlaceholderPage title="Contratti" icon="📝" sub="Mandati, relazioni e documenti — in arrivo" /> }
export function Impostazioni() { return <PlaceholderPage title="Impostazioni" icon="⚙️" sub="Configurazione studio" /> }
export function Admin() { return <PlaceholderPage title="Amministrazione" icon="👥" sub="Gestione utenti" /> }
