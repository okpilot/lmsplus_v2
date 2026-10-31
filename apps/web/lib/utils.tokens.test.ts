import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('AC4 cn() merges the new token groups', () => {
  const cases: ReadonlyArray<readonly [string, string, string]> = [
    ['ring width', 'ring-3 ring-focus', 'ring-focus'],
    ['ring select', 'ring-2 ring-select', 'ring-select'],
    ['ring surface', 'ring-1 ring-surface', 'ring-surface'],
    ['ring offset width', 'ring-offset-4 ring-offset-focus', 'ring-offset-focus'],
    ['outline width', 'outline-4 outline-focus', 'outline-focus'],
    ['border width', 'border-4 border-emphasis', 'border-emphasis'],
    ['opacity', 'opacity-75 opacity-disabled', 'opacity-disabled'],
    ['stroke width', 'stroke-1 stroke-icon', 'stroke-icon'],
    ['stroke bold', 'stroke-icon stroke-icon-bold', 'stroke-icon-bold'],
    ['font weight', 'font-bold font-semibold', 'font-semibold'],
    ['font weight medium', 'font-bold font-medium', 'font-medium'],
    ['tracking', 'tracking-wide tracking-code', 'tracking-code'],
    ['tracking normal', 'tracking-wide tracking-normal', 'tracking-normal'],
    ['tracking logo', 'tracking-wide tracking-logo', 'tracking-logo'],
    ['text question', 'text-body text-question', 'text-question'],
    ['text strong', 'text-label text-label-strong', 'text-label-strong'],
    ['text caption strong', 'text-caption text-caption-strong', 'text-caption-strong'],
    ['text chip', 'text-micro text-chip', 'text-chip'],
    ['sidebar width', 'w-60 w-sidebar', 'w-sidebar'],
    ['control size', 'h-9 h-control-sm', 'h-control-sm'],
    ['spacing role', 'p-4 p-pad-control', 'p-pad-control'],
  ]
  for (const [name, input, out] of cases) {
    it(`${name}: ${input} -> ${out}`, () => {
      expect(cn(...input.split(' '))).toBe(out)
    })
  }

  it('keeps a ring colour next to a ring width', () => {
    expect(cn('ring-ring', 'ring-focus')).toBe('ring-ring ring-focus')
  })
})
