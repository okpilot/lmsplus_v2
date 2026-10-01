import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { StatusNote } from './status-note'

describe('StatusNote', () => {
  it('announces a bad note as an alert', () => {
    render(<StatusNote tone="bad">Failed</StatusNote>)
    expect(screen.getByRole('alert')).toHaveTextContent('Failed')
  })

  it.each(['caution', 'ok'] as const)('announces a %s note as a status', (tone) => {
    render(<StatusNote tone={tone}>Heads up</StatusNote>)
    expect(screen.getByRole('status')).toHaveTextContent('Heads up')
  })

  it('shows the title and the body together', () => {
    render(
      <StatusNote tone="ok" title="Saved">
        All changes stored
      </StatusNote>,
    )
    expect(screen.getByText('Saved')).toHaveClass('font-medium')
    expect(screen.getByText('All changes stored')).toBeInTheDocument()
  })

  it('hides the decorative icon from assistive tech', () => {
    const { container } = render(<StatusNote tone="caution">Careful</StatusNote>)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})
