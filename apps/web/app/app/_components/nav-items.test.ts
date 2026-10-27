import { describe, expect, it } from 'vitest'
import {
  isActivePath,
  NAV_ITEMS,
  SETTINGS_ITEM,
  SIDEBAR_GROUPS,
  visibleNavItems,
} from './nav-items'

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

describe('visibleNavItems', () => {
  const hrefs = (items: { href: string }[]) => items.map((i) => i.href)

  it('drops VFR RT for a student whose courses lack VFR_RT', () => {
    const out = visibleNavItems(NAV_ITEMS, { userRole: 'student', courseCodes: ['PPL_A'] })
    expect(hrefs(out)).not.toContain('/app/vfr-rt')
    expect(hrefs(out)).toContain('/app/quiz')
  })

  it('drops VFR RT for a student with an empty course list', () => {
    const out = visibleNavItems(NAV_ITEMS, { userRole: 'student', courseCodes: [] })
    expect(hrefs(out)).not.toContain('/app/vfr-rt')
  })

  it('keeps VFR RT for a student enrolled in VFR_RT', () => {
    const out = visibleNavItems(NAV_ITEMS, {
      userRole: 'student',
      courseCodes: ['PPL_A', 'VFR_RT'],
    })
    expect(hrefs(out)).toContain('/app/vfr-rt')
  })

  it('keeps VFR RT when courseCodes is null or absent (fail open)', () => {
    expect(hrefs(visibleNavItems(NAV_ITEMS, { userRole: 'student', courseCodes: null }))).toContain(
      '/app/vfr-rt',
    )
    expect(hrefs(visibleNavItems(NAV_ITEMS, { userRole: 'student' }))).toContain('/app/vfr-rt')
  })

  it.each(['admin', 'instructor'])('keeps VFR RT for %s regardless of courseCodes', (userRole) => {
    const out = visibleNavItems(NAV_ITEMS, { userRole, courseCodes: [] })
    expect(hrefs(out)).toContain('/app/vfr-rt')
  })
})
