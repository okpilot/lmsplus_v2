import { describe, expect, it } from 'vitest'
import { tabHref } from './tab-url'

describe('tabHref', () => {
  it('AC3: groups adds tab=groups and keeps other params', () => {
    const p = new URLSearchParams(tabHref('?status=active&page=2', 'groups').replace(/^\?/, ''))
    expect(p.get('tab')).toBe('groups')
    expect(p.get('status')).toBe('active')
    expect(p.get('page')).toBe('2')
  })

  it('AC3: students removes tab and keeps other params', () => {
    const p = new URLSearchParams(
      tabHref('?tab=groups&status=active', 'students').replace(/^\?/, ''),
    )
    expect(p.has('tab')).toBe(false)
    expect(p.get('status')).toBe('active')
  })

  it('AC3: groups with an empty search yields ?tab=groups', () => {
    expect(tabHref('', 'groups')).toBe('?tab=groups')
  })
})
