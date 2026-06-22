import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAddComment, mockRemoveComment, mockUseComments } = vi.hoisted(() => ({
  mockAddComment: vi.fn(),
  mockRemoveComment: vi.fn(),
  mockUseComments: vi.fn(),
}))

vi.mock('../session/_hooks/use-comments', () => ({
  useComments: (...args: unknown[]) => mockUseComments(...args),
}))

import { CommentsTab } from './comments-tab'

const CURRENT_USER_ID = 'user-current'
const OTHER_USER_ID = 'user-other'

const makeComment = (
  id: string,
  overrides: {
    user_id?: string
    body?: string
    role?: string
    full_name?: string | null
  } = {},
) => ({
  id,
  question_id: 'q-1',
  user_id: overrides.user_id ?? OTHER_USER_ID,
  body: overrides.body ?? 'A comment body',
  created_at: '2026-03-11T00:00:00Z',
  users: {
    full_name: overrides.full_name !== undefined ? overrides.full_name : 'Bob',
    role: overrides.role ?? 'student',
  },
})

function defaultHookState(
  partial: Partial<{
    comments: ReturnType<typeof makeComment>[]
    isLoading: boolean
    error: string | null
  }> = {},
) {
  return {
    comments: partial.comments ?? [],
    isLoading: partial.isLoading ?? false,
    error: partial.error ?? null,
    addComment: mockAddComment,
    removeComment: mockRemoveComment,
  }
}

