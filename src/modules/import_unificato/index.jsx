import { useState, useEffect, useRef, useCallback } from 'react'
import { useAIStatus } from '../../context/AIStatusContext'
import { trace } from '../../core/debug/trace'
import { processImportedFiles, confirmImportedDocument } from './application/importWorkflow.js'
import { buildBulkConfirmFormFromDocument } from './application/importMappers.js'
import {
  getPreferredSocietaId,
  getStoredAiMode,
  getStoredAiPreprocessMode,
  persistAiMode,
  persistAiPreprocessMode,
  persistSelectedSocieta,
} from './application/importContainerStorage.js'
import * as importRepo from './data/importRepo.js'
import { ImportDropzone } from './components/ImportDropzone.jsx'
import { ImportControlBar } from './components/ImportControlBar.jsx'
import { ImportDocumentsList } from './components/ImportDocumentsList.jsx'
import { TIPI_DOCUMENTO, ALIQUOTE_IVA, fmt } from './components/importUiConfig.js'

export function ModuloImportUnificato({ ruolo }) {
  const ai = useAIStatus()
  const fileInputRef = useRef()
  const dropRef = useRef()

  const [aiEnabled, setAiEnabled] = useState(true)
  const [causaliIva, setCausaliIva] = useState([])
  const [causaliContabili, setCausaliContabili] = useState([])
  const [societa, setSocieta] = useState([])
  const [societaId, setSocietaId] = useState('')
  const [clienti, setClienti] = useState([])
  const [pianoConti, setPianoConti] = useState([])
  const [documenti, setDocumenti] = useState([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [societaImportHint, setSocietaImportHint] = useState('')
  const [bulkConfirming, setBulkConfirming] = useState(false)
  const [tipoManuale, setTipoManuale] = useState('')
  const [aiMode, setAiMode] = useState(() => getStoredAiMode())
  const [aiPreprocessMode, setAiPreprocessMode] = useState(() => getStoredAiPreprocessMode())

  useEffect(() => persistAiMode(aiMode), [aiMode])

  useEffect(() => persistAiPreprocessMode(aiPreprocessMode), [aiPreprocessMode])

  useEffect(() => {
    if (societaId) setSocietaImportHint('')
  }, [societaId])

  const caricaDocumenti = useCallback(async () => {
    if (!societaId) return
    const { data } = await importRepo.getDocumentiImportInStaging(societaId)
    setDocumenti(data || [])
    trace('LOAD DATA', { count: data?.length, societa_id: societaId })
  }, [societaId])

  useEffect(() => {
    importRepo.getSocietaAttive().then(({ data }) => {
      const list = data || []
      setSocieta(list)
      if (!list.length) return
      setSocietaId(getPreferredSocietaId(list))
    })
    importRepo.getImpostazioneStudioAiEnabled().then(({ data }) => {
      const val = Array.isArray(data) ? data[0]?.valore : data?.valore
      setAiEnabled(val !== 'false')
    })
  }, [])

  useEffect(() => {
    if (!societaId) return
    importRepo.getClientiAttivi().then(({ data }) => setClienti(data || []))
    importRepo.getPianoContiBySocieta(societaId).then(({ data }) => setPianoConti(data || []))
    importRepo.getCausaliContabiliBySocieta(societaId).then(({ data }) => setCausaliContabili(data || []))
    importRepo.getCausaliIvaAttive().then(({ data }) => setCausaliIva(data || []))
    caricaDocumenti()
  }, [societaId, caricaDocumenti])

  useEffect(() => {
    const el = dropRef.current
    if (!el) return
    const over = (e) => {
      e.preventDefault()
      if (societaId) setDragOver(true)
    }
    const leave = () => setDragOver(false)
    const drop = (e) => {
      e.preventDefault()
      setDragOver(false)
      handleFiles(e.dataTransfer.files)
    }
    el.addEventListener('dragover', over)
    el.addEventListener('dragleave', leave)
    el.addEventListener('drop', drop)
    return () => {
      el.removeEventListener('dragover', over)
      el.removeEventListener('dragleave', leave)
      el.removeEventListener('drop', drop)
    }
  }, [societaId, tipoManuale, aiMode, aiPreprocessMode])

  const handleFiles = async (fileList) => {
    if (!societaId) {
      setSocietaImportHint('Seleziona prima la societ? dal menu Societ? sopra.')
      return
    }
    const files = Array.from(fileList)
    if (!files.length) return

    setUploading(true)
    try {
      await processImportedFiles({
        fileList,
        societaId,
        aiEnabled,
        aiMode,
        aiPreprocessMode,
        tipoManuale,
        pianoConti,
        causaliIva,
        causaliContabili,
        clienti,
        ai,
        confirm: window.confirm,
        alert: window.alert,
        onProgress: setProgress,
      })
    } finally {
      setUploading(false)
      setProgress(null)
      caricaDocumenti()
    }
  }

  const confermaDocumento = async (doc, form) => {
    try {
      await confirmImportedDocument({
        doc,
        form,
        societaId,
        pianoConti,
        causaliIva,
        aiMode,
        aiPreprocessMode,
        alert: window.alert,
      })
      caricaDocumenti()
    } catch (e) {
      alert('Errore: ' + e.message)
    }
  }

  const eliminaDocumento = async (id) => {
    await importRepo.markDocumentoImportError(id)
    setDocumenti((prev) => prev.filter((d) => d.id !== id))
  }

  const confermaTuttiDocumenti = async () => {
    if (bulkConfirming) return
    if (!window.confirm("Confermi l'invio di tutti i " + documenti.length + ' documenti in Da Validare?')) return
    setBulkConfirming(true)
    try {
      for (const doc of documenti) {
        await confermaDocumento(doc, buildBulkConfirmFormFromDocument(doc))
      }
    } finally {
      setBulkConfirming(false)
    }
  }

  const svuotaDocumentiImport = async () => {
    if (!window.confirm('Eliminare tutti i documenti in staging?')) return
    await importRepo.markDocumentiImportErrorBulk(societaId)
    setDocumenti([])
  }

  return (
    <div className="page">
      <ImportControlBar
        societa={societa}
        societaId={societaId}
        setSocietaId={setSocietaId}
        aiEnabled={aiEnabled}
        aiMode={aiMode}
        setAiMode={setAiMode}
        aiPreprocessMode={aiPreprocessMode}
        setAiPreprocessMode={setAiPreprocessMode}
        tipoManuale={tipoManuale}
        setTipoManuale={setTipoManuale}
        tipiDocumento={TIPI_DOCUMENTO}
        ruolo={ruolo}
        onPersistSocieta={persistSelectedSocieta}
      />

      <ImportDropzone
        dropRef={dropRef}
        fileInputRef={fileInputRef}
        uploading={uploading}
        societaId={societaId}
        dragOver={dragOver}
        progress={progress}
        societaImportHint={societaImportHint}
        tipoManuale={tipoManuale}
        tipiDocumento={TIPI_DOCUMENTO}
        onFilesSelected={handleFiles}
        onClickZone={() => {
          if (uploading) return
          if (!societaId) {
            setSocietaImportHint('Seleziona prima la societa dal menu Societa sopra.')
            return
          }
          fileInputRef.current?.click()
        }}
      />

      <ImportDocumentsList
        societaId={societaId}
        documenti={documenti}
        onConfermaTutti={confermaTuttiDocumenti}
        onSvuotaTutto={svuotaDocumentiImport}
        onConfermaDocumento={confermaDocumento}
        onEliminaDocumento={eliminaDocumento}
        clienti={clienti}
        pianoConti={pianoConti}
        causaliIva={causaliIva}
        tipiDocumento={TIPI_DOCUMENTO}
        aliquoteIva={ALIQUOTE_IVA}
        fmt={fmt}
        actionsBusy={bulkConfirming}
      />
    </div>
  )
}
