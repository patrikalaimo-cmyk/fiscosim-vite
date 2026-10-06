function getStatusUi(status) {
  if (status === 'blocked') {
    return {
      label: 'Payload bloccato',
      border: '1px solid rgba(220,53,69,.34)',
      background: 'rgba(95,27,38,.34)',
      color: '#ffd7dd',
    }
  }

  if (status === 'warning') {
    return {
      label: 'Payload pronto con avvisi',
      border: '1px solid rgba(255,193,7,.3)',
      background: 'rgba(92,64,9,.24)',
      color: '#ffe9a8',
    }
  }

  return {
    label: 'Payload pronto per Contabilità',
    border: '1px solid rgba(25,135,84,.32)',
    background: 'rgba(18,76,56,.26)',
    color: '#c8f3df',
  }
}

export function WorkingViewCommitDryRunPanel({
  result,
}) {
  if (!result) return null

  const validation = result?.validation || {}
  const status = String(validation.status || 'ok')
  const blockers = Array.isArray(validation.blockers) ? validation.blockers : []
  const warnings = Array.isArray(validation.warnings) ? validation.warnings : []
  const missingInputFields = Array.isArray(result?.missingInputFields) ? result.missingInputFields : []
  const commitResult = result?.commitResult || null
  const commitStatus = String(commitResult?.status || '')
  const commitMode = String(commitResult?.mode || '')
  const commitIdempotencyKey = String(commitResult?.idempotencyKey || result?.commitInput?.idempotencyKey || '')
  const commitPayloadHash = String(commitResult?.payloadHash || '')
  const commitWarnings = Array.isArray(commitResult?.warnings) ? commitResult.warnings : []
  const commitBlockers = Array.isArray(commitResult?.blockers) ? commitResult.blockers : []
  const commitNoDbWriteInDryRun = commitResult?.noDbWriteInDryRun === true
  const replayOrConflictLabel = commitStatus === 'replayed' ? 'Replay rilevato' : commitStatus === 'blocked' && commitBlockers.includes('idempotency_conflict') ? 'Conflict rilevato' : ''
  const ui = getStatusUi(status)

  return (
    <div
      style={{
        borderRadius: 12,
        border: ui.border,
        background: ui.background,
        padding: '.16rem .2rem',
        display: 'grid',
        gap: '.1rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.16rem', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '.78rem', color: ui.color }}>
          {ui.label}
        </strong>
        <span style={{ fontSize: '.62rem', color: 'rgba(225,235,248,.78)' }}>
          Dry-run P7B-v3
        </span>
      </div>

      <div style={{ fontSize: '.66rem', color: 'rgba(225,235,248,.88)', lineHeight: 1.3 }}>
        Nessuna registrazione è stata salvata: dry-run P7.
      </div>

      {commitResult ? (
        <div style={{ display: 'grid', gap: '.04rem', fontSize: '.64rem', color: 'rgba(225,235,248,.86)', lineHeight: 1.28 }}>
          <div><strong>Commit service:</strong> status={commitStatus || 'n/a'} · mode={commitMode || 'n/a'}{commitNoDbWriteInDryRun ? ' · no final write' : ''}</div>
          <div><strong>Idempotency:</strong> {commitIdempotencyKey || 'n/a'}</div>
          <div><strong>Payload hash:</strong> {commitPayloadHash || 'n/a'}</div>
          {replayOrConflictLabel ? <div><strong>{replayOrConflictLabel}</strong></div> : null}
        </div>
      ) : null}

      {missingInputFields.length ? (
        <div style={{ display: 'grid', gap: '.06rem' }}>
          <div style={{ fontSize: '.64rem', color: 'rgba(225,235,248,.86)', fontWeight: 700 }}>
            Dati non disponibili (passati null):
          </div>
          <div style={{ fontSize: '.64rem', color: 'rgba(225,235,248,.78)' }}>
            {missingInputFields.join(' | ')}
          </div>
        </div>
      ) : null}

      {blockers.length ? (
        <div style={{ display: 'grid', gap: '.06rem' }}>
          <div style={{ fontSize: '.64rem', color: '#ffd7dd', fontWeight: 700 }}>Blocker</div>
          {blockers.map((item) => (
            <div key={item} style={{ fontSize: '.64rem', color: '#ffd7dd', lineHeight: 1.28 }}>
              • {item}
            </div>
          ))}
        </div>
      ) : null}

      {commitBlockers.length ? (
        <div style={{ display: 'grid', gap: '.06rem' }}>
          <div style={{ fontSize: '.64rem', color: '#ffd7dd', fontWeight: 700 }}>Blocker commit</div>
          {commitBlockers.map((item) => (
            <div key={item} style={{ fontSize: '.64rem', color: '#ffd7dd', lineHeight: 1.28 }}>
              • {item}
            </div>
          ))}
        </div>
      ) : null}

      {warnings.length ? (
        <div style={{ display: 'grid', gap: '.06rem' }}>
          <div style={{ fontSize: '.64rem', color: '#ffe9a8', fontWeight: 700 }}>Avvisi</div>
          {warnings.map((item) => (
            <div key={item} style={{ fontSize: '.64rem', color: '#ffe9a8', lineHeight: 1.28 }}>
              • {item}
            </div>
          ))}
        </div>
      ) : null}

      {commitWarnings.length ? (
        <div style={{ display: 'grid', gap: '.06rem' }}>
          <div style={{ fontSize: '.64rem', color: '#ffe9a8', fontWeight: 700 }}>Avvisi commit</div>
          {commitWarnings.map((item) => (
            <div key={item} style={{ fontSize: '.64rem', color: '#ffe9a8', lineHeight: 1.28 }}>
              • {item}
            </div>
          ))}
        </div>
      ) : null}

      <details>
        <summary style={{ cursor: 'pointer', fontSize: '.62rem', color: 'rgba(225,235,248,.78)' }}>
          Mostra payload JSON (dry-run)
        </summary>
        <pre
          style={{
            margin: '.08rem 0 0',
            padding: '.12rem',
            borderRadius: 8,
            border: '1px solid rgba(124,157,202,.2)',
            background: 'rgba(8,24,37,.62)',
            color: '#dbe7fb',
            fontSize: '.58rem',
            lineHeight: 1.28,
            maxHeight: 260,
            overflow: 'auto',
          }}
        >
          {JSON.stringify(result?.payload || {}, null, 2)}
        </pre>
      </details>
    </div>
  )
}
