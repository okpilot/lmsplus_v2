import { existsSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

type Boundary = 'error' | 'loading'

const APP_DIR = __dirname

// Page directories allowed to lack their own boundary files today. Phase 2 (#1416) removes
// entries as screens are redone; a fixed directory must leave the list.
const KNOWN_GAPS: Record<string, Boundary[]> = {
  '.': ['loading'],
  app: ['error', 'loading'],
  'app/admin': ['loading'],
  'app/admin/dashboard': ['error'],
  'app/admin/dashboard/sessions/[id]': ['error', 'loading'],
  'app/admin/dashboard/students/[id]': ['error'],
  'app/admin/exam-config': ['error'],
  'app/admin/internal-exams': ['error', 'loading'],
  'app/admin/internal-exams/report': ['error', 'loading'],
  'app/admin/questions': ['error'],
  'app/admin/students': ['error'],
  'app/admin/syllabus': ['error'],
  'app/dashboard': ['error'],
  'app/internal-exam': ['error', 'loading'],
  'app/internal-exam/report': ['error'],
  'app/progress': ['error'],
  'app/quiz': ['error'],
  'app/quiz/report': ['error', 'loading'],
  'app/quiz/session': ['error', 'loading'],
  'app/reports': ['error'],
  'app/settings': ['error'],
  'app/vfr-rt': ['error', 'loading'],
  'app/vfr-rt/report': ['error', 'loading'],
  'auth/forgot-password': ['error', 'loading'],
  'auth/reset-password': ['error', 'loading'],
  'auth/set-password': ['error', 'loading'],
  consent: ['error', 'loading'],
  'legal/privacy': ['error', 'loading'],
  'legal/terms': ['error', 'loading'],
}

function pageDirs(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true })
  const own = entries.some((e) => e.isFile() && e.name === 'page.tsx') ? [dir] : []
  return own.concat(
    entries.filter((e) => e.isDirectory()).flatMap((e) => pageDirs(join(dir, e.name))),
  )
}

function missingBoundaries(): Record<string, Boundary[]> {
  const gaps: Record<string, Boundary[]> = {}
  for (const dir of pageDirs(APP_DIR)) {
    const missing = (['error', 'loading'] as const).filter(
      (b) => !existsSync(join(dir, `${b}.tsx`)),
    )
    if (missing.length > 0) gaps[relative(APP_DIR, dir).split(sep).join('/') || '.'] = missing
  }
  return gaps
}

describe('page segment boundaries', () => {
  it('gives every page directory its own error.tsx and loading.tsx, except the listed gaps', () => {
    expect(pageDirs(APP_DIR).length).toBeGreaterThan(0)
    expect(missingBoundaries()).toEqual(KNOWN_GAPS)
  })
})
