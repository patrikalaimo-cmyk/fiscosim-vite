/**
 * L5 synthetic multi-period dataset plan + invariants (pure).
 * Used by Stage3W SG-P4-01 LAB suite — no I/O, no LIVE.
 */

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}

function vat22(taxable) {
  const imponibile = round2(taxable)
  const iva = round2(imponibile * 0.22)
  return { imponibile, iva, lordo: round2(imponibile + iva) }
}

/**
 * Canonical seed: ≥2 years, ≥2 IVA periods, FA+FP per period.
 * Doc numbers include runId for idempotent-ish LAB posts.
 */
export function buildL5MultiPeriodSeedPlan({ runId } = {}) {
  const id = String(runId || 'RUN').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24) || 'RUN'
  const periods = [
    {
      key: 'Y2024_M11',
      year: 2024,
      periodoInizio: '2024-11-01',
      periodoFine: '2024-11-30',
      docs: [
        {
          kind: 'fattura_attiva',
          contract_kind: 'fattura_attiva',
          date: '2024-11-10',
          numero_documento: `SG-E2E-P401-FA24-${id}`,
          ...vat22(2000),
        },
        {
          kind: 'fattura_passiva',
          contract_kind: 'fattura_passiva',
          date: '2024-11-15',
          numero_documento: `SG-E2E-P401-FP24-${id}`,
          ...vat22(1000),
        },
      ],
    },
    {
      key: 'Y2026_M02',
      year: 2026,
      periodoInizio: '2026-02-01',
      periodoFine: '2026-02-28',
      docs: [
        {
          kind: 'fattura_attiva',
          contract_kind: 'fattura_attiva',
          date: '2026-02-08',
          numero_documento: `SG-E2E-P401-FA26-${id}`,
          ...vat22(500),
        },
        {
          kind: 'fattura_passiva',
          contract_kind: 'fattura_passiva',
          date: '2026-02-12',
          numero_documento: `SG-E2E-P401-FP26-${id}`,
          ...vat22(300),
        },
      ],
    },
  ]

  return {
    kind: 'l5_multi_periodo_sintetico',
    runId: id,
    years: [...new Set(periods.map((p) => p.year))].sort((a, b) => a - b),
    periodCount: periods.length,
    periods,
    allDocNumbers: periods.flatMap((p) => p.docs.map((d) => d.numero_documento)),
  }
}

/** Expected period summary from seed plan (independent of DB). */
export function expectedPeriodSummaryFromPlan(period) {
  const fa = period.docs.filter((d) => d.kind === 'fattura_attiva')
  const fp = period.docs.filter((d) => d.kind === 'fattura_passiva')
  const ivaDebito = round2(fa.reduce((s, d) => s + d.iva, 0))
  const ivaCredito = round2(fp.reduce((s, d) => s + d.iva, 0))
  const partiteAperteLordo = round2(
    [...fa, ...fp].reduce((s, d) => s + d.lordo, 0),
  )
  return {
    key: period.key,
    year: period.year,
    periodoInizio: period.periodoInizio,
    periodoFine: period.periodoFine,
    pnCount: period.docs.length,
    vatRowsExpected: period.docs.length,
    ivaDebito,
    ivaCredito,
    saldoIva: round2(ivaDebito - ivaCredito),
    partiteAperteLordo,
    docNumbers: period.docs.map((d) => d.numero_documento),
  }
}

export function expectedDatasetFromPlan(plan) {
  const periods = (plan?.periods || []).map(expectedPeriodSummaryFromPlan)
  return {
    kind: plan?.kind || 'l5_multi_periodo_sintetico',
    runId: plan?.runId,
    years: plan?.years || [],
    periodCount: periods.length,
    periods,
    fingerprint: buildL5DatasetFingerprint(periods),
  }
}

/**
 * Stable fingerprint over sorted period metrics (no timestamps).
 * Format: L5MP1|<year>:<mm>:<pn>:<vatN>:<debito>:<credito>:<saldo>:<partite>;...
 */
