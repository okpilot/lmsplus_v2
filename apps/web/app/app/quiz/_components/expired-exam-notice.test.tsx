import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockRouterPush } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

// ---- Subject under test ---------------------------------------------------

import { ExpiredExamNotice } from './expired-exam-notice'

// ---- Lifecycle ------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- Tests ----------------------------------------------------------------

describe('ExpiredExamNotice', () => {
  it('renders the expired-exam title and subtitle', () => {
    render(<ExpiredExamNotice sessionId="sess-abc" />)

    expect(screen.getByText('Practice Exam expired')).toBeInTheDocument()
    expect(
      screen.getByText('Your exam time has ended. View your results below.'),
    ).toBeInTheDocument()
  })

  it('renders as a caution alert', () => {
    render(<ExpiredExamNotice sessionId="sess-abc" />)

    const notice = screen.getByText('Practice Exam expired').closest('[data-slot="alert"]')
    expect(notice?.className).toContain('bg-caution-soft')
  })

  it('navigates to the correct report URL when "View Results" is clicked', async () => {
    const user = userEvent.setup()
    render(<ExpiredExamNotice sessionId="sess-abc" />)

    await user.click(screen.getByRole('button', { name: 'View Results' }))

    expect(mockRouterPush).toHaveBeenCalledWith('/app/quiz/report?session=sess-abc')
  })

  it('embeds the exact sessionId in the URL (no aliasing across instances)', async () => {
    const user = userEvent.setup()
    render(<ExpiredExamNotice sessionId="another-id-xyz" />)

    await user.click(screen.getByRole('button', { name: 'View Results' }))

    expect(mockRouterPush).toHaveBeenCalledWith('/app/quiz/report?session=another-id-xyz')
  })
})
