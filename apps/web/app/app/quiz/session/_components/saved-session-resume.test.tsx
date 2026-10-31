import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

  it('titles the page with a level-1 heading that inherits the centred alignment', () => {
    renderIt()
    const h1 = screen.getByRole('heading', { level: 1, name: 'Saved quiz' })
    const header = h1.parentElement?.parentElement as HTMLElement
    expect(header.className).toContain('sm:justify-center')
    expect(header.className).not.toContain('sm:justify-between')
    expect(header.parentElement?.className).toContain('text-center')
  })

  it('resumes the quiz on Resume', () => {
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: /resume/i }))

    expect(mockHook).toHaveBeenCalledWith('s1')
    expect(resume).toHaveBeenCalledTimes(1)
  })

  it('asks in an alertdialog before deleting and deletes once on confirm', async () => {
    discard.mockResolvedValue(undefined)
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete this saved quiz?' })
    expect(within(dialog).getByText('This cannot be undone.')).toBeInTheDocument()
    expect(discard).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(discard).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('keeps the quiz when Cancel is clicked in the dialog', async () => {
    renderIt()
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete this saved quiz?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(discard).not.toHaveBeenCalled()
  })

  it('disables the dialog buttons while loading', async () => {
    discard.mockReturnValue(new Promise(() => {}))
    const { rerender } = renderIt()
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete this saved quiz?' })
    mockHook.mockReturnValue({ resume, discard, loading: true, error: null })
    rerender(
      <SavedSessionResume
        sessionId="s1"
        subjectName="Air Law"
        mode="quick_quiz"
        answeredCount={4}
        totalCount={10}
      />,
    )

    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: /Delete/ })).toBeDisabled()
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
    expect(screen.getByRole('alert')).toHaveAttribute('data-slot', 'field-error')
  })

  it('shows the saved-quiz heading as the page title', () => {
    mockHook.mockReturnValue({ resume, discard, loading: false, error: null })
    renderIt()

    expect(screen.getByRole('heading', { level: 1, name: 'Saved quiz' })).toHaveClass('text-title')
  })

  it('disables both actions while one is running', () => {
    mockHook.mockReturnValue({ resume, discard, loading: true, error: null })
    renderIt()

    expect(screen.getByRole('button', { name: /resume/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /delete/i })).toBeDisabled()
  })
})
