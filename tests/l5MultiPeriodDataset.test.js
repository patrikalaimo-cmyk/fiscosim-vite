import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildL5MultiPeriodSeedPlan,
  expectedPeriodSummaryFromPlan,
  expectedDatasetFromPlan,
  buildL5DatasetFingerprint,
  assertL5MultiPeriodInvariants,
} from '../src/modules/contabilita/application/l5/buildL5MultiPeriodDatasetPlan.js'

test('seed plan spans two years and two periods with unique docs', () => {
  const plan = buildL5MultiPeriodSeedPlan({ runId: 'abc123' })
  assert.equal(plan.kind, 'l5_multi_periodo_sintetico')
  assert.deepEqual(plan.years, [2024, 2026])
  assert.equal(plan.periodCount, 2)
  assert.equal(plan.periods.length, 2)
  assert.equal(plan.allDocNumbers.length, 4)
  assert.ok(plan.allDocNumbers.every((d) => d.includes('abc123')))
  assert.ok(new Set(plan.allDocNumbers).size === 4)
})

test('expected summaries and fingerprint are stable', () => {
  const plan = buildL5MultiPeriodSeedPlan({ runId: 'fp1' })
  const s0 = expectedPeriodSummaryFromPlan(plan.periods[0])
  assert.equal(s0.ivaDebito, 440)
  assert.equal(s0.ivaCredito, 220)
  assert.equal(s0.saldoIva, 220)
  assert.equal(s0.partiteAperteLordo, 3660)
  assert.equal(s0.pnCount, 2)

  const s1 = expectedPeriodSummaryFromPlan(plan.periods[1])
  assert.equal(s1.ivaDebito, 110)
  assert.equal(s1.ivaCredito, 66)
  assert.equal(s1.saldoIva, 44)
  assert.equal(s1.partiteAperteLordo, 976)

  const ds = expectedDatasetFromPlan(plan)
  assert.equal(ds.fingerprint, buildL5DatasetFingerprint(ds.periods))
  assert.match(ds.fingerprint, /^L5MP1\|/)
  assert.ok(ds.fingerprint.includes('2024:2024-11:2:2:440.00:220.00:220.00:3660.00'))
  assert.ok(ds.fingerprint.includes('2026:2026-02:2:2:110.00:66.00:44.00:976.00'))
})

test('assertL5MultiPeriodInvariants PASS on matching observed', () => {
  const plan = buildL5MultiPeriodSeedPlan({ runId: 'ok' })
  const expected = expectedDatasetFromPlan(plan)
  const observed = expected.periods.map((p) => ({
    key: p.key,
    year: p.year,
    periodoInizio: p.periodoInizio,
    periodoFine: p.periodoFine,
    pnCount: p.pnCount,
    vatRowsObserved: p.vatRowsExpected,
    ivaDebito: p.ivaDebito,
    ivaCredito: p.ivaCredito,
    saldoIva: p.saldoIva,
    partiteAperteLordo: p.partiteAperteLordo,
    balancedPnAll: true,
  }))
  const res = assertL5MultiPeriodInvariants({ plan, observedPeriods: observed })
  assert.equal(res.valid, true, res.blockers.join(', '))
  assert.equal(res.observedFingerprint, res.expectedFingerprint)
})

test('assertL5MultiPeriodInvariants fail-closed on mismatch', () => {
  const plan = buildL5MultiPeriodSeedPlan({ runId: 'bad' })
  const res = assertL5MultiPeriodInvariants({
    plan,
    observedPeriods: [{
      key: 'Y2024_M11',
      year: 2024,
      periodoInizio: '2024-11-01',
      pnCount: 1,
      vatRowsObserved: 1,
      ivaDebito: 0,
      ivaCredito: 0,
      saldoIva: 0,
      partiteAperteLordo: 0,
      balancedPnAll: false,
    }],
  })
  assert.equal(res.valid, false)
  assert.ok(res.blockers.some((b) => b.startsWith('periodo_mancante:Y2026')))
  assert.ok(res.blockers.some((b) => b.includes('pn_count')))
  assert.ok(res.blockers.includes('fingerprint_mismatch'))
})
