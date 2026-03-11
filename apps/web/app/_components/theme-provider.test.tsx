import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from './theme-provider'

// Capture the props passed to NextThemesProvider so we can assert on them.
const { mockNextThemesProvider } = vi.hoisted(() => ({
  mockNextThemesProvider: vi.fn(),
}))

vi.mock('next-themes', () => ({
  ThemeProvider: mockNextThemesProvider,
}))

beforeEach(() => {
  mockNextThemesProvider.mockReset()
  mockNextThemesProvider.mockImplementation(({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ))
})

describe('ThemeProvider', () => {
  it('renders children inside the provider', () => {
    render(
      <ThemeProvider>
        <span>child content</span>
      </ThemeProvider>,
    )
    expect(screen.getByText('child content')).toBeInTheDocument()
  })

  it('configures class-based system theming with transitions disabled', () => {
    render(
      <ThemeProvider>
        <span />
      </ThemeProvider>,
    )
    const receivedProps = mockNextThemesProvider.mock.calls[0]?.[0] as Record<string, unknown>
    expect(receivedProps).toMatchObject({
      attribute: 'class',
      defaultTheme: 'system',
      enableSystem: true,
      disableTransitionOnChange: true,
    })
  })
})
