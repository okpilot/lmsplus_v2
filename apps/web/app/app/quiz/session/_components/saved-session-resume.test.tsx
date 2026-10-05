import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockHook } = vi.hoisted(() => ({ mockHook: vi.fn() }))

vi.mock('../_hooks/use-saved-session-resume', () => ({
  useSavedSessionResume: (...a: unknown[]) => mockHook(...a),
}))

import { SavedSessionResume } from './saved-session-resume'

const resume = vi.fn()
const discard = vi.fn()

function renderIt() {
  return render(
    <SavedSessionResume
      sessionId="s1"
      subjectName="Air Law"
      mode="quick_quiz"
      answeredCount={4}
      totalCount={10}
    />,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  mockHook.mockReturnValue({ resume, discard, loading: false, error: null })
})

describe('SavedSessionResume', () => {
  it('shows which quiz was saved and how far the student got', () => {
    renderIt()

    expect(screen.getByText(/Air Law/)).toBeInTheDocument()
    expect(screen.getByText(/4 of 10/)).toBeInTheDocument()
  })

  it('resumes the quiz on Resume', () => {
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: /resume/i }))

    expect(mockHook).toHaveBeenCalledWith('s1')
    expect(resume).toHaveBeenCalledTimes(1)
  })

  it('deletes the quiz on Delete', () => {
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))

    expect(discard).toHaveBeenCalledTimes(1)
  })

  it('shows the error', () => {
    mockHook.mockReturnValue({
      resume,
      discard,
      loading: false,
      error: 'Finish your open quiz first.',
    })
    renderIt()

    expect(screen.getByRole('alert')).toHaveTextContent('Finish your open quiz first.')
  })

  it('disables both actions while one is running', () => {
    mockHook.mockReturnValue({ resume, discard, loading: true, error: null })
    renderIt()

    expect(screen.getByRole('button', { name: /resume/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /delete/i })).toBeDisabled()
  })
})
