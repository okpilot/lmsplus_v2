import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ADMIN_DIR = __dirname

function pageFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true })
  const own = entries
    .filter((e) => e.isFile() && e.name === 'page.tsx')
    .map((e) => join(dir, e.name))
  return own.concat(
    entries.filter((e) => e.isDirectory()).flatMap((e) => pageFiles(join(dir, e.name))),
  )
}

const pages = pageFiles(ADMIN_DIR).map((f) => relative(ADMIN_DIR, f))

describe('admin pages', () => {
  it('discovers the admin pages including the root page', () => {
    expect(pages.length).toBeGreaterThan(0)
    expect(pages).toContain('page.tsx')
  })

  it.each(pages)('%s verifies the caller with requireAdmin() before rendering', (page) => {
    const source = readFileSync(join(ADMIN_DIR, page), 'utf8')

    expect(source).toMatch(/^\s*await requireAdmin\(\)/m)
    expect(source).toMatch(/from '@\/lib\/auth\/require-admin'/)
  })
})
