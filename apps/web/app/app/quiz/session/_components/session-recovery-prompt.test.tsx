import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionRecoveryPrompt } from './session-recovery-prompt'

// ---- Helpers --------------------------------------------------------------

function makeProps(overrides?: Partial<React.ComponentProps<typeof SessionRecoveryPrompt>>) {
  return {
    answeredCount: 3,
    totalCount: 10,
    onResume: vi.fn(),
    onSave: vi.fn(),
    onDiscard: vi.fn(),
    loading: false,
    error: null,
    ...overrides,
  }
}

// ---- Lifecycle ------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- Rendering ------------------------------------------------------------

describe('SessionRecoveryPrompt — rendering', () => {
  it('shows answered count and total count', () => {
    render(<SessionRecoveryPrompt {...makeProps()} />)
    expect(screen.getByText(/3 of 10 questions answered/i)).toBeInTheDocument()
  })

  it('shows subject name when provided', () => {
    render(<SessionRecoveryPrompt {...makeProps({ subjectName: 'Meteorology' })} />)
    expect(screen.getByText(/meteorology/i)).toBeInTheDocument()
  })

  it('does not render subject line when subjectName is absent', () => {
    render(<SessionRecoveryPrompt {...makeProps({ subjectName: undefined })} />)
    expect(screen.queryByText(/you were answering/i)).not.toBeInTheDocument()
  })

  it('renders Resume, Save for Later, and Discard buttons', () => {
    render(<SessionRecoveryPrompt {...makeProps()} />)
    expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save for later/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^discard$/i })).toBeInTheDocument()
  })

  it('shows error message when error prop is provided', () => {
    render(<SessionRecoveryPrompt {...makeProps({ error: 'Server unavailable' })} />)
    expect(screen.getByText('Server unavailable')).toBeInTheDocument()
  })

  it('does not show error element when error is null', () => {
    render(<SessionRecoveryPrompt {...makeProps({ error: null })} />)
    expect(screen.queryByText(/server/i)).not.toBeInTheDocument()
  })
})

// ---- Disabled state -------------------------------------------------------

describe('SessionRecoveryPrompt — loading state disables buttons', () => {
  it('disables all buttons while loading', () => {
    render(<SessionRecoveryPrompt {...makeProps({ loading: true })} />)
    for (const btn of screen.getAllByRole('button')) {
      expect(btn).toBeDisabled()
    }
  })

  it('enables all buttons when not loading', () => {
    render(<SessionRecoveryPrompt {...makeProps({ loading: false })} />)
    for (const btn of screen.getAllByRole('button')) {
      expect(btn).not.toBeDisabled()
    }
  })
})

// ---- Callbacks ------------------------------------------------------------

describe('SessionRecoveryPrompt — button callbacks', () => {
  it('calls onResume when Resume is clicked', async () => {
    const onResume = vi.fn()
    render(<SessionRecoveryPrompt {...makeProps({ onResume })} />)
    await userEvent.click(screen.getByRole('button', { name: /resume/i }))
    expect(onResume).toHaveBeenCalledTimes(1)
  })

  it('calls onSave when Save for Later is clicked', async () => {
    const onSave = vi.fn()
    render(<SessionRecoveryPrompt {...makeProps({ onSave })} />)
    await userEvent.click(screen.getByRole('button', { name: /save for later/i }))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('calls onDiscard after confirming the discard dialog', async () => {
    const onDiscard = vi.fn()
    render(<SessionRecoveryPrompt {...makeProps({ onDiscard })} />)
    await userEvent.click(screen.getByRole('button', { name: /^discard$/i }))
    await userEvent.click(screen.getByRole('button', { name: /^discard$/i, hidden: false }))
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })

  it('does not fire callbacks when buttons are disabled', async () => {
    const onResume = vi.fn()
    const onSave = vi.fn()
    const onDiscard = vi.fn()
    render(<SessionRecoveryPrompt {...makeProps({ loading: true, onResume, onSave, onDiscard })} />)

    for (const btn of screen.getAllByRole('button')) {
      await userEvent.click(btn)
    }

    expect(onResume).not.toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
    expect(onDiscard).not.toHaveBeenCalled()
  })
})

// ---- Exam mode ------------------------------------------------------------

describe('SessionRecoveryPrompt — exam mode', () => {
  it('shows Practice Exam heading', () => {
    render(<SessionRecoveryPrompt {...makeProps({ mode: 'exam' })} />)
    expect(screen.getByText(/resume your practice exam\?/i)).toBeInTheDocument()
    expect(screen.queryByText(/^resume your quiz\?/i)).not.toBeInTheDocument()
  })

  it('hides the Save for Later button so users cannot save an exam draft', () => {
    render(<SessionRecoveryPrompt {...makeProps({ mode: 'exam' })} />)
    expect(screen.queryByRole('button', { name: /save for later/i })).not.toBeInTheDocument()
  })

  it('uses Practice Exam discard copy in the confirm dialog', async () => {
    render(<SessionRecoveryPrompt {...makeProps({ mode: 'exam' })} />)
    await userEvent.click(screen.getByRole('button', { name: /^discard$/i }))
    expect(screen.getByText(/discard practice exam\?/i)).toBeInTheDocument()
    expect(screen.getByText(/practice exam session\. you cannot undo/i)).toBeInTheDocument()
  })

  it('keeps study-mode copy when mode is undefined', () => {
    render(<SessionRecoveryPrompt {...makeProps()} />)
    expect(screen.getByText(/^resume your quiz\?/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save for later/i })).toBeInTheDocument()
  })
})
