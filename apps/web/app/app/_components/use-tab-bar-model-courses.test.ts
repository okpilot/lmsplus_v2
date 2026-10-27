import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useTabBarModel } from './use-tab-bar-model'

const labels = (state: Parameters<typeof useTabBarModel>[1]) =>
  renderHook(() => useTabBarModel('/app/dashboard', state, 20)).result.current.visible.map(
    (i) => i.label,
  )

describe('useTabBarModel VFR RT gating', () => {
  it('hides VFR RT for a PPL-only student', () => {
    expect(labels({ userRole: 'student', courseCodes: ['PPL_A'] })).not.toContain('VFR RT')
  })

  it('shows VFR RT for a PPL + RT student', () => {
    expect(labels({ userRole: 'student', courseCodes: ['PPL_A', 'VFR_RT'] })).toContain('VFR RT')
  })

  it.each(['admin', 'instructor'])('shows VFR RT for %s', (userRole) => {
    expect(labels({ userRole, courseCodes: null })).toContain('VFR RT')
  })

  it('hides VFR RT until the user state resolves', () => {
    expect(labels(undefined)).not.toContain('VFR RT')
  })
})
