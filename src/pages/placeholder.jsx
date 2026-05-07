import { Topbar, Empty } from '../components/layout'
import { useStore } from '../store/useStore'

function PlaceholderPage({ title, subtitle, icon, sub }) {
  const { currentProc } = useStore()
  return (
    <>
      <Topbar title={title} subtitle={currentProc ? currentProc.nome : subtitle} />
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <Empty icon={icon} title={title} sub={sub || 'Questa sezione è in sviluppo'} />
      </div>
    </>
  )
}

export function ProceduraDetail() {
  return <PlaceholderPage title="Scheda procedura" icon="📁" sub="Dettaglio completo procedura" />
}

export function Inventario() {
  return <PlaceholderPage title="Inventario" icon="📦" sub="Gestione beni inventariati" />
}

export function Lotti() {
  return <PlaceholderPage title="Lotti di vendita" icon="📋" sub="Composizione lotti" />
}

export function Aste() {
  return <PlaceholderPage title="Aste" icon="🔨" sub="Wizard avvisi di vendita" />
}

export function Contratti() {
  return <PlaceholderPage title="Contratti" icon="📝" sub="Mandati, relazioni e documenti" />
}

export function Impostazioni() {
  return <PlaceholderPage title="Impostazioni" icon="⚙️" sub="Configurazione studio" />
}

export function Admin() {
  return <PlaceholderPage title="Amministrazione" icon="👥" sub="Gestione utenti" />
}
