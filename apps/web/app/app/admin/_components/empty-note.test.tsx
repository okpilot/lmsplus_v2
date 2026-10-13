import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EmptyNote } from './empty-note'

describe('EmptyNote', () => {
  it('shows the note inside the shared empty part', () => {
    const { container } = render(<EmptyNote>No sessions yet.</EmptyNote>)
    expect(screen.getByText('No sessions yet.')).toBeInTheDocument()
    expect(container.querySelector('[data-slot="empty"]')).not.toBeNull()
  })
})
