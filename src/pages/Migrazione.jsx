import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Topbar } from '../components/layout'

const TIPO_MAP = {
  'Liquidazione giudiziale':       'liquidazione_giudiziale',
  'Liquidazione controllata':      'liquidazione_controllata',
  'Concordato preventivo':         'concordato_preventivo',
  'Amministrazione straordinaria': 'amministrazione_straordinaria',
}

export default function Migrazione() {
  const navigate = useNavigate()
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
      setFileInfo(`✅ ${file.name} — ${data.procedure?.length || 0} procedure, ${data.articoli?.length || 0} articoli`)
      setLog([])
    } catch (err) {
      setFileInfo('❌ Errore lettura file: ' + err.message)
    }
  }

  const avvia = async () => {
    if (!backup) return
    setRunning(true)
    setLog([])
    setProgress(0)

    const procIdMap = {}
    const totale = (backup.procedure?.length || 0) + (backup.articoli?.length || 0)
    let fatto = 0

    // ── PROCEDURE ────────────────────────────────────────────────────────
    addLog('📋 Migrazione procedure…', 'info')
    for (const p of (backup.procedure || [])) {
      try {
        const payload = {
          nome:           p.nome            || '',
          tipo:           TIPO_MAP[p.tipo]  || 'liquidazione_giudiziale',
          num:            p.num             || '',
          tribunale:      p.tribunale       || '',
          giudice:        p.giudice         || '',
          curatore:       p.curatore        || '',
          curatore_cf:    p.curatoreCF      || '',
          curatore_email: p.curatoreEmail   || '',
          commissionario: p.commissionario  || '',
          data_apertura:  p.data            || null,
          status:         p.status === 'attiva' ? 'attiva' : 'archiviata',
        }

        const { data: ex } = await supabase.from('procedure')
          .select('id').eq('nome', payload.nome).eq('num', payload.num).maybeSingle()

        if (ex) {
          addLog(`  ⏭  ${p.nome} — già presente`, 'warn')
          procIdMap[p.id] = ex.id
        } else {
          const { data, error } = await supabase.from('procedure').insert(payload).select('id').single()
          if (error) throw error
          procIdMap[p.id] = data.id
          addLog(`  ✅ ${p.nome}`, 'ok')
        }
      } catch (err) {
        addLog(`  ❌ ${p.nome}: ${err.message}`, 'err')
      }
      fatto++
      setProgress(Math.round(fatto / totale * 100))
    }

    // ── ARTICOLI ─────────────────────────────────────────────────────────
    addLog('\n📦 Migrazione articoli…', 'info')
    let artOk = 0, artErr = 0

    for (const a of (backup.articoli || [])) {
      try {
        const newProcId = procIdMap[a.procId]
        if (!newProcId) {
          addLog(`  ⚠  Procedura non trovata: ${a.descBreve}`, 'warn')
          artErr++; fatto++
          setProgress(Math.round(fatto / totale * 100))
          continue
        }

        const photos = a.photos || []
        const payload = {
          proc_id:          newProcId,
          tipologia_siecic: a.tipologiaSiecic || 'BENE MOBILE',
          sottocategoria:   a.sottocategoria  || '',
          desc_breve:       a.descBreve       || '',
          desc_estesa:      a.descEstesa      || '',
          marca:            a.marca           || '',
          modello:          a.modello         || '',
          anno_prod:        a.anno            || '',
          km:               a.km              || '',
          matricola:        a.serial          || '',
          qta:              Number(a.qta)     || 1,
          unita_misura:     a.misura          || 'UN',
          stato:            a.stato           || '',
          val_mercato:      a.valMercato ? Number(a.valMercato) : null,
          val_giud:         a.valGiud    ? Number(a.valGiud)    : null,
          danni:            a.danni           || '',
          note:             a.note            || '',
          sort_order:       0,
        }

        const { data: exArt } = await supabase.from('articoli')
          .select('id').eq('proc_id', newProcId).eq('desc_breve', payload.desc_breve).maybeSingle()

        let artId
        if (exArt) {
          artId = exArt.id
          // Non logghiamo "già presente" qui — lo faremo dopo le foto
        } else {
          const { data, error } = await supabase.from('articoli').insert(payload).select('id').single()
          if (error) throw error
          artId = data.id
          artOk++
        }

        // Foto
        if (photos.length > 0) {
          let fotoOk = 0
          for (let i = 0; i < photos.length; i++) {
            const photoData = photos[i]
            if (!photoData?.startsWith('data:image')) continue
            try {
              const [header, b64] = photoData.split(',')
              const mime = header.match(/:(.*?);/)[1]
              const bin  = atob(b64)
              const arr  = new Uint8Array(bin.length)
              for (let j = 0; j < bin.length; j++) arr[j] = bin.charCodeAt(j)
              const blob = new Blob([arr], { type: mime })
              const ext  = mime.includes('png') ? 'png' : 'jpg'
              const path = `${newProcId}/${artId}/foto_${i + 1}.${ext}`

              const { error: upErr } = await supabase.storage.from('foto-articoli')
                .upload(path, blob, { contentType: mime, upsert: true })
              if (upErr && !upErr.message.includes('already exists')) throw upErr

              const { data: urlD } = supabase.storage.from('foto-articoli').getPublicUrl(path)
              await supabase.from('foto_articoli').upsert(
                { articolo_id: artId, url: urlD.publicUrl, sort_order: i },
                { onConflict: 'articolo_id,sort_order' }
              )
              fotoOk++
            } catch (fe) {
              addLog(`    ⚠  foto ${i + 1} di "${a.descBreve}": ${fe.message}`, 'warn')
            }
          }
          if (exArt)  addLog(`  📷 ${a.descBreve} — ${fotoOk} foto caricate`, 'ok')
          else        addLog(`  ✅ ${a.descBreve} (${fotoOk} foto)`, 'ok')
        } else {
          if (exArt)  addLog(`  ⏭  ${a.descBreve} — già presente`, 'warn')
          else        addLog(`  ✅ ${a.descBreve}`, 'ok')
        }
      } catch (err) {
        addLog(`  ❌ ${a.descBreve}: ${err.message}`, 'err')
        artErr++
      }
      fatto++
      setProgress(Math.round(fatto / totale * 100))
    }

    // Logo
    if (backup.settings?.logo) {
      localStorage.setItem('ip_logo', backup.settings.logo)
      addLog('\n✅ Logo Pro.Ges.S. salvato in Impostazioni', 'ok')
    }

    setProgress(100)
    addLog(`\n🎉 COMPLETATO — ${artOk} articoli importati, ${artErr} errori`, 'ok')
    setRunning(false)
  }

  const colorMap = { ok: '#4ade80', err: '#f87171', warn: '#facc15', info: '#60a5fa' }

  return (
    <>
      <Topbar title="Migrazione dati" subtitle="Importa il backup da InventPro HTML" />
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><div className="card-title">1. Seleziona file di backup</div></div>
          <div className="card-body">
            <input type="file" accept=".json" onChange={handleFile}
              style={{ display: 'block', marginBottom: 12, color: 'var(--text2)' }} />
            {fileInfo && <div style={{ fontSize: 13, color: 'var(--text2)' }}>{fileInfo}</div>}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">2. Avvia migrazione</div></div>
          <div className="card-body">
            <button className="btn btn-primary"
              onClick={avvia} disabled={!backup || running}>
              {running ? '⏳ Migrazione in corso…' : '▶ Avvia migrazione'}
            </button>

            {progress > 0 && (
              <div style={{ margin: '12px 0' }}>
                <div style={{ background: 'var(--border)', borderRadius: 4, height: 8 }}>
                  <div style={{ background: 'var(--accent)', borderRadius: 4, height: 8,
                    width: progress + '%', transition: 'width 0.3s' }} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>{progress}%</div>
              </div>
            )}

            {log.length > 0 && (
              <div ref={logRef} style={{
                background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: 16,
                fontFamily: 'DM Mono, monospace', fontSize: 12, lineHeight: 1.7,
                maxHeight: 400, overflowY: 'auto', marginTop: 16
              }}>
                {log.map((l, i) => (
                  <div key={i} style={{ color: colorMap[l.type] || 'var(--text2)', whiteSpace: 'pre-wrap' }}>
                    {l.msg}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
