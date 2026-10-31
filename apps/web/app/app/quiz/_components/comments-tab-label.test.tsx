import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../session/_hooks/use-comments', () => ({
  useComments: () => ({
    comments: [],
    isLoading: false,
    error: null,
    addComment: vi.fn(),
    removeComment: vi.fn(),
  }),
}))

import { CommentsTab } from './comments-tab'

describe('CommentsTab input name (#1433 S7)', () => {
  it('AC3: comment box has aria-label "Add a comment"', () => {
    render(<CommentsTab questionId="q-1" currentUserId="u-1" />)
    expect(screen.getByRole('textbox', { name: 'Add a comment' })).toBeInTheDocument()
  })

  it('AC3: comment box keeps its placeholder', () => {
    render(<CommentsTab questionId="q-1" currentUserId="u-1" />)
    const box = screen.getByRole('textbox', { name: 'Add a comment' })
    expect(box.getAttribute('placeholder')).toBeTruthy()
  })
})
