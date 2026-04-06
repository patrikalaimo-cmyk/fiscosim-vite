/**
 * One-off generator: reads canonical docs and writes Pandoc-oriented *.pandoc.md files.
 * Run: node docs/pdf-export/build-pdf-sources.mjs
 */
import { readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const docsDir = join(__dirname, '..')

const TITLE_PAGE = (subtitle, audienceLine) => `\\thispagestyle{empty}
\\vspace*{0.14\\textheight}
\\begin{center}
{\\Huge\\textbf{FiscoSim}}\\\\[14pt]
{\\Large ${subtitle}}\\\\[10pt]
{\\large ${audienceLine}}\\\\[40pt]
{\\normalsize \\textit{PDF export edition}}\\\\[6pt]
{\\normalsize 2026}
\\end{center}
\\vfill
\\begin{center}
\\small\\textit{Generated from Markdown. Optimised for Pandoc (XeLaTeX or pdfLaTeX).}
\\end{center}
\\newpage
`

const YAML = (subtitle, authorLine) => `---
title: "FiscoSim"
subtitle: "${subtitle}"
author: "${authorLine}"
date: "2026"
lang: en-GB
documentclass: article
classoption:
  - oneside
geometry: margin=2.5cm
fontsize: 11pt
linestretch: 1.15
toc: true
toc-depth: 3
numbersections: false
colorlinks: true
linkcolor: Blue
urlcolor: Blue
header-includes:
  - |
    % Spacing and readability (Pandoc → LaTeX)
    \\usepackage{setspace}
    \\setstretch{1.15}
    \\usepackage{parskip}
    \\setlength{\\parskip}{0.7em plus 0.2em minus 0.1em}
    \\usepackage{needspace}
    \\let\\oldsection\\section
    \\renewcommand{\\section}{\\needspace{6\\baselineskip}\\oldsection}
---

`

const HTML_NOTE = `<!--

  Pandoc — PDF export (example)
  -----------------------------
  pandoc 01-operational-manual.pandoc.md -o FiscoSim-Operational-Manual.pdf \\
    --from=markdown+raw_tex \\
    --pdf-engine=xelatex \\
    --toc --toc-depth=3 \\
    -V documentclass=article \\
    -V geometry:margin=2.5cm

  Use xelatex for Unicode (Italian UI terms). Install: TeX Live / MiKTeX.

-->

`

function spacingSections(md) {
  // Extra blank lines before each level-2 heading that starts a numbered chapter
  return md.replace(/\n(## [0-9]+\.)/g, '\n\n\n$1')
}

/** Remove inline TOC; Pandoc `toc: true` generates the PDF table of contents. */
function stripManualTableOfContents(md) {
  return md.replace(/\n## Table of contents\n\n[\s\S]*?\n---\n/, '\n')
}

function stripFirstH1(md) {
  const lines = md.split('\n')
  if (lines[0]?.startsWith('# ')) {
    lines.shift()
    while (lines[0] === '' || lines[0] === '---') {
      if (lines[0] === '---') {
        lines.shift()
        break
      }
      lines.shift()
    }
  }
  return lines.join('\n').trimStart()
}

function prepOperational(body) {
  let b = stripFirstH1(body)
  b = b.replace(/\*This manual describes[\s\S]*$/, '')
  b = stripManualTableOfContents(b)
  return spacingSections(b.trim())
}

function prepTechnical(body) {
  let b = stripFirstH1(body)
  b = b.replace(/\*Default models[\s\S]*$/, '').trim()
  b = b.replace(
    /\[operational-manual-accounting-operators\.md\]\(\.\/operational-manual-accounting-operators\.md\)/g,
    'Operational Manual (companion document)'
  )
  b = stripManualTableOfContents(b)
  return spacingSections(b)
}

function prepTesting(body) {
  let b = stripFirstH1(body)
  b = b.replace(/^## Global prerequisites/m, '## 0. Global prerequisites')
  b = b.replace(/\n# ([0-9]+)\. Basic tests\n/g, '\n\n\n## $1. Basic tests\n')
  b = b.replace(/\n# ([0-9]+)\. Import tests\n/g, '\n\n\n## $1. Import tests\n')
  b = b.replace(/\n# ([0-9]+)\. Accounting tests\n/g, '\n\n\n## $1. Accounting tests\n')
  b = b.replace(/\n# ([0-9]+)\. IVA tests\n/g, '\n\n\n## $1. IVA tests\n')
  b = b.replace(/\n# ([0-9]+)\. E2E tests[^\n]*\n/g, '\n\n\n## $1. E2E tests (Test Mode)\n')
  b = b.replace(/\n# ([0-9]+)\. AI tests\n/g, '\n\n\n## $1. AI tests\n')
  b = b.replace(/\n# ([0-9]+)\. Insight tests\n/g, '\n\n\n## $1. Insight tests\n')
  b = b.replace(/\n# ([0-9]+)\. Copilot tests\n/g, '\n\n\n## $1. Copilot tests\n')
  b = b.replace(/\n# ([0-9]+)\. Regression[^\n]*\n/g, '\n\n\n## $1. Regression quick matrix\n')
  b = b.replace(
    /For architecture details[\s\S]*operational-manual-accounting-operators\.md\)\./,
    'For architecture details, see the Technical Manual (PDF export). For operator prose, see the Operational Manual (PDF export).'
  )
  return spacingSections(b.trim())
}

const op = readFileSync(join(docsDir, 'operational-manual-accounting-operators.md'), 'utf8')
const tech = readFileSync(join(docsDir, 'technical-manual-developers.md'), 'utf8')
const test = readFileSync(join(docsDir, 'testing-guide-full.md'), 'utf8')

const opOut =
  HTML_NOTE +
  YAML('Operational Manual — Accounting Operators', 'FiscoSim Documentation') +
  '```{=latex}\n' +
  TITLE_PAGE('Operational Manual', 'For accounting operators') +
  '```\n\n\n' +
  prepOperational(op) +
  '\n'

const techOut =
  HTML_NOTE +
  YAML('Technical Manual — Developers and Advanced Users', 'FiscoSim Documentation') +
  '```{=latex}\n' +
  TITLE_PAGE('Technical Manual', 'For developers and advanced users') +
  '```\n\n\n' +
  prepTechnical(tech) +
  '\n'

const testOut =
  HTML_NOTE +
  YAML('Testing Guide — Step-by-step', 'FiscoSim QA / Engineering') +
  '```{=latex}\n' +
  TITLE_PAGE('Testing Guide', 'Step-by-step validation') +
  '```\n\n\n' +
  prepTesting(test) +
  '\n'

writeFileSync(join(__dirname, '01-operational-manual.pandoc.md'), opOut, 'utf8')
writeFileSync(join(__dirname, '02-technical-manual.pandoc.md'), techOut, 'utf8')
writeFileSync(join(__dirname, '03-testing-guide.pandoc.md'), testOut, 'utf8')

console.log('Wrote 01-operational-manual.pandoc.md, 02-technical-manual.pandoc.md, 03-testing-guide.pandoc.md')
