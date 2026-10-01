import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSetTheme, mockUseTheme } = vi.hoisted(() => ({
  mockSetTheme: vi.fn(),
  mockUseTheme: vi.fn(),
}))

vi.mock('next-themes', () => ({ useTheme: mockUseTheme }))

import { ThemeRow } from './theme-row'

function renderRow(resolvedTheme: string) {
  mockUseTheme.mockReturnValue({ resolvedTheme, setTheme: mockSetTheme })
  render(<ThemeRow />)
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('ThemeRow', () => {
  it('offers dark mode when the theme is light', async () => {
    renderRow('light')
    await userEvent.setup({ delay: null }).click(screen.getByRole('button', { name: 'Dark mode' }))
    expect(mockSetTheme).toHaveBeenCalledWith('dark')
  })

  it('offers light mode when the theme is dark', async () => {
    renderRow('dark')
    await userEvent.setup({ delay: null }).click(screen.getByRole('button', { name: 'Light mode' }))
    expect(mockSetTheme).toHaveBeenCalledWith('light')
  })

  it('does not change the theme on render', () => {
    renderRow('light')
    expect(mockSetTheme).not.toHaveBeenCalled()
  })
})
