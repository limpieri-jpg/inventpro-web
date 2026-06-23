import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Topbar, Spinner, Modal, Empty } from '../components/layout'
import { supabase } from '../lib/supabase'
import { callAI } from '../lib/ai'
import { Plus, Search, X, Trash2, Camera, FileDown, Sparkles, AlertTriangle } from 'lucide-react'
import * as XLSX from 'xlsx'

function fmtEur(n) { return n ? '€ ' + Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—' }


const TIPOLOGIE_SIECIC = [
  'BENE MOBILE', 'BENE MOBILE REGISTRATO', 'BENE IMMOBILE',
  'CREDITO', 'PARTECIPAZIONE', 'BENE IMMATERIALE', 'AZIENDA/RAMO D\'AZIENDA', 'ALTRO'
]
const SOTTOCATEGORIE = {
  'BENE MOBILE': ['Macchinari industriali','Attrezzature','Arredi','Informatica','Elettronica','Veicoli','Materie prime','Altro'],
  'BENE MOBILE REGISTRATO': ['Autovettura','Autocarro','Motoveicolo','Natante','Aeromobile','Altro'],
  'BENE IMMOBILE': ['Fabbricato civile','Fabbricato industriale','Terreno','Altro'],
  'CREDITO': ['Credito commerciale','Credito tributario','Credito da revocatoria','Altro'],
  'PARTECIPAZIONE': ['Quota SRL','Azioni','Altro'],
  'BENE IMMATERIALE': ['Marchio','Brevetto','Software','Avviamento','Altro'],
  'AZIENDA/RAMO D\'AZIENDA': ['Azienda intera','Ramo d\'azienda'],
  'ALTRO': ['Altro']
}
const UM_LIST = ['UN','KG','MT','MQ','LT','SET','LOTTO']

function ArticoloForm({ articolo, procId, onSave, onClose }) {
  const { notify } = useStore()
  const [tab, setTab] = useState('dati')
  const [form, setForm] = useState({
    desc_breve:'', desc_estesa:'', marca:'', modello:'', anno_prod:'', matricola:'',
    tipologia_siecic:'BENE MOBILE', sottocategoria:'Macchinari industriali', codice_siecic:'',
    unita_misura:'UN', qta:1, stato:'Buono', titolo_possesso:'piena_proprieta',
    val_mercato:0, val_giud:0, danni:'', note:'',
    ...articolo
  })
  const [photos, setPhotos]       = useState([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  // ID temporaneo per caricare foto prima del salvataggio
  const [artId] = useState(() => articolo?.id || ('tmp-' + Date.now()))

  const set = (k,v) => setForm(f => ({...f,[k]:v}))

  // Carica foto esistenti
  useEffect(() => {
    const id = articolo?.id
    if (!id) return
    supabase.from('foto').select('*').eq('articolo_id', id).order('created_at', { ascending: true })
      .then(({data}) => { if (data) setPhotos(data) })
  }, [articolo?.id])

  // Upload foto — funziona anche prima del salvataggio (usa artId temporaneo)
  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setUploading(true)
    try {
      const newPhotos = []
      for (const file of files) {
        const ext = file.name.split('.').pop()
        const path = `${procId}/${artId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
        const {error: upErr} = await supabase.storage.from('foto-inventario').upload(path, file)
        if (upErr) throw upErr
        const {data:{publicUrl}} = supabase.storage.from('foto-inventario').getPublicUrl(path)
        // Se articolo già salvato, inserisci in DB; altrimenti tieni in memoria
        if (articolo?.id) {
          const {data} = await supabase.from('foto').insert({
            articolo_id: articolo.id, proc_id: procId,
            storage_path: path, url: publicUrl, sort_order: photos.length + newPhotos.length
          }).select().single()
          if (data) newPhotos.push(data)
        } else {
          newPhotos.push({ id: path, url: publicUrl, storage_path: path, _temp: true })
        }
      }
      setPhotos(p => [...p, ...newPhotos])
      notify('Foto caricate', 'ok')
    } catch (err) { notify('Errore upload: ' + err.message, 'err') }
    finally { setUploading(false) }
  }

  const deletePhoto = async (foto) => {
    await supabase.storage.from('foto-inventario').remove([foto.storage_path])
    if (!foto._temp) await supabase.from('foto').delete().eq('id', foto.id)
    setPhotos(p => p.filter(f => f.id !== foto.id))
  }

  // Analisi AI — usa Edge Function come proxy (nessuna chiave API nel browser)
  const analizzaConAI = async () => {
    if (photos.length === 0) { notify('Carica almeno una foto prima di analizzare', 'warn'); return }
    setAnalyzing(true)
    try {
      // Converti le prime 3 foto in base64
      const fotoUrls = photos.slice(0,3).map(f => f.url)
      const toBase64 = async (url) => {
        const res = await fetch(url)
        const blob = await res.blob()
        return new Promise(resolve => {
          const r = new FileReader()
          r.onload = () => resolve({ b64: r.result.split(',')[1], mt: blob.type })
          r.readAsDataURL(blob)
        })
      }
      const imgs = await Promise.all(fotoUrls.map(toBase64))

      const datiNoti = [
        form.marca && `Marca: ${form.marca}`,
        form.modello && `Modello: ${form.modello}`,
        form.anno_prod && `Anno: ${form.anno_prod}`,
        form.matricola && `Matricola: ${form.matricola}`,
        form.stato && `Stato dichiarato: ${form.stato}`,
        form.note && `Note: ${form.note}`,
      ].filter(Boolean).join('\n')

      const content = [
        ...imgs.map(({b64,mt}) => ({ type:'image', source:{type:'base64', media_type:mt, data:b64} })),
        { type:'text', text:`Analizza questo bene per un inventario di procedura concorsuale italiana.
${datiNoti ? 'Dati già noti:\n'+datiNoti : ''}

Rispondi SOLO con JSON valido (no markdown, no commenti):
{
  "tipologia_siecic": "BENE MOBILE|BENE MOBILE REGISTRATO|BENE IMMOBILE|CREDITO|PARTECIPAZIONE|BENE IMMATERIALE|AZIENDA/RAMO D'AZIENDA|ALTRO",
  "sottocategoria": "sottocategoria specifica",
  "desc_breve": "descrizione breve max 12 parole, tecnica e precisa",
  "desc_estesa": "descrizione dettagliata 2-3 frasi per verbale di inventario",
  "marca": "marca se visibile, stringa vuota se non visibile",
  "modello": "modello se visibile, stringa vuota se non visibile",
  "anno_prod": "anno se stimabile, stringa vuota altrimenti",
  "stato": "Ottimo|Buono|Discreto|Deteriorato|Non funzionante",
  "danni": "descrizione dettagliata di TUTTI i danni, difetti, usure, graffi, ammaccature, rotture, ossidazioni, macchie o anomalie visibili nelle foto. Sii specifico su tipo e posizione del danno. Scrivi \"Nessun danno rilevato\" solo se il bene è visibilmente integro",
  "val_mercato": numero intero euro (valore mercato realistico per bene usato),
  "val_giud": numero intero euro (vendita giudiziaria, tipicamente 60-75% del mercato),
  "codice_siecic": "codice classificazione SIECIC a 4-6 cifre appropriato per la tipologia del bene",
  "targa": "se veicolo, stringa vuota altrimenti",
  "telaio": "VIN se veicolo, stringa vuota altrimenti",
  "km": "chilometraggio se veicolo, stringa vuota altrimenti",
  "colore": "colore se veicolo, stringa vuota altrimenti",
  "alimentazione": "Benzina|Diesel|Ibrido|Elettrico|GPL|Metano|Altro se veicolo, stringa vuota altrimenti"
}` }
      ]

      const text = await callAI({ messages: [{ role: 'user', content }], max_tokens: 1000 })
      const json = JSON.parse(text.replace(/```json|```/g,'').trim())

      setForm(f => ({
        ...f,
        tipologia_siecic: json.tipologia_siecic || f.tipologia_siecic,
        codice_siecic:   json.codice_siecic   || f.codice_siecic   || '',
        sottocategoria:   json.sottocategoria   || f.sottocategoria,
        desc_breve:  f.desc_breve  || json.desc_breve  || '',
        desc_estesa: f.desc_estesa || json.desc_estesa || '',
        marca:       f.marca       || json.marca       || '',
        modello:     f.modello     || json.modello     || '',
        anno_prod:   f.anno_prod   || json.anno_prod   || '',
        stato:       json.stato    || f.stato,
        danni:       json.danni !== undefined ? json.danni : (f.danni || ''),
        val_mercato: json.val_mercato || f.val_mercato,
        val_giud:    json.val_giud    || f.val_giud,
        // campi veicolo
        ...(json.targa        && {targa:        json.targa}),
        ...(json.telaio       && {telaio:       json.telaio}),
        ...(json.km           && {km:           json.km}),
        ...(json.colore       && {colore:       json.colore}),
        ...(json.alimentazione && {alimentazione: json.alimentazione}),
      }))
      // tab rimane su 'dati' dopo l'analisi
      notify('Analisi AI completata — verifica i valori generati', 'ok', 5000)
    } catch (e) { notify('Errore AI: ' + e.message, 'err') }
    finally { setAnalyzing(false) }
  }

  const handleSave = async () => {
    if (!form.desc_breve) { notify('Inserisci la descrizione', 'warn'); return }
    setSaving(true)
    try {
      const {id:_id, created_at, updated_at, prima_foto_path, prima_foto_url, n_foto, ...payload} = form
      let saved
      if (articolo?.id) {
        const {data, error} = await supabase.from('articoli').update(payload).eq('id', articolo.id).select().single()
        if (error) throw error
        saved = data
      } else {
        const {data:{user}} = await supabase.auth.getUser()
        const {data, error} = await supabase.from('articoli').insert({...payload, proc_id:procId, owner_id:user.id}).select().single()
        if (error) throw error
        saved = data
        // Sposta le foto temporanee al nuovo ID reale
        if (photos.length > 0) {
          for (let i=0; i<photos.length; i++) {
            const foto = photos[i]
            const newPath = foto.storage_path.replace(artId, saved.id)
            try {
              await supabase.storage.from('foto-inventario').move(foto.storage_path, newPath)
              await supabase.from('foto').insert({
                articolo_id: saved.id, proc_id: procId,
                storage_path: newPath,
                url: supabase.storage.from('foto-inventario').getPublicUrl(newPath).data.publicUrl,
                sort_order: i
              })
            } catch(_) {}
          }
        }
      }
      notify('Articolo salvato', 'ok')
      onSave(saved)
    } catch (e) { notify('Errore: ' + e.message, 'err') }
    finally { setSaving(false) }
  }

  const TABS = [
    { id:'dati',   label:'📷 Foto & Dati' },
    { id:'valori', label:'💶 Valori' },
    { id:'danni',  label:`⚠️ Danni${form.danni ? ' ●' : ''}` },
  ]

  return (
    <div>
      {/* Tab bar */}
      <div className="tabs" style={{marginBottom:20}}>
        {TABS.map(t => (
          <div key={t.id} className={`tab ${tab===t.id?'active':''}`} onClick={()=>setTab(t.id)}>{t.label}</div>
        ))}
      </div>

      {/* ── TAB: Foto & Dati ───────────────────────────────────────────── */}
      {tab==='dati' && (
        <div style={{display:'flex',flexDirection:'column',gap:16}}>

          {/* Sezione foto */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">📷 Fotografie</div>
              <label className="btn btn-ghost btn-sm" style={{cursor:'pointer'}}>
                <Camera size={13}/> {uploading ? 'Carico…' : 'Aggiungi foto'}
                <input type="file" accept="image/*" multiple style={{display:'none'}} onChange={handlePhotoUpload} disabled={uploading}/>
              </label>
            </div>
            <div className="card-body">
              {photos.length === 0 ? (
                <div style={{textAlign:'center',padding:'24px 0',color:'var(--text3)'}}>
                  <Camera size={32} style={{opacity:0.3,marginBottom:8}}/>
                  <div style={{fontSize:13}}>Nessuna foto — carica le foto per avviare l'analisi AI</div>
                </div>
              ) : (
                <div style={{display:'flex',flexWrap:'wrap',gap:10}}>
                  {photos.map(f => (
                    <div key={f.id} style={{position:'relative',width:110,height:90}}>
                      <img src={f.url} alt="" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:6,border:'1px solid var(--border)'}}/>
                      <button onClick={()=>deletePhoto(f)} style={{position:'absolute',top:3,right:3,background:'rgba(255,50,80,0.9)',border:'none',borderRadius:'50%',width:20,height:20,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                        <X size={11} color="#fff"/>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {photos.length > 0 && (
                <div style={{marginTop:14,display:'flex',justifyContent:'flex-end'}}>
                  <button className="btn btn-primary" onClick={analizzaConAI} disabled={analyzing}>
                    <Sparkles size={13}/>
                    {analyzing ? 'Analisi in corso…' : 'Analizza con AI'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Dati articolo */}
          <div className="card">
            <div className="card-header"><div className="card-title">📋 Dati articolo</div></div>
            <div className="card-body">
              <div className="form-grid">

                {/* ── CLASSIFICAZIONE ── */}
                <div className="form-section" style={{gridColumn:'1/-1'}}>Classificazione</div>
                <div className="form-group">
                  <label className="form-label">Codice SIECIC</label></div>
                  <div className="form-group"><input className="form-input" value={form.codice_siecic||''} onChange={e=>set('codice_siecic',e.target.value)} placeholder="Es. 010101"/></div>
                  <div className="form-group"><label className="form-label">Tipologia SIECIC</label>
                  <select className="form-input" value={form.tipologia_siecic||'BENE MOBILE'} onChange={e=>{set('tipologia_siecic',e.target.value);set('sottocategoria',SOTTOCATEGORIE[e.target.value]?.[0]||'')}}>
                    {TIPOLOGIE_SIECIC.map(t=><option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Sottocategoria</label>
                  <select className="form-input" value={form.sottocategoria||''} onChange={e=>set('sottocategoria',e.target.value)}>
                    {(SOTTOCATEGORIE[form.tipologia_siecic]||SOTTOCATEGORIE['ALTRO']).map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Quantità</label>
                  <input type="number" className="form-input" value={form.qta??1} onChange={e=>set('qta',e.target.value)} min="0" step="1"/>
                </div>
                <div className="form-group">
                  <label className="form-label">Unità di misura</label>
                  <select className="form-input" value={form.unita_misura||'UN'} onChange={e=>set('unita_misura',e.target.value)}>
                    {UM_LIST.map(u=><option key={u}>{u}</option>)}
                  </select>
                </div>

                {/* ── DESCRIZIONE ── */}
                <div className="form-section" style={{gridColumn:'1/-1'}}>Descrizione</div>
                <div className="form-col-full form-group">
                  <label className="form-label">Descrizione breve *</label>
                  <input className="form-input" value={form.desc_breve} onChange={e=>set('desc_breve',e.target.value)} placeholder="Es. Tornio parallelo CNC Mazak"/>
                </div>
                <div className="form-col-full form-group">
                  <label className="form-label">Descrizione estesa</label>
                  <textarea className="form-input" value={form.desc_estesa||''} onChange={e=>set('desc_estesa',e.target.value)} rows={3} placeholder="Dettagli per verbale di inventario…"/>
                </div>

                {/* ══ BENE MOBILE ══ */}
                {(form.tipologia_siecic==='BENE MOBILE'||form.tipologia_siecic==='ALTRO') && (<>
                  <div className="form-section" style={{gridColumn:'1/-1'}}>Identificazione</div>
                  <div className="form-group"><label className="form-label">Marca</label><input className="form-input" value={form.marca||''} onChange={e=>set('marca',e.target.value)}/></div>
                  <div className="form-group"><label className="form-label">Modello</label><input className="form-input" value={form.modello||''} onChange={e=>set('modello',e.target.value)}/></div>
                  <div className="form-group"><label className="form-label">Anno produzione</label><input className="form-input" value={form.anno_prod||''} onChange={e=>set('anno_prod',e.target.value)} placeholder="Es. 2018"/></div>
                  <div className="form-group"><label className="form-label">Matricola / S/N</label><input className="form-input" value={form.matricola||''} onChange={e=>set('matricola',e.target.value)}/></div>
                  <div className="form-group"><label className="form-label">Titolo possesso</label>
                    <select className="form-input" value={form.titolo_possesso||'piena_proprieta'} onChange={e=>set('titolo_possesso',e.target.value)}>
                      {[['piena_proprieta','Piena proprietà'],['nuda_proprieta','Nuda proprietà'],['usufrutto','Usufrutto'],['rivendica','Rivendica'],['leasing','Leasing'],['abitazione','Abitazione'],['superficie','Superficie']].map(([v,l])=><option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label className="form-label">Stato</label>
                    <select className="form-input" value={form.stato||'Buono'} onChange={e=>set('stato',e.target.value)}>
                      {['Ottimo','Buono','Discreto','Deteriorato','Non funzionante'].map(s=><option key={s}>{s}</option>)}
                    </select>
                  </div>
                </>)}

                {/* ══ BENE MOBILE REGISTRATO ══ */}
                {form.tipologia_siecic==='BENE MOBILE REGISTRATO' && (<>
                  <div className="form-section" style={{gridColumn:'1/-1'}}>Dati veicolo</div>
                  <div className="form-group"><label className="form-label">Marca</label><input className="form-input" value={form.marca||''} onChange={e=>set('marca',e.target.value)}/></div>
                  <div className="form-group"><label className="form-label">Modello</label><input className="form-input" value={form.modello||''} onChange={e=>set('modello',e.target.value)}/></div>
                  <div className="form-group"><label className="form-label">Targa</label><input className="form-input" value={form.targa||''} onChange={e=>set('targa',e.target.value)} placeholder="Es. AB123CD" style={{textTransform:'uppercase'}}/></div>
                  <div className="form-group"><label className="form-label">N. Telaio (VIN)</label><input className="form-input" value={form.telaio||''} onChange={e=>set('telaio',e.target.value)} style={{fontFamily:'monospace'}}/></div>
                  <div className="form-group"><label className="form-label">Km / Ore lavoro</label><input className="form-input" value={form.km||''} onChange={e=>set('km',e.target.value)} placeholder="Es. 120.000"/></div>
                  <div className="form-group"><label className="form-label">Anno immatricolazione</label><input className="form-input" value={form.anno_prod||''} onChange={e=>set('anno_prod',e.target.value)} placeholder="Es. 2018"/></div>
                  <div className="form-group"><label className="form-label">Data immatricolazione</label><input className="form-input" value={form.data_immat||''} onChange={e=>set('data_immat',e.target.value)} placeholder="gg/mm/aaaa"/></div>
                  <div className="form-group"><label className="form-label">Colore</label><input className="form-input" value={form.colore||''} onChange={e=>set('colore',e.target.value)}/></div>
                  <div className="form-group"><label className="form-label">Alimentazione</label>
                    <select className="form-input" value={form.alimentazione||''} onChange={e=>set('alimentazione',e.target.value)}>
                      {['','Benzina','Diesel','Ibrido','Elettrico','GPL','Metano','Altro'].map(a=><option key={a}>{a}</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label className="form-label">Cilindrata (cc)</label><input className="form-input" value={form.cilindrata||''} onChange={e=>set('cilindrata',e.target.value)} placeholder="Es. 1600"/></div>
                  <div className="form-group"><label className="form-label">Potenza (kW/CV)</label><input className="form-input" value={form.potenza||''} onChange={e=>set('potenza',e.target.value)} placeholder="Es. 85 kW / 115 CV"/></div>
                  <div className="form-group"><label className="form-label">N. posti</label><input className="form-input" value={form.n_posti||''} onChange={e=>set('n_posti',e.target.value)}/></div>
                  <div className="form-group"><label className="form-label">Revisione scadenza</label><input className="form-input" value={form.revisione||''} onChange={e=>set('revisione',e.target.value)} placeholder="gg/mm/aaaa"/></div>
                  <div className="form-group"><label className="form-label">Stato</label>
                    <select className="form-input" value={form.stato||'Buono'} onChange={e=>set('stato',e.target.value)}>
                      {['Ottimo','Buono','Discreto','Deteriorato','Non funzionante'].map(s=><option key={s}>{s}</option>)}
                    </select>
                  </div>
                </>)}

                {/* ══ BENE IMMOBILE ══ */}
                {form.tipologia_siecic==='BENE IMMOBILE' && (<>
                  <div className="form-section" style={{gridColumn:'1/-1'}}>Dati catastali</div>
                  <div className="form-group"><label className="form-label">Comune catastale</label><input className="form-input" value={form.comune_catastale||''} onChange={e=>set('comune_catastale',e.target.value)}/></div>
                  <div className="form-group"><label className="form-label">Foglio</label><input className="form-input" value={form.foglio||''} onChange={e=>set('foglio',e.target.value)}/></div>
                  <div className="form-group"><label className="form-label">Particella / Mappale</label><input className="form-input" value={form.mappale||''} onChange={e=>set('mappale',e.target.value)}/></div>
                  <div className="form-group"><label className="form-label">Subalterno</label><input className="form-input" value={form.subalterno||''} onChange={e=>set('subalterno',e.target.value)}/></div>
                  <div className="form-group"><label className="form-label">Categoria catastale</label><input className="form-input" value={form.categoria_catastale||''} onChange={e=>set('categoria_catastale',e.target.value)} placeholder="Es. A/2, C/1, D/7"/></div>
                  <div className="form-group"><label className="form-label">Classe</label><input className="form-input" value={form.classe_catastale||''} onChange={e=>set('classe_catastale',e.target.value)}/></div>
                  <div className="form-group"><label className="form-label">Rendita catastale (€)</label><input className="form-input" value={form.rendita||''} onChange={e=>set('rendita',e.target.value)}/></div>
                  <div className="form-group"><label className="form-label">Vani / Consistenza</label><input className="form-input" value={form.vani||''} onChange={e=>set('vani',e.target.value)} placeholder="Es. 5 vani / 120 mq"/></div>
                  <div className="form-section" style={{gridColumn:'1/-1'}}>Ubicazione e caratteristiche</div>
                  <div className="form-col-full form-group"><label className="form-label">Indirizzo</label><input className="form-input" value={form.indirizzo_immobile||''} onChange={e=>set('indirizzo_immobile',e.target.value)} placeholder="Via, n., Comune (PR)"/></div>
                  <div className="form-group"><label className="form-label">Piano</label><input className="form-input" value={form.piano||''} onChange={e=>set('piano',e.target.value)} placeholder="Es. 2° / Terra"/></div>
                  <div className="form-group"><label className="form-label">Superficie (mq)</label><input className="form-input" value={form.superficie||''} onChange={e=>set('superficie',e.target.value)}/></div>
                  <div className="form-group"><label className="form-label">Anno costruzione</label><input className="form-input" value={form.anno_costruzione||''} onChange={e=>set('anno_costruzione',e.target.value)}/></div>
                  <div className="form-group"><label className="form-label">Stato conservazione</label>
                    <select className="form-input" value={form.stato_conservazione||''} onChange={e=>set('stato_conservazione',e.target.value)}>
                      {['','Ottimo','Buono','Discreto','Da ristrutturare','Fatiscente'].map(s=><option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label className="form-label">Classe energetica</label>
                    <select className="form-input" value={form.classe_energetica||''} onChange={e=>set('classe_energetica',e.target.value)}>
                      {['','A4','A3','A2','A1','B','C','D','E','F','G'].map(s=><option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="form-col-full form-group"><label className="form-label">Pertinenze e accessori</label><textarea className="form-input" value={form.pertinenze||''} onChange={e=>set('pertinenze',e.target.value)} rows={2} placeholder="Es. Garage, cantina, posto auto..."/></div>
                  <div className="form-col-full form-group"><label className="form-label">Iscrizioni e trascrizioni pregiudizievoli</label><textarea className="form-input" value={form.iscrizioni||''} onChange={e=>set('iscrizioni',e.target.value)} rows={2} placeholder="Es. Ipoteca volontaria, pignoramento..."/></div>
                </>)}

                {/* ══ CREDITO ══ */}
                {form.tipologia_siecic==='CREDITO' && (<>
                  <div className="form-section" style={{gridColumn:'1/-1'}}>Dati credito</div>
                  <div className="form-group"><label className="form-label">Debitore</label><input className="form-input" value={form.debitore||''} onChange={e=>set('debitore',e.target.value)}/></div>
                  <div className="form-group"><label className="form-label">CF / P.IVA debitore</label><input className="form-input" value={form.cf_debitore||''} onChange={e=>set('cf_debitore',e.target.value)}/></div>
                  <div className="form-group"><label className="form-label">Importo nominale (€)</label><input className="form-input" value={form.importo_nominale||''} onChange={e=>set('importo_nominale',e.target.value)}/></div>
                  <div className="form-group"><label className="form-label">Data scadenza</label><input className="form-input" value={form.data_scadenza||''} onChange={e=>set('data_scadenza',e.target.value)} placeholder="gg/mm/aaaa"/></div>
                  <div className="form-group"><label className="form-label">Titolo (fattura, sentenza…)</label><input className="form-input" value={form.titolo_credito||''} onChange={e=>set('titolo_credito',e.target.value)}/></div>
                  <div className="form-group"><label className="form-label">Esigibilità stimata</label>
                    <select className="form-input" value={form.esigibilita||''} onChange={e=>set('esigibilita',e.target.value)}>
                      {['','Alta','Media','Bassa','Incerta','Inesigibile'].map(s=><option key={s}>{s}</option>)}
                    </select>
                  </div>
                </>)}

                {/* ══ PARTECIPAZIONE ══ */}
                {form.tipologia_siecic==='PARTECIPAZIONE' && (<>
                  <div className="form-section" style={{gridColumn:'1/-1'}}>Dati partecipazione</div>
                  <div className="form-group"><label className="form-label">Società</label><input className="form-input" value={form.societa||''} onChange={e=>set('societa',e.target.value)}/></div>
                  <div className="form-group"><label className="form-label">CF / P.IVA società</label><input className="form-input" value={form.cf_societa||''} onChange={e=>set('cf_societa',e.target.value)}/></div>
                  <div className="form-group"><label className="form-label">Quota (%)</label><input className="form-input" value={form.quota_perc||''} onChange={e=>set('quota_perc',e.target.value)} placeholder="Es. 50%"/></div>
                  <div className="form-group"><label className="form-label">N. azioni / quote</label><input className="form-input" value={form.n_azioni||''} onChange={e=>set('n_azioni',e.target.value)}/></div>
                  <div className="form-group"><label className="form-label">Valore nominale (€)</label><input className="form-input" value={form.val_nominale||''} onChange={e=>set('val_nominale',e.target.value)}/></div>
                  <div className="form-group"><label className="form-label">Sede società</label><input className="form-input" value={form.sede_societa||''} onChange={e=>set('sede_societa',e.target.value)}/></div>
                </>)}

                {/* ══ BENE IMMATERIALE ══ */}
                {form.tipologia_siecic==='BENE IMMATERIALE' && (<>
                  <div className="form-section" style={{gridColumn:'1/-1'}}>Dati bene immateriale</div>
                  <div className="form-group"><label className="form-label">Titolare</label><input className="form-input" value={form.titolare||''} onChange={e=>set('titolare',e.target.value)}/></div>
                  <div className="form-group"><label className="form-label">N. registrazione</label><input className="form-input" value={form.n_registrazione||''} onChange={e=>set('n_registrazione',e.target.value)}/></div>
                  <div className="form-group"><label className="form-label">Data deposito</label><input className="form-input" value={form.data_deposito||''} onChange={e=>set('data_deposito',e.target.value)} placeholder="gg/mm/aaaa"/></div>
                  <div className="form-group"><label className="form-label">Scadenza</label><input className="form-input" value={form.data_scadenza||''} onChange={e=>set('data_scadenza',e.target.value)} placeholder="gg/mm/aaaa"/></div>
                  <div className="form-group"><label className="form-label">Territorio di tutela</label><input className="form-input" value={form.territorio||''} onChange={e=>set('territorio',e.target.value)} placeholder="Es. Italia, UE"/></div>
                </>)}

                {/* ══ AZIENDA / RAMO D'AZIENDA ══ */}
                {form.tipologia_siecic==="AZIENDA/RAMO D'AZIENDA" && (<>
                  <div className="form-section" style={{gridColumn:'1/-1'}}>Dati azienda</div>
                  <div className="form-group"><label className="form-label">Ragione sociale</label><input className="form-input" value={form.rag_soc||''} onChange={e=>set('rag_soc',e.target.value)}/></div>
                  <div className="form-group"><label className="form-label">CF / P.IVA</label><input className="form-input" value={form.cf_societa||''} onChange={e=>set('cf_societa',e.target.value)}/></div>
                  <div className="form-group"><label className="form-label">Sede legale</label><input className="form-input" value={form.sede_societa||''} onChange={e=>set('sede_societa',e.target.value)}/></div>
                  <div className="form-group"><label className="form-label">Settore ATECO</label><input className="form-input" value={form.ateco||''} onChange={e=>set('ateco',e.target.value)} placeholder="Es. 28.41"/></div>
                  <div className="form-group"><label className="form-label">N. dipendenti</label><input className="form-input" value={form.n_dipendenti||''} onChange={e=>set('n_dipendenti',e.target.value)}/></div>
                  <div className="form-group"><label className="form-label">Fatturato ultimo esercizio (€)</label><input className="form-input" value={form.fatturato||''} onChange={e=>set('fatturato',e.target.value)}/></div>
                </>)}

                {/* ── Note (sempre) ── */}
                <div className="form-col-full form-group">
                  <label className="form-label">Note</label>
                  <textarea className="form-input" value={form.note||''} onChange={e=>set('note',e.target.value)} rows={2} placeholder="Informazioni aggiuntive…"/>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: Valori ────────────────────────────────────────────────── */}
      {tab==='valori' && (
        <div className="card">
          <div className="card-header"><div className="card-title">💶 Valutazione economica</div></div>
          <div className="card-body">
            <div style={{fontSize:12,color:'var(--text3)',marginBottom:16}}>
              I valori vengono generati automaticamente dall'AI in base alle foto e ai dati dell'articolo, oppure possono essere inseriti manualmente.
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Valore di mercato (€)</label>
                <input type="number" className="form-input" value={form.val_mercato??0} onChange={e=>set('val_mercato',e.target.value)} min="0" step="1"
                  style={{fontSize:16,fontWeight:600}}/>
                <div style={{fontSize:11,color:'var(--text3)',marginTop:4}}>Valore commerciale realistico per bene usato</div>
              </div>
              <div className="form-group">
                <label className="form-label">Valore giudiziario (€)</label>
                <input type="number" className="form-input" value={form.val_giud??0} onChange={e=>set('val_giud',e.target.value)} min="0" step="1"
                  style={{fontSize:16,fontWeight:600,color:'var(--accent)'}}/>
                <div style={{fontSize:11,color:'var(--text3)',marginTop:4}}>Prezzo base per vendita giudiziaria (tipicamente 60-75% del mercato)</div>
              </div>
            </div>
            {(form.val_mercato > 0 && form.val_giud > 0) && (
              <div style={{marginTop:12,padding:'10px 14px',background:'var(--bg2)',borderRadius:8,fontSize:13}}>
                Abbattimento: <strong>{Math.round((1 - form.val_giud/form.val_mercato)*100)}%</strong> rispetto al valore di mercato
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: Danni ─────────────────────────────────────────────────── */}
      {tab==='danni' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title"><AlertTriangle size={14} style={{marginRight:6,color:'var(--accent-w)'}}/>Danni riscontrati</div>
          </div>
          <div className="card-body">
            <div style={{fontSize:12,color:'var(--text3)',marginBottom:12}}>
              Descrivi eventuali danni, difetti o anomalie riscontrate. Questo campo viene incluso nella relazione di stima e nella scheda di inventario.
            </div>
            <textarea className="form-input" value={form.danni||''} onChange={e=>set('danni',e.target.value)} rows={6}
              placeholder="Es: Graffi sulla carrozzeria lato destro, perdita olio dal paraolio anteriore, display con pixel danneggiati…"
              style={{width:'100%'}}/>
            {!form.danni && (
              <div style={{marginTop:8,fontSize:12,color:'var(--accent-g)'}}>✓ Nessun danno rilevato</div>
            )}
          </div>
        </div>
      )}

      {/* Azioni */}
      <div style={{display:'flex',justifyContent:'flex-end',gap:10,marginTop:20}}>
        <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvataggio…' : articolo?.id ? 'Aggiorna articolo' : 'Crea articolo'}
        </button>
      </div>
    </div>
  )
}


export default function Inventario() {
  const { currentProc, notify, profile } = useStore()
  const isAdmin = profile?.is_admin
  const navigate = useNavigate()
  const [articoli, setArticoli] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editArticolo, setEditArticolo] = useState(null)
  const [page, setPage] = useState(0)
  const [showFallcoModal, setShowFallcoModal] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [dataDeposito, setDataDeposito] = useState('')
  const [exportingFallco, setExportingFallco] = useState(false)
  const PER_PAGE = 25

  useEffect(() => {
    if (!currentProc) { navigate('/procedure'); return }
    loadArticoli()
  }, [currentProc, search, catFilter])

  const loadArticoli = useCallback(async () => {
    if (!currentProc) return
    setLoading(true)
    try {
      let q = supabase.from('v_articoli_con_foto').select('*').eq('proc_id', currentProc.id).order('created_at', { ascending: true })
      if (search) q = q.or(`desc_breve.ilike.%${search}%,marca.ilike.%${search}%`)
      if (catFilter) q = q.eq('categoria', catFilter)
      const { data, error } = await q
      if (error) throw error
      setArticoli(data || [])
    } catch (e) { notify('Errore: ' + e.message, 'err') }
    finally { setLoading(false) }
  }, [currentProc, search, catFilter])

  const deleteArticolo = async (id) => {
    if (!confirm('Eliminare questo articolo?')) return
    await supabase.from('articoli').delete().eq('id', id)
    loadArticoli()
    notify('Articolo eliminato', 'ok')
  }

  const genReport = async (estimativo) => {
    try {
      const { data: tutti, error } = await supabase.from('v_articoli_con_foto').select('*').eq('proc_id', currentProc.id).order('created_at', { ascending: true })
      if (error) throw error
      if (!tutti.length) { notify('Nessun articolo da esportare', 'warn'); return }
      // Carica tutte le foto per ogni articolo
      const { data: tutteFoto } = await supabase.from('foto').select('articolo_id, url, sort_order').eq('proc_id', currentProc.id).order('sort_order')
      const fotoPerArticolo = {}
      for (const f of (tutteFoto || [])) {
        if (!fotoPerArticolo[f.articolo_id]) fotoPerArticolo[f.articolo_id] = []
        fotoPerArticolo[f.articolo_id].push(f.url)
      }


      const studioLogo = localStorage.getItem('ip_logo') || ''
      const studioNome = localStorage.getItem('ip_studio_nome') || 'Pro.Ges.S. Srl'
      const studioIndirizzo = localStorage.getItem('ip_studio_indirizzo') || ''
      const footerTxt = studioNome + (studioIndirizzo ? '<br>' + studioIndirizzo : '')
      const logoHtml = studioLogo
        ? `<img src="${studioLogo}" style="max-height:70px;max-width:200px;object-fit:contain">`
        : `<div style="font-size:18px;font-weight:700;color:#1a3a6b">${studioNome}</div>`
      const makeQRUrl = (text) => `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent((text || 'INV').substring(0, 100))}`
      const proc = currentProc
      const fmtTipo = (t) => (t||'').replace(/_/g,' ').replace(/\b\w/g, l => l.toUpperCase())
      const titoloDoc = estimativo ? 'Report estimativo' : 'Report fotografico beni mobili'
      const coverTitle = estimativo ? 'REPORT ESTIMATIVO' : 'REPORT FOTOGRAFICO'
      const totVG = tutti.reduce((s, a) => s + (parseFloat(a.val_giud || 0) * parseFloat(a.qta || 1)), 0)
      const fmtEurLocal = (n) => { const parts = parseFloat(n || 0).toFixed(2).split('.'); parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.'); return '€ ' + parts[0] + ',' + parts[1]; }
      const procQR = makeQRUrl([(proc.tipo || ''), (proc.nome || ''), (proc.num ? proc.num + (proc.anno ? '/' + proc.anno : '') : '')].join(' '))

      const frontespizio = '<div style="page-break-after:always;min-height:100vh;display:flex;flex-direction:column;padding:50px 60px;background:#fff;box-sizing:border-box">'
        + '<div style="text-align:center;margin-bottom:auto">'
        + '<div style="margin-bottom:24px">' + logoHtml + '</div>'
        + '<div style="font-size:24px;font-weight:700;color:#1a1a16;letter-spacing:.03em;margin-bottom:28px">' + coverTitle + '</div>'
        + '<div style="font-size:17px;color:#333;margin-bottom:8px">' + fmtTipo(proc.tipo) + '</div>'
        + '<div style="font-size:15px;color:#555;margin-bottom:8px">N\u00b0 ' + (proc.num ? proc.num + (proc.anno ? '/' + proc.anno : '') : '') + '</div>'
        + '<div style="font-size:15px;color:#555">Tribunale di ' + (proc.tribunale || '') + '</div>'
        + (proc.nome ? '<div style="font-size:14px;font-weight:600;color:#333;margin-top:6px">' + proc.nome + '</div>' : '')
        + '</div>'
        + '<div style="text-align:center;margin-top:auto">'
        + (proc.giudice ? '<div style="font-size:14px;color:#333;margin-bottom:8px">Giudice Delegato: ' + proc.giudice + '</div>' : '')
        + (proc.curatore ? '<div style="font-size:14px;color:#333;margin-bottom:8px">Curatore: ' + proc.curatore + '</div>' : '')
        + '<div style="font-size:14px;color:#1a3a6b;font-weight:600;margin-bottom:8px">Commissionario: ' + studioNome + '</div>'
        + '<div style="margin-top:16px;border-top:1px solid #ddd;padding-top:8px;font-size:10px;color:#888">' + footerTxt + '</div>'
        + '</div></div>'

      // artRows ora generato nel bodyHtml

      const totBanner = estimativo ? '<div class="tot-banner-est"><b>Valore di Stima totale:</b> ' + fmtEurLocal(totVG) + '</div>' : ''
      const printBtn = '<div class="print-bar no-print"><div style="flex:1"><div style="font-weight:700;font-size:14px;margin-bottom:3px">\uD83D\uDCCB ' + titoloDoc + '</div>'
        + '<div style="font-size:11px;opacity:.9">\u2460 Clicca <b>Stampa/Salva PDF</b> &nbsp;\u2461 Destinazione: <b>Salva come PDF</b> &nbsp;\u2462 Disattiva <b>Intestazioni e pi\u00e8 di pagina</b> + attiva <b>Grafica di sfondo</b></div></div>'
        + '<button onclick="window.print()" class="print-btn">\uD83D\uDDB8 Stampa / Salva PDF</button></div>'
      const pageHdr = '<div class="page-hdr"><div>' + logoHtml + '</div>'
        + '<div style="display:flex;align-items:center;gap:10px">'
        + '<div class="page-hdr-info"><b>' + titoloDoc + '</b>' + fmtTipo(proc.tipo) + ' ' + (proc.nome || '') + '<br>n\u00b0 ' + (proc.num ? proc.num + (proc.anno ? '/' + proc.anno : '') : '') + ' - Tribunale di ' + (proc.tribunale || '') + '<br>'
        + (proc.giudice ? 'Giudice: <em>' + proc.giudice + '</em><br>' : '')
        + (proc.curatore ? 'Curatore: <em>' + proc.curatore + '</em>' : '') + '</div>'
        + '<img src="' + procQR + '" style="width:60px;height:60px">'
        + '</div></div>'
      const css = '@page{size:A4 portrait;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px;color:#222;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.print-bar{position:sticky;top:0;background:#1d4ed8;color:#fff;padding:10px 20px;display:flex;align-items:center;gap:16px;z-index:999}.print-btn{background:#fff;color:#1d4ed8;border:none;padding:8px 18px;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px}.page{width:210mm;min-height:297mm;padding:0;page-break-after:always;break-after:page;display:flex;flex-direction:column}.page:last-child{page-break-after:auto;break-after:auto}.page-inner{flex:1;padding:10mm 12mm 8mm}.page-hdr{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:6px;border-bottom:2px solid #2d6a7f;margin-bottom:12px}.page-hdr-info{text-align:right;font-size:9px;line-height:1.7;color:#333}.page-hdr-info b{font-size:11px;color:#000;display:block}.page-ftr{border-top:1px solid #ccc;padding:4px 12mm;font-size:9px;color:#666;display:flex;align-items:center;background:#fff}.card{border:1px solid #aaa;margin-bottom:12px;page-break-inside:avoid;break-inside:avoid}.card-hdr{background:#1a3a5c;color:#fff;display:flex;align-items:center;-webkit-print-color-adjust:exact;print-color-adjust:exact}.card-num{width:36px;min-height:36px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;background:rgba(255,255,255,.15)}.card-title{font-size:12px;font-weight:700;padding:8px 10px;flex:1}.card-body{width:100%;border-collapse:collapse;padding:6px 12px}.qr-cell{width:80px;vertical-align:top;padding:8px 4px 8px 8px}.meta-cell{vertical-align:top;padding:6px 10px 6px 10px}.meta-tbl{border-collapse:collapse}.lbl{font-weight:700;padding-right:6px;white-space:nowrap;line-height:1.8;vertical-align:top}.photos-wrap{padding:0 12px 10px}.photos-lbl{margin-bottom:4px}.photos-row{display:flex;flex-wrap:wrap;gap:6px}.photo{width:185px;height:138px;object-fit:cover;border:1px solid #ccc}.tot-banner-est{background:#8b1a1a;color:#fff;padding:14px 24px;margin-top:16px;font-size:16px;text-align:center;-webkit-print-color-adjust:exact;print-color-adjust:exact}@media print{.no-print{display:none!important}}'

      // Header ripetuto su ogni pagina
      const hdrHtml = '<div class="page-hdr"><div>' + logoHtml + '</div>'
        + '<div style="display:flex;align-items:center;gap:10px">'
        + '<div class="page-hdr-info"><b>' + titoloDoc + '</b>' + fmtTipo(proc.tipo) + ' ' + (proc.nome || '') + '<br>n\u00b0 ' + (proc.num ? proc.num + (proc.anno ? '/' + proc.anno : '') : '') + ' - Tribunale di ' + (proc.tribunale || '') + '<br>'
        + (proc.giudice ? 'Giudice: <em>' + proc.giudice + '</em><br>' : '')
        + (proc.curatore ? 'Curatore: <em>' + proc.curatore + '</em>' : '') + '</div>'
        + '<img src="' + procQR + '" style="width:56px;height:56px">'
        + '</div></div>'

      const totPages = Math.ceil(tutti.length / 2)
      const ftrHtml = (pageNum) => '<div class="page-ftr"><span style="flex:1;text-align:center">' + footerTxt + '</span><span style="white-space:nowrap">' + pageNum + ' di ' + totPages + '</span></div>'

      // Costruisce articoli in pagine da 2
      const artCards = tutti.map((a, i) => {
        const vg = parseFloat(a.val_giud || 0) * parseFloat(a.qta || 1)
        const artQR = makeQRUrl(a.codice_siecic || ('ART-' + (i + 1)))
        let metaLeft = ''
        metaLeft += '<tr><td class="lbl">Quantit\u00e0:</td><td>' + (a.qta || 1) + ' ' + (a.unita_misura || 'UN') + '</td></tr>'
        if (a.desc_breve || a.desc_estesa) metaLeft += '<tr><td class="lbl" style="vertical-align:top">Descrizione:</td><td>' + (a.desc_breve || '') + (a.desc_estesa ? '<br><span style="color:#555">' + a.desc_estesa + '</span>' : '') + '</td></tr>'
        let metaRight = ''
        if (a.stato) metaRight += '<tr><td class="lbl">Stato:</td><td>' + a.stato + '</td></tr>'
        if (a.marca) metaRight += '<tr><td class="lbl">Marca:</td><td>' + a.marca + '</td></tr>'
        if (a.modello) metaRight += '<tr><td class="lbl">Modello:</td><td>' + a.modello + '</td></tr>'
        if (a.matricola) metaRight += '<tr><td class="lbl">Matricola:</td><td>' + a.matricola + '</td></tr>'
        if (a.anno_prod) metaRight += '<tr><td class="lbl">Anno:</td><td>' + a.anno_prod + '</td></tr>'
        if (a.note) metaRight += '<tr><td class="lbl" style="vertical-align:top">Note:</td><td>' + a.note + '</td></tr>'
        const valoreHdr = estimativo ? '<div style="margin-left:auto;font-size:11px;font-weight:700;padding:0 10px;white-space:nowrap">Stima: ' + fmtEurLocal(vg) + '</div>' : ''
        let photosHtml = ''
        const artFotos = fotoPerArticolo[a.id] || (a.prima_foto_url ? [a.prima_foto_url] : [])
        if (artFotos.length > 0) photosHtml = '<div class="photos-wrap"><div class="photos-lbl"><b>Fotografie:</b></div><div class="photos-row">' + artFotos.map(url => '<img src="' + url + '" class="photo">').join('') + '</div></div>'
        return '<div class="card"><div class="card-hdr"><div class="card-num">' + (i + 1) + '</div><div class="card-title">' + (a.desc_breve || 'Articolo ' + (i + 1)) + '</div>' + valoreHdr + '</div>'
          + '<table class="card-body"><tr>'
          + '<td class="qr-cell"><img src="' + artQR + '" style="width:62px;height:62px"></td>'
          + '<td class="meta-cell"><table class="meta-tbl">' + metaLeft + '</table></td>'
          + (metaRight ? '<td class="meta-cell"><table class="meta-tbl">' + metaRight + '</table></td>' : '')
          + '</tr></table>' + photosHtml + '</div>'
      })

      // Raggruppa 2 articoli per pagina
      const contentPages = []
      for (let i = 0; i < artCards.length; i += 2) {
        const isLast = i + 2 >= artCards.length
        contentPages.push('<div class="page"><div class="page-inner">' + hdrHtml + artCards[i] + (artCards[i+1] || '') + (isLast && totBanner ? totBanner : '') + '</div>' + ftrHtml(Math.floor(i/2)+1) + '</div>')
      }

      const bodyHtml = printBtn + frontespizio + contentPages.join('')
      const html = '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>' + titoloDoc + '</title><style>' + css + '</style></head><body>' + bodyHtml + '</body></html>'
      const win = window.open('', '_blank')
      if (win) { win.document.write(html); win.document.close() }
      else notify('Abilita i popup per generare il report', 'warn')
      setShowReportModal(false)
    } catch (e) { notify('Errore: ' + e.message, 'err') }
  }

  const exportFallco = async () => {
    setExportingFallco(true)
    try {
      const { data: tutti, error } = await supabase.from('v_articoli_con_foto').select('*').eq('proc_id', currentProc.id).order('created_at', { ascending: true })
      if (error) throw error
      const fmtData = (d) => {
        if (!d) return ''
        const dt = new Date(d)
        if (isNaN(dt)) return d
        return String(dt.getDate()).padStart(2, '0') + '/' + String(dt.getMonth() + 1).padStart(2, '0') + '/' + dt.getFullYear()
      }
      const mapTipologia = (t) => {
        if (!t) return 'M'
        const tl = t.toUpperCase()
        if (tl.includes('IMMOBILE') || tl.includes('FABBRICATO') || tl.includes('TERRENO')) return 'I'
        if (tl.includes('AZIENDA') || tl.includes('RAMO')) return 'A'
        return 'M'
      }
      const righe = tutti.map(a => ({
        'Descrizione': a.desc_breve || '',
        'Tipologia': mapTipologia(a.tipologia_siecic),
        'Società/Socio': a.societa || '0',
        'Titolo': a.titolo_possesso || 'piena_proprieta',
        'Quota %': (a.titolo_possesso === 'piena_proprieta' || !a.titolo_possesso) ? '100' : (a.quota_pct || ''),
        'Codifica SIECIC': a.codice_siecic || '',
        'Società/Socio_1': '', 'Titolo_1': '', 'Quota %_1': '',
        'Società/Socio_2': '', 'Titolo_2': '', 'Quota %_2': '',
        'Società/Socio_3': '', 'Titolo_3': '', 'Quota %_3': '',
        'Misura': a.unita_misura || 'UN',
        'Quantità': a.qta || 1,
        'Valore di stima unitario': a.val_giud || 0,
        'Data deposito perizia': dataDeposito ? fmtData(dataDeposito) : '',
        'Nazione': 'Italia',
        'Provincia': currentProc.provincia || '',
        'Comune ': currentProc.comune || '',
        'Cap ': currentProc.cap || '',
        'Zip ': '',
        'Indirizzo': currentProc.indirizzo || '',
        'Quantità aggiudicata': '', 'Valore aggiudicato': '',
        'Data decreto di trasferimento': '', 'Operazione chiusa': '',
        'Codice Lotto': '', 'Descrizione Lotto': '',
        'Note': a.note || '',
        'Sezione': a.sezione || '', 'Foglio': a.foglio || '',
        'Particella': a.mappale || '', 'Subparticella': '',
        'Subalterno': a.subalterno || '', 'Graffato': '',
        'Categoria': a.classe_catastale || a.categoria || '',
        'Classe': a.classe || '', 'Catasto': a.comune_cat || '',
        'Superficie mq': a.superficie || '', 'Rendita Catastale': a.rendita || '',
        'Edificio': '', 'Scala': '', 'Interno': '', 'Piano': a.piano || '',
        'Numero vani': a.vani || '', 'Reddito Domenicale': '', 'Reddito Agrario': ''
      }))
      const ws = XLSX.utils.json_to_sheet(righe)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Inventario')
      const nomeFile = 'FALLCO_' + (currentProc.nome || '').replace(/\s+/g, '_') + '_' + new Date().toISOString().slice(0, 10) + '.xlsx'
      XLSX.writeFile(wb, nomeFile)
      notify('Export FALLCO completato', 'ok')
      setShowFallcoModal(false)
    } catch (e) { notify('Errore export: ' + e.message, 'err') }
    finally { setExportingFallco(false) }
  }

  const totValore = articoli.reduce((s, a) => s + (Number(a.val_giud || 0) * Number(a.qta || 1)), 0)
  const paginated = articoli.slice(page * PER_PAGE, (page + 1) * PER_PAGE)
  const totalPages = Math.ceil(articoli.length / PER_PAGE)

  if (!currentProc) return null

  return (
    <>
      <Topbar
        title="Inventario"
        subtitle={currentProc.nome}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            {isAdmin && <button className="btn btn-ghost btn-sm" onClick={() => setShowReportModal(true)}>📄 Report PDF</button>}
            <button className="btn btn-ghost btn-sm" onClick={() => setShowFallcoModal(true)}>
              <FileDown size={14} /> Export FALLCO
            </button>
            {isAdmin && <button className="btn btn-primary btn-sm" onClick={() => { setEditArticolo(null); setShowForm(true) }}>
              <Plus size={14} /> Nuovo articolo
            </button>}
          </div>
        }
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 20 }}>
          <div className="stat-card"><div className="stat-label">Totale articoli</div><div className="stat-value stat-blue">{articoli.length}</div></div>
          <div className="stat-card"><div className="stat-label">Valore giudiziario</div><div className="stat-value stat-green" style={{ fontSize: 18 }}>{totValore ? '€ ' + totValore.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</div></div>
          <div className="stat-card"><div className="stat-label">Visualizzati</div><div className="stat-value">{articoli.length}</div></div>
        </div>
        <div className="filter-bar">
          <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
            <input className="form-input" placeholder="Cerca articolo, marca…" style={{ paddingLeft: 32 }} value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
          </div>
          <select className="filter-select" value={catFilter} onChange={e => { setCatFilter(e.target.value); setPage(0) }}>
            <option value="">Tutte le categorie</option>
            {TIPOLOGIE_SIECIC.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="table-card">
          {loading ? <Spinner /> : articoli.length === 0 ? (
            <Empty icon="📦" title="Nessun articolo" sub={search ? 'Nessun risultato per la ricerca' : "Crea il primo articolo dell'inventario"} />
          ) : (
            <>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 50 }}></th>
                    <th>Descrizione</th>
                    <th>Marca / Modello</th>
                    <th>Categoria</th>
                    <th>Q.tà</th>
                    <th>Val. Giud.</th>
                    <th>Stato</th>
                    <th style={{ width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(a => (
                    <tr key={a.id} onClick={() => isAdmin && ( setEditArticolo(a), setShowForm(true) )} style={{cursor: isAdmin ? "pointer" : "default"}}>
                      <td onClick={e => e.stopPropagation()}>
                        {a.prima_foto_url
                          ? <img src={a.prima_foto_url} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)' }} />
                          : <div style={{ width: 36, height: 36, background: 'var(--bg3)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>📦</div>
                        }
                      </td>
                      <td style={{ fontWeight: 500 }}>{a.desc_breve || '—'}{a.n_foto > 0 && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text3)' }}>📷{a.n_foto}</span>}</td>
                      <td className="muted">{[a.marca, a.modello].filter(Boolean).join(' ') || '—'}</td>
                      <td><span className="badge badge-blue" style={{ fontSize: 10 }}>{a.categoria || '—'}</span></td>
                      <td className="mono">{a.qta} {a.unita_misura}</td>
                      <td className="mono">{fmtEur(Number(a.val_giud || 0) * Number(a.qta || 1))}</td>
                      <td><span className={`badge ${a.stato === 'ottimo' || a.stato === 'buono' ? 'badge-green' : a.stato === 'discreto' ? 'badge-yellow' : 'badge-red'}`}>{a.stato || '—'}</span></td>
                      <td onClick={e => e.stopPropagation()}>
                        {isAdmin && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent-r)', padding: '4px 8px' }} onClick={() => deleteArticolo(a.id)}><Trash2 size={13} /></button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {totalPages > 1 && (
                <div className="pagination">
                  <div className="pagination-info">{page * PER_PAGE + 1}–{Math.min((page + 1) * PER_PAGE, articoli.length)} di {articoli.length}</div>
                  <div className="pagination-btns">
                    <button className="page-btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>←</button>
                    {Array.from({ length: totalPages }, (_, i) => <button key={i} className={`page-btn ${i === page ? 'active' : ''}`} onClick={() => setPage(i)}>{i + 1}</button>)}
                    <button className="page-btn" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>→</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Modal open={showReportModal} onClose={() => setShowReportModal(false)} title="Genera Report PDF">
        <div style={{ padding: '8px 0' }}>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>Scegli il tipo di report per i {articoli.length} articoli dell'inventario.</p>
          <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
            <div style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 8, padding: 16, textAlign: 'center', cursor: 'pointer' }} onClick={() => genReport(false)}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📷</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Report fotografico</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>Frontespizio + foto + descrizioni</div>
            </div>
            <div style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 8, padding: 16, textAlign: 'center', cursor: 'pointer' }} onClick={() => genReport(true)}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>💰</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Report estimativo</div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>Valori mercato + giudiziale + totale</div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={() => setShowReportModal(false)}>Annulla</button>
          </div>
        </div>
      </Modal>

      <Modal open={showFallcoModal} onClose={() => setShowFallcoModal(false)} title="Export FALLCO">
        <div style={{ padding: '8px 0' }}>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>Genera il file Excel nel formato FALLCO con tutti i {articoli.length} articoli dell'inventario.</p>
          <div className="form-group">
            <label className="form-label">Data deposito perizia</label>
            <input type="date" className="form-input" value={dataDeposito} onChange={e => setDataDeposito(e.target.value)} />
            <span style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, display: 'block' }}>Lascia vuoto se non ancora depositata</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
            <button className="btn btn-ghost" onClick={() => setShowFallcoModal(false)}>Annulla</button>
            <button className="btn btn-primary" onClick={exportFallco} disabled={exportingFallco}>
              <FileDown size={14} /> {exportingFallco ? 'Generazione…' : 'Scarica FALLCO.xlsx'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editArticolo ? 'Modifica articolo' : 'Nuovo articolo'} wide>
        <ArticoloForm articolo={editArticolo} procId={currentProc.id} onClose={() => setShowForm(false)} onSave={() => { setShowForm(false); loadArticoli() }} />
      </Modal>
    </>
  )
}
