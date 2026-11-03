import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const src = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')
const SITES = ['app/app/_components/user-chip.tsx', 'app/app/quiz/_components/comments-tab.tsx']

describe('avatar sites use the shared Avatar', () => {
  it.each(SITES)('%s imports Avatar and has no hand-rolled circle', (f) => {
    const s = src(f)
    expect(s).toContain('@/components/ui/avatar')
    expect(s).not.toMatch(/rounded-pill[^'"`\n]*bg-muted|bg-muted[^'"`\n]*rounded-pill/)
    expect(s).not.toMatch(/(?<![\w-])h-8 w-8(?![\w-])/)
  })

  it.each(SITES)('%s does not define its own initials helper', (f) => {
    expect(src(f)).not.toMatch(/(function|const)\s+(getInitials|initials)\b/)
  })

  it.each(SITES)('%s takes initials from lib/utils/initials', (f) => {
    expect(src(f)).toContain('@/lib/utils/initials')
  })

  it('comment-helpers.ts no longer exists', () => {
    expect(existsSync(path.join(ROOT, 'app/app/quiz/_components/comment-helpers.ts'))).toBe(false)
  })

  it('user-chip no longer exports initials', () => {
    expect(src('app/app/_components/user-chip.tsx')).not.toMatch(
      /export\s+(function|const)\s+initials/,
    )
  })

  it('keyboard-legend draws keys with Kbd and no raw kbd element', () => {
    const s = src('app/app/quiz/session/_components/keyboard-legend.tsx')
    expect(s).toContain('@/components/kit/kbd')
    expect(s).not.toContain('<kbd')
  })
})
