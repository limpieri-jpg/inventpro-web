import { useState, useRef } from 'react'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'
import { Topbar } from '../components/layout'
import { Download, Upload, Database } from 'lucide-react'

const TIPO_MAP = {
  'Liquidazione giudiziale':       'liquidazione_giudiziale',
  'Liquidazione controllata':      'liquidazione_controllata',
  'Concordato preventivo':         'concordato_preventivo',
  'Amministrazione straordinaria': 'amministrazione_straordinaria',
}

// ─── Tab Backup totale ─────────────────────────────────────────────────────────
function TabBackup() {
  const { notify } = useStore()
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress]   = useState('')

  const esportaTutto = async () => {
    setExporting(true)
    try {
      setProgress('Caricamento procedure…')
      const { data: procedure } = await supabase.from('procedure').select('*, sedi(*)')
      
      setProgress('Caricamento articoli…')
      const { data: articoli } = await supabase.from('articoli').select('*')
      
      setProgress('Caricamento foto…')
      const { data: foto } = await supabase.from('foto').select('id,url,storage_path,proc_id,articolo_id,sort_order,created_at')
      
      setProgress('Caricamento lotti…')
      const { data: lotti } = await supabase.from('lotti').select('*, lotti_articoli(articolo_id)')
      
      setProgress('Caricamento avvisi…')
      const { data: avvisi } = await supabase.from('avvisi').select('*')
      
      setProgress('Caricamento utenti…')
      const { data: profili } = await supabase.from('profiles').select('id,nome,cognome,titolo,ruolo,email,cf,tel,pec,is_admin,is_active')
      
      setProgress('Caricamento assegnazioni…')
      const { data: assegnazioni } = await supabase.from('procedure_utenti').select('*')

      const backup = {
        versione: '2.0',
        tipo: 'backup_completo',
        data_export: new Date().toISOString(),
        stats: {
          procedure: procedure?.length || 0,
          articoli: articoli?.length || 0,
          foto: foto?.length || 0,
          lotti: lotti?.length || 0,
          avvisi: avvisi?.length || 0,
          profili: profili?.length || 0,
        },
        procedure: procedure || [],
        articoli: articoli || [],
        foto: foto || [],
        lotti: lotti || [],
        avvisi: avvisi || [],
        profili: profili || [],
        assegnazioni: assegnazioni || [],
        impostazioni: {
          studio_nome: localStorage.getItem('ip_studio_nome') || '',
          studio_indirizzo: localStorage.getItem('ip_studio_indirizzo') || '',
          conti_commissionario: localStorage.getItem('ip_conti_commissionario') || '[]',
          logo: localStorage.getItem('ip_logo') || '',
        }
      }

      setProgress('Generazione file…')
      const json = JSON.stringify(backup, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const data = new Date().toISOString().slice(0,10)
      const fileName = `inventpro_backup_completo_${data}.json`

      // Prova con File System Access API (selezione cartella)
      if (window.showSaveFilePicker) {
        try {
          const fileHandle = await window.showSaveFilePicker({
            suggestedName: fileName,
            types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
          })
          const writable = await fileHandle.createWritable()
          await writable.write(blob)
          await writable.close()
        } catch(e) {
          if (e.name === 'AbortError') { setExporting(false); setProgress(''); return }
          // Fallback download standard
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a'); a.href = url; a.download = fileName; a.click(); URL.revokeObjectURL(url)
        }
      } else {
        // Fallback per browser senza File System Access API
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = fileName; a.click(); URL.revokeObjectURL(url)
      }
      setProgress(`✅ Backup completato — ${backup.stats.procedure} procedure, ${backup.stats.articoli} articoli, ${backup.stats.foto} foto`)
    } catch(e) {
      setProgress('❌ Errore: ' + e.message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div className="card">
        <div className="card-header"><div className="card-title">📦 Backup completo sistema</div></div>
        <div className="card-body">
          <p style={{fontSize:13,color:'var(--text2)',marginBottom:16,lineHeight:1.7}}>
            Esporta tutti i dati in un unico file JSON:<br/>
            <strong>Procedure</strong> (con sedi), <strong>Articoli</strong>, <strong>Foto</strong> (URL), <strong>Lotti</strong>, <strong>Avvisi di vendita</strong>, <strong>Profili utenti</strong>, <strong>Assegnazioni procedure</strong>, <strong>Impostazioni studio</strong>.
          </p>
          <button className="btn btn-primary" onClick={esportaTutto} disabled={exporting}>
            <Download size={14}/> {exporting ? 'Esportazione…' : 'Scarica backup completo'}
          </button>
          {progress && (
            <div style={{marginTop:12,fontSize:13,color:progress.startsWith('✅')?'var(--accent-g)':progress.startsWith('❌')?'var(--accent-r)':'var(--text3)'}}>
              {progress}
            </div>
          )}
          <div style={{marginTop:16,padding:'12px 14px',background:'rgba(59,111,255,0.06)',border:'1px solid rgba(59,111,255,0.2)',borderRadius:8,fontSize:12,color:'var(--text3)'}}>
            💡 Le foto vengono salvate come URL (link allo storage Supabase), non come file immagine. Per esportare le immagini fisicamente usa il bottone <strong>Esporta foto in cartella</strong> nella scheda Anagrafica di ogni procedura.
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Tab Ripristino / Migrazione ──────────────────────────────────────────────
function TabRipristino() {
  const [backup, setBackup]     = useState(null)
  const [fileInfo, setFileInfo] = useState('')
  const [log, setLog]           = useState([])
  const [running, setRunning]   = useState(false)
  const [progress, setProgress] = useState(0)
  const logRef = useRef(null)

  const addLog = (msg, type = 'info') => {
    setLog(prev => [...prev, { msg, type }])
    setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, 50)
  }

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      setBackup(data)
      const isCompleto = data.tipo === 'backup_completo'
      const stats = data.stats || {}
      setFileInfo(`✅ ${file.name} — ${isCompleto ? 'Backup completo v'+data.versione : 'Backup InventPro HTML'} — ${data.procedure?.length || stats.procedure || 0} procedure, ${data.articoli?.length || stats.articoli || 0} articoli`)
      setLog([])
    } catch (err) {
      setFileInfo('❌ Errore lettura file: ' + err.message)
    }
  }

  const avvia = async () => {
    if (!backup) return
    setRunning(true); setLog([]); setProgress(0)
    const procIdMap = {}
    const isCompleto = backup.tipo === 'backup_completo'

    // Se è un backup completo v2.0 — ripristino diretto
    if (isCompleto) {
      addLog('🔄 Ripristino backup completo InventPro…', 'info')
      
      // Procedure
      addLog('\n📋 Ripristino procedure…', 'info')
      let pOk = 0
      for (const p of (backup.procedure || [])) {
        const { sedi: _, ...pClean } = p
        const { data: ex } = await supabase.from('procedure').select('id').eq('id', p.id).maybeSingle()
        if (ex) {
          await supabase.from('procedure').update(pClean).eq('id', p.id)
          procIdMap[p.id] = p.id
          addLog(`  ⏭  ${p.nome} — aggiornata`, 'warn')
        } else {
          const { error } = await supabase.from('procedure').insert(pClean)
          if (error) { addLog(`  ❌ ${p.nome}: ${error.message}`, 'err'); continue }
          procIdMap[p.id] = p.id; pOk++
          addLog(`  ✅ ${p.nome}`, 'ok')
        }
      }

      // Sedi
      addLog('\n📍 Ripristino sedi…', 'info')
      for (const p of (backup.procedure || [])) {
        for (const s of (p.sedi || [])) {
          await supabase.from('sedi').upsert(s)
        }
      }

      // Articoli
      addLog('\n📦 Ripristino articoli…', 'info')
      let aOk = 0
      for (const a of (backup.articoli || [])) {
        const { data: ex } = await supabase.from('articoli').select('id').eq('id', a.id).maybeSingle()
        if (ex) { await supabase.from('articoli').update(a).eq('id', a.id); addLog(`  ⏭  ${a.desc_breve}`, 'warn') }
        else {
          const { error } = await supabase.from('articoli').insert(a)
          if (error) { addLog(`  ❌ ${a.desc_breve}: ${error.message}`, 'err'); continue }
          aOk++; addLog(`  ✅ ${a.desc_breve}`, 'ok')
        }
      }

      // Lotti
      addLog('\n🗂 Ripristino lotti…', 'info')
      for (const l of (backup.lotti || [])) {
        const { lotti_articoli, ...lClean } = l
        await supabase.from('lotti').upsert(lClean)
        for (const la of (lotti_articoli || [])) {
          await supabase.from('lotti_articoli').upsert({ lotto_id: l.id, articolo_id: la.articolo_id })
        }
      }

      // Foto (solo metadati, le immagini restano sullo storage)
      addLog('\n📷 Ripristino metadati foto…', 'info')
      for (const f of (backup.foto || [])) {
        await supabase.from('foto').upsert(f)
      }

      // Avvisi
      addLog('\n📄 Ripristino avvisi…', 'info')
      for (const av of (backup.avvisi || [])) {
        await supabase.from('avvisi').upsert(av)
      }

      // Impostazioni localStorage
      if (backup.impostazioni) {
        const imp = backup.impostazioni
        if (imp.studio_nome) localStorage.setItem('ip_studio_nome', imp.studio_nome)
        if (imp.studio_indirizzo) localStorage.setItem('ip_studio_indirizzo', imp.studio_indirizzo)
        if (imp.conti_commissionario) localStorage.setItem('ip_conti_commissionario', imp.conti_commissionario)
        if (imp.logo) localStorage.setItem('ip_logo', imp.logo)
        addLog('\n✅ Impostazioni studio ripristinate', 'ok')
      }

      setProgress(100)
      addLog(`\n🎉 RIPRISTINO COMPLETATO`, 'ok')
      setRunning(false)
      return
    }

    // ── Migrazione da InventPro HTML (vecchio formato) ────────────────────
    addLog('📋 Migrazione da InventPro HTML…', 'info')
    const totale = (backup.procedure?.length || 0) + (backup.articoli?.length || 0)
    let fatto = 0

    for (const p of (backup.procedure || [])) {
      try {
        const payload = {
          nome: p.nome||'', tipo: TIPO_MAP[p.tipo]||'liquidazione_giudiziale',
          num: p.num||'', tribunale: p.tribunale||'', giudice: p.giudice||'',
          curatore: p.curatore||'', commissionario: p.commissionario||'',
          data_apertura: p.data||null, status: p.status==='attiva'?'attiva':'archiviata',
        }
        const { data: ex } = await supabase.from('procedure').select('id').eq('nome', payload.nome).eq('num', payload.num).maybeSingle()
        if (ex) { addLog(`  ⏭  ${p.nome} — già presente`, 'warn'); procIdMap[p.id] = ex.id }
        else {
          const { data, error } = await supabase.from('procedure').insert(payload).select('id').single()
          if (error) throw error
          procIdMap[p.id] = data.id
          addLog(`  ✅ ${p.nome}`, 'ok')
        }
      } catch(err) { addLog(`  ❌ ${p.nome}: ${err.message}`, 'err') }
      fatto++; setProgress(Math.round(fatto/totale*100))
    }

    addLog('\n📦 Migrazione articoli…', 'info')
    let artOk = 0, artErr = 0
    for (const a of (backup.articoli || [])) {
      try {
        const newProcId = procIdMap[a.procId]
        if (!newProcId) { addLog(`  ⚠  Procedura non trovata: ${a.descBreve}`, 'warn'); artErr++; fatto++; setProgress(Math.round(fatto/totale*100)); continue }
        const photos = a.photos || []
        const payload = {
          proc_id: newProcId, tipologia_siecic: a.tipologiaSiecic||'BENE MOBILE',
          sottocategoria: a.sottocategoria||'', desc_breve: a.descBreve||'',
          desc_estesa: a.descEstesa||'', marca: a.marca||'', modello: a.modello||'',
          anno_prod: a.anno||'', km: a.km||'', matricola: a.serial||'',
          qta: Number(a.qta)||1, unita_misura: a.misura||'UN', stato: a.stato||'',
          val_mercato: a.valMercato?Number(a.valMercato):null, val_giud: a.valGiud?Number(a.valGiud):null,
          danni: a.danni||'', note: a.note||'', sort_order: 0,
        }
        const { data: exArt } = await supabase.from('articoli').select('id').eq('proc_id', newProcId).eq('desc_breve', payload.desc_breve).maybeSingle()
        let artId
        if (exArt) { artId = exArt.id }
        else {
          const { data, error } = await supabase.from('articoli').insert(payload).select('id').single()
          if (error) throw error
          artId = data.id; artOk++
        }
        if (photos.length > 0) {
          let fotoOk = 0
          for (let i = 0; i < photos.length; i++) {
            const photoData = photos[i]
            if (!photoData?.startsWith('data:image')) continue
            try {
              const [header, b64] = photoData.split(',')
              const mime = header.match(/:(.*?);/)[1]
              const bin = atob(b64); const arr = new Uint8Array(bin.length)
              for (let j = 0; j < bin.length; j++) arr[j] = bin.charCodeAt(j)
              const blob = new Blob([arr], {type: mime})
              const ext = mime.includes('png')?'png':'jpg'
              const path = `${newProcId}/${artId}/foto_${i+1}.${ext}`
              const { error: upErr } = await supabase.storage.from('foto-inventario').upload(path, blob, {contentType:mime, upsert:true})
              if (upErr && !upErr.message.includes('already exists')) throw upErr
              const { data: urlD } = supabase.storage.from('foto-inventario').getPublicUrl(path)
              await supabase.from('foto').insert({articolo_id:artId, proc_id:newProcId, storage_path:path, url:urlD.publicUrl, sort_order:i})
              fotoOk++
            } catch(fe) { addLog(`    ⚠  foto ${i+1}: ${fe.message}`, 'warn') }
          }
          addLog(`  ✅ ${a.descBreve} (${fotoOk} foto)`, 'ok')
        } else {
          addLog(exArt ? `  ⏭  ${a.descBreve}` : `  ✅ ${a.descBreve}`, exArt?'warn':'ok')
        }
      } catch(err) { addLog(`  ❌ ${a.descBreve}: ${err.message}`, 'err'); artErr++ }
      fatto++; setProgress(Math.round(fatto/totale*100))
    }
    if (backup.settings?.logo) { localStorage.setItem('ip_logo', backup.settings.logo); addLog('\n✅ Logo salvato', 'ok') }
    setProgress(100)
    addLog(`\n🎉 COMPLETATO — ${artOk} articoli, ${artErr} errori`, 'ok')
    setRunning(false)
  }

  const colorMap = { ok:'#4ade80', err:'#f87171', warn:'#facc15', info:'#60a5fa' }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div className="card">
        <div className="card-header"><div className="card-title">📂 Ripristino da backup</div></div>
        <div className="card-body">
          <div style={{fontSize:13,color:'var(--text2)',marginBottom:16,lineHeight:1.7}}>
            Carica un file di backup per ripristinare i dati. Supporta:<br/>
            <strong>• Backup completo InventPro</strong> (formato v2.0 — ripristino fedele)<br/>
            <strong>• Backup InventPro HTML</strong> (vecchio formato — migrazione)
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div>
              <label style={{display:'block',fontSize:12,color:'var(--text3)',marginBottom:6}}>Seleziona file backup (.json)</label>
              <input type="file" accept=".json" onChange={handleFile}
                style={{display:'block',color:'var(--text2)'}}/>
              {fileInfo && <div style={{fontSize:13,color:'var(--text2)',marginTop:8}}>{fileInfo}</div>}
            </div>
            <button className="btn btn-primary" onClick={avvia} disabled={!backup||running} style={{alignSelf:'flex-start'}}>
              <Upload size={14}/> {running ? '⏳ Ripristino in corso…' : '▶ Avvia ripristino'}
            </button>
          </div>
          {progress > 0 && (
            <div style={{margin:'12px 0'}}>
              <div style={{background:'var(--border)',borderRadius:4,height:8}}>
                <div style={{background:'var(--accent)',borderRadius:4,height:8,width:progress+'%',transition:'width 0.3s'}}/>
              </div>
              <div style={{fontSize:12,color:'var(--text3)',marginTop:4}}>{progress}%</div>
            </div>
          )}
          {log.length > 0 && (
            <div ref={logRef} style={{background:'rgba(0,0,0,0.3)',borderRadius:8,padding:16,fontFamily:'monospace',fontSize:12,lineHeight:1.7,maxHeight:400,overflowY:'auto',marginTop:16}}>
              {log.map((l,i) => (
                <div key={i} style={{color:colorMap[l.type]||'var(--text2)',whiteSpace:'pre-wrap'}}>{l.msg}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Pagina principale ────────────────────────────────────────────────────────
export default function Backup() {
  const [tab, setTab] = useState('backup')

  const TABS = [
    { id: 'backup',     label: 'Backup completo',  icon: Database },
    { id: 'ripristino', label: 'Ripristino / Import', icon: Upload },
  ]

  return (
    <>
      <Topbar title="Backup & Ripristino" subtitle="Esporta e importa i dati del sistema"/>
      <div style={{flex:1,overflowY:'auto',padding:24}}>
        <div className="tabs" style={{marginBottom:24}}>
          {TABS.map(t => (
            <div key={t.id} className={`tab ${tab===t.id?'active':''}`} onClick={()=>setTab(t.id)}>
              <t.icon size={13} style={{marginRight:6,verticalAlign:'middle'}}/>{t.label}
            </div>
          ))}
        </div>
        {tab==='backup'     && <TabBackup/>}
        {tab==='ripristino' && <TabRipristino/>}
      </div>
    </>
  )
}
