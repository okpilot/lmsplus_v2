import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSetTheme, mockUseTheme } = vi.hoisted(() => ({
  mockSetTheme: vi.fn(),
  mockUseTheme: vi.fn(),
}))

vi.mock('next-themes', () => ({ useTheme: mockUseTheme }))

import { MOON_PATHS, SUN_PATHS, useThemeSwitch } from './use-theme-switch'

beforeEach(() => {
  vi.resetAllMocks()
})

describe('useThemeSwitch', () => {
  it('reports dark once mounted when the resolved theme is dark', () => {
    mockUseTheme.mockReturnValue({ resolvedTheme: 'dark', setTheme: mockSetTheme })
    const { result } = renderHook(() => useThemeSwitch())
    expect(result.current.mounted).toBe(true)
    expect(result.current.isDark).toBe(true)
  })

  it('reports light when the resolved theme is light', () => {
    mockUseTheme.mockReturnValue({ resolvedTheme: 'light', setTheme: mockSetTheme })
    const { result } = renderHook(() => useThemeSwitch())
    expect(result.current.isDark).toBe(false)
  })

  it('switches to light when toggled in dark mode', () => {
    mockUseTheme.mockReturnValue({ resolvedTheme: 'dark', setTheme: mockSetTheme })
    const { result } = renderHook(() => useThemeSwitch())
    act(() => result.current.toggle())
    expect(mockSetTheme).toHaveBeenCalledWith('light')
  })

  it('switches to dark when toggled in light mode', () => {
    mockUseTheme.mockReturnValue({ resolvedTheme: 'light', setTheme: mockSetTheme })
    const { result } = renderHook(() => useThemeSwitch())
    act(() => result.current.toggle())
    expect(mockSetTheme).toHaveBeenCalledWith('dark')
  })

  it('exposes distinct sun and moon icon paths', () => {
    expect(SUN_PATHS.length).toBeGreaterThan(MOON_PATHS.length)
  })
})
