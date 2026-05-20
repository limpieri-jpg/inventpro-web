import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useStore = create((set, get) => ({
  // Auth
  user: null,
  profile: null,
  loading: true,

  // Navigazione
  currentProc: null,

  // Toast
  toasts: [],

  // ── Auth ──────────────────────────────────────
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setLoading: (loading) => set({ loading }),

  setCurrentProc: (proc) => set({ currentProc: proc }),

  // ── Toast ─────────────────────────────────────
  notify: (msg, type = 'ok', duration = 3000) => {
    const id = Date.now()
    set(s => ({ toasts: [...s.toasts, { id, msg, type }] }))
    setTimeout(() => {
      set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }))
    }, duration)
  },

  // ── Login/Logout ──────────────────────────────
  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, profile: null, currentProc: null })
  },

  // ── Profilo ──────────────────────────────────
  fetchProfile: async (userId) => {
    if (!userId) return null
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    if (data) {
      // Blocca accesso se utente disattivato
      if (data.is_active === false) {
        await supabase.auth.signOut()
        set({ user: null, profile: null })
        return null
      }
      set({ profile: data })
    } else {
      // Profilo non esiste — lo crea automaticamente
      const { data: userData } = await supabase.auth.getUser()
      if (userData?.user) {
        const newProfile = {
          id: userId,
          nome: userData.user.user_metadata?.nome || '',
          cognome: userData.user.user_metadata?.cognome || '',
          email: userData.user.email || '',
          is_admin: false,
          is_active: true
        }
        await supabase.from('profiles').upsert(newProfile)
        set({ profile: newProfile })
        return newProfile
      }
    }
    return data
  },

  // ── Procedure ────────────────────────────────
  fetchProcedure: async (filters = {}) => {
    const { profile } = get()
    let q = supabase
      .from('v_procedure_riepilogo')
      .select('*')
      .order('created_at', { ascending: false })

    // Utenti non-admin vedono solo le procedure assegnate
    if (profile && !profile.is_admin) {
      const { data: assegnate } = await supabase
        .from('procedure_utenti')
        .select('proc_id')
        .eq('user_id', profile.id)
      const ids = (assegnate || []).map(r => r.proc_id)
      if (ids.length === 0) return []
      q = q.in('id', ids)
    }

    if (filters.status) q = q.eq('status', filters.status)
    if (filters.search) q = q.ilike('nome', `%${filters.search}%`)

    const { data, error } = await q
    if (error) throw error
    return data || []
  },

  fetchProc: async (id) => {
    const { profile } = get()
    // Verifica accesso per utenti non-admin
    if (profile && !profile.is_admin) {
      const { data: acc } = await supabase
        .from('procedure_utenti')
        .select('proc_id')
        .eq('user_id', profile.id)
        .eq('proc_id', id)
        .maybeSingle()
      if (!acc) {
        set({ currentProc: null })
        return null
      }
    }
    const { data, error } = await supabase
      .from('procedure')
      .select(`*, sedi(*)`)
      .eq('id', id)
      .single()
    if (error) throw error
    set({ currentProc: data })
    return data
  },

  // ── Articoli ──────────────────────────────────
  fetchArticoli: async (procId, filters = {}) => {
    let q = supabase
      .from('v_articoli_con_foto')
      .select('*')
      .eq('proc_id', procId)
      .order('sort_order', { ascending: true })

    if (filters.search) {
      q = q.or(`desc_breve.ilike.%${filters.search}%,marca.ilike.%${filters.search}%`)
    }
    if (filters.categoria) q = q.eq('categoria', filters.categoria)

    const { data, error } = await q
    if (error) throw error
    return data || []
  },

  // ── Lotti ─────────────────────────────────────
  fetchLotti: async (procId) => {
    const { data, error } = await supabase
      .from('lotti')
      .select(`*, lotti_articoli(articolo_id)`)
      .eq('proc_id', procId)
      .order('numero')
    if (error) throw error
    return data || []
  },

  // ── Wizard Aste (persiste tra le navigazioni) ───
  wizardAste: {},
  setWizardAste: (data) => set(s => ({ wizardAste: { ...s.wizardAste, ...data } })),
  resetWizardAste: () => set({ wizardAste: {} }),

  // ── Avvisi ────────────────────────────────────
  fetchAvvisi: async (procId) => {
    const { data, error } = await supabase
      .from('avvisi')
      .select('*')
      .eq('proc_id', procId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  },
}))
