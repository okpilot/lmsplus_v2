import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { FLOATING_SURFACE } from './floating-surface'

describe('FLOATING_SURFACE', () => {
  it('is exactly the five surface tokens', () => {
    expect(FLOATING_SURFACE).toBe(
      'bg-popover text-popover-foreground ring-surface ring-border shadow-raised',
    )
  })

  it('carries no radius, outline or animation class', () => {
    expect(FLOATING_SURFACE).not.toMatch(/rounded|outline|animate|duration|data-/)
  })

  it('is used verbatim by popover.tsx', () => {
    const src = readFileSync(path.join(__dirname, 'popover.tsx'), 'utf8')
    expect(src).toContain('FLOATING_SURFACE')
    expect(src).not.toContain('ring-surface ring-border shadow-raised')
  })
})
