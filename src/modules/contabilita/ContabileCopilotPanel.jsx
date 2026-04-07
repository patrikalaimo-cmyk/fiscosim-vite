import { useCallback, useEffect, useRef, useState } from 'react'
import { buildAnswerHighlightNodes, deriveCopilotHighlights } from './copilotHighlightUtils.js'
import { CopilotInsightsBlock, buildCopilotFixPromptFromInsight } from './CopilotInsightsBlock.jsx'

const QUICK_ACTIONS = [
  {
    id: 'explain',
    label: 'Spiega questa registrazione',
    titleEn: 'Explain this entry',
    prompt:
      'Spiega in modo sintetico questa scrittura contabile per il documento in contesto: conto proposto, fonte AI (memory/pattern/learning/fallback), confidenza, punti da verificare. Usa i tool se servono dati aggiornati su accounting_entries.',
  },
  {
    id: 'similar',
    label: 'Trova registrazioni simili',
    titleEn: 'Find similar entries',
    prompt:
      'Trova documenti o scritture simili: stesso fornitore (P.IVA) e/o stesso conto costo/ricavo. Usa get_entries con society_wide o filtri appropriati e riassumi i risultati senza inventare dati.',
  },
  {
    id: 'vat',
    label: 'Verifica trattamento IVA',
    titleEn: 'Check VAT treatment',
    prompt:
      'Verifica il trattamento IVA per questo documento: coerenza tra tipo documento, imponibile, IVA, causale IVA impostata e fiscal_knowledge. Segnala rischi o incongruenze. Usa i tool se necessario.',
  },
]

/**
 * Chat Copilot contabile → POST /api/accounting/ai (action=copilot_turn)
 * layout="sidebar" | "floating"
 */
