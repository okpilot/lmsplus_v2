import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeToggle } from './theme-toggle'

// Control the current theme value and capture setTheme calls.
const { mockSetTheme, mockUseTheme } = vi.hoisted(() => {
  const mockSetTheme = vi.fn()
  const mockUseTheme = vi.fn()
  return { mockSetTheme, mockUseTheme }
})

vi.mock('next-themes', () => ({
  useTheme: mockUseTheme,
}))

beforeEach(() => {
  mockSetTheme.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

function renderToggle(theme: string) {
  mockUseTheme.mockReturnValue({ resolvedTheme: theme, setTheme: mockSetTheme })
  // Use delay:null so userEvent does not fight with any timer state.
  const user = userEvent.setup({ delay: null })
  render(<ThemeToggle />)
  return { user }
}

describe('ThemeToggle', () => {
  describe('after mount', () => {
    it('renders a button with aria-label "Toggle theme"', () => {
      renderToggle('light')
      expect(screen.getByRole('button', { name: /toggle theme/i })).toBeInTheDocument()
    })

    it('shows the sun icon (several rays) when the theme is dark', () => {
      renderToggle('dark')
      const button = screen.getByRole('button', { name: /toggle theme/i })
      expect(button.querySelectorAll('path').length).toBeGreaterThan(1)
    })

    it('shows the moon icon (single path) when the theme is light', () => {
      renderToggle('light')
      const button = screen.getByRole('button', { name: /toggle theme/i })
      expect(button.querySelectorAll('path')).toHaveLength(1)
    })

    it('switches from dark to light when clicked in dark mode', async () => {
      const { user } = renderToggle('dark')
      await user.click(screen.getByRole('button', { name: /toggle theme/i }))
      expect(mockSetTheme).toHaveBeenCalledWith('light')
    })

    it('switches from light to dark when clicked in light mode', async () => {
      const { user } = renderToggle('light')
      await user.click(screen.getByRole('button', { name: /toggle theme/i }))
      expect(mockSetTheme).toHaveBeenCalledWith('dark')
    })

    it('calls setTheme exactly once per click', async () => {
      const { user } = renderToggle('light')
      await user.click(screen.getByRole('button', { name: /toggle theme/i }))
      expect(mockSetTheme).toHaveBeenCalledTimes(1)
    })

    it('does not set theme on initial render', () => {
      renderToggle('light')
      expect(mockSetTheme).not.toHaveBeenCalled()
    })
  })
})
