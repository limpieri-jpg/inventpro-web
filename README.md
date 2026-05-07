# InventPro WebApp

Gestione inventari concorsuali — Progess Italia

## Stack
- React 18 + Vite
- Supabase (Auth + Database + Storage)
- Design identico al Gestionale Progess (dark theme, DM Sans)
- Deploy su Vercel

## Setup locale

```bash
# 1. Installa dipendenze
npm install

# 2. Crea il file .env.local copiando il template
cp .env.local.example .env.local
# → Inserisci URL e anon key dal tuo progetto Supabase

# 3. Esegui lo schema SQL su Supabase
# Dashboard Supabase → SQL Editor → incolla inventpro_schema.sql

# 4. Avvia il server di sviluppo
npm run dev
```

## Deploy su Vercel

```bash
# Prima installazione
npm i -g vercel
vercel login
vercel --prod

# Variabili ambiente su Vercel:
# VITE_SUPABASE_URL
# VITE_SUPABASE_ANON_KEY
```

## Struttura cartelle

```
src/
├── lib/           # Supabase client, helpers
├── store/         # Zustand store globale
├── components/    # Componenti riutilizzabili
│   └── layout/    # Sidebar, Topbar, Modal, Toast
└── pages/         # Pagine dell'app
```

## Pagine implementate (Sprint 1)
- ✅ Login
- ✅ Dashboard con statistiche
- ✅ Lista procedure con filtri e ricerca
- ✅ Form crea/modifica procedura

## Pagine in sviluppo (Sprint 2+)
- 🔄 Scheda procedura dettaglio
- 🔄 Inventario articoli
- 🔄 Lotti di vendita
- 🔄 Wizard avvisi
- 🔄 Contratti e documenti AI
