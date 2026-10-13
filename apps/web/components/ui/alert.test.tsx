import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Alert, AlertAction, AlertDescription, AlertTitle } from './alert'

describe('Alert', () => {
  it('exposes role alert when the caller passes it', () => {
    render(<Alert role="alert">Boom</Alert>)
    expect(screen.getByRole('alert')).toHaveTextContent('Boom')
  })

  it('exposes role status when the caller passes it', () => {
    render(<Alert role="status">Saved</Alert>)
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
  })

  it('has no role attribute when the caller omits it', () => {
    render(<Alert data-testid="a">Note</Alert>)
    expect(screen.getByTestId('a')).not.toHaveAttribute('role')
  })

  it('uses the muted surface for the neutral tone by default', () => {
    render(<Alert data-testid="a">Note</Alert>)
    expect(screen.getByTestId('a').className).toContain('bg-muted')
  })

  it.each([
    ['info', 'bg-info-soft'],
    ['success', 'bg-success-soft'],
    ['caution', 'bg-caution-soft'],
    ['danger', 'bg-danger-soft'],
  ] as const)('paints the %s tone with its soft surface', (tone, cls) => {
    render(
      <Alert tone={tone} data-testid="a">
        x
      </Alert>,
    )
    const el = screen.getByTestId('a')
    expect(el.className).toContain(cls)
    expect(el.className).toContain(`[&>svg]:text-${tone}`)
    expect(el.className).not.toContain('bg-muted')
  })

  it('uses tighter vertical padding in the compact size', () => {
    render(
      <Alert size="compact" data-testid="a">
        x
      </Alert>,
    )
    const el = screen.getByTestId('a')
    expect(el.className).toContain('py-stack')
    expect(el.className).not.toContain('p-card')
  })

  it('marks the root and parts with data-slot', () => {
    render(
      <Alert data-testid="a">
        <AlertTitle>T</AlertTitle>
        <AlertDescription>D</AlertDescription>
        <AlertAction>Act</AlertAction>
      </Alert>,
    )
    expect(screen.getByTestId('a')).toHaveAttribute('data-slot', 'alert')
    expect(screen.getByText('T')).toHaveAttribute('data-slot', 'alert-title')
    expect(screen.getByText('D')).toHaveAttribute('data-slot', 'alert-description')
    expect(screen.getByText('Act')).toHaveAttribute('data-slot', 'alert-action')
  })
})