describe('CommentsTab', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockUseComments.mockReturnValue(defaultHookState())
  })

  it('shows empty state when there are no comments', () => {
    render(<CommentsTab questionId="q-1" currentUserId={CURRENT_USER_ID} />)
    expect(screen.getByText('No comments yet. Be the first to comment.')).toBeInTheDocument()
  })

  it('shows singular comment count label', () => {
    mockUseComments.mockReturnValue(defaultHookState({ comments: [makeComment('c-1')] }))
    render(<CommentsTab questionId="q-1" currentUserId={CURRENT_USER_ID} />)
    expect(screen.getByText('1 comment')).toBeInTheDocument()
  })

  it('shows plural comments count label', () => {
    mockUseComments.mockReturnValue(
      defaultHookState({ comments: [makeComment('c-1'), makeComment('c-2')] }),
    )
    render(<CommentsTab questionId="q-1" currentUserId={CURRENT_USER_ID} />)
    expect(screen.getByText('2 comments')).toBeInTheDocument()
  })

  it('renders comment body and author name', () => {
    mockUseComments.mockReturnValue(
      defaultHookState({
        comments: [makeComment('c-1', { body: 'Great explanation!', full_name: 'Alice' })],
      }),
    )
    render(<CommentsTab questionId="q-1" currentUserId={CURRENT_USER_ID} />)
    expect(screen.getByText('Great explanation!')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('shows the LMS Plus badge for admin comments', () => {
    mockUseComments.mockReturnValue(
      defaultHookState({
        comments: [makeComment('c-1', { role: 'admin', full_name: 'Instructor' })],
      }),
    )
    render(<CommentsTab questionId="q-1" currentUserId={CURRENT_USER_ID} />)
    expect(screen.getByText('LMS Plus')).toBeInTheDocument()
  })

  it('does not show LMS Plus badge for student comments', () => {
    mockUseComments.mockReturnValue(
      defaultHookState({
        comments: [makeComment('c-1', { role: 'student' })],
      }),
    )
    render(<CommentsTab questionId="q-1" currentUserId={CURRENT_USER_ID} />)
    expect(screen.queryByText('LMS Plus')).not.toBeInTheDocument()
  })

  it('shows Delete button only for comments owned by the current user', () => {
    mockUseComments.mockReturnValue(
      defaultHookState({
        comments: [
          makeComment('c-own', { user_id: CURRENT_USER_ID, body: 'My comment' }),
          makeComment('c-other', { user_id: OTHER_USER_ID, body: 'Their comment' }),
        ],
      }),
    )
    render(<CommentsTab questionId="q-1" currentUserId={CURRENT_USER_ID} />)
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1)
  })

  it('calls removeComment when Delete is clicked', async () => {
    mockRemoveComment.mockResolvedValue(true)
    mockUseComments.mockReturnValue(
      defaultHookState({
        comments: [makeComment('c-own', { user_id: CURRENT_USER_ID })],
      }),
    )

    const user = userEvent.setup()
    render(<CommentsTab questionId="q-1" currentUserId={CURRENT_USER_ID} />)
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    expect(mockRemoveComment).toHaveBeenCalledWith('c-own')
  })

  it('shows an error message when the hook reports an error', () => {
    mockUseComments.mockReturnValue(defaultHookState({ error: 'Failed to load comments' }))
    render(<CommentsTab questionId="q-1" currentUserId={CURRENT_USER_ID} />)
    expect(screen.getByText('Failed to load comments')).toBeInTheDocument()
  })

  it('shows loading skeleton while comments are loading', () => {
    mockUseComments.mockReturnValue(defaultHookState({ isLoading: true }))
    render(<CommentsTab questionId="q-1" currentUserId={CURRENT_USER_ID} />)
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument()
    // The main content form should not be rendered yet
    expect(screen.queryByPlaceholderText('Add a comment...')).not.toBeInTheDocument()
  })

  it('posts a comment when the Post button is clicked with non-empty text', async () => {
    mockAddComment.mockResolvedValue(true)
    const user = userEvent.setup()
    render(<CommentsTab questionId="q-1" currentUserId={CURRENT_USER_ID} />)

    await user.type(screen.getByPlaceholderText('Add a comment...'), 'Hello world')
    await user.click(screen.getByRole('button', { name: 'Post' }))

    expect(mockAddComment).toHaveBeenCalledWith('Hello world')
  })

  it('clears the input after a successful post', async () => {
    mockAddComment.mockResolvedValue(true)
    const user = userEvent.setup()
    render(<CommentsTab questionId="q-1" currentUserId={CURRENT_USER_ID} />)

    const input = screen.getByPlaceholderText('Add a comment...')
    await user.type(input, 'My message')
    await user.click(screen.getByRole('button', { name: 'Post' }))

    await waitFor(() => {
      expect(input).toHaveValue('')
    })
  })

  it('does not clear the input when the post fails', async () => {
    mockAddComment.mockResolvedValue(false)
    const user = userEvent.setup()
    render(<CommentsTab questionId="q-1" currentUserId={CURRENT_USER_ID} />)

    const input = screen.getByPlaceholderText('Add a comment...')
    await user.type(input, 'Failed message')
    await user.click(screen.getByRole('button', { name: 'Post' }))

    await waitFor(() => {
      expect(mockAddComment).toHaveBeenCalled()
    })
    expect(input).toHaveValue('Failed message')
  })

  it('does not submit when the input is blank', async () => {
    const user = userEvent.setup()
    render(<CommentsTab questionId="q-1" currentUserId={CURRENT_USER_ID} />)

    await user.click(screen.getByRole('button', { name: 'Post' }))

    expect(mockAddComment).not.toHaveBeenCalled()
  })

  it('posts a comment when Enter is pressed in the input', async () => {
    mockAddComment.mockResolvedValue(true)
    const user = userEvent.setup()
    render(<CommentsTab questionId="q-1" currentUserId={CURRENT_USER_ID} />)

    await user.type(screen.getByPlaceholderText('Add a comment...'), 'Enter key test{Enter}')

    expect(mockAddComment).toHaveBeenCalledWith('Enter key test')
  })

  it('shows "Unknown" name and "U" initials for a comment with no author name', () => {
    mockUseComments.mockReturnValue(
      defaultHookState({
        comments: [makeComment('c-1', { full_name: null })],
      }),
    )
    render(<CommentsTab questionId="q-1" currentUserId={CURRENT_USER_ID} />)
    // Production code falls back to 'Unknown' when full_name is null
    expect(screen.getByText('Unknown')).toBeInTheDocument()
    // getInitials('Unknown') = 'U'
    expect(screen.getByText('U')).toBeInTheDocument()
  })

  it('passes questionId to useComments', () => {
    render(<CommentsTab questionId="q-unique" currentUserId={CURRENT_USER_ID} />)
    expect(mockUseComments).toHaveBeenCalledWith('q-unique')
  })

  it('shows a spinner inside the Post button while the comment is being submitted', async () => {
    // Use a never-resolving promise so the component stays in the submitting state.
    mockAddComment.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    render(<CommentsTab questionId="q-1" currentUserId={CURRENT_USER_ID} />)

    await user.type(screen.getByPlaceholderText('Add a comment...'), 'Spinner test')
    // Fire the click but do not await resolution — the promise never settles.
    const btn = screen.getByRole('button', { name: 'Post' })
    await user.click(btn)

    // The Loader2 SVG is aria-hidden + animate-spin, present only while submitting.
    expect(btn.querySelector('svg[aria-hidden="true"].animate-spin')).not.toBeNull()
  })

  it('sets aria-busy on the Post button while the comment is being submitted', async () => {
    mockAddComment.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    render(<CommentsTab questionId="q-1" currentUserId={CURRENT_USER_ID} />)

    await user.type(screen.getByPlaceholderText('Add a comment...'), 'Aria test')
    const btn = screen.getByRole('button', { name: 'Post' })
    await user.click(btn)

    expect(btn).toHaveAttribute('aria-busy', 'true')
  })

  it('does not set aria-busy on the Post button when idle', () => {
    render(<CommentsTab questionId="q-1" currentUserId={CURRENT_USER_ID} />)
    expect(screen.getByRole('button', { name: 'Post' })).not.toHaveAttribute('aria-busy')
  })

  // ---- Synchronous re-entry guard -----------------------------------------

  it('submits once when the button and Enter key fire simultaneously while a post is in flight', async () => {
    // addComment never resolves so the component stays in the submitting state,
    // simulating a concurrent click + Enter key race.
    mockAddComment.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    render(<CommentsTab questionId="q-1" currentUserId={CURRENT_USER_ID} />)

    const input = screen.getByPlaceholderText('Add a comment...')
    await user.type(input, 'concurrent race')
    // Fire click and Enter in the same tick to simulate a multi-source race.
    await user.click(screen.getByRole('button', { name: 'Post' }))
    // Trigger the onKeyDown handler while the first submission is still in flight.
    await user.keyboard('{Enter}')

    expect(mockAddComment).toHaveBeenCalledTimes(1)
  })

  it('allows a retry after a failed post', async () => {
    // First call fails (returns false), second call succeeds.
    mockAddComment.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const user = userEvent.setup()
    render(<CommentsTab questionId="q-1" currentUserId={CURRENT_USER_ID} />)

    const input = screen.getByPlaceholderText('Add a comment...')
    await user.type(input, 'retry message')

    // First attempt — fails.
    await user.click(screen.getByRole('button', { name: 'Post' }))
    await waitFor(() => expect(mockAddComment).toHaveBeenCalledTimes(1))

    // Lock should be released after failure — second attempt should go through.
    await user.click(screen.getByRole('button', { name: 'Post' }))
    await waitFor(() => expect(mockAddComment).toHaveBeenCalledTimes(2))
  })

  it('allows a retry after the post handler throws', async () => {
    // handleSubmit catches a rejected addComment locally (logging it), so the throw
    // never escapes the click handler — assert it is logged and the lock is released.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockAddComment.mockRejectedValueOnce(new Error('network error')).mockResolvedValueOnce(true)
    const user = userEvent.setup()
    render(<CommentsTab questionId="q-1" currentUserId={CURRENT_USER_ID} />)

    const input = screen.getByPlaceholderText('Add a comment...')
    await user.type(input, 'throw retry message')

    // First attempt — rejects. The catch logs it and the finally releases the lock.
    await user.click(screen.getByRole('button', { name: 'Post' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Post' })).not.toBeDisabled())
    expect(consoleError).toHaveBeenCalled()

    // Second attempt — succeeds. Confirms the lock was fully released.
    await user.click(screen.getByRole('button', { name: 'Post' }))
    await waitFor(() => expect(mockAddComment).toHaveBeenCalledTimes(2))

    consoleError.mockRestore()
  })
})
