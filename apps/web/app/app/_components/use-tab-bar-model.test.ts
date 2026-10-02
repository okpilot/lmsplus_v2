import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useTabBarModel } from './use-tab-bar-model'

describe('useTabBarModel', () => {
  it('hides admin items from students', () => {
    const { result } = renderHook(() => useTabBarModel('/app/dashboard', 'student', 20))
    expect(result.current.visible.map((i) => i.label)).not.toContain('Syllabus')
    expect(result.current.hidden).toEqual([])
  })

  it('includes admin items for admins', () => {
    const { result } = renderHook(() => useTabBarModel('/app/dashboard', 'admin', 20))
    expect(result.current.visible.map((i) => i.label)).toContain('Syllabus')
  })

  it('resolves the active tab from a sub-path', () => {
    const { result } = renderHook(() => useTabBarModel('/app/quiz/session', 'student', 20))
    expect(result.current.activeHref).toBe('/app/quiz')
    expect(result.current.moreActive).toBe(false)
  })

  it('flags More active when the current page overflows into the sheet', () => {
    const { result } = renderHook(() => useTabBarModel('/app/settings', 'student', 3))
    expect(result.current.hidden.map((i) => i.href)).toContain('/app/settings')
    expect(result.current.moreActive).toBe(true)
  })
})
