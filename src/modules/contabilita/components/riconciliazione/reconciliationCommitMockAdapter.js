function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function createCounter(prefix) {
  let current = 0
  return () => `${prefix}-${String(++current).padStart(4, '0')}`
}

function createState() {
  return {
    primaNota: [],
    primaNotaRighe: [],
    partitarioMovements: [],
    bankMovementActions: [],
    idempotencyRecords: new Map(),
  }
}

function snapshotState(state) {
  return {
    primaNota: clone(state.primaNota),
    primaNotaRighe: clone(state.primaNotaRighe),
    partitarioMovements: clone(state.partitarioMovements),
    bankMovementActions: clone(state.bankMovementActions),
    idempotencyRecords: clone(Array.from(state.idempotencyRecords.entries())),
  }
}

function restoreState(state, snapshot) {
  state.primaNota = clone(snapshot.primaNota)
  state.primaNotaRighe = clone(snapshot.primaNotaRighe)
  state.partitarioMovements = clone(snapshot.partitarioMovements)
  state.bankMovementActions = clone(snapshot.bankMovementActions)
  state.idempotencyRecords = new Map(clone(snapshot.idempotencyRecords))
}

export function createReconciliationCommitMockAdapter() {
  const state = createState()
  const nextPrimaNotaId = createCounter('pn-mock')
  const nextPrimaNotaRigaId = createCounter('pnr-mock')
  const nextPartitarioMovementId = createCounter('part-mock')
  const nextBankActionId = createCounter('bank-act-mock')

  const adapter = {
    transactional: true,
    supportsIdempotency: true,
    state,
    async transaction(executor) {
      const snapshot = snapshotState(state)
      try {
        const result = await executor(adapter)
        return result
      } catch (error) {
        restoreState(state, snapshot)
        throw error
      }
    },
    async getCommittedByIdempotencyKey(idempotencyKey) {
      return state.idempotencyRecords.get(String(idempotencyKey || '')) || null
    },
    async registerCommittedByIdempotencyKey(idempotencyKey, result) {
      state.idempotencyRecords.set(String(idempotencyKey || ''), clone(result))
      return { data: clone(result), error: null }
    },
    async createPrimaNota(payload = {}, meta = {}) {
      const id = nextPrimaNotaId()
      state.primaNota.push({ id, payload: clone(payload), meta: clone(meta) })
      return { data: { id, payloadId: meta?.payloadId || null }, error: null }
    },
    async createPrimaNotaRighe(rows = [], meta = {}) {
      const created = rows.map((row) => {
        const id = nextPrimaNotaRigaId()
        const createdRow = { id, ...clone(row), prima_nota_id: row?.prima_nota_id || meta?.primaNotaId || null }
        state.primaNotaRighe.push(createdRow)
        return createdRow
      })
      return { data: created, error: null }
    },
    async createPartitarioMovements(rows = [], meta = {}) {
      const created = rows.map((row) => {
        const id = nextPartitarioMovementId()
        const createdRow = { id, ...clone(row), meta: clone(meta) }
        state.partitarioMovements.push(createdRow)
        return createdRow
      })
      return { data: created, error: null }
    },
    async markBankMovementReconciled(payload = {}, meta = {}) {
      const id = nextBankActionId()
      const record = { id, action: 'reconciled', payload: clone(payload), meta: clone(meta) }
      state.bankMovementActions.push(record)
      return { data: record, error: null }
    },
    async markBankMovementIgnored(payload = {}, meta = {}) {
      const id = nextBankActionId()
      const record = { id, action: 'ignored', payload: clone(payload), meta: clone(meta) }
      state.bankMovementActions.push(record)
      return { data: record, error: null }
    },
  }

  return adapter
}