export function ContabileCopilotPanel({
  documentId,
  /** Documento usato per le chiamate API (es. primo in lista se nessuna riga è selezionata) */
  copilotDocumentId = null,
  societaId,
  accountingEntryId = null,
  docLabel = '',
  contextDoc = null,
  pianoConti = [],
  causaliIva = [],
  layout = 'sidebar',
  onClose,
  onRefreshAutoValidate,
  onOpenGuidata,
  onRefreshEntryMeta,
  onHighlightsChange,
  onRegisterSendPrompt,
  onInsightFixNow,
  insightsRefreshKey = 0,
}) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const bottomRef = useRef(null)
  const prevCtxKey = useRef('')

  const ctxKey = `${documentId || ''}`
  useEffect(() => {
    if (!prevCtxKey.current) {
      prevCtxKey.current = ctxKey
      return
    }
    if (prevCtxKey.current !== ctxKey) {
      setMessages([])
      setError(null)
      setInput('')
      onHighlightsChange?.(null)
      prevCtxKey.current = ctxKey
    }
  }, [ctxKey, onHighlightsChange])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const docForApi = copilotDocumentId || documentId

  const handleAction = useCallback(
    (a) => {
      const t = String(a?.type || '')
      if (t === 'refresh_auto_validate') {
        void onRefreshAutoValidate?.()
        return
      }
      if (t === 'open_guidata') {
        void onOpenGuidata?.()
        return
      }
      if (docForApi && (t === 'refresh_entry_meta' || t === 'refresh_scores')) {
        void onRefreshEntryMeta?.(docForApi)
        return
      }
    },
    [docForApi, onRefreshAutoValidate, onOpenGuidata, onRefreshEntryMeta]
  )

  const sendWithTextRef = useRef(null)

  const sendWithText = useCallback(
    async (rawText) => {
      const text = String(rawText || '').trim()
      if (!text || !docForApi || !societaId || loading) return

      onHighlightsChange?.(null)

      const nextUser = { role: 'user', content: text }
      const history = [...messages, nextUser]
      setMessages(history)
      setInput('')
      setError(null)
      setLoading(true)

      try {
        const res = await fetch('/api/accounting/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'copilot_turn',
            documentId: docForApi,
            societaId,
            accountingEntryId: accountingEntryId || undefined,
            messages: history.map((m) =>
              m.role === 'user'
                ? { role: 'user', content: m.content }
                : { role: 'assistant', answer: m.answer, reasoning: m.reasoning }
            ),
          }),
        })
        const j = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(j.error || res.statusText || 'Errore Copilot')
        }
        const answer = j.answer || '—'
        const reasoning = j.reasoning || '—'
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            answer,
            reasoning,
            actions: Array.isArray(j.actions) ? j.actions : [],
          },
        ])
        if (contextDoc && onHighlightsChange) {
          const hl = deriveCopilotHighlights(contextDoc, pianoConti, causaliIva, answer, reasoning)
          onHighlightsChange(hl)
        }
      } catch (e) {
        setError(e?.message || String(e))
        setMessages((prev) => prev.slice(0, -1))
      } finally {
        setLoading(false)
      }
    },
    [
      docForApi,
      societaId,
      accountingEntryId,
      messages,
      loading,
      contextDoc,
      pianoConti,
      causaliIva,
      onHighlightsChange,
    ]
  )

  sendWithTextRef.current = sendWithText

  useEffect(() => {
    if (!onRegisterSendPrompt) return
    onRegisterSendPrompt((text) => void sendWithTextRef.current?.(text))
    return () => onRegisterSendPrompt(null)
  }, [onRegisterSendPrompt])

  const handleInsightFix = useCallback(
    (insight) => {
      if (typeof onInsightFixNow === 'function') {
        onInsightFixNow(insight)
        return
      }
      void sendWithTextRef.current?.(buildCopilotFixPromptFromInsight(insight))
    },
    [onInsightFixNow]
  )

  const disabled = !docForApi || !societaId

  const isSidebar = layout === 'sidebar'

  return (
    <div
      className="card"
      style={
        isSidebar
          ? {
              flex: '0 0 min(380px, 36vw)',
              minWidth: 300,
              maxWidth: 440,
              height: '100%',
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              padding: 0,
              overflow: 'hidden',
              borderRadius: 0,
              border: 'none',
              borderLeft: '1px solid var(--bd)',
              boxShadow: 'none',
            }
          : {
              position: 'fixed',
              right: 12,
              top: 72,
              width: 'min(420px, calc(100vw - 24px))',
              maxHeight: 'calc(100vh - 88px)',
              zIndex: 160,
              display: 'flex',
              flexDirection: 'column',
              padding: 0,
              overflow: 'hidden',
              boxShadow: '0 12px 40px rgba(0,0,0,.35)',
              border: '1px solid var(--bd)',
            }
      }
    >
      <div
        style={{
          padding: '.55rem .75rem',
          borderBottom: '1px solid var(--bd)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '.5rem',
          background: 'var(--s2)',
          flexShrink: 0,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: '.82rem' }}>Copilot contabile</div>
          <div
            style={{
              fontSize: '.65rem',
              color: 'var(--mu)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {docLabel || (disabled ? 'Seleziona un documento' : 'Contesto aggiornato con documento + scrittura')}
          </div>
          {accountingEntryId && !disabled && (
            <div style={{ fontSize: '.58rem', color: 'var(--mu)', marginTop: 2, fontFamily: 'monospace' }}>
              Entry: {String(accountingEntryId).slice(0, 8)}…
            </div>
          )}
        </div>
        <button type="button" className="btn-sec" style={{ fontSize: '.65rem', padding: '.2rem .45rem', flexShrink: 0 }} onClick={onClose}>
          Chiudi
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '.6rem .65rem', display: 'flex', flexDirection: 'column', gap: '.55rem' }}>
        {societaId && (
          <div style={{ paddingBottom: '.5rem', borderBottom: '1px solid var(--bd)' }}>
            <CopilotInsightsBlock
              societaId={societaId}
              documentId={documentId || null}
              variant="panel"
              onFixNow={handleInsightFix}
              refreshKey={insightsRefreshKey}
            />
          </div>
        )}
        {!disabled && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem', flexShrink: 0 }}>
            {QUICK_ACTIONS.map((q) => (
              <button
                key={q.id}
                type="button"
                className="btn-sec"
                style={{ fontSize: '.62rem', padding: '.22rem .45rem' }}
                disabled={loading}
                title={q.titleEn}
                onClick={() => void sendWithText(q.prompt)}
              >
                {q.label}
              </button>
            ))}
          </div>
        )}

        {disabled && (
          <div className="empty" style={{ padding: '.75rem' }}>
            <div className="empty-t" style={{ fontSize: '.78rem' }}>
              Seleziona un documento dalla lista: il contesto Copilot si aggiorna automaticamente.
            </div>
          </div>
        )}

        {!disabled && messages.length === 0 && !loading && (
          <div style={{ fontSize: '.72rem', color: 'var(--mu)', lineHeight: 1.45 }}>
            Usa le azioni rapide o scrivi una domanda. Il server usa documento,{' '}
            <code style={{ fontSize: '.65rem' }}>accounting_entries</code>, tool e knowledge fiscale.
          </div>
        )}

        {messages.map((m, i) => {
          const codeHl =
            m.role === 'assistant' && contextDoc
              ? deriveCopilotHighlights(contextDoc, pianoConti, causaliIva, m.answer, m.reasoning).contoCodes
              : []
          return m.role === 'user' ? (
            <div
              key={`u-${i}`}
              style={{
                alignSelf: 'flex-end',
                maxWidth: '92%',
                padding: '.4rem .55rem',
                borderRadius: 10,
                background: 'rgba(200,164,94,.2)',
                border: '1px solid rgba(200,164,94,.35)',
                fontSize: '.74rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {m.content}
            </div>
          ) : (
            <div
              key={`a-${i}`}
              style={{
                alignSelf: 'flex-start',
                maxWidth: '100%',
                padding: '.5rem .55rem',
                borderRadius: 10,
                background: 'var(--s2)',
                border: '1px solid var(--bd)',
                fontSize: '.74rem',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '.25rem', color: 'var(--gold)' }}>Risposta</div>
              <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.4 }}>
                {buildAnswerHighlightNodes(m.answer, codeHl)}
              </div>
              <details style={{ marginTop: '.45rem', fontSize: '.68rem', color: 'var(--mu)' }}>
                <summary style={{ cursor: 'pointer', userSelect: 'none' }}>Ragionamento</summary>
                <div style={{ marginTop: '.35rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.4 }}>
                  {buildAnswerHighlightNodes(m.reasoning, codeHl)}
                </div>
              </details>
              {m.actions?.length > 0 && (
                <div style={{ marginTop: '.5rem', display: 'flex', flexWrap: 'wrap', gap: '.35rem' }}>
                  {m.actions.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className="btn-sec"
                      style={{ fontSize: '.62rem', padding: '.2rem .4rem' }}
                      onClick={() => handleAction(a)}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {loading && (
          <div style={{ fontSize: '.72rem', color: 'var(--mu)', fontStyle: 'italic' }}>
            Analisi in corso (contesto + tool + modello)…
          </div>
        )}

        {error && (
          <div style={{ fontSize: '.72rem', color: '#ff8585', padding: '.35rem', borderRadius: 8, background: 'rgba(183,28,28,.15)' }}>{error}</div>
        )}

        <div ref={bottomRef} />
      </div>

      <div style={{ padding: '.5rem .6rem', borderTop: '1px solid var(--bd)', display: 'flex', gap: '.4rem', alignItems: 'flex-end', flexShrink: 0 }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void sendWithText(input)
            }
          }}
          placeholder={disabled ? '…' : 'Domanda…'}
          disabled={disabled || loading}
          rows={2}
          style={{
            flex: 1,
            resize: 'none',
            fontSize: '.74rem',
            padding: '.35rem .45rem',
            borderRadius: 8,
            border: '1px solid var(--bd)',
            background: 'var(--s1)',
            color: 'inherit',
          }}
        />
        <button
          type="button"
          className="btn"
          disabled={disabled || loading || !String(input).trim()}
          style={{ fontSize: '.72rem', padding: '.4rem .55rem' }}
          onClick={() => void sendWithText(input)}
        >
          Invia
        </button>
      </div>
    </div>
  )
}
