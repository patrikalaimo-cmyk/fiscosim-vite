export function resolveRegistrazioneEsercizio({
  esercizio,
  dataRegistrazione,
  lastExerciseUsed,
  currentYear = new Date().getFullYear(),
} = {}) {
  const normalizedExercise = String(esercizio || lastExerciseUsed || currentYear || '').trim()
  const dataYear = String(dataRegistrazione || '').slice(0, 4)
  const suggestedExercise = dataYear || normalizedExercise || String(currentYear)
  const warning =
    dataYear && normalizedExercise && dataYear !== normalizedExercise
      ? `La data registrazione appartiene all'esercizio ${dataYear}, mentre e selezionato ${normalizedExercise}.`
      : ''

  return {
    esercizio: normalizedExercise || String(currentYear),
    suggestedExercise,
    warning,
    needsConfirm: Boolean(warning),
    matchesDataYear: !warning,
    dataYear,
  }
}
