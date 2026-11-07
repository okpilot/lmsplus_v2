// #1288(a): security-auditor.md suppression 12 <-> .coderabbit.yaml `supabase/migrations/**` block.
// Exact-fact tokens only; scoped to the migrations path_instructions entry.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ANCHORS = [
  '20260410000009',
  '20260324000053',
  '20260324000055',
  'question_images_public_read',
  '#814',
  '#1282',
]

/** Text of the path_instructions entry whose `path:` mentions supabase/migrations/. */
export function migrationsBlock(yaml) {
  const lines = yaml.split('\n')
  const start = lines.findIndex((l) => /^\s*-\s*path:\s*["']?supabase\/migrations\//.test(l))
  if (start === -1) throw new Error('no supabase/migrations/** path_instructions entry')
  const indent = lines[start].search(/\S/)
  let end = start + 1
  while (end < lines.length) {
    const l = lines[end]
    if (/^\s*-\s*path:/.test(l) && l.search(/\S/) <= indent) break
    end++
  }
  return lines.slice(start, end).join('\n')
}

/** First anchor missing from `block`, or null. */
export function missingAnchor(block) {
  return ANCHORS.find((a) => !block.includes(a)) ?? null
}

/** Text from `start` to the next numbered suppression heading (or end of file). */
export function suppressionSection(md, start) {
  const bodyAt = md.indexOf('\n', start) + 1
  const next = bodyAt === 0 ? -1 : md.slice(bodyAt).search(/^\d+\. \*\*/m)
  return next === -1 ? md.slice(start) : md.slice(start, bodyAt + next)
}

const yaml = readFileSync(join(ROOT, '.coderabbit.yaml'), 'utf8')
const auditor = readFileSync(join(ROOT, '.claude/agents/security-auditor.md'), 'utf8')

test('every anchor fact of suppression 12 appears in the .coderabbit.yaml migrations block', () => {
  const missing = missingAnchor(migrationsBlock(yaml))
  assert.equal(missing, null, `.coderabbit.yaml migrations block lacks anchor token ${missing}`)
})

test('every anchor fact appears in security-auditor.md suppression 12', () => {
  const i = auditor.indexOf('12. **Do NOT flag the `question-images`')
  assert.notEqual(i, -1, 'suppression 12 not found')
  const sec = suppressionSection(auditor, i)
  const missing = ANCHORS.find((a) => !sec.includes(a))
  assert.equal(missing, undefined, `suppression 12 lacks anchor token ${missing}`)
})

test('a redacted issue number in the migrations block is reported by name', () => {
  const block = migrationsBlock(yaml)
  const mutated = yaml.replace(block, block.replaceAll('#1282', 'REDACTED'))
  assert.equal(missingAnchor(migrationsBlock(mutated)), '#1282')
})

test('a removed migration id is reported by name', () => {
  const mutated = migrationsBlock(yaml).replaceAll('20260324000055', 'X')
  assert.equal(missingAnchor(mutated), '20260324000055')
})

test('an anchor present only in a later suppression is reported missing', () => {
  const md = '12. **Do NOT flag A**\nbody 20260410000009\n13. **Do NOT flag B**\n#1282 is here\n'
  const sec = suppressionSection(md, 0)
  assert.equal(sec.includes('20260410000009'), true)
  assert.equal(sec.includes('#1282'), false)
  assert.equal(
    ANCHORS.find((a) => !sec.includes(a)),
    '20260324000053',
  )
})