export function buildL5DatasetFingerprint(periodSummaries = []) {
  const rows = (Array.isArray(periodSummaries) ? periodSummaries : [])
    .map((p) => {
      const start = String(p.periodoInizio || '').slice(0, 10)
      const ym = start.slice(0, 7)
      return [
        String(p.year || start.slice(0, 4)),
        ym,
        String(p.pnCount ?? 0),
        String(p.vatRowsExpected ?? p.vatRowsObserved ?? 0),
        round2(p.ivaDebito).toFixed(2),
        round2(p.ivaCredito).toFixed(2),
        round2(p.saldoIva).toFixed(2),
        round2(p.partiteAperteLordo).toFixed(2),
      ].join(':')
    })
    .sort()
  return `L5MP1|${rows.join(';')}`
}

/**
 * Assert observed LAB effects against seed expectations.
 * observedPeriods: [{ key, pnCount, vatRowsObserved, ivaDebito, ivaCredito, saldoIva, partiteAperteLordo, balancedPnAll }]
 */
export function assertL5MultiPeriodInvariants({ plan, observedPeriods } = {}) {
  const blockers = []
  if (!plan?.periods?.length) blockers.push('plan_vuoto')
  const expected = expectedDatasetFromPlan(plan)
  if (expected.years.length < 2) blockers.push('anni_insufficienti')
  if (expected.periodCount < 2) blockers.push('periodi_insufficienti')

  const byKey = new Map((observedPeriods || []).map((o) => [o.key, o]))
  for (const exp of expected.periods) {
    const obs = byKey.get(exp.key)
    if (!obs) {
      blockers.push(`periodo_mancante:${exp.key}`)
      continue
    }
    if (obs.pnCount !== exp.pnCount) {
      blockers.push(`pn_count:${exp.key}:${obs.pnCount}!=${exp.pnCount}`)
    }
    if (obs.vatRowsObserved !== exp.vatRowsExpected) {
      blockers.push(`vat_rows:${exp.key}:${obs.vatRowsObserved}!=${exp.vatRowsExpected}`)
    }
    if (round2(obs.ivaDebito) !== exp.ivaDebito) {
      blockers.push(`iva_debito:${exp.key}:${obs.ivaDebito}!=${exp.ivaDebito}`)
    }
    if (round2(obs.ivaCredito) !== exp.ivaCredito) {
      blockers.push(`iva_credito:${exp.key}:${obs.ivaCredito}!=${exp.ivaCredito}`)
    }
    if (round2(obs.saldoIva) !== exp.saldoIva) {
      blockers.push(`saldo_iva:${exp.key}:${obs.saldoIva}!=${exp.saldoIva}`)
    }
    if (round2(obs.partiteAperteLordo) !== exp.partiteAperteLordo) {
      blockers.push(`partite:${exp.key}:${obs.partiteAperteLordo}!=${exp.partiteAperteLordo}`)
    }
    if (obs.balancedPnAll !== true) {
      blockers.push(`pn_sbilanciata:${exp.key}`)
    }
  }

  const observedFingerprint = buildL5DatasetFingerprint(
    (observedPeriods || []).map((o) => ({
      year: o.year,
      periodoInizio: o.periodoInizio,
      pnCount: o.pnCount,
      vatRowsExpected: o.vatRowsObserved,
      ivaDebito: o.ivaDebito,
      ivaCredito: o.ivaCredito,
      saldoIva: o.saldoIva,
      partiteAperteLordo: o.partiteAperteLordo,
    })),
  )
  if (observedFingerprint !== expected.fingerprint) {
    blockers.push(`fingerprint_mismatch`)
  }

  return {
    valid: blockers.length === 0,
    blockers,
    expectedFingerprint: expected.fingerprint,
    observedFingerprint,
    expected,
  }
}
