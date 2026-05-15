/**
 * Helper per chiamate AI — usa la Edge Function Supabase come proxy sicuro.
 * La chiave API Anthropic non è mai esposta nel browser.
 *
 * Uso:
 *   import { callAI } from '../lib/ai'
 *   const text = await callAI({ model, max_tokens, messages })
 */
import { supabase } from './supabase'

const EDGE_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/super-processor'
const MODEL    = 'claude-sonnet-4-20250514'

/**
 * Chiama il modello AI tramite Edge Function.
 * @param {object} opts
 * @param {Array}  opts.messages       — array di messaggi { role, content }
 * @param {number} [opts.max_tokens]   — default 1500
 * @param {string} [opts.model]        — default claude-sonnet-4-20250514
 * @returns {Promise<string>}          — testo della risposta
 */
export async function callAI({ messages, max_tokens = 1500, model = MODEL }) {
  // Recupera il token di sessione Supabase per autenticare la richiesta
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Utente non autenticato')

  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + session.access_token,
      'apikey':        import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ model, max_tokens, messages }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || 'Errore Edge Function: ' + res.status)
  }

  const data = await res.json()
  const text = data.content?.[0]?.text || ''
  if (!text) throw new Error('Risposta AI vuota')
  return text
}
