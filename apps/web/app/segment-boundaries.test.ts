import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

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

function missingBoundaries(root: string): Record<string, Boundary[]> {
  const gaps: Record<string, Boundary[]> = {}
  for (const dir of pageDirs(root)) {
    const missing = (['error', 'loading'] as const).filter(
      (b) => !existsSync(join(dir, `${b}.tsx`)),
    )
    if (missing.length > 0) gaps[relative(root, dir).split(sep).join('/') || '.'] = missing
  }
  return gaps
}

const fixtureRoots: string[] = []

function fixtureTree(files: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'segment-boundaries-'))
  fixtureRoots.push(root)
  for (const file of files) {
    mkdirSync(join(root, file, '..'), { recursive: true })
    writeFileSync(join(root, file), '')
  }
  return root
}

describe('page segment boundaries', () => {
  afterAll(() => {
    for (const root of fixtureRoots) rmSync(root, { recursive: true, force: true })
  })

  it('gives every page directory its own error.tsx and loading.tsx, except the listed gaps', () => {
    expect(pageDirs(APP_DIR).length).toBeGreaterThan(0)
    expect(missingBoundaries(APP_DIR)).toEqual(KNOWN_GAPS)
  })

  it('reports a new page directory that lacks its boundary files', () => {
    const root = fixtureTree(['a/page.tsx', 'a/error.tsx', 'a/loading.tsx', 'b/page.tsx'])
    expect(missingBoundaries(root)).toEqual({ b: ['error', 'loading'] })
  })

  it('reports nothing for a listed directory once its boundary files exist', () => {
    const root = fixtureTree(['a/page.tsx', 'a/error.tsx', 'a/loading.tsx'])
    expect(missingBoundaries(root)).toEqual({})
  })
})
