import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const srcRoot = path.join(repoRoot, 'src')

const definitionFile = path.normalize(path.join('src', 'modules', 'contabilita', 'application', 'scritturaContabileService.js'))
const allowedTestFilePattern = /(?:^|[\\/])(test|tests|__tests__)(?:[\\/]|$)|\.test\.|\.spec\./i

const legacyCallPatterns = [
  {
    name: 'call:createScritturaContabile',
    regex: /\bcreateScritturaContabile\s*\(/,
  },
  {
    name: 'call:scritturaContabileService.createScritturaContabile',
    regex: /\bscritturaContabileService\.createScritturaContabile\s*\(/,
  },
]

const legacyImportPattern = /import\s+[^;]*\b(?:scritturaContabileService|createScritturaContabile)\b[^;]*from\s+['"][^'"]*scritturaContabileService(?:\.js)?['"]/ 

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await listFiles(fullPath))
      continue
    }
    if (/\.(js|jsx|mjs|ts|tsx)$/i.test(entry.name)) {
      files.push(fullPath)
    }
  }
  return files
}

function toWorkspacePath(absPath) {
  return path.relative(repoRoot, absPath).split(path.sep).join('/')
}

function isAllowedFile(workspacePath) {
  const normalized = workspacePath.split('/').join(path.sep)
  if (path.normalize(normalized) === definitionFile) return true
  return allowedTestFilePattern.test(workspacePath)
}

function isForbiddenContext(workspacePath) {
  return /(?:^|[\\/])(views|components|application|import_contabilita|riconciliazione|consultazione)(?:[\\/]|$)/i.test(workspacePath)
}

function findMatches(content, patterns) {
  const lines = content.split(/\r?\n/)
  const matches = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    for (const pattern of patterns) {
      if (!pattern.regex.test(line)) continue
      matches.push({
        pattern: pattern.name,
        line: index + 1,
        text: line.trim(),
      })
    }
  }
  return matches
}

const files = await listFiles(srcRoot)
const forbiddenHits = []
const informationalImports = []
const allowedHits = []

for (const absPath of files) {
  const workspacePath = toWorkspacePath(absPath)
  const content = await readFile(absPath, 'utf8')
  const callMatches = findMatches(content, legacyCallPatterns)
  const importMatches = findMatches(content, [{ name: 'import:scritturaContabileService', regex: legacyImportPattern }])
  if (!callMatches.length && !importMatches.length) continue

  if (isAllowedFile(workspacePath)) {
    if (callMatches.length) allowedHits.push({ file: workspacePath, matches: callMatches })
    continue
  }

  if (importMatches.length) {
    informationalImports.push({ file: workspacePath, matches: importMatches })
  }
  if (callMatches.length && isForbiddenContext(workspacePath)) {
    forbiddenHits.push({ file: workspacePath, matches: callMatches })
  } else if (callMatches.length) {
    forbiddenHits.push({ file: workspacePath, matches: callMatches })
  }
}

if (informationalImports.length > 0) {
  console.log('Legacy scrittura contabile imports found (informational, not blocking):')
  for (const hit of informationalImports) {
    for (const match of hit.matches) {
      console.log(`- ${hit.file}:${match.line} [${match.pattern}] ${match.text}`)
    }
  }
}

if (allowedHits.length > 0) {
  console.log('Allowed legacy scrittura contabile references:')
  for (const hit of allowedHits) {
    for (const match of hit.matches) {
      console.log(`- ${hit.file}:${match.line} [${match.pattern}] ${match.text}`)
    }
  }
}

if (forbiddenHits.length > 0) {
  console.error('Legacy direct accounting write callsite detected. Use guided canonical flow.')
  for (const hit of forbiddenHits) {
    for (const match of hit.matches) {
      console.error(`- ${hit.file}:${match.line} [${match.pattern}] ${match.text}`)
    }
  }
  process.exit(1)
}

console.log('No forbidden legacy scrittura contabile callsites detected.')