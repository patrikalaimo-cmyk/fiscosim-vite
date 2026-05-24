import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('src/modules/contabilita')
const TARGETS = [
  path.join(ROOT, 'components/riconciliazione'),
  path.join(ROOT, 'views/RiconciliazioneBancariaView.jsx'),
]

const unsafePatterns = [
  /supabase\s*\.\s*from\s*\(/i,
  /from\s*\(\s*['"]movimenti_bancari['"]/i,
  /from\s*\(\s*['"]bank_movements['"]/i,
  /movimenti_bancari/i,
]

function collectFiles(targetPath) {
  if (!fs.existsSync(targetPath)) return []
  const stat = fs.statSync(targetPath)
  if (stat.isFile()) return [targetPath]

  const entries = fs.readdirSync(targetPath, { withFileTypes: true })
  return entries.flatMap((entry) => collectFiles(path.join(targetPath, entry.name)))
}

const files = TARGETS.flatMap((target) => collectFiles(target)).filter((file) => /\.(m?js|jsx|ts|tsx)$/i.test(file))
const violations = []

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8')
  for (const pattern of unsafePatterns) {
    if (pattern.test(content)) {
      violations.push({ file, pattern: String(pattern) })
      break
    }
  }
}

if (violations.length > 0) {
  console.error('Unsafe reconciliation real-save references found:')
  for (const violation of violations) {
    console.error(`- ${path.relative(process.cwd(), violation.file)} :: ${violation.pattern}`)
  }
  process.exit(1)
}

console.log('No unsafe real-save references found in reconciliation surface.')
process.exit(0)