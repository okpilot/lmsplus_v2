import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReportFlagProvider, useReportFlag } from './report-flag-context'

// ---- Mocks ------------------------------------------------------------------

const { mockToggleFlag } = vi.hoisted(() => ({ mockToggleFlag: vi.fn() }))

vi.mock('../../actions/flag', () => ({ toggleFlag: mockToggleFlag }))

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- Harness ----------------------------------------------------------------

const QID = 'q1'

function FlagConsumer({ questionId = QID }: { questionId?: string }) {
  const flag = useReportFlag()
  if (!flag) return <div data-testid="no-context">no context</div>
  return (
    <button
      type="button"
      data-testid="toggle"
      onClick={() => flag.toggle(questionId)}
      disabled={flag.isToggling(questionId)}
    >
      {flag.isFlagged(questionId) ? 'flagged' : 'not-flagged'}
    </button>
  )
}

// ---- Tests ------------------------------------------------------------------

describe('useReportFlag', () => {
  it('returns null when rendered without a provider', () => {
    render(<FlagConsumer />)
    expect(screen.getByTestId('no-context')).toBeInTheDocument()
  })
})

describe('ReportFlagProvider', () => {
  it('seeds the flagged state from initialFlaggedIds', () => {
    render(
      <ReportFlagProvider initialFlaggedIds={[QID]}>
        <FlagConsumer />
      </ReportFlagProvider>,
    )
    expect(screen.getByTestId('toggle')).toHaveTextContent('flagged')
  })

  it('shows a question as not flagged when it is absent from initialFlaggedIds', () => {
    render(
      <ReportFlagProvider initialFlaggedIds={[]}>
        <FlagConsumer />
      </ReportFlagProvider>,
    )
    expect(screen.getByTestId('toggle')).toHaveTextContent('not-flagged')
  })

  it('flags a question after the server reports it flagged', async () => {
    mockToggleFlag.mockResolvedValue({ success: true, flagged: true })
    render(
      <ReportFlagProvider initialFlaggedIds={[]}>
        <FlagConsumer />
      </ReportFlagProvider>,
    )
    fireEvent.click(screen.getByTestId('toggle'))
    await waitFor(() => expect(screen.getByTestId('toggle')).toHaveTextContent('flagged'))
    expect(mockToggleFlag).toHaveBeenCalledWith({ questionId: QID })
  })

  it('unflags a question after the server reports it unflagged', async () => {
    mockToggleFlag.mockResolvedValue({ success: true, flagged: false })
    render(
      <ReportFlagProvider initialFlaggedIds={[QID]}>
        <FlagConsumer />
      </ReportFlagProvider>,
    )
    fireEvent.click(screen.getByTestId('toggle'))
    await waitFor(() => expect(screen.getByTestId('toggle')).toHaveTextContent('not-flagged'))
  })

  it('does not change state when the server reports failure', async () => {
    mockToggleFlag.mockResolvedValue({ success: false, error: 'nope' })
    render(
      <ReportFlagProvider initialFlaggedIds={[]}>
        <FlagConsumer />
      </ReportFlagProvider>,
    )
    fireEvent.click(screen.getByTestId('toggle'))
    await waitFor(() => expect(mockToggleFlag).toHaveBeenCalled())
    expect(screen.getByTestId('toggle')).toHaveTextContent('not-flagged')
  })

  it('ignores a second toggle while the first is still pending', async () => {
    let resolveToggle: (v: { success: true; flagged: boolean }) => void = () => {}
    mockToggleFlag.mockReturnValue(
      new Promise((resolve) => {
        resolveToggle = resolve
      }),
    )
    render(
      <ReportFlagProvider initialFlaggedIds={[]}>
        <FlagConsumer />
      </ReportFlagProvider>,
    )
    const button = screen.getByTestId('toggle')
    fireEvent.click(button)
    // Button is disabled while the toggle is in flight.
    await waitFor(() => expect(button).toBeDisabled())
    fireEvent.click(button) // second click should be a no-op
    resolveToggle({ success: true, flagged: true })
    await waitFor(() => expect(button).toHaveTextContent('flagged'))
    expect(mockToggleFlag).toHaveBeenCalledTimes(1)
  })

  it('re-enables the button and preserves state when toggleFlag throws', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockToggleFlag.mockRejectedValue(new Error('network'))
    render(
      <ReportFlagProvider initialFlaggedIds={[]}>
        <FlagConsumer />
      </ReportFlagProvider>,
    )
    const button = screen.getByTestId('toggle')
    fireEvent.click(button)
    // finally{} must clear pending state even when the action rejects.
    await waitFor(() => expect(button).not.toBeDisabled())
    expect(button).toHaveTextContent('not-flagged')
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})
