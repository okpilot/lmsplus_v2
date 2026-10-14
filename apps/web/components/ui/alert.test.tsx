import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Alert, AlertAction, AlertDescription, AlertTitle } from './alert'

describe('AlertAction', () => {
  it('always stacks below the alert text, spanning every column', () => {
    render(<AlertAction data-testid="a">Undo</AlertAction>)
    const classes = screen.getByTestId('a').className.split(/\s+/)
    expect(classes).toContain('col-span-full')
    expect(classes.some((c) => c.startsWith('sm:'))).toBe(false)
  })

  it('aligns with the text column when the alert has an icon', () => {
    render(<AlertAction data-testid="a">Undo</AlertAction>)
    expect(screen.getByTestId('a').className.split(/\s+/)).toContain(
      'group-has-[>svg]/alert:col-start-2',
    )
  })

  it('keeps the root grid free of a side action column', () => {
    render(<Alert data-testid="r">x</Alert>)
    expect(screen.getByTestId('r').className).not.toMatch(/sm:has-data/)
  })
})

describe('AlertDescription', () => {
  it('uses the muted foreground when muted, instead of the tone text', () => {
    render(
      <Alert tone="caution">
        <AlertDescription muted data-testid="d">
          Note
        </AlertDescription>
      </Alert>,
    )
    const cls = screen.getByTestId('d').className
    expect(cls).toContain('text-muted-foreground')
    expect(cls).not.toContain('alert:text-caution')
  })

  it('keeps the tone text by default', () => {
    render(
      <Alert tone="caution">
        <AlertDescription data-testid="d">Note</AlertDescription>
      </Alert>,
    )
    expect(screen.getByTestId('d').className).toContain('alert:text-caution')
    expect(screen.getByTestId('d').className).not.toContain('text-muted-foreground')
  })
})

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

  it.each([
    ['info', 'text-info'],
    ['success', 'text-success'],
    ['caution', 'text-caution'],
    ['danger', 'text-danger'],
  ] as const)('tints the %s title and description with the tone colour', (tone, cls) => {
    render(
      <Alert tone={tone} data-testid="a">
        <AlertTitle>T</AlertTitle>
        <AlertDescription>D</AlertDescription>
      </Alert>,
    )
    expect(screen.getByTestId('a')).toHaveAttribute('data-tone', tone)
    expect(screen.getByText('T').className).toContain(`group-data-[tone=${tone}]/alert:${cls}`)
    expect(screen.getByText('D').className).toContain(`group-data-[tone=${tone}]/alert:${cls}`)
  })

  it('keeps the root text colour foreground so actions are not tinted', () => {
    render(
      <Alert tone="danger" data-testid="a">
        x
      </Alert>,
    )
    expect(screen.getByTestId('a').className).toContain('text-foreground')
  })

  it('marks the default tone as neutral', () => {
    render(<Alert data-testid="a">x</Alert>)
    expect(screen.getByTestId('a')).toHaveAttribute('data-tone', 'neutral')
  })

  it('keeps a caller muted description colour alongside the tone tint', () => {
    render(
      <Alert tone="info">
        <AlertDescription className="text-muted-foreground">D</AlertDescription>
      </Alert>,
    )
    const cls = screen.getByText('D').className
    expect(cls).toContain('text-muted-foreground')
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
