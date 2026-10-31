import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const SITES = [
  'components/ui/button-variants.ts',
  'components/ui/input.tsx',
  'components/ui/textarea.tsx',
  'components/ui/select.tsx',
  'components/ui/checkbox.tsx',
  'components/ui/radio-group.tsx',
  'components/ui/switch.tsx',
  'components/ui/label.tsx',
  'components/ui/slider.tsx',
  'app/app/_components/answer-options.tsx',
  'app/app/admin/exam-config/_components/subject-config-card.tsx',
  'app/app/quiz/_components/resume-exam-banner.tsx',
]

describe('disabled opacity uses the token', () => {
  it('has no opacity-50 in app/ or components/ source', () => {
    let out = ''
    try {
      out = execSync(
        `grep -rnE "(^|[^-\\w])opacity-50\\b|:opacity-50\\b" app components --include=*.ts --include=*.tsx --exclude=*.test.ts --exclude=*.test.tsx`,
        { cwd: ROOT, encoding: 'utf8' },
      )
    } catch {
      out = ''
    }
    expect(out).toBe('')
  })

  it.each(SITES)('%s carries opacity-disabled', (f) => {
    expect(readFileSync(path.join(ROOT, f), 'utf8')).toMatch(/\bopacity-disabled\b/)
  })
})
