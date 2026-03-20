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

describe('CommentsTab', () => {
  it('renders the coming soon placeholder', () => {
    render(<CommentsTab questionId="q1" currentUserId="test-user-id" />)
    expect(screen.getByText('No comments yet. Be the first to comment.')).toBeInTheDocument()
  })
})
