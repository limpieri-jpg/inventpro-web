/**
 * Determina il genere grammaticale dal codice fiscale italiano.
 * I caratteri 9-10 (posizioni 9 e 10, base 0) rappresentano il giorno di nascita:
 * - Maschio: 01-31
 * - Femmina: 41-71 (giorno + 40)
 *
 * @param {string} cf - Codice fiscale (16 caratteri)
 * @returns {'M'|'F'} — 'M' maschile, 'F' femminile (default 'M' se CF assente/non valido)
 */
export function getCFGenere(cf) {
  if (!cf || cf.length < 11) return 'M'
  const giorno = parseInt(cf.substring(9, 11), 10)
  if (isNaN(giorno)) return 'M'
  return giorno > 40 ? 'F' : 'M'
}

/**
 * Restituisce le forme grammaticali accordate al genere del professionista.
 * Uso: const g = getGenereTermini(proc.cf_curatore)
 *      g.ilLa         → "Il" / "La"
 *      g.sottoscritto → "sottoscritto" / "sottoscritta"
 *      ecc.
 */
export function getGenereTermini(cf) {
  const sesso = getCFGenere(cf)
  const M = sesso === 'M'
  return {
    sesso,
    // articoli e pronomi
    ilLa:           M ? 'Il'            : 'La',
    ilLaArt:        M ? 'il'            : 'la',
    delDella:       M ? 'del'           : 'della',
    alAlla:         M ? 'al'            : 'alla',
    // aggettivi/participi
    sottoscritto:   M ? 'sottoscritto'  : 'sottoscritta',
    nominato:       M ? 'nominato'      : 'nominata',
    delegato:       M ? 'delegato'      : 'delegata',
    incaricato:     M ? 'incaricato'    : 'incaricata',
    autorizzato:    M ? 'autorizzato'   : 'autorizzata',
    // ruoli (accordati)
    curatore:       M ? 'Curatore'      : 'Curatrice',
    commissario:    M ? 'Commissario'   : 'Commissaria',
    liquidatore:    M ? 'Liquidatore'   : 'Liquidatrice',
    gestoreOCC:     M ? 'Gestore OCC'  : 'Gestrice OCC',
    // forme brevi
    ilCuratore:     M ? 'Il Curatore'   : 'La Curatrice',
    delCuratore:    M ? 'del Curatore'  : 'della Curatrice',
    // formula apertura documento
    apertura:       M ? 'Il sottoscritto' : 'La sottoscritta',
    // formula qualità — mappa tipo procedura → ruolo accordato al genere
    qualita: (tipo) => {
      const t = tipo ? tipo.toLowerCase() : ''
      // Liquidazione Giudiziale (fallimento CCII)
      if (t.includes('liquidazione giudiziale'))   return M ? 'Curatore'              : 'Curatrice'
      // Liquidazione Controllata (sovraindebitamento)
      if (t.includes('liquidazione controllata'))  return M ? 'Liquidatore Giudiziale': 'Liquidatrice Giudiziale'
      // Concordato preventivo
      if (t.includes('concordato'))                return M ? 'Commissario Giudiziale': 'Commissaria Giudiziale'
      // Amministrazione straordinaria
      if (t.includes('amministrazione straordinar'))return M ? 'Commissario Straordinario': 'Commissaria Straordinaria'
      // Piano di ristrutturazione / composizione negoziata
      if (t.includes('composizione negoziata'))    return M ? 'Esperto'               : 'Esperta'
      if (t.includes('ristrutturazione'))          return M ? 'Professionista Attestatore': 'Professionista Attestatrice'
      // OCC / sovraindebitamento generico
      if (t.includes('occ') || t.includes('sovraindebitamento')) return M ? 'Gestore OCC' : 'Gestrice OCC'
      // Commissario generico
      if (t.includes('commissar'))                 return M ? 'Commissario'           : 'Commissaria'
      // Liquidatore generico
      if (t.includes('liquid'))                    return M ? 'Liquidatore'           : 'Liquidatrice'
      // Default: Curatore
      return M ? 'Curatore' : 'Curatrice'
    }
  }
}
