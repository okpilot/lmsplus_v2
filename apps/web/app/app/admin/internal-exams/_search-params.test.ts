import { describe, expect, it } from 'vitest'
import { parseInternalExamsSearchParams } from './_search-params'

describe('parseInternalExamsSearchParams', () => {
  it('keeps a recognised code status', () => {
    expect(parseInternalExamsSearchParams({ status: 'consumed' }).status).toBe('consumed')
    expect(parseInternalExamsSearchParams({ status: 'finished' }).status).toBe('finished')
  })

  it('drops an unrecognised status to undefined', () => {
    expect(parseInternalExamsSearchParams({ status: 'bogus' }).status).toBeUndefined()
  })

  it('drops an array-valued status to undefined', () => {
    expect(parseInternalExamsSearchParams({ status: ['active', 'voided'] }).status).toBeUndefined()
  })

  it('leaves status undefined and both page numbers at 1 when all params are absent', () => {
    const result = parseInternalExamsSearchParams({})
    expect(result.status).toBeUndefined()
    expect(result.codesPage).toBe(1)
    expect(result.attemptsPage).toBe(1)
  })

  it('parses the two table pages independently', () => {
    const result = parseInternalExamsSearchParams({ codesPage: '3', attemptsPage: '5' })
    expect(result.codesPage).toBe(3)
    expect(result.attemptsPage).toBe(5)
  })

  it('falls back to page 1 for an out-of-range page value', () => {
    expect(parseInternalExamsSearchParams({ codesPage: '0' }).codesPage).toBe(1)
    expect(parseInternalExamsSearchParams({ attemptsPage: '-2' }).attemptsPage).toBe(1)
  })
})

describe('parseInternalExamsSearchParams: tab, scope, dlg', () => {
  it('defaults tab to sittings and scope to upcoming', () => {
    const r = parseInternalExamsSearchParams({})
    expect(r.tab).toBe('sittings')
    expect(r.scope).toBe('upcoming')
    expect(r.dlg).toBeUndefined()
  })

  it('keeps each recognised tab', () => {
    for (const tab of ['sittings', 'codes', 'attempts'])
      expect(parseInternalExamsSearchParams({ tab }).tab).toBe(tab)
  })

  it('falls back to sittings for an unknown or array tab', () => {
    expect(parseInternalExamsSearchParams({ tab: 'x' }).tab).toBe('sittings')
    expect(parseInternalExamsSearchParams({ tab: ['sittings', 'codes'] }).tab).toBe('sittings')
  })

  it('keeps each recognised scope', () => {
    for (const scope of ['upcoming', 'open', 'past', 'cancelled'])
      expect(parseInternalExamsSearchParams({ scope }).scope).toBe(scope)
  })

  it('falls back to upcoming for an unknown or array scope', () => {
    expect(parseInternalExamsSearchParams({ scope: 'all' }).scope).toBe('upcoming')
    expect(parseInternalExamsSearchParams({ scope: ['open', 'past'] }).scope).toBe('upcoming')
  })

  it('keeps dlg new and edit, drops anything else', () => {
    expect(parseInternalExamsSearchParams({ dlg: 'new' }).dlg).toBe('new')
    expect(parseInternalExamsSearchParams({ dlg: 'edit' }).dlg).toBe('edit')
    expect(parseInternalExamsSearchParams({ dlg: 'people' }).dlg).toBeUndefined()
    expect(parseInternalExamsSearchParams({ dlg: ['new', 'edit'] }).dlg).toBeUndefined()
  })
})

describe('readTabParam', () => {
  it('returns codes for a repeated tab param, matching the server', async () => {
    const { readTabParam } = await import('./_search-params')
    expect(readTabParam(new URLSearchParams('tab=sittings&tab=codes'))).toBe('codes')
  })

  it('returns the tab for a single tab param', async () => {
    const { readTabParam } = await import('./_search-params')
    expect(readTabParam(new URLSearchParams('tab=sittings'))).toBe('sittings')
  })

  it('returns codes when tab is absent', async () => {
    const { readTabParam } = await import('./_search-params')
    expect(readTabParam(new URLSearchParams(''))).toBe('codes')
  })
})

describe('readDlgParam', () => {
  it('reads each recognised dlg value', async () => {
    const { readDlgParam } = await import('./_search-params')
    expect(readDlgParam(new URLSearchParams('dlg=new'))).toBe('new')
    expect(readDlgParam(new URLSearchParams('dlg=edit'))).toBe('edit')
  })

  it('returns null for a repeated dlg, as the server drops an array', async () => {
    const { readDlgParam } = await import('./_search-params')
    expect(readDlgParam(new URLSearchParams('dlg=new&dlg=new'))).toBeNull()
  })

  it('returns null for an unknown or absent dlg', async () => {
    const { readDlgParam } = await import('./_search-params')
    expect(readDlgParam(new URLSearchParams('dlg=bogus'))).toBeNull()
    expect(readDlgParam(new URLSearchParams(''))).toBeNull()
  })
})
