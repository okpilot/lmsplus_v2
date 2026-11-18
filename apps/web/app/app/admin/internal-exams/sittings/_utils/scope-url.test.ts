import { describe, expect, it } from 'vitest'
import { scopeUrl } from './scope-url'

describe('scopeUrl', () => {
  it('sets tab=sittings and the scope', () => {
    const url = scopeUrl('/app/admin/internal-exams', new URLSearchParams(), 'open')
    expect(url).toContain('/app/admin/internal-exams?')
    expect(url).toContain('tab=sittings')
    expect(url).toContain('scope=open')
  })

  it('drops page and dlg but keeps other params', () => {
    const url = scopeUrl(
      '/app/admin/internal-exams',
      new URLSearchParams('tab=sittings&scope=past&page=3&dlg=new&status=active'),
      'cancelled',
    )
    expect(url).not.toContain('page=')
    expect(url).not.toContain('dlg=')
    expect(url).toContain('status=active')
    expect(url).toContain('scope=cancelled')
  })
})
