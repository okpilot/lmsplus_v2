import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyNote,
  EmptyTitle,
} from './empty'

describe('Empty', () => {
  it('passes role and testid through to the root', () => {
    render(<Empty role="status" data-testid="e" />)
    const el = screen.getByTestId('e')
    expect(el).toHaveAttribute('role', 'status')
    expect(el).toHaveAttribute('data-slot', 'empty')
  })

  it('renders a non-heading title by default', () => {
    render(<EmptyTitle>Nothing</EmptyTitle>)
    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.getByText('Nothing').className).toContain('text-heading')
  })

  it('renders a level-2 heading when asked', () => {
    render(<EmptyTitle as="h2">Nothing</EmptyTitle>)
    expect(screen.getByRole('heading', { level: 2, name: 'Nothing' })).toBeInTheDocument()
  })

  it('styles the icon media variant as a round muted badge', () => {
    render(<EmptyMedia variant="icon" data-testid="m" />)
    const cls = screen.getByTestId('m').className
    expect(cls).toContain('size-12')
    expect(cls).toContain('rounded-full')
  })

  it('leaves the default media unstyled by the icon look', () => {
    render(<EmptyMedia data-testid="m" />)
    expect(screen.getByTestId('m').className).not.toContain('size-12')
  })

  it('marks every part with its data-slot', () => {
    render(
      <Empty>
        <EmptyHeader data-testid="h">
          <EmptyDescription>D</EmptyDescription>
        </EmptyHeader>
        <EmptyContent data-testid="c" />
      </Empty>,
    )
    expect(screen.getByTestId('h')).toHaveAttribute('data-slot', 'empty-header')
    expect(screen.getByText('D')).toHaveAttribute('data-slot', 'empty-description')
    expect(screen.getByTestId('c')).toHaveAttribute('data-slot', 'empty-content')
  })
})

describe('EmptyNote', () => {
  it('shows the note as the description of an empty part', () => {
    const { container } = render(<EmptyNote>No sessions yet.</EmptyNote>)
    expect(container.querySelector('[data-slot="empty"]')).toContainElement(
      screen.getByText('No sessions yet.'),
    )
    expect(screen.getByText('No sessions yet.')).toHaveAttribute('data-slot', 'empty-description')
  })

  it('shows an inline note as bare muted text outside any empty card', () => {
    render(
      <EmptyNote variant="inline" className="py-4 text-center">
        Nothing here.
      </EmptyNote>,
    )
    const note = screen.getByText('Nothing here.')
    expect(note.closest('[data-slot="empty"]')).toBeNull()
    expect(note).toHaveAttribute('data-slot', 'empty-note')
    expect(note.className).toContain('text-muted-foreground')
    expect(note.className).toContain('py-4')
    expect(note.className).toContain('text-center')
  })
})
