import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const src = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

const SITES = [
  'app/app/admin/students/_components/student-table.tsx',
  'app/app/admin/questions/_components/question-table.tsx',
  'app/app/admin/questions/_components/delete-question-button.tsx',
  'app/app/admin/syllabus/_components/delete-button.tsx',
  'app/app/admin/dashboard/_components/student-table-helpers.tsx',
]

describe('hints are Base UI tooltips, never native title', () => {
  it.each(SITES)('%s has no title= attribute and imports the tooltip', (f) => {
    const s = src(f)
    expect(s).not.toMatch(/\btitle=/)
    expect(s).toContain('@/components/ui/tooltip')
  })
})
