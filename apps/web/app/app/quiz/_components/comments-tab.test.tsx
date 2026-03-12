import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CommentsTab } from './comments-tab'

describe('CommentsTab', () => {
  it('renders the coming soon placeholder', () => {
    render(<CommentsTab />)
    expect(screen.getByText('Comments are coming soon.')).toBeInTheDocument()
  })
})
