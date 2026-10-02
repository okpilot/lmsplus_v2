import { describe, expect, it } from 'vitest'
import { isActivePath, NAV_ITEMS, SETTINGS_ITEM, SIDEBAR_GROUPS } from './nav-items'

describe('isActivePath', () => {
  it('matches the exact path', () => {
    expect(isActivePath('/app/quiz', '/app/quiz')).toBe(true)
  })

  it('matches a nested path', () => {
    expect(isActivePath('/app/quiz/session', '/app/quiz')).toBe(true)
  })

  it('does not match a sibling that only shares a prefix', () => {
    expect(isActivePath('/app/quizzes', '/app/quiz')).toBe(false)
    expect(isActivePath('/app/admin/dashboard', '/app/dashboard')).toBe(false)
  })
})

describe('sidebar groups', () => {
  it('lists Learn then Progress in order', () => {
    expect(SIDEBAR_GROUPS.map((g) => g.label)).toEqual(['Learn', 'Progress'])
    expect(SIDEBAR_GROUPS[0]?.items.map((i) => i.label)).toEqual([
      'Dashboard',
      'Quiz',
      'VFR RT',
      'Internal Exam',
    ])
    expect(SIDEBAR_GROUPS[1]?.items.map((i) => i.label)).toEqual(['Reports'])
  })

  it('only reuses items from the shared navigation list', () => {
    for (const item of SIDEBAR_GROUPS.flatMap((g) => g.items)) {
      expect(NAV_ITEMS).toContain(item)
    }
  })

  it('exposes Settings outside the groups', () => {
    expect(SETTINGS_ITEM?.href).toBe('/app/settings')
    expect(SIDEBAR_GROUPS.flatMap((g) => g.items)).not.toContain(SETTINGS_ITEM)
  })
})
