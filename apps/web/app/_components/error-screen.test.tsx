import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from '@/components/ui/button'
import { ErrorScreen } from './error-screen'

describe('ErrorScreen', () => {
  it('announces the failure with the default title and description', () => {
    render(<ErrorScreen action={<Button>Retry</Button>}>Details here.</ErrorScreen>)
    expect(screen.getByRole('alert')).toHaveAttribute('data-slot', 'empty-header')
    expect(screen.getByRole('heading', { level: 2, name: 'Something went wrong' })).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('Details here.')
  })

  it('centres the card in a tall, gutter-padded area', () => {
    const { container } = render(<ErrorScreen action={null}>x</ErrorScreen>)
    expect(container.firstElementChild?.className).toContain('min-h-[50vh]')
    expect(container.firstElementChild?.className).toContain('place-items-center')
  })

  it('uses a caller title instead of the default', () => {
    render(
      <ErrorScreen title="Quiz unavailable" action={null}>
        x
      </ErrorScreen>,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Quiz unavailable' })).toBeVisible()
  })

  it('draws the icon in the danger tone and hides it from assistive tech', () => {
    const { container } = render(<ErrorScreen action={null}>x</ErrorScreen>)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('class')).toContain('text-danger')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })

  it('keeps the action outside the alert so it is not announced', () => {
    render(<ErrorScreen action={<Button>Retry</Button>}>x</ErrorScreen>)
    expect(screen.getByRole('alert')).not.toContainElement(screen.getByRole('button'))
  })

  it('applies actionClassName to the action row', () => {
    render(
      <ErrorScreen action={<Button>Retry</Button>} actionClassName="sm:flex-row">
        x
      </ErrorScreen>,
    )
    expect(screen.getByRole('button').parentElement?.className).toContain('sm:flex-row')
  })

  it('renders the action and lets it be clicked', async () => {
    const onClick = vi.fn()
    render(<ErrorScreen action={<Button onClick={onClick}>Retry</Button>}>x</ErrorScreen>)
    await userEvent.setup({ delay: null }).click(screen.getByRole('button', { name: 'Retry' }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
